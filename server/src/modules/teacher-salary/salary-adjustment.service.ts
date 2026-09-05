import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ROLES } from '../../common/constants/permissions.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { branchFilter } from '../../common/als/branch-context.js';
import { deriveStatus } from '../../common/utils/proration.js';
import { localTodayMidnight } from '../../common/utils/date.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KPI MUKOFOTI VA JARIMA (`kind: "bonus" | "deduction"`).
 * (`salaryAdjustment.service.js` KO'CHIRMASI.)
 *
 * ⚠ NEGA ALOHIDA QATOR (guruh maoshiga QO'SHILMAYDI):
 *  1. KPI markaz darajasidagi qaror — u BITTA guruhga tegishli emas
 *     ("o'quvchilari eng tez o'sadi" 5 guruhning yig'indisi).
 *  2. Guruh qatori HAR KECHA davrlardan qayta hisoblanadi (`recalc`).
 *     Mukofot o'sha qatorga yozilsa tungi job uni NOLGA tushirib
 *     yuborardi — aynan shuning uchun `recalc()` `kind !== "group"`
 *     bo'lsa darhol qaytadi.
 *  3. Hisobotda "asosiy maosh" va "mukofot" AJRATILGAN bo'lishi kerak.
 *
 * ⚠ `isDeleted` FILTRI YO'Q: `TeacherSalary` da bunday ustun UMUMAN
 * MAVJUD EMAS (hosila jadval). Uni `isDeleted: false` ga aylantirish
 * Prisma'da XATO berardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const actorId = (u: any) => u?.id || u?._id || null;

@Injectable()
export class SalaryAdjustmentService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  private async assertTeacher(teacherId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: String(teacherId) },
      select: { id: true, role: true, isDeleted: true, homeBranchId: true },
    });
    if (!user || user.isDeleted) throw new ApiError(404, "O'qituvchi topilmadi");
    if (user.role !== ROLES.TEACHER) {
      throw new ApiError(400, "Faqat o'qituvchiga mukofot/jarima belgilanadi");
    }
    return user;
  }

  /**
   * Mukofot yoki jarima qatori yaratadi.
   *
   * ⚠ `amount` HAR DOIM MUSBAT kiritiladi; jarima (`deduction`) da
   * `expectedAmount` MANFIY qilib saqlanadi — shunda oylik yig'indi
   * oddiy `SUM()` bilan to'g'ri chiqadi va hisobotlarda maxsus holat
   * kerak bo'lmaydi.
   */
  async create(body: Record<string, any>, currentUser: any) {
    const kind = body.kind === 'deduction' ? 'deduction' : 'bonus';
    const teacher = await this.assertTeacher(body.teacher);
    const amount = Math.round(Number(body.amount) || 0);
    if (amount <= 0) throw new ApiError(400, 'Summa noldan katta bo\'lishi kerak');

    const year = Number(body.year);
    const month = Number(body.month);
    if (!year || !month || month < 1 || month > 12) {
      throw new ApiError(400, "Yil va oy to'g'ri ko'rsatilishi kerak");
    }

    if (!body.reason || !String(body.reason).trim()) {
      // ⚠ Sababsiz mukofot AUDIT uchun yaroqsiz — keyin "bu nima edi?"
      // degan savolga javob bo'lmaydi.
      throw new ApiError(400, "Sabab ko'rsatilishi shart");
    }

    // Guruh IXTIYORIY: KPI aniq bir guruh uchun bo'lsa bog'lanadi.
    let group: string | null = null;
    let branchId: string | null = null;
    if (body.group) {
      const grp = await this.prisma.group.findUnique({
        where: { id: String(body.group) },
        select: { id: true },
      });
      if (!grp) throw new ApiError(404, 'Guruh topilmadi');
      group = grp.id;
      branchId = await this.branchAccess.resolveBranchFromGroup(group);
    } else {
      branchId =
        (await this.branchAccess.resolveBranchForWrite(
          currentUser, body.branchId ?? null,
        )) || teacher.homeBranchId || null;
    }
    if (!branchId) throw new ApiError(400, 'Filial aniqlanmadi');

    const expected = kind === 'deduction' ? -amount : amount;

    const doc = await this.prisma.teacherSalary.create({
      data: {
        branchId,
        teacherId: teacher.id,
        groupId: group,
        kind,
        year,
        month,
        expectedAmount: expected,
        baseEarnings: expected,
        prorationFactor: 1,
        payableDays: 0,
        totalDays: 0,
        status: deriveStatus(0, expected),
        source: 'manual',
        reason: String(body.reason).trim(),
        approvalId: body.approvalId ? String(body.approvalId) : null,
        createdById: actorId(currentUser),
      } as never,
    });
    return withLegacyId(doc);
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * HISOB-KITOBNI YOPISH (ishdan bo'shatish oqimi).
   *
   * O'qituvchining BARCHA oylardagi to'lanmagan qoldig'ini BITTA
   * `deduction` qatori bilan nolga tushiradi.
   *
   * ⚠ NEGA JORIY OYGA YOZILADI (o'tgan oylar TAHRIRLANMAYDI):
   * o'tgan oylarda dars HAQIQATAN o'tilgan va chiqim o'sha oylarda
   * TO'G'RI hisoblangan. Ularni orqadan o'chirish TARIXNI
   * QALBAKILASHTIRISH bo'lardi. Voz kechish esa BUGUNGI qaror —
   * shuning uchun u bugungi oyga MANFIY chiqim (reversal) bo'lib
   * tushadi. Yig'indida balans nol, har oyning foydasi esa o'z davrida
   * ROST qoladi.
   *
   * ⚠ FILIAL FILTRI ATAYLAB YO'Q: maqsad — "yopdim" degandan keyin
   * arxivlash va o'chirish qorovullari ham bo'shashi. O'sha qorovullar
   * FILIALGA QARAMAYDI, shuning uchun bu yerda filtr qo'yilsa, ikki
   * filialda ishlagan xodimda qoldiq 0 ko'rinib, arxivlash baribir
   * bloklanardi — boshi berk ko'cha.
   * ═══════════════════════════════════════════════════════════════════
   */
  async settleBalance(teacherId: string, body: Record<string, any>, currentUser: any) {
    const teacher = await this.assertTeacher(teacherId);
    // ⚠ FILIAL QO'RIQCHISI — `teacherId` params dan keladi. Yuqoridagi
    // "filial filtri ataylab yo'q" izohi QATORLAR yig'indisiga tegishli,
    // O'QITUVCHINING O'ZIGA emas: usiz filial direktori begona filial
    // o'qituvchisining butun qoldig'ini hisoblab, uni O'Z filialiga
    // chiqim (deduction) qilib yozib yuborardi.
    await this.branchAccess.assertUserInBranchScope(teacher.id);

    if (!body?.reason || !String(body.reason).trim()) {
      throw new ApiError(400, "Sabab ko'rsatilishi shart");
    }

    // ⚠ XOM QATORLAR (`aggregate` EMAS): bo'sh natijada `_sum` NULL
    // qaytaradi va `balance <= 0` sharti `false` bo'lib, qo'riqchi
    // CHETLAB O'TILARDI.
    const rows = await this.prisma.teacherSalary.findMany({
      where: { teacherId: teacher.id },
      select: { expectedAmount: true, paidAmount: true },
    });

    // ⚠ NET balans (har qator alohida EMAS): mavjud jarima/mukofotlar
    // ham hisobga olinadi, aks holda ilgari yozilgan jarima IKKI MARTA
    // sanalardi.
    const totalExpected = rows.reduce((s, r) => s + (Number(r.expectedAmount) || 0), 0);
    const totalPaid = rows.reduce((s, r) => s + (Number(r.paidAmount) || 0), 0);
    const balance = totalExpected - totalPaid;

    if (balance <= 0) {
      throw new ApiError(
        400, "Bu o'qituvchida to'lanmagan qoldiq yo'q - hisob allaqachon yopiq.",
      );
    }

    // ⚠ Joriy MAHALLIY oy (Asia/Tashkent). Server UTC bo'lsa ham oy
    // chegarasida adashmasin — 1-sana 02:00 da UTC hali OLDINGI oyda.
    const today = localTodayMidnight();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + 1;

    const doc = await this.create(
      {
        teacher: teacher.id,
        kind: 'deduction',
        amount: balance,
        year,
        month,
        reason: String(body.reason).trim(),
        branchId: body.branchId ?? null,
      },
      currentUser,
    );

    return { settled: balance, year, month, adjustment: doc };
  }

  /**
   * Mukofot/jarimani o'chiradi.
   *
   * ⚠ TO'LANGAN qatorni o'chirish MUMKIN EMAS — avval to'lov bekor
   * qilinishi kerak, aks holda `SalaryTransaction` YETIM qolib chiqim
   * hisoboti buzilardi.
   */
  async remove(id: string, currentUser: any) {
    // FILIAL: boshqa filial mukofoti/jarimasini o'chirib bo'lmaydi
    // (`TeacherSalary` da `branchId` NOT NULL → to'g'ridan-to'g'ri filtr,
    // `salary-transaction.service.ts::remove` bilan bir xil idioma).
    const doc = await this.prisma.teacherSalary.findFirst({
      where: { id: String(id), ...branchFilter() },
    });
    if (!doc) throw new ApiError(404, 'Yozuv topilmadi');
    if (doc.kind !== 'bonus' && doc.kind !== 'deduction') {
      throw new ApiError(400, 'Faqat mukofot yoki jarima o\'chiriladi');
    }
    if (Number(doc.paidAmount) > 0) {
      throw new ApiError(
        400, "Bu yozuv bo'yicha to'lov qilingan. Avval to'lovni bekor qiling.",
      );
    }
    await this.prisma.teacherSalary.delete({ where: { id: doc.id } });
    return { ok: true, deletedBy: actorId(currentUser) };
  }

  /** O'qituvchining bir oydagi mukofot/jarimalari. */
  async listByTeacherMonth(teacherId: string, year: number, month: number) {
    return withLegacyIds(
      await this.prisma.teacherSalary.findMany({
        // FILIAL: o'qituvchi boshqa filialda ham ishlasa, o'sha yerdagi
        // mukofot/jarimasi shu filial ko'rinishiga chiqmasin
        // (`teacher-salary.service.ts::list` bilan bir xil idioma).
        where: {
          teacherId: String(teacherId),
          ...branchFilter(),
          year: Number(year),
          month: Number(month),
          kind: { in: ['bonus', 'deduction'] },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }
}
