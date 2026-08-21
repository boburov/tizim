import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceService } from '../../modules/attendance/attendance.service.js';
import { NotificationsService } from '../../modules/notifications/notifications.service.js';
import { localTodayMidnight } from '../../common/utils/date.js';
import { requireDayKey } from '../day-key.js';
import { ROLES } from '../../common/constants/permissions.js';
import type { JobDefinition } from '../job.types.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `weekly.low-attendance` — `server/src/jobs/lowAttendanceDigest.job.js`.
 *
 * Har dushanba 09:30 da egalarga JORIY OY davomida davomati chegaradan
 * past o'quvchilar ro'yxati.
 *
 * ⚠ OYNA — OY BOSHIDAN BUGUNGACHA, oxirgi 7 kun EMAS. Haftalik oyna
 * bilan bitta kasal bo'lgan hafta o'quvchini "xavfli" ro'yxatiga
 * tashlardi; oylik oyna esa BARQAROR tendensiyani ko'rsatadi.
 *
 * ⚠ RO'YXAT 15 TA BILAN CHEGARALANGAN (`getDashboardStats` o'zi 20 ta
 * qaytaradi). Telegram xabari 4096 belgidan uzun bo'lsa BUTUNLAY
 * rad etiladi — chegara shu uchun.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const MAX_LINES = 15;

@Injectable()
export class LowAttendanceDigestJob implements JobDefinition {
  readonly name = 'weekly.low-attendance';
  /** Express: `every("30 9 * * 1", LOW_ATTENDANCE_JOB)` — dushanba. */
  readonly cron = '30 9 * * 1';

  private readonly logger = new Logger('Job:low-attendance');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly notifications: NotificationsService,
  ) {}

  async run(): Promise<void> {
    const today = localTodayMidnight();
    // Joriy oyning 1-sanasi (UTC-midnight — `localTodayMidnight` bilan
    // bir xil kalendar tizimida).
    const from = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0, 0),
    );

    // ⚠ `limit: 1` — bizga FAQAT `lowAttendanceStudents` kerak.
    // `groupBreakdown` sahifalanadi va uni to'liq tortish katta markazda
    // keraksiz og'irlik bo'lardi.
    const stats = await this.attendance.getDashboardStats({
      fromDate: from,
      toDate: today,
      page: 1,
      limit: 1,
    });

    const low = stats.lowAttendanceStudents || [];
    if (low.length === 0) {
      this.logger.log("Past davomatli o'quvchi yo'q");
      return;
    }

    const owners = await this.prisma.user.findMany({
      where: { role: ROLES.OWNER, isActive: true, isDeleted: false },
      select: { id: true },
    });
    if (!owners.length) return;

    type LowRow = { student?: { firstName?: string; lastName?: string }; rate?: number };
    const lines = (low as LowRow[]).slice(0, MAX_LINES).map((s) => {
      const last = (s.student?.lastName || '').trim();
      const first = (s.student?.firstName || '').trim();
      return `• ${last} ${first} - ${s.rate}%`;
    });

    try {
      await this.notifications.send(
        {
          title: `Past davomat (${stats.threshold}% dan past)`,
          body: `Joriy oyda davomati past o'quvchilar:\n${lines.join('\n')}`,
          category: 'attendance',
          audience: { type: 'auto_system', userIds: owners.map((o) => String(o.id)) },
          isAuto: true,
          dedupeKey: `low-attendance-owner:${requireDayKey()}`,
        },
        null,
      );
    } catch (err) {
      this.logger.warn(`Past davomat hisoboti yuborilmadi: ${String(err)}`);
    }

    this.logger.log(`Past davomat hisoboti yuborildi (${low.length} o'quvchi)`);
  }
}
