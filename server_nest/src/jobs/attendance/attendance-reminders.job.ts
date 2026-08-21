import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceService } from '../../modules/attendance/attendance.service.js';
import { NotificationsService } from '../../modules/notifications/notifications.service.js';
import { localTodayMidnight, localDayOfWeek } from '../../common/utils/date.js';
import { requireDayKey } from '../day-key.js';
import { ROLES } from '../../common/constants/permissions.js';
import type { JobDefinition } from '../job.types.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `daily.attendance-unmarked` — `server/src/jobs/attendanceReminders.job.js`.
 *
 * Kechqurun 20:00 da: bugungi darsi bo'lgan-u davomati TO'LIQ
 * belgilanmagan guruhlarni topadi va (a) har o'qituvchiga o'z guruhlari
 * ro'yxatini, (b) egalarga umumiy yig'mani yuboradi.
 *
 * ── ⚠ NEGA HAR GURUH UCHUN ALOHIDA SO'ROV ──
 *
 * `listForGroupOnDate` shunchaki davomat qatorlarini o'qimaydi: u
 * jadval versiyasini, bayramlarni, muzlatishlarni va ozod qilishlarni
 * hisobga olib "bugun shu guruhda kim BO'LISHI KERAK edi" ni hisoblaydi.
 * Uni bitta yalpi so'rov bilan almashtirish o'sha qoidalarni qayta
 * yozish bo'lardi — ya'ni ikkinchi haqiqat manbai.
 *
 * ── DUBLIKAT HIMOYASI ──
 *
 * `dedupeKey`: `att-unmarked:<teacherId>:<dayKey>` va
 * `att-unmarked-owner:<dayKey>`. Job kunda ikki marta yursa ikkinchi
 * xabar YARATILMAYDI.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class AttendanceRemindersJob implements JobDefinition {
  readonly name = 'daily.attendance-unmarked';
  /** Express: `every("0 20 * * *", ATTENDANCE_UNMARKED_JOB)`. */
  readonly cron = '0 20 * * *';

  private readonly logger = new Logger('Job:attendance-unmarked');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly notifications: NotificationsService,
  ) {}

  async run(): Promise<void> {
    const today = localTodayMidnight();
    const dow = localDayOfWeek();
    const dayKey = requireDayKey();

    const groups = await this.prisma.group.findMany({
      where: {
        isActive: true,
        isDeleted: false,
        // Bugungi hafta kunida darsi bor guruhlar.
        schedule: { some: { day: dow } },
      },
      include: { teachers: { select: { id: true } } },
    });

    const perTeacher = new Map<string, Array<{ name: string; unmarked: number; total: number }>>();
    const ownerDigest: Array<{ name: string; unmarked: number; total: number }> = [];

    for (const g of groups) {
      let data;
      try {
        data = await this.attendance.listForGroupOnDate(g.id, today);
      } catch (err) {
        // ⚠ BITTA GURUH YIQILSA QOLGANLARI HISOBLANAVERADI: bitta buzuq
        // jadval butun kechqurungi eslatmani yo'q qilmasligi kerak.
        this.logger.warn(`Guruh davomati o'qilmadi (${g.id}): ${String(err)}`);
        continue;
      }

      if (!data.isClassDay) continue;
      const total = data.rows.length;
      if (total === 0) continue;
      const unmarked = data.rows.filter((r: { attendance?: unknown }) => !r.attendance).length;
      if (unmarked === 0) continue;

      const entry = { name: g.name, unmarked, total };
      ownerDigest.push(entry);
      for (const t of g.teachers || []) {
        const k = String(t.id);
        if (!perTeacher.has(k)) perTeacher.set(k, []);
        perTeacher.get(k)!.push(entry);
      }
    }

    let sent = 0;
    for (const [teacherId, list] of perTeacher) {
      const lines = list.map((x) => `• ${x.name}: ${x.unmarked}/${x.total} belgilanmagan`);
      try {
        await this.notifications.send(
          {
            title: 'Bugungi davomat belgilanmagan',
            body: `Quyidagi guruhlarda bugungi davomat to'liq belgilanmagan:\n${lines.join('\n')}`,
            category: 'attendance',
            audience: { type: 'auto_system', userIds: [teacherId] },
            isAuto: true,
            dedupeKey: `att-unmarked:${teacherId}:${dayKey}`,
          },
          null,
        );
        sent += 1;
      } catch (err) {
        this.logger.warn(`O'qituvchi eslatmasi yuborilmadi (${teacherId}): ${String(err)}`);
      }
    }

    if (ownerDigest.length > 0) {
      const owners = await this.prisma.user.findMany({
        where: { role: ROLES.OWNER, isActive: true, isDeleted: false },
        select: { id: true },
      });
      if (owners.length) {
        const lines = ownerDigest.map((x) => `• ${x.name}: ${x.unmarked}/${x.total}`);
        try {
          await this.notifications.send(
            {
              title: 'Davomat belgilanmagan guruhlar',
              body:
                `Bugun ${ownerDigest.length} ta guruhda davomat to'liq belgilanmadi:\n` +
                lines.join('\n'),
              category: 'attendance',
              audience: { type: 'auto_system', userIds: owners.map((o) => String(o.id)) },
              isAuto: true,
              dedupeKey: `att-unmarked-owner:${dayKey}`,
            },
            null,
          );
        } catch (err) {
          this.logger.warn(`Egasiga davomat hisoboti yuborilmadi: ${String(err)}`);
        }
      }
    }

    this.logger.log(
      `Davomat eslatmalari: ${groups.length} guruh tekshirildi, ` +
        `${sent} o'qituvchiga yuborildi, ${ownerDigest.length} guruh yig'mada`,
    );
  }
}
