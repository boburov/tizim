import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BEKOR QILINGAN DARSLARNI HISOBGA OLISH
 * (`helpers/lessonCancellation.helper.js` KO'CHIRMASI).
 *
 * ⚠ IKKI JOYDA BIR XIL ISHLATILISHI SHART:
 *   1. o'quvchi to'lovi  (`studentPayment` — hali ko'chirilmagan)
 *   2. o'qituvchi soatbay maoshi (`variableBase` — shu ish)
 *
 * Ikki joyda ikki xil mantiq bo'lsa: o'quvchi TO'LAMAGAN dars uchun
 * o'qituvchiga haq to'lanardi va markaz har bekor qilingan darsda zarar
 * ko'rardi. Shuning uchun bu servis UMUMIY joyda turadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class LessonCancellationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Oraliqdagi bekor qilingan (va KO'CHIRILMAGAN) darslar kalitlari.
   *
   * ⚠ `billable: true` yozuvlar QAYTARILMAYDI: ular ko'chirilgan (makeup)
   * darslar — dars baribir o'tiladi va pul o'zgarmasligi kerak.
   *
   * @returns `"YYYY-MM-DD"` yoki `"YYYY-MM-DD|slot"` kalitlari
   */
  async loadCancelledLessonKeys(
    groupId: string | null | undefined,
    from: Date,
    to: Date,
  ): Promise<Set<string>> {
    if (!groupId) return new Set();
    const rows = await this.prisma.lessonCancellation.findMany({
      where: {
        groupId: String(groupId),
        date: { gte: from, lte: to },
        billable: false,
        isDeleted: false,
      },
      select: { dateKey: true, slot: true },
    });

    const set = new Set<string>();
    for (const r of rows) {
      // slot="" → o'sha kunning BARCHA darslari bekor.
      set.add(r.slot ? `${r.dateKey}|${r.slot}` : r.dateKey);
    }
    return set;
  }
}

/**
 * `getClassDaysInRange` qaytargan sessiya bekor qilinganmi.
 *
 * ⚠ IKKI KALIT tekshiriladi: butun kun (slotsiz) VA aniq slot — chunki
 * "shu kun umuman dars yo'q" va "shu kunning 14:00 darsi yo'q" ikkala
 * holat ham qo'llab-quvvatlanadi.
 */
export const isCancelledSession = (
  cancelledSet: Set<string> | null | undefined,
  session: { dateKey: string | null; slot?: string },
): boolean => {
  if (!cancelledSet || cancelledSet.size === 0) return false;
  if (session.dateKey && cancelledSet.has(session.dateKey)) return true;
  return Boolean(session.slot) && cancelledSet.has(`${session.dateKey}|${session.slot}`);
};
