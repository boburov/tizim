import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ROLES } from '../../common/constants/permissions.js';
import {
  localTodayMidnight,
  localDayOfWeek,
} from '../../common/utils/date.js';
import {
  getClassDaysInRange,
  withinCourseBounds,
} from '../../common/utils/attendance.js';
import {
  LessonCancellationService,
  isCancelledSession,
} from '../../common/helpers/lesson-cancellation.service.js';
import {
  StudentFreezeService,
  isFrozenOn,
} from '../../modules/student-freeze/student-freeze.service.js';
import { HolidaysService } from '../../modules/holidays/holidays.service.js';
import { NotificationsService } from '../../modules/notifications/notifications.service.js';
import { requireDayKey } from '../day-key.js';
import type { JobDefinition } from '../job.types.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `daily.lesson-reminder` — `server/src/jobs/lessonReminders.job.js`.
 *
 * O'quvchiga ERTALABKI dars eslatmasi (06:00). Boshqa kunlik joblardan
 * OLDIN: bu o'quvchiga tegishli YAGONA ertalabki xabar va u dars
 * boshlanishidan ancha AVVAL yetishi kerak.
 *
 * ── ⚠ TO'RTTA FILTR, HAMMASI KERAK ──
 *   1. `withinCourseBounds` — kurs boshlanmagan/tugagan bo'lsa dars yo'q
 *   2. BAYRAM — `holidayKeySetForRange` seansni tashlab ketadi
 *   3. BEKOR QILINGAN DARS — `isCancelledSession`
 *   4. MUZLATISH — muzlatilgan o'quvchiga eslatma ketmaydi
 *
 * Birortasi tushib qolsa o'quvchi BO'LMAYDIGAN dars uchun eslatma
 * olardi — va bu ishonchni darhol yo'qotadi.
 *
 * ── ⚠ DEDUPE ──
 * `lesson-reminder:<studentId>:<kun>` — job qayta yursa o'quvchi IKKI
 * xabar olardi. `requireDayKey()` `null` kun kalitida OCHIQ yiqiladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class LessonRemindersJob implements JobDefinition {
  readonly name = 'daily.lesson-reminder';
  /** Express: `every("0 6 * * *", LESSON_REMINDER_JOB)`. */
  readonly cron = '0 6 * * *';

  private readonly logger = new Logger('Job:lesson-reminder');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly holidays: HolidaysService,
    private readonly cancellations: LessonCancellationService,
    private readonly freezes: StudentFreezeService,
    private readonly notifications: NotificationsService,
  ) {}

  async run(): Promise<void> {
    const today = localTodayMidnight();
    const dayKey = requireDayKey();
    const dow = localDayOfWeek();
    const dayEnd = new Date(today.getTime() + DAY_MS);

    const groups = await this.prisma.group.findMany({
      where: {
        isActive: true,
        isDeleted: false,
        schedule: { some: { day: dow as never } },
      },
      include: { schedule: true },
    });

    if (!groups.length) {
      this.logger.log(`Bugun darsi bor guruh yo'q — eslatma yuborilmadi (${dayKey})`);
      return;
    }

    const holidaySet = await this.holidays.holidayKeySetForRange(today, today);

    const perStudent = new Map<string, { group: string; startTime: string; endTime: string }[]>();

    for (const group of groups as any[]) {
      if (!withinCourseBounds(group, today)) continue;

      const sessions = getClassDaysInRange(group, today, today, holidaySet) as any[];
      if (!sessions.length) continue;

      const cancelled = await this.cancellations.loadCancelledLessonKeys(
        group.id, today, today);
      const live = sessions.filter((s) => !isCancelledSession(cancelled, s));
      if (!live.length) continue;

      const memberships = await this.prisma.groupMembership.findMany({
        where: {
          groupId: group.id,
          joinedAt: { lt: dayEnd },
          OR: [{ leftAt: null }, { leftAt: { gt: today } }],
          isDeleted: false,
        },
        select: { studentId: true },
      });

      for (const m of memberships) {
        if (!m.studentId) continue;
        const key = String(m.studentId);
        if (!perStudent.has(key)) perStudent.set(key, []);
        for (const s of live) {
          perStudent.get(key)!.push({
            group: group.name,
            startTime: s.startTime,
            endTime: s.endTime,
          });
        }
      }
    }

    if (!perStudent.size) {
      this.logger.log(`Bugun darsi bor o'quvchi topilmadi (${dayKey})`);
      return;
    }

    const studentIds = [...perStudent.keys()];

    const activeStudents = await this.prisma.user.findMany({
      where: {
        id: { in: studentIds },
        role: ROLES.STUDENT,
        isActive: true,
        isDeleted: false,
      },
      select: { id: true },
    });
    const activeSet = new Set(activeStudents.map((u) => String(u.id)));

    // ⚠ NEST IMZOSI BOSHQA: Express `{ studentId: { in: [...] } }`
    // filtri qabul qiladi, Nest esa ID RO'YXATINI. Natija bir xil —
    // faqat chaqiruv shakli boshqa.
    const freezeByStudent = await this.freezes.loadFreezeWindowsByStudent(studentIds);
    const todayMs = today.getTime();

    let sent = 0;
    let skipped = 0;

    for (const [studentId, lessons] of perStudent) {
      if (!activeSet.has(studentId)) {
        skipped += 1;
        continue;
      }
      if (isFrozenOn(freezeByStudent.get(studentId) || [], todayMs)) {
        skipped += 1;
        continue;
      }

      lessons.sort((a, b) => a.startTime.localeCompare(b.startTime));
      const lines = lessons.map((l) => `• ${l.startTime}–${l.endTime} · ${l.group}`);
      const first = lessons[0];

      try {
        await this.notifications.send(
          {
            title: 'Bugun darsingiz bor',
            body:
              lessons.length === 1
                ? `Bugun soat ${first.startTime} da "${first.group}" guruhida darsingiz bor. Kechikmang!`
                : `Bugun ${lessons.length} ta darsingiz bor:\n${lines.join('\n')}`,
            category: 'attendance',
            audience: { type: 'auto_system', userIds: [studentId] },
            isAuto: true,
            dedupeKey: `lesson-reminder:${studentId}:${dayKey}`,
          },
          null,
        );
        sent += 1;
      } catch (err) {
        this.logger.warn(
          `Dars eslatmasi yuborilmadi (${studentId}): ${(err as Error)?.message}`,
        );
      }
    }

    this.logger.log(
      `Ertalabki dars eslatmalari yuborildi — ${dayKey}, guruhlar: ${groups.length}, ` +
        `yuborildi: ${sent}, o'tkazildi: ${skipped}`,
    );
  }
}
