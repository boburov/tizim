import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyIds } from '../../common/utils/serialize.js';
import {
  PAYROLL_AUDIT_ACTIONS,
  PAYROLL_AUDIT_ACTION_LABELS,
} from '../../common/constants/payroll-audit.js';

export { PAYROLL_AUDIT_ACTIONS };

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MAOSH AUDIT JURNALI —
 * `server/src/modules/staffPayroll/services/payrollAudit.service.js`
 * NING TO'LIQ EKVIVALENTI (`record` + `assertMutable` + `timeline`).
 *
 * NEGA IZ MUHIM: HR sanasi moliyaga to'g'ridan-to'g'ri ta'sir qilmaydi,
 * lekin keyinchalik maosh qayta hisoblanganda natijani O'ZGARTIRADI.
 * "Sana qachon va kim tomonidan surildi?" degan savolga javob bo'lishi kerak.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Chaqiruvchilar `employee` / `actor` / `targetId` ga hujjat ham, ID ham
 * uzatadi. Prisma faqat satr qabul qiladi — bitta joyda normallashtiramiz.
 */
const toId = (v: unknown): string | null => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  const o = v as { id?: unknown; _id?: unknown };
  return o.id ? String(o.id) : o._id ? String(o._id) : null;
};

export interface PayrollAuditInput {
  employee: unknown;
  year?: number | null;
  month?: number | null;
  action: string;
  targetType?: string;
  targetId?: unknown;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  actor?: { firstName?: string; lastName?: string; id?: unknown; _id?: unknown } | null;
  meta?: unknown;
  /**
   * Chaqiruvchi tranzaksiya ichida bo'lsa — o'sha tranzaksiyada yozamiz.
   * Aks holda audit yozuvi kommit bo'lib, asosiy amal qaytarilishi mumkin
   * edi: "to'landi" degan audit izi qolib, to'lovning o'zi yo'q.
   */
  tx?: any;
}

