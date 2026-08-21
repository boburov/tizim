import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ROLES } from '../constants/permissions.js';
import { toUtcMidnight } from '../utils/date.js';

/**
 * `server/src/helpers/studentCompletion.helper.js` NING KO'CHIRMASI.
 *
 * O'quvchining "yakunlash sanasi" (`completedAt`) ni qayta hisoblaydi.
 *
 * MANBA USTUVORLIGI (O'ZGARMADI):
 *   1) `completedAtManual = true` → qo'lda override, tegmaymiz.
 *   2) `archivedAt` bor          → `completedAt = archivedAt`.
 *   3) faol a'zolik bor          → `null` (hali o'qiyapti).
 *   4) faol a'zolik yo'q, lekin a'zoliklar bor → eng oxirgi `leftAt`.
 *   5) umuman a'zolik yo'q       → `null`.
 *
 * ⚠ SOFT-DELETE AVTOMATIK FILTRLANMAYDI, shuning uchun `isDeleted: false`
 * har bir so'rovda OCHIQ yozilgan.
 */
@Injectable()
export class StudentCompletionService {
  private readonly logger = new Logger('StudentCompletion');

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** `tx` berilsa o'sha tranzaksiyada ishlaydi. */
  async recompute(studentId: string, { tx }: { tx?: any } = {}): Promise<void> {
    const client: any = tx || this.prisma;

    const user = await client.user.findUnique({
      where: { id: String(studentId) },
      select: {
        id: true,
        role: true,
        completedAt: true,
        completedAtManual: true,
        archivedAt: true,
      },
    });
    if (!user || user.role !== ROLES.STUDENT) return;
    if (user.completedAtManual) return;

    let completedAt: Date | null = null;
    if (user.archivedAt) {
      completedAt = toUtcMidnight(user.archivedAt);
    } else {
      // FAOL a'zolik bormi — bitta so'rov yetadi (hammasini o'qish shart emas).
      const active = await client.groupMembership.findFirst({
        where: { studentId: user.id, isDeleted: false, leftAt: null },
        select: { id: true },
      });

      if (!active) {
        // Eng OXIRGI chiqish sanasi — `orderBy` buni bazada hal qiladi.
        const lastLeft = await client.groupMembership.findFirst({
          where: { studentId: user.id, isDeleted: false, leftAt: { not: null } },
          select: { leftAt: true },
          orderBy: { leftAt: 'desc' },
        });
        if (lastLeft?.leftAt) completedAt = toUtcMidnight(lastLeft.leftAt);
      }
    }

    const current = user.completedAt ? new Date(user.completedAt).getTime() : null;
    const next = completedAt ? completedAt.getTime() : null;
    if (current !== next) {
      await client.user.update({ where: { id: user.id }, data: { completedAt } });
    }
  }

  /** Xato bo'lsa ham asosiy oqim buzilmasligi uchun best-effort variant. */
  async safeRecompute(studentId: string, opts?: { tx?: any }): Promise<void> {
    try {
      await this.recompute(studentId, opts);
    } catch (err) {
      this.logger.warn(
        `completedAt qayta hisoblanmadi (student=${studentId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
