import { Injectable, Logger } from '@nestjs/common';
import { HolidaysService } from '../../modules/holidays/holidays.service.js';
import { NotificationsService } from '../../modules/notifications/notifications.service.js';
import { requireDayKey } from '../day-key.js';
import type { JobDefinition } from '../job.types.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `daily.holiday-greetings` — `server/src/jobs/holidayGreetings.job.js`.
 *
 * Bugungi bayram bo'lsa o'quvchilarga/o'qituvchilarga tabrik yuboradi.
 *
 * ── ⚠ IKKI QATLAMLI DUBLIKAT HIMOYASI (ikkalasi ham SHART) ──
 *
 *  1. `holiday.lastSentAt` — job ikkinchi marta yursa `isAlreadySentToday`
 *     uni o'tkazib yuboradi;
 *  2. `dedupeKey` = `holiday:<id>:<audience>:<dayKey>` — bu BAZA
 *     darajasidagi kafolat. Birinchisi yetarli emas: `markSent` yuborishdan
 *     KEYIN yoziladi, ya'ni ikki nusxa bir vaqtda yursa ikkalasi ham
 *     `lastSentAt` ni bo'sh ko'rib, ikkalasi ham yuborardi. `dedupeKey`
 *     esa o'sha poygada ikkinchi xabarni YARATTIRMAYDI.
 *
 * ── ⚠ `markSent` YUBORISHDAN KEYIN ──
 *
 * Tartib teskari bo'lsa, yuborish yiqilgan bayram "yuborilgan" bo'lib
 * qolardi va o'sha yili boshqa hech qachon takrorlanmasdi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Auditoriya xaritasi — Express bilan AYNAN.
 *
 * ⚠ `all` IKKI XABAR yuboradi (`all_students` + `all_teachers`), bitta
 * "hammaga" auditoriyasi EMAS. Express izohida bu "V1" xatti-harakati
 * deb qayd etilgan; birlashtirsak dedupe kalitlari ham o'zgarib,
 * allaqachon yuborilgan bayramlar QAYTA ketardi.
 */
const AUDIENCE_MAP: Record<string, string> = {
  all: 'all_students',
  students: 'all_students',
  teachers: 'all_teachers',
};

@Injectable()
export class HolidayGreetingsJob implements JobDefinition {
  readonly name = 'daily.holiday-greetings';
  /** Express: `every("30 8 * * *", HOLIDAY_JOB)` — past davomat bilan to'qnashmasin. */
  readonly cron = '30 8 * * *';

  private readonly logger = new Logger('Job:holiday-greetings');

  constructor(
    private readonly holidays: HolidaysService,
    private readonly notifications: NotificationsService,
  ) {}

  private audiencesFor(audience: string): string[] {
    if (audience === 'all') return ['all_students', 'all_teachers'];
    return [AUDIENCE_MAP[audience] || 'all_students'];
  }

  private async dispatch(
    holiday: { id?: string; _id?: string; name: string; message: string; audience: string },
    dayKey: string,
  ): Promise<void> {
    const holidayId = String(holiday._id ?? holiday.id);
    for (const type of this.audiencesFor(holiday.audience)) {
      await this.notifications.send(
        {
          title: holiday.name,
          body: holiday.message,
          category: 'holiday',
          audience: { type },
          isAuto: true,
          dedupeKey: `holiday:${holidayId}:${type}:${dayKey}`,
        },
        // ⚠ `null` — tizim yuboruvchisi. `senderRole` "system" bo'ladi va
        // auditoriya ko'lami CHEKLANMAYDI (o'qituvchi faqat o'z
        // o'quvchilariga yozadi, tizim esa hammaga).
        null,
      );
    }
  }

  async run(): Promise<void> {
    const today = new Date();
    const dayKey = requireDayKey(today);
    const holidays = await this.holidays.getTodayHolidays(today);

    let sent = 0;
    let skipped = 0;

    for (const h of holidays as never as Array<{
      id: string; _id?: string; name: string; message: string;
      audience: string; lastSentAt?: Date | null;
    }>) {
      if (this.holidays.isAlreadySentToday(h, today)) {
        skipped += 1;
        continue;
      }
      try {
        await this.dispatch(h, dayKey);
        await this.holidays.markSent(String(h._id ?? h.id), today);
        sent += 1;
      } catch (err) {
        // ⚠ BITTA BAYRAM YIQILSA QOLGANLARI YUBORILAVERADI. Xato
        // tashlansa butun job qayta urinardi va ALLAQACHON yuborilgan
        // bayramlar `dedupeKey` ga tayanib qolardi — kafolat bo'lsa-da,
        // keraksiz.
        this.logger.warn(`Bayram tabrigi yuborilmadi (${h._id ?? h.id}): ${String(err)}`);
      }
    }

    this.logger.log(
      `Bayram tabriklari: jami ${holidays.length}, yuborildi ${sent}, o'tkazildi ${skipped}`,
    );
  }
}