@Injectable()
export class PayrollAuditService {
  private readonly logger = new Logger('PayrollAudit');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  /**
   * ⚠ BU METOD HECH QACHON `throw` QILMAYDI (tranzaksiyadan tashqarida).
   * Chaqiruvchi uni `await` qiladi, lekin natijasiga tayanmaydi — audit
   * tizimning ishlashini to'xtatmasligi kerak, ammo jimgina yo'qolishi
   * ham mumkin emas, shuning uchun xato LOGGA tushadi.
   */
  async record({
    employee,
    year = null,
    month = null,
    action,
    targetType = '',
    targetId = null,
    oldValue = null,
    newValue = null,
    reason = '',
    actor = null,
    meta = {},
    tx = null,
  }: PayrollAuditInput): Promise<unknown> {
    const client: any = tx || this.prisma;
    try {
      const employeeId = toId(employee);
      if (!employeeId) {
        this.logger.warn(`Audit yozuvi: xodim aniqlanmadi (action=${action})`);
        return null;
      }

      return await client.payrollAuditLog.create({
        data: {
          employeeId,
          year,
          month,
          action,
          targetType,
          targetId: toId(targetId),
          // `undefined` Prisma'da "tegma", `null` esa "NULL yoz" —
          // shuning uchun ochiq `?? null`.
          oldValue: oldValue ?? null,
          newValue: newValue ?? null,
          reason,
          actorId: toId(actor),
          actorLabel: actor?.firstName
            ? `${actor.firstName} ${actor.lastName || ''}`.trim()
            : actor
              ? ''
              : 'Tizim',
          meta: meta ?? {},
        },
      });
    } catch (err) {
      this.logger.warn(
        `Audit yozuvini saqlab bo'lmadi (action=${action}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      // ⚠ TRANZAKSIYA ICHIDA XATO YUTILMAYDI. Prisma tranzaksiyasida
      // yiqilgan so'rovdan keyin o'sha tranzaksiya baribir bekor
      // qilinadi — "yutib" davom etish faqat chalkash xato berardi.
      if (tx) throw err;
      return null;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * O'ZGARMASLIK QO'RIQCHISI — modulning YAGONA to'siq nuqtasi.
   *
   * Qulflangan, yopilgan yoki TO'LANGAN oy o'zgarmaydi. To'langanlik
   * ham kiritilgan: pul chiqib bo'lgan oyning summasini keyin
   * o'zgartirish kassa bilan hisobot orasida farq tug'diradi.
   *
   * ⚠ RAD ETILGAN URINISH HAM AUDITGA TUSHADI: "nega o'zgarmadi?"
   * degan savolga javob bo'lishi kerak, jimgina qaytib ketmasligi.
   * ═══════════════════════════════════════════════════════════════════
   */
  async assertMutable(
    payroll: {
      employeeId?: string; employee?: unknown;
      year?: number; month?: number;
      id?: string; _id?: string;
      lifecycle?: string; paidAmount?: unknown; finalAmount?: unknown;
    } | null | undefined,
    { action, actor, reason }: {
      action?: string;
      actor?: PayrollAuditInput['actor'];
      reason?: string;
    } = {},
  ): Promise<void> {
    if (!payroll) return;

    const locked = payroll.lifecycle === 'finalized';
    const paid = ((payroll.paidAmount as unknown as number) || 0) > 0;
    if (!locked && !paid) return;

    await this.record({
      employee: payroll.employeeId || payroll.employee,
      year: payroll.year ?? null,
      month: payroll.month ?? null,
      action: PAYROLL_AUDIT_ACTIONS.BLOCKED,
      targetType: 'staffPayroll',
      targetId: payroll.id || payroll._id,
      oldValue: {
        lifecycle: payroll.lifecycle,
        paidAmount: payroll.paidAmount,
        finalAmount: payroll.finalAmount,
      },
      reason,
      actor,
      meta: { attemptedAction: action },
    });

    throw new ApiError(
      400,
      locked
        ? "Bu oy yopilgan - o'zgartirish uchun avval qulfni oching."
        : "Bu oy uchun to'lov qilingan - o'zgartirish uchun avval to'lovni bekor qiling.",
    );
  }

  /** Xodimning moliyaviy TAYMLAYNI (audit tarixi). */
  async timeline(
    employeeId: string,
    { limit = 100, year, month }: {
      limit?: unknown; year?: unknown; month?: unknown;
    } = {},
  ) {
    // ⚠ FILIAL QO'RIQCHISI — `employeeId` MIJOZDAN keladi va marshrut
    // `payroll.read` bilan himoyalangan, u esa FILIAL ICHIDAGI kalit
    // (ya'ni har bir direktorda bor). Qo'riqchisiz begona filial
    // xodimining butun moliyaviy taymlayni — stavka o'zgarishlari,
    // summalar, sabablar — ochiq edi.
    //
    // ⚠ FAQAT O'QISH yo'lida: `writeAudit()` ATAYLAB tekshirilmaydi —
    // u tranzaksiya ichida chaqiriladi va hech qachon `throw`
    // qilmasligi kerak (yuqoridagi izoh).
    await this.branchAccess.assertUserInBranchScope(employeeId);

    const where: Record<string, unknown> = { employeeId: String(employeeId) };
    if (year) where.year = Number(year);
    if (month) where.month = Number(month);

    const rows = await this.prisma.payrollAuditLog.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 100, 300),
      include: {
        actor: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return withLegacyIds(
      rows.map((r) => ({
        ...r,
        actionLabel:
          (PAYROLL_AUDIT_ACTION_LABELS as Record<string, string>)[r.action] || r.action,
        actorName: r.actor
          ? `${r.actor.firstName || ''} ${r.actor.lastName || ''}`.trim()
          : r.actorLabel || 'Tizim',
      })),
    );
  }
}
