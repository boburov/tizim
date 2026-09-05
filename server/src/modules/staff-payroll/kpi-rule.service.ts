import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { branchFilter } from '../../common/als/branch-context.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { hasPermission } from '../../common/rbac/permission.service.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { KpiTriggersService } from './kpi-triggers.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KPI QOIDALARI — konfiguratsiya CRUD'i.
 *
 * Qoida o'chirilganda YUMSHOQ o'chiriladi: o'tgan oylarning maosh
 * qatorlari unga ISHORA qiladi va nomi snapshot qilingan bo'lsa ham,
 * qoidaning o'zi kerak bo'lib qolishi mumkin (audit).
 *
 * ⚠ QISMAN UNIQUE: `(employeeId, ruleId) WHERE isDeleted = false`.
 * Prisma `upsert` faqat HAQIQIY unique kalit bilan ishlaydi, qisman
 * indeks bilan emas — shuning uchun `setAssignment` avval TOPADI,
 * keyin yozadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface Actor { id?: string | null; _id?: string | null; homeBranchId?: string | null }
const actorId = (u?: Actor | null): string | null => u?.id || u?._id || null;

@Injectable()
export class KpiRuleService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly triggersService: KpiTriggersService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  /**
   * QOIDA KO'RINISHI — "mening filialim YOKI butun tarmoq".
   *
   * ⚠ Yalang'och `branchFilter()` YARAMAYDI: qoidaning `branchId` si
   * NULL bo'lishi mumkin va bu "butun tarmoq qoidasi" degani (KPI
   * dvigateli aynan shunday o'qiydi). Kesib tashlansa tarmoq qoidalari
   * ro'yxatdan JIMGINA yo'qolardi — `expense-category.service` dagi
   * `scopeWithShared` bilan bir xil shakl.
   */
  private scopeWithShared(): Record<string, unknown>[] {
    const bf = branchFilter();
    if (!Object.keys(bf).length) return [];
    return [{ OR: [bf, { branchId: null }] }];
  }

  /**
   * QOIDA FILIALI — TANADAN emas, KO'LAMDAN.
   *
   * `branchId: null` = qoida BARCHA filiallar maoshiga qo'llanadi.
   * Shuning uchun uni faqat TASHKILOT DARAJASIDAGI odam qo'ya oladi;
   * filial darajasidagi odamning qoidasi DOIM o'z filialiga bog'lanadi.
   *
   * ⚠ `canSeeAllBranches()` bu yerda YARAMAYDI — u ko'rinish rejimi,
   * vakolat emas: yakka filialli markazda u EGA uchun ham `false`
   * (`market.service` dagi `isOrgLevel` bilan bir xil sabab).
   */
  private async resolveRuleBranchId(
    requested: unknown,
    currentUser: Actor | null,
    permissions?: string[],
  ): Promise<string | null> {
    if (hasPermission(permissions, PERMISSIONS.BRANCHES_VIEW_ALL)) {
      return requested ? String(requested) : null;
    }
    return this.branchAccess.resolveBranchForWrite(currentUser, requested ?? null);
  }

  triggers() {
    return this.triggersService.listTriggers();
  }

  async list({ enabled, trigger }: { enabled?: boolean; trigger?: string } = {}) {
    const where: Record<string, unknown> = { isDeleted: false };
    if (enabled !== undefined) where.enabled = enabled;
    if (trigger) where.trigger = trigger;

    // FILIAL: begona filial qoidasi ro'yxatga tushmasin (tarmoq
    // qoidalari — `branchId: null` — hammaga ko'rinaveradi).
    const scope = this.scopeWithShared();
    if (scope.length) where.AND = scope;

    const rules = await this.prisma.kpiRule.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
    });

    // Har qoida nechta xodimga SHAXSAN biriktirilgan.
    const counts = await this.prisma.staffKpiAssignment.groupBy({
      by: ['ruleId'],
      where: { isDeleted: false, enabled: true },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [String(c.ruleId), c._count._all]));

    return withLegacyIds(
      rules.map((r) => ({
        ...r,
        assignedCount: countMap.get(String(r.id)) || 0,
      })),
    );
  }

  /** Ichki o'qish — XOM Prisma yozuvi (`update`/`remove` shundan foydalanadi). */
  private async loadRule(id: string) {
    // FILIAL: `id` MIJOZDAN keladi — begona filial qoidasini ID bilan
    // ochib, `update`/`remove` orqali o'sha filial maoshini
    // o'zgartirib bo'lmasin.
    const rule = await this.prisma.kpiRule.findFirst({
      where: { id: String(id), isDeleted: false, AND: this.scopeWithShared() },
    });
    if (!rule) throw new ApiError(404, 'KPI qoidasi topilmadi');
    return rule;
  }

  async getById(id: string) {
    return withLegacyId(await this.loadRule(id));
  }

  private assertTrigger(trigger: string): void {
    if (!this.triggersService.has(trigger)) {
      throw new ApiError(400, 'Bunday KPI triggeri mavjud emas');
    }
  }

  /**
   * ⚠ FOIZ CHEGARASI — `rewardType="percent"` bo'lganda `rewardValue`
   * FOIZ, so'm EMAS. 100 dan oshsa xodimga tushum summasidan KO'PROQ
   * mukofot yozilardi.
   *
   * Servisda, chunki `update` QISMAN: `{ rewardType: "percent" }` ni
   * yolg'iz yuborib, eski so'mli `rewardValue` (masalan 500 000) ni
   * joyida qoldirish mumkin — o'sha holat ham tutilishi kerak.
   */
  private assertRewardShape(
    { rewardType, rewardValue }: { rewardType?: string; rewardValue?: unknown },
  ): void {
    if (rewardType === 'percent' && Number(rewardValue) > 100) {
      throw new ApiError(400, "Foiz stavkasi 100 dan oshmasligi kerak");
    }
  }

  /**
   * `body` dan FAQAT ustunlar olinadi.
   *
   * ⚠ Prisma noma'lum maydonda "Unknown argument" bilan yiqiladi.
   * `{...body}` ni to'g'ridan-to'g'ri uzatish marshrutga qo'shilgan har
   * qanday yangi maydonda 500 berardi, shuning uchun OQ RO'YXAT.
   */
  private ruleColumns(body: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (body.name !== undefined) out.name = body.name;
    if (body.description !== undefined) out.description = body.description;
    if (body.trigger !== undefined) out.trigger = body.trigger;
    if (body.conditions !== undefined) out.conditions = body.conditions ?? {};
    if (body.rewardType !== undefined) out.rewardType = body.rewardType;
    if (body.rewardValue !== undefined) out.rewardValue = Number(body.rewardValue) || 0;
    if (body.applicableRoles !== undefined) {
      out.applicableRoles = body.applicableRoles || [];
    }
    // ⚠ `branchId` ATAYLAB YO'Q: tanadagi qiymat XOM yozilsa (ayniqsa
    // `null`) qoida butun tarmoqniki bo'lib, HAR filial maoshiga
    // qo'llanardi. Filial `resolveRuleBranchId()` da hisoblanadi.
    if (body.monthlyCap !== undefined) out.monthlyCap = Number(body.monthlyCap) || 0;
    if (body.enabled !== undefined) out.enabled = body.enabled;
    return out;
  }

  async create(
    body: Record<string, unknown>,
    currentUser: Actor | null,
    permissions?: string[],
  ) {
    this.assertTrigger(body.trigger as string);
    this.assertRewardShape({
      rewardType: body.rewardType as string, rewardValue: body.rewardValue });
    // FILIAL: qoida qaysi filialga tegishli ekani KO'LAMDAN chiqadi.
    const branchId = await this.resolveRuleBranchId(
      body.branchId, currentUser, permissions);
    const rule = await this.prisma.kpiRule.create({
      data: {
        ...this.ruleColumns(body),
        branchId,
        // `rewardValue` sxemada MAJBURIY (default yo'q) — berilmasa
        // Prisma yiqiladi, bu to'g'ri: mukofot qiymatsiz qoida ma'nosiz.
        rewardValue: Number(body.rewardValue) || 0,
        createdById: actorId(currentUser),
      } as never,
    });
    return withLegacyId(rule);
  }

  async update(
    id: string,
    body: Record<string, unknown>,
    currentUser: Actor | null,
    permissions?: string[],
  ) {
    if (body.trigger) this.assertTrigger(body.trigger as string);

    const rule = await this.loadRule(id);
    // Qisman patch: tekshiruv KEYINGI holat ustida bajariladi.
    this.assertRewardShape({
      rewardType: (body.rewardType as string) ?? rule.rewardType,
      rewardValue: body.rewardValue ?? rule.rewardValue,
    });
    // FILIAL: tana bilan qoidani begona filialga — yoki `null` orqali
    // BUTUN TARMOQQA — ko'chirib bo'lmaydi, ko'lam qayta hisoblanadi.
    const branchPatch =
      body.branchId === undefined
        ? {}
        : {
            branchId: await this.resolveRuleBranchId(
              body.branchId, currentUser, permissions),
          };

    const saved = await this.prisma.kpiRule.update({
      where: { id: rule.id },
      data: {
        ...this.ruleColumns(body),
        ...branchPatch,
        updatedById: actorId(currentUser),
      } as never,
    });
    return withLegacyId(saved);
  }

  async remove(id: string, currentUser: Actor | null) {
    const rule = await this.loadRule(id);
    const by = actorId(currentUser);

    // ⚠ Uchala yozuv BITTA tranzaksiyada: qoida o'chirilib,
    // biriktiruvlari qolib ketsa ular mavjud bo'lmagan qoidaga ishora
    // qilardi va `rebuildAutoKpi` har oyda "qoida topilmadi" deb
    // aylanib yurardi.
    await this.prisma.$transaction(async (tx) => {
      await tx.kpiRule.update({
        where: { id: rule.id },
        data: { isDeleted: true, deletedAt: new Date(), deletedBy: by },
      });

      // Biriktiruvlar ham o'chadi — "o'chirilgan qoida"ga ishora qilib
      // turishning ma'nosi yo'q.
      await tx.staffKpiAssignment.updateMany({
        where: { ruleId: rule.id, isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date() },
      });

      // ⚠ YOPILMAGAN oylardagi qatorlar tozalanadi. Yopilgan oylar
      // TEGILMAYDI — to'langan/qabul qilingan maosh o'zgarmaydi.
      await tx.staffPayrollItem.deleteMany({
        where: { ruleId: rule.id, payroll: { lifecycle: 'draft' } },
      });
    });

    return { id: rule.id };
  }

  // ─── BIRIKTIRUVLAR (xodim × qoida) ───

  async listAssignments(employeeId: string) {
    // ⚠ FILIAL QO'RIQCHISI — `employeeId` MIJOZDAN keladi.
    await this.branchAccess.assertUserInBranchScope(employeeId);
    return withLegacyIds(
      await this.prisma.staffKpiAssignment.findMany({
        where: { employeeId: String(employeeId), isDeleted: false },
        include: { rule: true },
      }),
    );
  }

  /**
   * Biriktiruvni o'rnatish (yaratish yoki yangilash).
   *
   * ⚠ `enabled: false` — ISTISNO: rol bo'yicha tegishli qoidani shu
   * xodim uchun O'CHIRADI.
   */
  async setAssignment(
    body: {
      employee: string; rule: string;
      enabled?: boolean; rewardValueOverride?: unknown;
    },
    currentUser: Actor | null,
  ) {
    // FILIAL: begona filial qoidasini biriktirib bo'lmaydi.
    const rule = await this.prisma.kpiRule.findFirst({
      where: {
        id: String(body.rule), isDeleted: false, AND: this.scopeWithShared(),
      },
      select: { id: true },
    });
    if (!rule) throw new ApiError(404, 'KPI qoidasi topilmadi');

    const employeeId = String(body.employee);
    // ⚠ FILIAL QO'RIQCHISI — `body.employee` MIJOZDAN keladi. Bu PUL
    // YOZADIGAN yo'l: biriktiruv xodimning oyligiga mukofot qo'shadi.
    await this.branchAccess.assertUserInBranchScope(employeeId);
    const data = {
      enabled: body.enabled !== false,
      rewardValueOverride:
        body.rewardValueOverride === undefined ||
        body.rewardValueOverride === null ||
        body.rewardValueOverride === ''
          ? null
          : Number(body.rewardValueOverride),
    };

    // ⚠ Unique indeks QISMAN, Prisma `upsert` esa faqat to'liq unique
    // kalitni qabul qiladi — shuning uchun topib-yozamiz. Poyga bo'lsa
    // indeks P2002 beradi va mavjudini o'qiymiz (natija bir xil).
    const existing = await this.prisma.staffKpiAssignment.findFirst({
      where: { employeeId, ruleId: rule.id, isDeleted: false },
      select: { id: true },
    });
    if (existing) {
      return withLegacyId(
        await this.prisma.staffKpiAssignment.update({
          where: { id: existing.id }, data: data as never }),
      );
    }

    try {
      return withLegacyId(
        await this.prisma.staffKpiAssignment.create({
          data: {
            ...data, employeeId, ruleId: rule.id, createdById: actorId(currentUser),
          } as never,
        }),
      );
    } catch (err) {
      if ((err as { code?: string })?.code !== 'P2002') throw err;
      const raced = await this.prisma.staffKpiAssignment.findFirst({
        where: { employeeId, ruleId: rule.id, isDeleted: false },
      });
      if (!raced) throw err;
      return withLegacyId(
        await this.prisma.staffKpiAssignment.update({
          where: { id: raced.id }, data: data as never }),
      );
    }
  }

  async removeAssignment(id: string, currentUser: Actor | null) {
    const doc = await this.prisma.staffKpiAssignment.findFirst({
      where: { id: String(id), isDeleted: false },
      select: { id: true, employeeId: true },
    });
    if (!doc) throw new ApiError(404, 'Biriktiruv topilmadi');
    // ⚠ FILIAL QO'RIQCHISI — `id` params dan keladi: begona filial
    // xodimining mukofot biriktiruvi o'chirib yuborilmasin.
    await this.branchAccess.assertUserInBranchScope(doc.employeeId);
    await this.prisma.staffKpiAssignment.update({
      where: { id: doc.id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser) },
    });
    return { id: doc.id };
  }
}
