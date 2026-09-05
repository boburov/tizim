import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { assertGroupActive } from '../../common/helpers/group-state.js';
import { branchFilter, runWithBranchContext } from '../../common/als/branch-context.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { ROLES } from '../../common/constants/permissions.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
import { StudentPaymentService } from './student-payment.service.js';
import { TeacherSalaryService } from '../teacher-salary/teacher-salary.service.js';
import { ExpenseApprovalsService } from '../expense-approvals/expense-approvals.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHEGIRMA (`Discount`) — Express `finance/services/discount.service.js`
 * NING KO'CHIRMASI.
 *
 * Chegirma o'quvchi `expectedAmount` ini → guruh billed tushumini →
 * o'qituvchining FOIZ maoshini o'zgartiradi. Uchala qadam shu servisda
 * ketma-ket bajariladi.
 *
 * ⚠ `Discount` da UNIQUE INDEKS YO'Q (na Mongo'da, na Postgres'da).
 * Dublikatdan yagona himoya — `create()` ichidagi OCHIQ tekshiruv.
 *
 * ⚠ `TeacherSalaryService` `forwardRef` bilan: `TeacherSalaryModule`
 * `FinanceModule` ni import qiladi, ya'ni bog'liqlik HAQIQATAN aylanma
 * (batafsil izoh `group-fee.service.ts` da).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const STUDENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  phone: true,
};

@Injectable()
export class DiscountService {
  private readonly logger = new Logger('DiscountService');

