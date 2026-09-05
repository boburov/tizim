import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ROLES } from '../../common/constants/permissions.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
import { toUtcMidnight, localTodayMidnight } from '../../common/utils/date.js';
import { assertPeriodInvariants } from '../../common/utils/period.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { assertNotSelfSalary } from '../../common/rbac/self-salary.guard.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { ExpenseApprovalsService } from '../expense-approvals/expense-approvals.service.js';
import { TeacherSalaryService } from './teacher-salary.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QITUVCHINING STANDART MAOSH STAVKASI
 * (`teacherCompensation.service.js` KO'CHIRMASI).
 *
 * ⚠⚠ ASOSIY QOIDA: STAVKA HECH QACHON JOYIDA TAHRIRLANMAYDI.
 * O'zgarish HAR DOIM eskisini yopib (`effectiveTo`) yangisini ochadi.
 * Shu tufayli "martda oshirdik" YANVAR maoshini qayta yozib yubormaydi —
 * o'tgan oy recalc bo'lsa ham O'SHA OYDA amal qilgan stavkani topadi.
 *
 * ATOMIKLIK: `setCompensation` IKKI yozuv qiladi (eskisini yopish +
 * yangisini ochish). Ikkinchisi yiqilsa o'qituvchi STAVKASIZ qolardi va
 * maoshi jimgina 0 ga tushardi — shuning uchun ikkalasi BITTA
 * `$transaction` ichida.
 *
 * ⚠ QAYTA HISOB (`recomputeFrom`) ATAYLAB TRANZAKSIYADAN TASHQARIDA: u
 * o'nlab oyni aylanadi va uzoq davom etadi; tranzaksiya ichiga solish
 * qatorlarni keraksiz uzoq QULFLAB turardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const actorId = (u: any) => u?.id || u?._id || null;

@Injectable()
export class TeacherCompensationService {
  private readonly logger = new Logger('TeacherCompensation');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
    private readonly approvals: ExpenseApprovalsService,
    private readonly salaries: TeacherSalaryService,
  ) {}

  /**
   * STAVKA SHAKLI INVARIANTI — avval Mongoose `pre("validate")` da edi.
   *
   *   1. `baseType="none"`     → `baseAmount` MAJBURAN 0
   *   2. `variableType="none"` → `variableRate` MAJBURAN 0
   *   3. ikkalasi ham "none"   → RAD ETILADI
   *
   * ⚠ 1–2 NORMALIZATSIYA, tekshiruv EMAS: foydalanuvchi "fiksa yo'q"
   * deb belgilab, summani ekranda qoldirib ketishi mumkin. Qiymat
   * tozalanmasa `rateResolver` uni O'QIYDI va o'chirilgan qism baribir
   * maoshga qo'shilardi — ya'ni "o'chirdim" degan amal JIMGINA ishlamay
   * qolardi.
   *
   * ⚠ NEGA SERVISDA (Zod'da EMAS): stavka HTTP'dan tashqari `imports`
   * va ishga olish oqimidan ham yoziladi — ular Zod sxemasini CHETLAB
   * o'tadi.
   */
  private applyRateShape(data: Record<string, any>): Record<string, any> {
    if (data.baseType === 'none') data.baseAmount = 0;
    if (data.variableType === 'none') data.variableRate = 0;
    if (data.baseType === 'none' && data.variableType === 'none') {
      throw new ApiError(
        400,
        "Kamida bitta maosh qismi (fiksa yoki o'zgaruvchi) belgilanishi kerak",
      );
    }
    return data;
  }

  /**
   * ⚠ `effectiveTo` HAR DOIM `effectiveFrom` dan KEYIN. Teng bo'lsa davr
   * uzunligi NOL bo'lib qoladi: `rateResolver` uni `[from, to)` oynasida
   * HECH QACHON tanlamaydi, ya'ni stavka MAVJUD bo'lib turib ISHLAMAYDI.
   */
  private assertRange(effectiveFrom: Date | null, effectiveTo: Date | null): void {
    if (!effectiveTo || !effectiveFrom) return;
    if (new Date(effectiveTo).getTime() <= new Date(effectiveFrom).getTime()) {
      throw new ApiError(400, "Tugash sanasi boshlanish sanasidan keyin bo'lishi kerak");
    }
  }

  /**
   * ⚠⚠ STAVKA DAVRLARI KESISHMASLIGI KERAK.
   *
   * NEGA MAJBURIY: `rateResolver` har kesishgan stavka uchun ALOHIDA
   * segment yaratadi va kunlar QO'SHILADI. Ikki stavka bir kunni
   * qamrasa, o'sha kun IKKI MARTA to'lanadi — 2 mln oylik 4 mln bo'lib
   * chiqadi.
   *
   * `setCompensation` da ochiq davrni yopish orqali bu holat yuzaga
   * kelmasdi, lekin `amendCompensation` `effectiveFrom` ni ERKIN
   * o'zgartirardi va yopilgan davr ustiga surib yuborish mumkin edi.
   */
  private async assertNoOverlap(
    teacherId: string,
    candidate: { effectiveFrom: Date; effectiveTo: Date | null },
    excludeId: string | null = null,
  ): Promise<void> {
    const rows = await this.prisma.teacherCompensation.findMany({
      where: {
        teacherId: String(teacherId),
        isDeleted: false,
        ...(excludeId ? { id: { not: String(excludeId) } } : {}),
      },
      select: { effectiveFrom: true, effectiveTo: true },
    });

    assertPeriodInvariants(
      { startDate: candidate.effectiveFrom, endDate: candidate.effectiveTo || null },
      rows.map((r) => ({ startDate: r.effectiveFrom, endDate: r.effectiveTo || null })),
      'date',
    );
  }

  private async assertTeacher(teacherId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: String(teacherId) },
      select: {
        id: true, role: true, isDeleted: true, hiredAt: true,
        firstName: true, lastName: true,
      },
    });
    if (!user || user.isDeleted) throw new ApiError(404, "O'qituvchi topilmadi");
    if (user.role !== ROLES.TEACHER) {
      throw new ApiError(400, "Faqat o'qituvchiga maosh stavkasi belgilanadi");
    }
    return user;
  }

  /** O'qituvchining barcha stavka tarixi (yangisidan eskisiga). */
  async listByTeacher(teacherId: string) {
    // ⚠ FILIAL QO'RIQCHISI — `teacherId` params dan keladi va hech qanday
    // filtr qo'llanmasdi: filial direktori begona filial o'qituvchisining
    // maosh stavkasini ID ni qo'lda kiritib o'qib olardi.
    //
    // ⚠ QATOR darajasida `branchFilter()` ATAYLAB YO'Q: bu jadvalda
    // `branchId` NULLABLE va filtr filialsiz stavkani YASHIRARDI — stavka
    // "yo'q" bo'lib ko'rinib, maosh jimgina 0 ga tushardi.
    await this.branchAccess.assertUserInBranchScope(teacherId);
    return withLegacyIds(
      await this.prisma.teacherCompensation.findMany({
        where: { teacherId: String(teacherId), isDeleted: false },
        orderBy: { effectiveFrom: 'desc' },
      }),
    );
  }

  /** Berilgan sanada (default — bugun) amal qilgan stavka. */
  async getActive(teacherId: string, onDate: Date | null = null) {
    // ⚠ FILIAL QO'RIQCHISI — `listByTeacher` bilan bir xil sabab:
    // begona filial o'qituvchisining amaldagi stavkasi ochilmasin.
    await this.branchAccess.assertUserInBranchScope(teacherId);
    const t = (onDate ? toUtcMidnight(onDate) : localTodayMidnight()).getTime();
    const rows = await this.prisma.teacherCompensation.findMany({
      where: { teacherId: String(teacherId), isDeleted: false },
      orderBy: { effectiveFrom: 'desc' },
    });
    const found = rows.find((r) => {
      const s = toUtcMidnight(r.effectiveFrom).getTime();
      const e = r.effectiveTo ? toUtcMidnight(r.effectiveTo).getTime() : Infinity;
      return s <= t && t < e;
    });
    return found ? withLegacyId(found) : null;
  }

  /**
   * YANGI STAVKA O'RNATADI (eskisini yopadi).
   *
   * ⚠ `effectiveFrom` O'TGAN sanaga qo'yilsa — o'sha oydan boshlab
   * maoshlar QAYTA HISOBLANADI (retro oshirish/kamaytirish). Bu ATAYLAB
   * ruxsat etilgan, chunki "1-yanvardan oshirdik, lekin fevralda
   * kiritdik" REAL holat. Lekin bu moliyaviy ta'sirga ega, shuning uchun
   * chaqiruvchi (`requestSet`) uni tasdiqdan o'tkazadi.
   */
  async setCompensation(body: Record<string, any>, currentUser: any) {
    const teacher = await this.assertTeacher(body.teacher);
    // ⚠ O'ZIGA O'ZI STAVKA QO'YISH TAQIQI. Bu funksiya ishga olish
    // oqimidan ham chaqiriladi, lekin u yerda yangi yaratilgan xodim
    // chaqiruvchining O'ZI bo'la olmaydi.
    assertNotSelfSalary(currentUser, teacher.id);
    const from = toUtcMidnight(body.effectiveFrom || localTodayMidnight());

    // Ishga olingan sanadan OLDIN stavka bo'la olmaydi.
    if (teacher.hiredAt && from.getTime() < toUtcMidnight(teacher.hiredAt).getTime()) {
      throw new ApiError(
        400, "Maosh stavkasi ishga olingan sanadan oldin boshlana olmaydi",
      );
    }

    const branchId = await this.branchAccess.resolveBranchForWrite(
      currentUser, body.branchId ?? null,
    );

    const open = await this.prisma.teacherCompensation.findFirst({
      where: { teacherId: teacher.id, effectiveTo: null, isDeleted: false },
      select: { id: true, effectiveFrom: true },
    });

    if (open) {
      const openFrom = toUtcMidnight(open.effectiveFrom).getTime();
      if (from.getTime() <= openFrom) {
        throw new ApiError(
          400,
          'Yangi stavka amaldagi stavkadan keyin boshlanishi kerak. Xato kiritilgan bo\'lsa amaldagi stavkani tahrirlang.',
        );
      }
    }

    // ⚠ KESISHUV TEKSHIRUVI HECH NARSA O'ZGARTIRILMASDAN OLDIN.
    // Ochiq davr `from` da yopilishi KERAK, lekin uni tekshiruvga
    // qo'shib yuborsak "o'zi bilan o'zi kesishdi" degan YOLG'ON xato
    // chiqardi — shuning uchun u ro'yxatdan chiqariladi.
    const openId = open?.id || null;
    await this.assertNoOverlap(
      teacher.id, { effectiveFrom: from, effectiveTo: null }, openId,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      if (open) {
        await tx.teacherCompensation.update({
          where: { id: open.id },
          data: { effectiveTo: from, updatedById: actorId(currentUser) },
        });
      }
      return tx.teacherCompensation.create({
        data: this.applyRateShape({
          teacherId: teacher.id,
          branchId,
          effectiveFrom: from,
          effectiveTo: null,
          baseType: body.baseType || 'none',
          baseAmount: Number(body.baseAmount) || 0,
          variableType: body.variableType || 'none',
          variableRate: Number(body.variableRate) || 0,
          percentBase: body.percentBase || 'billed',
          note: body.note || '',
          createdById: actorId(currentUser),
        }) as never,
      });
    });

    // Natijaga qayta hisob XULOSASINI biriktiramiz — UI "3 oy
    // yangilandi, 2 oy to'langani uchun o'zgarmadi" deb ko'rsatadi.
    const recompute = await this.recomputeFrom(teacher.id, from);
    const result = withLegacyId(created) as Record<string, unknown>;
    result.recompute = recompute;
    return result;
  }

  /**
   * Amaldagi (ochiq) stavkani TUZATADI — yangi davr OCHMAYDI.
   * Faqat XATO KIRITISH uchun ("nolni ko'p yozdim"). Haqiqiy oshirish
   * `setCompensation` orqali bo'lishi kerak, aks holda TARIX yo'qoladi.
   */
  async amendCompensation(id: string, patch: Record<string, any>, currentUser: any) {
    const doc = await this.prisma.teacherCompensation.findUnique({
      where: { id: String(id) },
    });
    if (!doc || doc.isDeleted) throw new ApiError(404, 'Maosh stavkasi topilmadi');
    assertNotSelfSalary(currentUser, doc.teacherId);
    // ⚠ FILIAL QO'RIQCHISI — `id` params dan keladi. Usiz filial direktori
    // begona filial o'qituvchisining stavkasini (va u orqali maoshini)
    // ID ni qo'lda kiritib tuzatib yuborardi.
    await this.branchAccess.assertUserInBranchScope(doc.teacherId);

    const before = toUtcMidnight(doc.effectiveFrom);

    // ⚠ Mongoose hujjatni JOYIDA mutatsiya qilardi va tekshiruv
    // mutatsiyadan KEYIN ishlardi. Prisma'da yozuv o'zgarmasdan turadi,
    // shuning uchun "keyingi holat" ALOHIDA hisoblanadi va tekshiruv
    // AYNAN o'sha holat ustida bajariladi.
    const data: Record<string, any> = { updatedById: actorId(currentUser) };
    if (patch.effectiveFrom !== undefined) {
      data.effectiveFrom = toUtcMidnight(patch.effectiveFrom);
    }
    if (patch.baseType !== undefined) data.baseType = patch.baseType;
    if (patch.baseAmount !== undefined) data.baseAmount = Number(patch.baseAmount) || 0;
    if (patch.variableType !== undefined) data.variableType = patch.variableType;
    if (patch.variableRate !== undefined) {
      data.variableRate = Number(patch.variableRate) || 0;
    }
    if (patch.percentBase !== undefined) data.percentBase = patch.percentBase;
    if (patch.branchId !== undefined) data.branchId = patch.branchId || null;
    if (patch.note !== undefined) data.note = patch.note;

    const nextFrom = data.effectiveFrom ?? doc.effectiveFrom;

    // ⚠ SHAKL INVARIANTI KEYINGI HOLAT ustida. `patch` QISMAN bo'lgani
    // uchun "baseType=none" ni YOLG'IZ yuborish mumkin — u holda
    // `baseAmount` yozuvda ESKISICHA qolib ketardi.
    const nextShape = this.applyRateShape({
      baseType: data.baseType ?? doc.baseType,
      baseAmount: data.baseAmount ?? doc.baseAmount,
      variableType: data.variableType ?? doc.variableType,
      variableRate: data.variableRate ?? doc.variableRate,
    });
    data.baseAmount = nextShape.baseAmount;
    data.variableRate = nextShape.variableRate;
    this.assertRange(nextFrom, doc.effectiveTo);

    // ⚠ KESISHUV QO'RIQCHISI — AYNAN shu yerda yo'q edi.
    // `effectiveFrom` ORQAGA surilsa, yopilgan oldingi davr ustiga
    // tushib qolardi va o'sha oy maoshi IKKI BAROBAR hisoblanardi.
    await this.assertNoOverlap(
      doc.teacherId,
      { effectiveFrom: nextFrom, effectiveTo: doc.effectiveTo },
      doc.id,
    );

    const saved = await this.prisma.teacherCompensation.update({
      where: { id: doc.id }, data,
    });

    // Sana ORQAGA surilgan bo'lsa — eskiroq nuqtadan qayta hisoblaymiz.
    const from = new Date(
      Math.min(before.getTime(), toUtcMidnight(saved.effectiveFrom).getTime()),
    );
    await this.recomputeFrom(doc.teacherId, from);
    return withLegacyId(saved);
  }

  /**
   * Stavkani o'chiradi (soft).
   *
   * ⚠ Eng oxirgi (ochiq) stavkani o'chirsa — undan OLDINGISI QAYTA
   * OCHILADI, aks holda "stavkasiz teshik" qolardi. Ikkalasi BIRGA
   * bajarilishi shart: ikkinchisi yiqilsa teshik qolardi.
   */
  async removeCompensation(id: string, currentUser: any) {
    const doc = await this.prisma.teacherCompensation.findUnique({
      where: { id: String(id) },
    });
    if (!doc || doc.isDeleted) throw new ApiError(404, 'Maosh stavkasi topilmadi');
    // ⚠ O'ZIGA O'ZI STAVKA QO'YISH TAQIQI SHU YERDA HAM: `amendCompensation`
    // da bor edi, bu yerda YO'Q edi. O'chirish ZARARSIZ amal EMAS — pastda
    // OLDINGI davr QAYTA OCHILADI, ya'ni odam o'zining pasaytirilgan
    // stavkasini o'chirib, eskisini (yuqorisini) tiklab olardi.
    assertNotSelfSalary(currentUser, doc.teacherId);
    // ⚠ FILIAL QO'RIQCHISI — `id` params dan keladi: begona filial
    // o'qituvchisining stavkasi o'chirilib, maoshi qayta hisoblanardi.
    await this.branchAccess.assertUserInBranchScope(doc.teacherId);

    const from = toUtcMidnight(doc.effectiveFrom);

    await this.prisma.$transaction(async (tx) => {
      await tx.teacherCompensation.update({
        where: { id: doc.id },
        data: {
          isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser),
        },
      });

      const prev = await tx.teacherCompensation.findFirst({
        where: { teacherId: doc.teacherId, isDeleted: false, effectiveTo: from },
        select: { id: true },
      });
      if (prev) {
        await tx.teacherCompensation.update({
          where: { id: prev.id },
          data: {
            effectiveTo: doc.effectiveTo || null,
            updatedById: actorId(currentUser),
          },
        });
      }
    });

    await this.recomputeFrom(doc.teacherId, from);
    return { ok: true };
  }

  /**
   * Berilgan sanadan BUGUNGACHA har oy uchun maoshni qayta hisoblaydi.
   *
   * ⚠ BEST-EFFORT: bitta oydagi xato QOLGANINI TO'XTATMAYDI — stavka
   * o'zgarishi baribir saqlanib qolishi kerak, keyingi tungi job
   * qolganini tuzatadi.
   */
  async recomputeFrom(teacherId: string, fromDate: Date) {
    const start = toUtcMidnight(fromDate);
    const today = localTodayMidnight();
    let year = start.getUTCFullYear();
    let month = start.getUTCMonth() + 1;
    const endYear = today.getUTCFullYear();
    const endMonth = today.getUTCMonth() + 1;

    let months = 0;
    // ⚠ TO'LANGANI uchun tegilmagan qatorlar SONI qaytariladi. Jimgina
    // o'tkazib yuborish "nega maosh o'zgarmadi?" degan savolni
    // tug'dirardi.
    let lockedRows = 0;

    while (year < endYear || (year === endYear && month <= endMonth)) {
      try {
        const rows = await this.prisma.teacherSalary.findMany({
          where: { teacherId: String(teacherId), year, month },
          select: { id: true, kind: true, status: true, paidAmount: true },
        });

        for (const r of rows) {
          if (r.status === 'paid' && Number(r.paidAmount) > 0) lockedRows += 1;
        }

        // ⚠ `lockPaid`: BU YO'L stavka o'zgarishidan keladi — allaqachon
        // to'langan (yopilgan) oylar QAYTA OCHILMASLIGI kerak. Boshqa
        // chaqiruvchilar (o'quvchi qo'shildi, narx o'zgardi) QULFSIZ
        // chaqiradi, chunki u yerda maoshning HAQIQIY bazasi o'zgargan.
        await this.salaries.recalcBaseForTeacherMonth(teacherId, year, month, {
          lockPaid: true,
        });
        for (const r of rows) {
          if (r.kind !== 'group') continue;
          await this.salaries.recalc(r.id, { lockPaid: true });
        }
        months += 1;
      } catch (err) {
        this.logger.warn(
          `Maosh qayta hisobida xato (teacher=${teacherId}, ${year}-${month}): ${err}`,
        );
      }
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    return { months, lockedRows };
  }

  // ════════════════════════ TASDIQ (approval) OQIMI ════════════════════════

  private subjectKeyFor(teacher: string): string {
    return `teacher_compensation:${String(teacher)}`;
  }

  /**
   * Stavka o'zgarishini TASDIQQA yuboradi (yozuv YARATMAYDI).
   *
   * ⚠ TO'LIQ TEKSHIRUVLAR ATAYLAB BAJARISH PAYTIDA qayta ishlaydi —
   * so'rov va tasdiq orasida holat o'zgargan bo'lishi mumkin.
   */
  async requestSet(body: Record<string, any>, currentUser: any) {
    const teacher = await this.assertTeacher(body.teacher);
    // So'rov ham yaratilmaydi — o'ziga o'zi stavka qo'yish taqiqi
    // so'rov qatlamida ham amal qiladi.
    assertNotSelfSalary(currentUser, teacher.id);
    const branchId = await this.branchAccess.resolveBranchForWrite(
      currentUser, body.branchId ?? null,
    );

    return this.approvals.createRequest({
      branchId,
      kind: APPROVAL_KINDS.TEACHER_COMPENSATION_SET,
      payload: {
        op: body.op || 'set',
        compensationId: body.compensationId ? String(body.compensationId) : undefined,
        teacher: String(teacher.id),
        branchId: branchId ? String(branchId) : null,
        effectiveFrom: body.effectiveFrom,
        baseType: body.baseType,
        baseAmount: body.baseAmount,
        variableType: body.variableType,
        variableRate: body.variableRate,
        percentBase: body.percentBase,
        note: body.note,
      },
      subjectKey: this.subjectKeyFor(teacher.id),
      subjectName: [teacher.firstName, teacher.lastName].filter(Boolean).join(' '),
      contextName: 'Maosh stavkasi',
      requestNote: body.requestNote,
      currentUser,
    });
  }

  /**
   * Tasdiqlangan stavka so'rovini bajaradi.
   *
   * ✅ HTTP ORQALI CHAQIRILADI: bajaruvchilarning HAMMASI (10/10)
   * ro'yxatga olingan, ya'ni `APPROVAL_EXECUTORS_NOT_MIGRATED` 501
   * shoxi endi ERISHIB BO'LMAYDIGAN holatda. U ATAYLAB QOLDIRILDI —
   * kelajakda YANGI tasdiq turi qo'shilib, bajaruvchisi unutilsa,
   * so'rov JIMGINA "tasdiqlangan" bo'lib qolmasligi uchun.
   */
  async executeApprovedCompensation(approval: Record<string, any>) {
    const p = approval?.payload || {};
    // Tarixda SO'ROVCHI ko'rinsin (tasdiqlovchi emas).
    const requesterId = approval?.requestedById || approval?.requestedBy || null;
    const actor = { id: requesterId, _id: requesterId };

    if (p.op === 'amend') {
      if (!p.compensationId) {
        throw new ApiError(400, "So'rovda stavka identifikatori yo'q");
      }
      return this.amendCompensation(p.compensationId, p, actor);
    }
    return this.setCompensation(p, actor);
  }
}
