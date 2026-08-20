import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PAYROLL_AUDIT_ACTIONS } from '../../common/constants/payroll-audit.js';

export { PAYROLL_AUDIT_ACTIONS };

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MAOSH AUDIT JURNALI — ⚠ QISMAN KO'CHIRILGAN (faqat `record`).
 *
 * `server/src/modules/staffPayroll/services/payrollAudit.service.js` dagi
 * SO'ROV metodlari (`list`, o'zgarmaslik qo'riqchisi) FAZA 8 da ko'chadi.
 * Hozir faqat YOZISH kerak: `PATCH /users/:id` da `hiredAt` o'zgarsa
 * uning izi qolishi shart.
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

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
}
