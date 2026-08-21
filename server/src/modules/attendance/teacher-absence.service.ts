import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId } from '../../common/utils/serialize.js';
import {
  parseLocalDay,
  dateKeyOf,
  dayOfWeekOf,
  localTodayMidnight,
} from '../../common/utils/date.js';
import { scheduleActiveOn } from '../../common/utils/attendance.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-request.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QITUVCHI KELMAGANI — PROYEKSIYA XIZMATI.
 * `modules/attendance/services/teacherAbsence.service.js` KO'CHIRMASI.
 *
 * ⚠ MUSTAQIL HAQIQAT EMAS. `TeacherAbsence` yozuvlari
 * `TeacherAttendance` (manba-haqiqat) dan `teacherAttendance.service`
 * orqali hosil qilinadi va maosh/chegirma hisobiga ishlatiladi.
 *
 * ⚠ JADVAL ALOHIDA JADVALDA — `include` qilinmasa `scheduleActiveOn`
 * bo'sh massiv qaytarib, HAR KUN "dars kuni emas" bo'lardi va
 * o'qituvchi kelmagani HECH QACHON yozilmasdi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const GROUP_WITH_SCHEDULE = {
  id: true,
  teachers: { select: { id: true } },
  schedule: {
    select: { day: true, startTime: true, endTime: true, effectiveFrom: true },
  },
} as const;

@Injectable()
export class TeacherAbsenceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private parseDay(dateInput: unknown): Date {
    const date = parseLocalDay(dateInput);
    if (!date) throw new ApiError(400, "Sana noto'g'ri");
    return date;
  }

  /** Shu sanada AMAL QILGAN jadval versiyasi bo'yicha (versiyalash). */
  private isClassDayFor(group: any, dow: string, date: Date | null = null): boolean {
    return scheduleActiveOn(group.schedule, date).some((s) => s.day === dow);
  }

  private async loadGroup(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: String(groupId) },
      select: GROUP_WITH_SCHEDULE,
    });
    if (!group) throw new ApiError(404, 'Guruh topilmadi');
    return group;
  }

  /**
   * O'qituvchi shu kuni keldimi.
   *
   * ⚠ FAQAT FAKT — o'quvchilar hisobiga TA'SIR QILMAYDI.
   */
  async getStatus(groupId: string, dateInput: unknown) {
    const group = await this.loadGroup(groupId);
    const date = this.parseDay(dateInput);
    const dKey = dateKeyOf(date)!;
    const absence = await this.prisma.teacherAbsence.findFirst({
      where: { groupId: String(groupId), dateKey: dKey, isDeleted: false },
      select: { id: true },
    });
    return {
      dateKey: dKey,
      isClassDay: this.isClassDayFor(group, dayOfWeekOf(date), date),
      present: !absence,
    };
  }

  /**
   * O'qituvchi kelmadi — faqat BELGILAB qo'yiladi.
   *
   * ⚠ O'QUVCHILAR TO'LOVIGA TEGMAYDI. Jarima kerak bo'lsa, admin
   * o'qituvchi maoshiga QO'LDA yozadi (individual qaror).
   */
  async setAbsent(groupId: string, dateInput: unknown, currentUser: AuthenticatedUser) {
    const group = await this.loadGroup(groupId);
    const date = this.parseDay(dateInput);
    const dKey = dateKeyOf(date)!;
    // Kelajak sanaga "kelmadi" yozib bo'lmaydi (`bulkRecord` bilan bir
    // xil qoida) — lekin XABAR boshqacha, ataylab saqlangan.
    if (date.getTime() > localTodayMidnight().getTime()) {
      throw new ApiError(400, "Kelajak sanaga davomat belgilab bo'lmaydi");
    }
    if (!this.isClassDayFor(group, dayOfWeekOf(date), date)) {
      throw new ApiError(400, "Bu kun bu guruh uchun dars kuni emas");
    }

    const existing = await this.prisma.teacherAbsence.findFirst({
      where: { groupId: String(groupId), dateKey: dKey },
    });
    if (existing) return withLegacyId(existing);

    /**
     * ⚠ POYGA HIMOYASI: `(groupId, dateKey)` unique. Ikki so'rov bir
     * vaqtda kelsa ikkinchisi P2002 bilan yiqilardi — bu XATO EMAS,
     * yozuv baribir bor. Mongo'da bu `11000` kodi edi.
     */
    try {
      const created = await this.prisma.teacherAbsence.create({
        data: {
          groupId: String(groupId),
          teacherId: group.teachers?.[0]?.id || null,
          date,
          dateKey: dKey,
          recordedById: String(currentUser._id),
        },
      });
      return withLegacyId(created);
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
      const again = await this.prisma.teacherAbsence.findFirst({
        where: { groupId: String(groupId), dateKey: dKey },
      });
      return again ? withLegacyId(again) : null;
    }
  }

  /**
   * O'qituvchi keldi — belgini olib tashlaymiz.
   *
   * ⚠ GURUH TEKSHIRILMAYDI va SANA CHEGARASI YO'Q (Express'da ham
   * shunday): `setAbsent` dan farqli, bu yerda `loadGroup()` ham,
   * kelajak-kun tekshiruvi ham chaqirilmaydi. Mavjud bo'lmagan guruh
   * uchun ham `{ removed: false }` qaytadi, 404 EMAS.
   */
  async setPresent(groupId: string, dateInput: unknown) {
    const date = this.parseDay(dateInput);
    const dKey = dateKeyOf(date)!;
    const res = await this.prisma.teacherAbsence.deleteMany({
      where: { groupId: String(groupId), dateKey: dKey },
    });
    return { removed: res.count > 0 };
  }

  async toggle(
    groupId: string,
    dateInput: unknown,
    present: boolean,
    currentUser: AuthenticatedUser,
  ) {
    return present
      ? this.setPresent(groupId, dateInput)
      : this.setAbsent(groupId, dateInput, currentUser);
  }
}