  constructor(
    // ⚠ `@Inject` SHART — `PrismaService` token (qarang `prisma.module.ts`).
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly payments: StudentPaymentService,
    @Inject(forwardRef(() => TeacherSalaryService))
    private readonly salaries: TeacherSalaryService,
    private readonly approvals: ExpenseApprovalsService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  private actorId(u: any): string | null {
    return u?.id || u?._id || null;
  }

  /**
   * Chegirma guruh billed tushumini o'zgartiradi → o'qituvchining foiz
   * maoshi ham qayta hisoblanadi.
   *
   * ⚠ BEST-EFFORT (Express bilan aynan bir xil): maosh qayta hisobi
   * yiqilsa chegirmaning O'ZI saqlanib qoladi.
   */
  private async recalcTeacherForDiscount(doc: {
    group: string; scope?: string | null; year?: number | null; month?: number | null;
  }): Promise<void> {
    try {
      if (doc.scope === 'monthly' && doc.year && doc.month) {
        await this.salaries.recalcForGroupMonth(doc.group, doc.year, doc.month);
      } else {
        await this.salaries.recalcForGroup(doc.group);
      }
    } catch (err) {
      this.logger.warn(
        "Chegirma o'zgarishida o'qituvchi maoshi qayta hisoblanmadi: " +
          (err as Error).message,
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // O'QISH
  // ══════════════════════════════════════════════════════════════════

  async list({
    studentId, groupId, year, month, page = 1, limit = 50,
  }: {
    studentId?: string; groupId?: string;
    year?: number; month?: number; page?: number; limit?: number;
  }) {
    // FILIAL KO'LAMI: `Discount` da `branchId` YO'Q — u GURUHGA tegishli,
    // guruh esa filialga. Ilgari bu filtr yo'q edi va A filial direktori
    // B filialning chegirmalarini ko'rardi.
    const groupScope: any = await this.branchAccess.branchGroupFilter('groupId');

    const where: any = { ...groupScope, isDeleted: false };
    if (studentId) where.studentId = String(studentId);

    if (groupId) {
      const gid = String(groupId);
      // So'ralgan guruh ko'lam ICHIDA ekanini tekshiramiz. Tekshirmasdan
      // `where.groupId = gid` deb yozilsa, guruh ID'sini qo'lda berish
      // orqali ko'lam butunlay chetlab o'tilardi.
      const allowed = groupScope.groupId?.in;
      if (allowed && !allowed.some((id: unknown) => String(id) === gid)) {
        return { items: [], total: 0, page, limit };
      }
      where.groupId = gid;
    }
    // Oy filtri: o'sha oyga tegishli `monthly` + BARCHA `permanent`.
    if (year && month) {
      where.OR = [
        { scope: 'permanent' },
        { scope: 'monthly', year: Number(year), month: Number(month) },
      ];
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.discount.findMany({
        where,
        include: {
          student: { select: STUDENT_SELECT },
          group: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.discount.count({ where }),
    ]);

    return { items: withLegacyIds(items), total, page, limit };
  }

  // ══════════════════════════════════════════════════════════════════
  // INVARIANTLAR
  // ══════════════════════════════════════════════════════════════════

  private async ensureStudentAndGroup(studentId: string, groupId: string) {
    const [student, group] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: String(studentId), role: ROLES.STUDENT, isDeleted: false },
        select: { id: true },
      }),
      // FILIAL: bu YOZUV yo'lining darvozasi — guruh joriy ko'lamda
      // bo'lishi shart. Filtrsiz A filial direktori B filial guruhiga
      // chegirma yozib, o'sha filialning o'quvchi qarzini va o'qituvchi
      // foiz maoshini qayta hisoblab yuborardi (`group-fee.upsert()`
      // dagi bilan ayni idioma).
      this.prisma.group.findFirst({
        where: { id: String(groupId), isDeleted: false, ...branchFilter() },
        select: { id: true, isActive: true, isDeleted: true, endDate: true },
      }),
    ]);
    if (!student) throw new ApiError(400, "O'quvchi topilmadi");
    assertGroupActive(group);
  }

  /**
   * CHEGIRMA SHAKLI INVARIANTI — avval Mongoose `pre("validate")` da edi.
   *
   *   1. `type="percent"`  → `value` 100 dan oshmaydi
   *   2. `scope="monthly"` → yil va oy MAJBURIY
   *
   * 1: 100 dan katta foiz o'quvchi hisobini MANFIY qiladi — markaz unga
   *    qarzdor bo'lib qoladi. Zod'dagi `value: min(0)` da yuqori chegara
   *    yo'q, chunki `fixed` turida qiymat so'mda va million bo'lishi normal.
   *
   * 2: hook o'chgach bu qoida JIMGINA yo'qolgan edi — servis yil/oyni rad
   *    etish o'rniga `null` yozib ketardi. Natijada "oylik" chegirma hech
   *    qaysi oyga tegishli bo'lmasdi: `recalcForStudentScope` uni hech
   *    qachon topmasdi va chegirma umuman qo'llanmasdi.
   */
  private assertDiscountShape({ type, value, scope, year, month }: {
    type?: string; value?: unknown; scope?: string;
    year?: number | null; month?: number | null;
  }): void {
    if (type === 'percent' && Number(value) > 100) {
      throw new ApiError(400, "Foiz 100 dan oshmasligi kerak");
    }
    if (scope === 'monthly' && (!year || !month)) {
      throw new ApiError(400, "Oylik chegirma uchun yil va oy kerak");
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // YOZISH
  // ══════════════════════════════════════════════════════════════════

  async create(body: any, currentUser?: any) {
    this.assertDiscountShape(body);
    await this.ensureStudentAndGroup(body.student, body.group);

    // Double-submit himoyasi: aynan bir xil FAOL chegirma ikki marta
    // yozilmasin (ikkalasi ham qo'llanib, expected ikki baravar kamayardi).
    const scopeYear = body.scope === 'monthly' ? body.year : null;
    const scopeMonth = body.scope === 'monthly' ? body.month : null;

    const duplicate = await this.prisma.discount.findFirst({
      where: {
        studentId: String(body.student),
        groupId: String(body.group),
        type: body.type,
        value: body.value,
        scope: body.scope,
        year: scopeYear,
        month: scopeMonth,
        isActive: true,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ApiError(409, "Xuddi shunday faol chegirma allaqachon mavjud");
    }

    const doc = await this.prisma.discount.create({
      data: {
        studentId: String(body.student),
        groupId: String(body.group),
        type: body.type,
        value: body.value,
        scope: body.scope,
        year: scopeYear,
        month: scopeMonth,
        reason: body.reason || '',
        createdById: this.actorId(currentUser),
      } as never,
    });

    await this.payments.recalcForStudentScope(doc.studentId, doc.groupId, {
      scope: doc.scope,
      year: doc.year ?? undefined,
      month: doc.month ?? undefined,
    });
    await this.recalcTeacherForDiscount({ ...(doc as any), group: doc.groupId });
    return withLegacyId(doc);
  }

  async update(id: string, body: any) {
    // FILIAL: `Discount` da `branchId` YO'Q — ko'lam GURUH orqali
    // (`list()` dagi bilan ayni filtr). Filtrsiz begona chegirmani ID
    // bo'yicha tahrirlash mumkin edi, bu esa pastdagi
    // `recalcForStudentScope` + `recalcTeacherForDiscount` kaskadi bilan
    // BOSHQA filialning hisob-kitobini qayta yozardi.
    const groupScope: any = await this.branchAccess.branchGroupFilter('groupId');
    const doc = await this.prisma.discount.findFirst({
      where: { id: String(id), isDeleted: false, ...groupScope },
    });
    if (!doc) throw new ApiError(404, 'Chegirma topilmadi');

    // Yozishdan OLDINGI qamrov — scope/oy o'zgarsa eski oy(lar)
    // snapshot'ida chegirma "muzlab" qolmasligi uchun ularni ham qayta
    // hisoblaymiz.
    const prevScope = { scope: doc.scope, year: doc.year, month: doc.month };

    const data: any = {};
    if (body.type !== undefined) data.type = body.type;
    if (body.value !== undefined) data.value = body.value;
    if (body.scope !== undefined) data.scope = body.scope;
    if (body.reason !== undefined) data.reason = body.reason;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    const nextScope = body.scope !== undefined ? body.scope : doc.scope;
    if (nextScope === 'monthly') {
      if (body.year !== undefined) data.year = body.year;
      if (body.month !== undefined) data.month = body.month;
    } else {
      data.year = null;
      data.month = null;
    }

    // Tekshiruv KEYINGI holat ustida: `{ scope: "monthly" }` ni yolg'iz
    // yuborish mumkin, u holda yil/oy yozuvdagi eski (null) qiymatda
    // qolardi.
    this.assertDiscountShape({
      type: data.type ?? doc.type,
      value: data.value ?? doc.value,
      scope: nextScope,
      year: nextScope === 'monthly' ? (data.year ?? doc.year) : null,
      month: nextScope === 'monthly' ? (data.month ?? doc.month) : null,
    });

    const saved = await this.prisma.discount.update({
      where: { id: doc.id }, data,
    });

    const scopeChanged =
      prevScope.scope !== saved.scope ||
      prevScope.year !== saved.year ||
      prevScope.month !== saved.month;
    if (scopeChanged) {
      await this.payments.recalcForStudentScope(saved.studentId, saved.groupId, {
        scope: prevScope.scope,
        year: prevScope.year ?? undefined,
        month: prevScope.month ?? undefined,
      });
      await this.recalcTeacherForDiscount({
        group: saved.groupId, ...prevScope,
      });
    }

    await this.payments.recalcForStudentScope(saved.studentId, saved.groupId, {
      scope: saved.scope,
      year: saved.year ?? undefined,
      month: saved.month ?? undefined,
    });
    await this.recalcTeacherForDiscount({ ...(saved as any), group: saved.groupId });
    return withLegacyId(saved);
  }

  async remove(id: string, currentUser?: any) {
    // FILIAL: `update()` bilan ayni sabab — o'chirish ham chegirmani
    // olib tashlab, o'sha filialning qarz va maosh raqamlarini qayta
    // hisoblaydi.
    const groupScope: any = await this.branchAccess.branchGroupFilter('groupId');
    const doc = await this.prisma.discount.findFirst({
      where: { id: String(id), isDeleted: false, ...groupScope },
    });
    if (!doc) throw new ApiError(404, 'Chegirma topilmadi');
    await this.prisma.discount.update({
      where: { id: doc.id },
      data: {
        isDeleted: true, deletedAt: new Date(), deletedBy: this.actorId(currentUser),
      },
    });
    await this.payments.recalcForStudentScope(doc.studentId, doc.groupId, {
      scope: doc.scope,
      year: doc.year ?? undefined,
      month: doc.month ?? undefined,
    });
    await this.recalcTeacherForDiscount({ ...(doc as any), group: doc.groupId });
    return { id: doc.id, _id: doc.id };
  }

  // ══════════════════════════════════════════════════════════════════
  // CHEGIRMA TASDIG'I (owner tasdig'i talab qilinganda)
  //
  // Chegirma TAKRORLANUVCHI: `scope="permanent"` bo'lsa har oy qayta
  // qo'llanadi, ya'ni oyiga 500 000 so'mlik chegirma 2 yilda 12 mln
  // bo'ladi — lekin bironta ham "amaliyot" chiqim limitidan oshmaydi.
  // Shuning uchun tekshiruv summaga emas, IKKILIK huquqqa bog'lanadi
  // (`approvals.decide_config`).
  //
  // ⚠ TASDIQLANMAGUNCHA `Discount` hujjati YARATILMAYDI: hujjat mavjud
  // bo'lishining O'ZI snapshot'dagi `isActive: true` filtriga tushib,
  // o'quvchi to'lovini DARHOL kamaytirardi.
  // ══════════════════════════════════════════════════════════════════

  /**
   * Subyekt qulfi: bir "slot" uchun bitta kutilayotgan so'rov.
   *
   * Yaratish va tahrirlash BOSHQA subyekt fazolari — yangi chegirma
   * so'rovi mavjudini tahrirlash so'roviga to'sqinlik qilmaydi.
   */
  private discountSubjectKey(payload: any): string {
    return payload.op === 'update'
      ? `discount:${String(payload.discountId)}`
      : `discount:new:${String(payload.student)}:${String(payload.group)}:` +
        `${payload.scope}:${payload.year || 0}:${payload.month || 0}`;
  }

  /**
   * Chegirmani TASDIQQA yuboradi (hujjat yaratmaydi).
   *
   * Yengil tekshiruv: o'quvchi/guruh bor-yo'qligi. To'liq qoidalar
   * (dublikat, foiz chegarasi, guruh aktivligi) ATAYLAB tasdiqlash
   * paytida qayta tekshiriladi — so'rov va tasdiq orasida holat
   * o'zgarishi mumkin.
   */
  async requestDiscount(
    { op, discountId, body }: { op: string; discountId?: string; body: any },
    currentUser?: any,
  ) {
    let student: string;
    let group: string;
    let base: any = {};
    if (op === 'update') {
      // FILIAL: tasdiq yo'li ham `update()` bilan bir xil kesiladi —
      // aks holda begona chegirmani "so'rov" ko'rinishida ushlab,
      // uning summasi/oyi tasdiqlanganda o'zgarardi.
      const groupScope: any = await this.branchAccess.branchGroupFilter('groupId');
      const existing = await this.prisma.discount.findFirst({
        where: { id: String(discountId), isDeleted: false, ...groupScope },
      });
      if (!existing) throw new ApiError(404, 'Chegirma topilmadi');
      student = existing.studentId;
      group = existing.groupId;
      // Tahrirda faqat berilgan maydonlar o'zgaradi — qolgani eskisicha.
      base = {
        type: existing.type,
        value: existing.value,
        scope: existing.scope,
        year: existing.year,
        month: existing.month,
      };
    } else {
      student = body.student;
      group = body.group;
    }

    await this.ensureStudentAndGroup(student, group);

    const [studentDoc, groupDoc] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: String(student) }, select: STUDENT_SELECT,
      }),
      this.prisma.group.findUnique({
        where: { id: String(group) }, select: { name: true },
      }),
    ]);

    const payload: any = {
      op,
      discountId: discountId ? String(discountId) : undefined,
      student: String(student),
      group: String(group),
      type: body.type ?? base.type,
      value: body.value ?? base.value,
      scope: body.scope ?? base.scope,
      year: body.year ?? base.year,
      month: body.month ?? base.month,
      reason: body.reason,
      isActive: body.isActive,
    };

    return this.approvals.createRequest({
      branchId: await this.branchAccess.resolveBranchFromGroup(group),
      kind: APPROVAL_KINDS.DISCOUNT_SET,
      payload,
      subjectKey: this.discountSubjectKey(payload),
      subjectName:
        [studentDoc?.firstName, studentDoc?.lastName].filter(Boolean).join(' ') || '',
      contextName: groupDoc?.name || '',
      requestNote: body.requestNote,
      currentUser,
    });
  }

