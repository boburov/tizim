import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId } from '../../common/utils/serialize.js';

/** Yagona qatorli sozlama (`id = "default"`). */
const DEFAULT_ID = 'default';

/**
 * DAVOMAT SOZLAMALARI — `attendanceSettings.service.js` EKVIVALENTI.
 *
 * ⚠ `withLegacyId` SHART: klient `settings?._id` ni `useEffect`
 * bog'liqligi sifatida ishlatadi (`AttendanceSettingsPage.jsx`). `_id`
 * bo'lmasa bog'liqlik DOIM `undefined` bo'lib qoladi, effekt qayta
 * ishlamaydi va forma saqlangan qiymatlarni UMUMAN yuklamaydi —
 * "Saqlash" esa standart qiymatlarni yozib yuborardi.
 */
@Injectable()
export class AttendanceSettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get() {
    return withLegacyId(
      await this.prisma.attendanceSettings.upsert({
        where: { id: DEFAULT_ID },
        update: {},
        create: { id: DEFAULT_ID },
      }),
    );
  }

  async update(body: Record<string, any>) {
    await this.get(); // qator borligiga kafolat

    const data: Record<string, any> = {};

    if (body.lowAttendanceThreshold !== undefined) {
      const v = Number(body.lowAttendanceThreshold);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        throw new ApiError(400, "Threshold 0 dan 100 gacha bo'lishi kerak");
      }
      data.lowAttendanceThreshold = v;
    }
    if (body.consecutiveAbsencesAlert !== undefined) {
      const v = Number(body.consecutiveAbsencesAlert);
      if (!Number.isInteger(v) || v < 1) {
        throw new ApiError(400, "Ketma-ket kunlar soni kamida 1 bo'lsin");
      }
      data.consecutiveAbsencesAlert = v;
    }

    return withLegacyId(
      await this.prisma.attendanceSettings.update({ where: { id: DEFAULT_ID }, data }),
    );
  }
}
