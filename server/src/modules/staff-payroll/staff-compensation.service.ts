import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { ROLES } from '../../common/constants/permissions.js';
import { RolesHelperService } from '../../common/rbac/roles.helper.js';
import { toUtcMidnight, parseLocalDay } from '../../common/utils/date.js';
import { StaffPayrollService } from './staff-payroll.service.js';
import { PayrollAuditService, PAYROLL_AUDIT_ACTIONS } from './payroll-audit.service.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { userBranchCondition, isBranchAllowed } from '../../common/als/branch-context.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * XODIM MAOSH SHARTNOMASI — hayot sikli.
 *
 * O'qituvchi moduli bilan ARALASHMAYDI: u yerda `assertTeacher` roldan
 * o'tkazmaydi, bu yerda esa aksincha — o'quvchi rad etiladi, qolgan
 * hamma (owner, o'qituvchi, custom rollar) qabul qilinadi.
 *
 * ⚠ O'QITUVCHI HAQIDA MUHIM: o'qituvchining ASOSIY maoshi eski modulda
 * (`TeacherCompensation`) qoladi va TEGILMAYDI. Bu yerda unga shartnoma
 * ochilsa, u faqat KPI uchun bo'lishi kerak (`salaryType="kpi_only"`) —
 * aks holda oylik IKKI marta hisoblanardi.
 *
 * ⚠ ATOMIKLIK: `setCompensation` IKKI yozuv qiladi (eskisini yopish +
 * yangisini ochish). Ikkinchisi yiqilsa xodim SHARTNOMASIZ qolardi va
 * oyligi jimgina 0 ga tushardi — shuning uchun bitta `$transaction`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface Actor { id?: string | null; _id?: string | null; firstName?: string; lastName?: string }
const actorId = (u?: Actor | null): string | null => u?.id || u?._id || null;

@Injectable()
export class StaffCompensationService {
  private readonly logger = new Logger('StaffCompensation');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly payroll: StaffPayrollService,
    private readonly audit: PayrollAuditService,
    private readonly roles: RolesHelperService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  private async assertEmployee(employeeId: string) {
    // ⚠ FILIAL QO'RIQCHISI — `employeeId` MIJOZDAN keladi
    // (`payroll-history.service.ts` dagi bilan AYNI idioma). Filtrsiz
    // A filial direktori B filial xodimiga maosh shartnomasi ocha,
    // stavkasini o'zgartira olardi.
    // Owner va kontekstsiz chaqiruv (import/job) uchun jim o'tadi.
    await this.branchAccess.assertUserInBranchScope(employeeId);
    const user = await this.prisma.user.findUnique({
      where: { id: String(employeeId) },
      select: { id: true, role: true, homeBranchId: true },
    });
    if (!user) throw new ApiError(404, 'Xodim topilmadi');
    if (user.role === ROLES.STUDENT) {
      throw new ApiError(400, "O'quvchiga maosh shartnomasi ochilmaydi");
    }
    return user;
  }

  private assertTeacherKpiOnly(user: { role: string }, salaryType: string): void {
    if (user.role !== ROLES.TEACHER) return;
    if (salaryType === 'kpi_only') return;
    throw new ApiError(
      400,
      "O'qituvchining oyligi o'qituvchi maoshi modulida hisoblanadi. Bu yerda unga faqat KPI shartnomasi ochiladi.",
    );
  }

  async listByEmployee(employeeId: string) {
    // ⚠ FILIAL: bu metod `assertEmployee()` dan O'TMAYDI — begona
    // xodimning maosh tarixi (stavka summalari) ochiq qolardi.
    await this.branchAccess.assertUserInBranchScope(employeeId);
    const items = await this.prisma.staffCompensation.findMany({
      where: { employeeId: String(employeeId), isDeleted: false },
      orderBy: { effectiveFrom: 'desc' },
    });

    const active = items.find((i) => !i.effectiveTo) || null;
    return {
      items: withLegacyIds(items),
      active: active ? withLegacyId(active) : null,
    };
  }

  /**
   * Yangi shartnoma o'rnatish (oshirish/o'zgartirish).
   *
   * Ochiq shartnoma `effectiveTo` bilan yopiladi va yangisi ochiladi —
   * TARIX saqlanadi. Yanvar maoshi martdagi oshirishdan keyin ham
   * yanvar stavkasi bo'yicha qoladi.
   */
  async setCompensation(
    body: {
      employee: string; salaryType?: string; baseAmount?: number;
      effectiveFrom?: string; branchId?: string | null; note?: string;
    },
    currentUser: Actor | null,
  ) {
    const user = await this.assertEmployee(body.employee);
    const salaryType = body.salaryType || 'fixed';
    this.assertTeacherKpiOnly(user, salaryType);

    const effectiveFrom = toUtcMidnight(
      parseLocalDay(body.effectiveFrom as string) || new Date(),
    ) as Date;

    // ⚠ Filial: shartnomada berilmasa xodimning asosiy filiali.
    // Ikkalasi ham yo'q bo'lsa — ANIQ xato. O'qituvchi modulida bu
    // holat jimgina "maosh qatori umuman yaratilmaydi"ga olib kelardi.
    const branchId = body.branchId || user.homeBranchId || null;
    if (!branchId) {
      throw new ApiError(
        400,
        "Xodimga filial biriktirilmagan - avval filialni belgilang",
      );
    }

    const open = await this.prisma.staffCompensation.findFirst({
      where: { employeeId: user.id, effectiveTo: null, isDeleted: false },
      select: { id: true, effectiveFrom: true, salaryType: true, baseAmount: true },
    });

    if (open && open.effectiveFrom >= effectiveFrom) {
      throw new ApiError(
        400,
        "Yangi shartnoma amaldagisidan keyin boshlanishi kerak",
      );
    }

    // ⚠ Eskisini yopish va yangisini ochish BITTA tranzaksiyada: qisman
    // unique indeks `(employeeId) WHERE effectiveTo IS NULL` bitta
    // ochiq shartnomaga ruxsat beradi, ya'ni yopish yiqilsa yaratish
    // ham o'tmaydi — "shartnomasiz xodim" holati mumkin emas.
    const created = await this.prisma.$transaction(async (tx) => {
      if (open) {
        await tx.staffCompensation.update({
          where: { id: open.id },
          data: { effectiveTo: effectiveFrom, updatedById: actorId(currentUser) },
        });
      }
      return tx.staffCompensation.create({
        data: {
          employeeId: user.id,
          branchId,
          salaryType,
          baseAmount: (salaryType === 'kpi_only' ? 0 : body.baseAmount || 0) as never,
          effectiveFrom,
          note: body.note || '',
          createdById: actorId(currentUser),
        } as never,
      });
    });

    await this.audit.record({
      employee: user.id,
      action: PAYROLL_AUDIT_ACTIONS.SALARY_CHANGED,
      targetType: 'compensation',
      targetId: created.id,
      oldValue: open
        ? { salaryType: open.salaryType, baseAmount: open.baseAmount }
        : null,
      newValue: { salaryType, baseAmount: created.baseAmount, effectiveFrom },
      reason: body.note || '',
      actor: currentUser,
    });

    // Joriy oyni darhol qayta hisoblaymiz — egasi natijani ko'rsin.
    const now = new Date();
    try {
      await this.payroll.computePayroll(
        user.id, now.getUTCFullYear(), now.getUTCMonth() + 1);
    } catch (err) {
      // Hisob xatosi shartnoma yaratilishini bekor qilmasin.
      this.logger.warn(
        `Shartnomadan keyin maoshni qayta hisoblab bo'lmadi (${String(user.id)}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return withLegacyId(created);
  }

  /** Xato kiritilgan shartnomani tuzatish (summani/turini o'zgartirish). */
  async amendCompensation(
    id: string,
    patch: {
      salaryType?: string; baseAmount?: number;
      branchId?: string | null; note?: string;
    },
    currentUser: Actor | null,
  ) {
    const doc = await this.prisma.staffCompensation.findFirst({
      where: { id: String(id), isDeleted: false },
    });
    if (!doc) throw new ApiError(404, 'Shartnoma topilmadi');

    const user = await this.assertEmployee(doc.employeeId);
    const salaryType = patch.salaryType || doc.salaryType;
    this.assertTeacherKpiOnly(user, salaryType);

    const data: Record<string, unknown> = { updatedById: actorId(currentUser) };
    if (patch.baseAmount !== undefined) data.baseAmount = patch.baseAmount;
    if (patch.salaryType !== undefined) data.salaryType = patch.salaryType;
    if (patch.note !== undefined) data.note = patch.note;
    if (patch.branchId !== undefined) {
      // FILIAL: tana bilan kelgan filialni TEKSHIRAMIZ — aks holda
      // shartnomani begona filialga ko'chirib yuborish mumkin edi.
      // `null` ATAYLAB ruxsat: u "filial biriktirilmagan" degani va
      // mavjud xatti-harakat shu (`setCompensation` ham shunday yozadi).
      if (patch.branchId && !isBranchAllowed(patch.branchId)) {
        throw new ApiError(403, "Bu filialga shartnoma biriktirib bo'lmaydi");
      }
      data.branchId = patch.branchId || null;
    }

    // ⚠ KPI-ONLY → FIKSA SUMMA 0. `{ salaryType: "kpi_only" }` ni
    // YOLG'IZ yuborish yetarli edi: eski `baseAmount` (masalan
    // 3 000 000) joyida qolardi. `computePayroll` `kpi_only` segmentini
    // fiksaga qo'shmaydi, lekin `baseAmount` maosh varaqasiga SNAPSHOT
    // bo'lib tushardi — hujjatda hech qachon to'lanmaydigan "asosiy
    // maosh" raqami abadiy turib qolardi.
    const nextType = (data.salaryType as string) ?? doc.salaryType;
    if (nextType === 'kpi_only') data.baseAmount = 0;

    const saved = await this.prisma.staffCompensation.update({
      where: { id: doc.id },
      data: data as never,
    });

    const now = new Date();
    try {
      await this.payroll.computePayroll(
        doc.employeeId, now.getUTCFullYear(), now.getUTCMonth() + 1);
    } catch (err) {
      this.logger.warn(
        `Tuzatishdan keyin qayta hisob xatosi: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return withLegacyId(saved);
  }

  /** Shartnomani bekor qilish (yopish emas — xato kiritilgan bo'lsa). */
  async removeCompensation(id: string, currentUser: Actor | null) {
    const doc = await this.prisma.staffCompensation.findFirst({
      where: { id: String(id), isDeleted: false },
    });
    if (!doc) throw new ApiError(404, 'Shartnoma topilmadi');

    // ⚠ FILIAL: `amendCompensation()` dan FARQLI, bu yerda
    // `assertEmployee()` chaqirilmasdi — ya'ni begona filial xodimining
    // shartnomasini ID bo'yicha o'chirib yuborish mumkin edi.
    await this.branchAccess.assertUserInBranchScope(doc.employeeId);

    // ⚠ O'chirish va oldingi davrni qayta ochish BIRGA: ikkinchisi
    // yiqilsa xodimda shartnomasiz teshik qolardi.
    await this.prisma.$transaction(async (tx) => {
      await tx.staffCompensation.update({
        where: { id: doc.id },
        data: {
          isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser),
        },
      });

      // Oldingi davr ochiq qolsin — bo'shliq qolmasin.
      const prev = await tx.staffCompensation.findFirst({
        where: {
          employeeId: doc.employeeId,
          isDeleted: false,
          effectiveTo: doc.effectiveFrom,
        },
        orderBy: { effectiveFrom: 'desc' },
        select: { id: true },
      });
      if (prev) {
        await tx.staffCompensation.update({
          where: { id: prev.id },
          data: { effectiveTo: doc.effectiveTo || null },
        });
      }
    });

    return { id: doc.id };
  }

  /**
   * Maosh shartnomasi YO'Q xodimlar — "kim e'tibordan chetda qolgan".
   * Xodimlar ro'yxatida shartnomasiz odam ko'rinmay qolardi.
   */
  async employeesWithoutCompensation() {
    const catalog = await this.roles.loadRoleCatalog();
    const studentValues = [...catalog.values()]
      .filter((r) => r.roleType === 'student')
      .map((r) => r.value);
    if (!studentValues.includes(ROLES.STUDENT)) studentValues.push(ROLES.STUDENT);

    const compRows = await this.prisma.staffCompensation.findMany({
      where: { isDeleted: false, effectiveTo: null },
      select: { employeeId: true },
      distinct: ['employeeId'],
    });
    const withComp = compRows.map((r) => r.employeeId);

    return withLegacyIds(
      await this.prisma.user.findMany({
        where: {
          role: { notIn: [...studentValues, ROLES.TEACHER] },
          isActive: true,
          isDeleted: false,
          id: { notIn: withComp },
          // ⚠ FILIAL: `AND` ichida — `userBranchCondition()` o'zi `OR`
          // ishlatadi va uni yuqori darajaga qo'ysak boshqa shartlarni
          // JIMGINA bosib ketardi (`branch-context.ts` dagi ogohlantirish).
          // Filtrsiz bu ro'yxat BUTUN markazning xodimlarini berardi.
          AND: [userBranchCondition() ?? {}],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          homeBranchId: true,
        },
      }),
    );
  }
}