  /**
   * Tasdiqlangan chegirma so'rovini BAJARADI.
   *
   * `create`/`update` NING O'ZINI chaqiradi — dublikat tekshiruvi, foiz
   * chegarasi va qayta hisoblash (studentPayment + o'qituvchi foiz
   * maoshi) shu yerda QAYTA ishlaydi. Yiqilsa `approve()` so'rovni
   * FAILED qiladi.
   *
   * ⚠ FILIAL KONTEKSTI MAJBURAN o'rnatiladi — `executeApprovedGroupFee`
   * dagi bilan AYNI sabab: `create()`/`update()` ichidagi filial filtri
   * TASDIQLOVCHINING joriy ko'rinishiga bog'liq. Owner "Toshkent" ni
   * tanlab turib Buxoro so'rovini tasdiqlasa, guruh/chegirma topilmay
   * so'rov bekorga FAILED bo'lardi. So'rovning O'Z filiali — yagona
   * to'g'ri kontekst.
   */
  async executeApprovedDiscount(approval: any) {
    const p = approval?.payload || {};
    const branchId = String(approval?.branchId);
    const requesterId = approval?.requestedById || approval?.requestedBy || null;
    const actor = { id: requesterId, _id: requesterId };

    return runWithBranchContext(
      {
        branchId,
        allowedBranchIds: [branchId],
        canSeeAllBranches: false,
        userId: String(requesterId || ''),
      },
      () => {
        if (p.op === 'create') {
          return this.create(
            {
              student: p.student,
              group: p.group,
              type: p.type,
              value: p.value,
              scope: p.scope,
              year: p.year,
              month: p.month,
              reason: p.reason,
            },
            actor,
          );
        }

        if (p.op === 'update') {
          if (!p.discountId) {
            throw new ApiError(400, "So'rovda chegirma identifikatori yo'q");
          }
          return this.update(p.discountId, {
            type: p.type,
            value: p.value,
            scope: p.scope,
            year: p.year,
            month: p.month,
            reason: p.reason,
            isActive: p.isActive,
          });
        }

        throw new ApiError(400, `Noma'lum chegirma amali: ${p.op}`);
      },
    );
  }
}
