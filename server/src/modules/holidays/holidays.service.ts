import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { ROLES } from '../../common/constants/permissions.js';
import { HOLIDAY_AUDIENCES } from '../../common/constants/calendar.js';
import { userBranchCondition } from '../../common/als/branch-context.js';
import { dateKeyOf, toUtcMidnight, localTodayMidnight } from '../../common/utils/date.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BAYRAMLAR — `services/holidays.service.js` EKVIVALENTI.
 *
 * ⚠⚠ BU SERVIS PUL YO'LIDA TURADI. ⚠⚠
 *
 * `holidayKeySetForRange()` ni DAVOMAT, o'quvchi TO'LOVI (proratsiya) VA
 * o'qituvchining SOATBAY MAOSHI chaqiradi. Bayram kuni dars kuni
 * SANALMAYDI, ya'ni bu yerdagi har bir xato to'g'ridan-to'g'ri
 * hisoblangan SUMMANI o'zgartiradi.
 *
 * Shuning uchun sana mantig'iga — recurring/one-time, oy oshib ketish
 * qo'riqlovi, kesh TTL — UMUMAN TEGILMADI.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const CREATED_BY = { select: { id: true, firstName: true, lastName: true } };

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_BIRTHDAY_TITLE = "Tug'ilgan kun muborak!";

/**
 * Berilgan yildagi tug'ilgan kun (UTC yarim tun timestamp'i).
 *
 * ⚠ 29-FEVRAL QO'RIQLOVI: kabisa bo'lmagan yilda `Date.UTC(y, 1, 29)`
 * KEYINGI OYGA (1-mart) ko'chib ketardi. Bunday holatda oyning oxirgi
 * kuniga (28-fev) tushiriladi.
 */
const birthdayTsForYear = (year: number, bMonth: number, bDay: number): number => {
  const ts = Date.UTC(year, bMonth, bDay);
  if (new Date(ts).getUTCMonth() !== bMonth) {
    return Date.UTC(year, bMonth + 1, 0); // shu oyning oxirgi kuni
  }
  return ts;
};

@Injectable()
export class HolidaysService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async list({
    search, audience, includeInactive = false, includePast = false,
    page = 1, limit = 100,
  }: {
    search?: string; audience?: string; includeInactive?: boolean;
    includePast?: boolean; page?: number; limit?: number;
  }) {
    const where: Record<string, any> = {};
    if (!includeInactive) where.isActive = true;
    if (audience) where.audience = audience;
    if (search && search.trim()) {
      where.name = { contains: search.trim(), mode: 'insensitive' };
    }
    if (!includePast) {
      // Bir martalik bayramlardan O'TGANLARINI chiqarib tashlaymiz;
      // har yilgilar (recurring) DOIM qoladi.
      const currentYear = new Date().getUTCFullYear();
      where.OR = [
        { isRecurring: true },
        { isRecurring: false, year: { gte: currentYear } },
      ];
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.holiday.findMany({
        where,
        orderBy: [{ month: 'asc' }, { day: 'asc' }],
        skip,
        take: limit,
        include: { createdBy: CREATED_BY },
      }),
      this.prisma.holiday.count({ where }),
    ]);
    return { items: withLegacyIds(items), total, page, limit };
  }

  /** Ichki o'qish: XOM Prisma yozuvi (`update`/`softRemove` shundan foydalanadi). */
  private async loadHoliday(id: string) {
    const doc = await this.prisma.holiday.findUnique({
      where: { id: String(id) },
      include: { createdBy: CREATED_BY },
    });
    if (!doc) throw new ApiError(404, 'Bayram topilmadi');
    return doc;
  }

  async getById(id: string) {
    return withLegacyId(await this.loadHoliday(id));
  }

  private validateBody(body: Record<string, any>): void {
    if (body.audience && !(HOLIDAY_AUDIENCES as readonly string[]).includes(body.audience)) {
      throw new ApiError(400, "Noto'g'ri auditoriya");
    }
    if (body.month !== undefined) {
      const m = Number(body.month);
      if (!Number.isInteger(m) || m < 1 || m > 12) {
        throw new ApiError(400, "Oy 1 dan 12 gacha bo'lishi kerak");
      }
    }
    if (body.day !== undefined) {
      const d = Number(body.day);
      if (!Number.isInteger(d) || d < 1 || d > 31) {
        throw new ApiError(400, "Kun 1 dan 31 gacha bo'lishi kerak");
      }
      // ⚠ OYGA MOS KUN CHEGARASI. Fevral uchun 29 RUXSAT — har yilgi
      // bayram kabisa yillarda ishlaydi (kabisa bo'lmaganda
      // `holidayKeySetForRange` uni o'zi tashlab ketadi).
      const m = body.month !== undefined ? Number(body.month) : null;
      if (m) {
        const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
        if (d > maxDay) {
          throw new ApiError(400, `${m}-oy uchun kun ${maxDay} dan oshmasligi kerak`);
        }
      }
    }
  }

  async create(body: Record<string, any>, currentUser: any) {
    this.validateBody(body);
    const trimmed = String(body.name || '').trim();
    if (!trimmed) throw new ApiError(400, 'Nom kerak');

    const isRecurring = body.isRecurring !== false;
    const year = isRecurring ? null : Number(body.year);
    if (!isRecurring && (!year || year < 2000 || year > 2100)) {
      throw new ApiError(400, "Bir martalik bayram uchun to'g'ri yil kerak");
    }

    const doc = await this.prisma.holiday.create({
      data: {
        name: trimmed,
        isRecurring,
        month: Number(body.month),
        day: Number(body.day),
        year,
        message: String(body.message),
        audience: body.audience || 'all',
        createdById: currentUser?.id || currentUser?._id || null,
      } as never,
      include: { createdBy: CREATED_BY },
    });
    this.invalidateHolidayCache();
    return withLegacyId(doc);
  }

  async update(id: string, body: Record<string, any>) {
    const doc = await this.loadHoliday(id);
    this.validateBody(body);

    const data: Record<string, any> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.message !== undefined) data.message = String(body.message);
    if (body.audience !== undefined) data.audience = body.audience;
    if (body.month !== undefined) data.month = Number(body.month);
    if (body.day !== undefined) data.day = Number(body.day);
    if (body.isActive !== undefined) data.isActive = !!body.isActive;
    if (body.isRecurring !== undefined) data.isRecurring = !!body.isRecurring;

    // ⚠ "SAQLANGANDAN KEYINGI HOLAT" ga tayanamiz: quyidagi qoida AYNI
    // chaqiruvda kelgan YANGI qiymatga qarashi kerak, eski yozuvdagiga
    // emas — aks holda "har yilgi qilib o'zgartirish" so'rovida eski
    // `year` qolib ketardi.
    const nextIsRecurring =
      body.isRecurring !== undefined ? !!body.isRecurring : doc.isRecurring;

    if (nextIsRecurring) {
      // Har yilgi bayramda aniq yil MA'NOSIZ — tozalanadi.
      data.year = null;
    } else if (body.year !== undefined) {
      const y = Number(body.year);
      if (!y || y < 2000 || y > 2100) {
        throw new ApiError(400, "Yil 2000-2100 oralig'ida bo'lishi kerak");
      }
      data.year = y;
    }

    const saved = await this.prisma.holiday.update({
      where: { id: doc.id },
      data,
      include: { createdBy: CREATED_BY },
    });
    this.invalidateHolidayCache();
    return withLegacyId(saved);
  }

  async softRemove(id: string) {
    const doc = await this.loadHoliday(id);
    const saved = await this.prisma.holiday.update({
      where: { id: doc.id },
      data: { isActive: false },
      include: { createdBy: CREATED_BY },
    });
    this.invalidateHolidayCache();
    return withLegacyId(saved);
  }

  /**
   * Ikki instant bir xil MAHALLIY (Asia/Tashkent) kalendar kuniga
   * tegishlimi. `localTodayMidnight` UTC+5 ga siljitib UTC-midnight
   * ko'rinishini beradi, shuning uchun siljitilgan kunlarni UTC bo'yicha
   * solishtirish = mahalliy kun solishtiruvi.
   */
  private sameLocalDay(a?: Date | null, b?: Date | null): boolean {
    if (!a || !b) return false;
    return localTodayMidnight(a).getTime() === localTodayMidnight(b).getTime();
  }

  /**
   * Bugungi mos faol bayramlar (fon job'i uchun).
   *
   * ⚠ "BUGUN" MAHALLIY kalendar kuni bo'yicha — cron ham mahalliy
   * vaqtda ishlaydi. Aks holda job UTC 00:00 dan OLDIN (Toshkentda
   * 00:00–05:00) ishlasa, xom UTC sanasi KECHAGI kunni ko'rsatib,
   * bayram noto'g'ri kuni yuborilardi.
   */
  async getTodayHolidays(now: Date = new Date()) {
    const local = localTodayMidnight(now);
    const month = local.getUTCMonth() + 1;
    const day = local.getUTCDate();
    const year = local.getUTCFullYear();

    const all = await this.prisma.holiday.findMany({
      where: { isActive: true, month, day },
    });

    return withLegacyIds(all.filter((h) => h.isRecurring || h.year === year));
  }

  async markSent(id: string, now: Date = new Date()): Promise<void> {
    await this.prisma.holiday.update({
      where: { id: String(id) },
      data: { lastSentAt: now },
    });
  }

  isAlreadySentToday(holiday: { lastSentAt?: Date | null }, now: Date = new Date()): boolean {
    return this.sameLocalDay(holiday.lastSentAt, now);
  }

  // ───────────── O'QITUVCHILAR TUG'ILGAN KUNLARI ─────────────

  /**
   * Yaqinlashib kelayotgan tug'ilgan kunlar — eng yaqinidan eng
   * uzog'igacha. "Bugun" Asia/Tashkent mahalliy kuni; ro'yxat HAR KUNI
   * o'zgaradi (bugunga nisbatan qolgan kunlar hisoblanadi).
   */
  async listTeacherBirthdays(now: Date = new Date()) {
    // FILIAL: ro'yxat TELEFON RAQAMI bilan qaytadi, ya'ni PII — ko'lamsiz
    // holda filial rahbari BUTUN markazning o'qituvchilarini raqami bilan
    // o'qib olardi. `Holiday` global bo'lib qoladi; kesiladigan narsa —
    // shu yerdagi O'QITUVCHI qidiruvi.
    //
    // ⚠ `AND` ICHIDA, `OR` da EMAS: `userBranchCondition()` ning o'zi
    // `OR` qaytaradi (uy filiali YOKI biriktirma) va uni yuqori darajaga
    // qo'ysak keyingi `OR` uni JIMGINA bosib ketardi.
    const branchCond = userBranchCondition();
    const where: Record<string, any> = {
      role: ROLES.TEACHER,
      isActive: true,
      isDeleted: false,
      birthDate: { not: null },
    };
    if (branchCond) where.AND = [branchCond];

    const teachers = await this.prisma.user.findMany({
      where: where as never,
      select: {
        id: true, firstName: true, lastName: true,
        phone: true, username: true, birthDate: true,
      },
    });

    const today = localTodayMidnight(now);
    const todayTs = today.getTime();
    const ty = today.getUTCFullYear();

    const items = teachers.map((t) => {
      const b = new Date(t.birthDate!);
      const bMonth = b.getUTCMonth();
      const bDay = b.getUTCDate();

      let year = ty;
      let nextTs = birthdayTsForYear(year, bMonth, bDay);
      if (nextTs < todayTs) {
        year += 1;
        nextTs = birthdayTsForYear(year, bMonth, bDay);
      }

      const daysUntil = Math.round((nextTs - todayTs) / DAY_MS);
      return {
        // ⚠ `_id` ATAYLAB saqlanadi — klient shu nom bo'yicha o'qiydi
        // (javob chegarasidagi moslik qatlami, ichki kalit emas).
        id: t.id,
        _id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        phone: t.phone || null,
        username: t.username,
        birthDate: t.birthDate,
        nextBirthday: new Date(nextTs),
        daysUntil,
        isToday: daysUntil === 0,
        turningAge: year - b.getUTCFullYear(),
      };
    });

    items.sort(
      (a, b) =>
        a.daysUntil - b.daysUntil ||
        (a.lastName || '').localeCompare(b.lastName || '') ||
        (a.firstName || '').localeCompare(b.firstName || ''),
    );
    return items;
  }

  private defaultBirthdayBody(name: string): string {
    const appName = this.config.get<string>('APP_NAME') || 'Bayyina';
    return (
      `Hurmatli ${name}, tug'ilgan kuningiz muborak bo'lsin! ` +
      `Sizga mustahkam salomatlik, tinimsiz muvaffaqiyat va baxt tilaymiz. ` +
      `${appName} jamoasi.`
    );
  }

  /** Bitta o'qituvchiga tabrik bildirishnomasi. */
  async congratulateTeacher(
    teacherId: string,
    { channels, message, title }: { channels?: string[]; message?: string; title?: string },
    currentUser: any,
  ) {
    // FILIAL: begona filial o'qituvchisini tabriklab bo'lmaydi. Xabarning
    // O'ZI `resolveAudience` da baribir kesilardi, lekin standart matnga
    // o'qituvchining ISMI qo'yiladi va u javobda qaytib, boshqa filial
    // xodimini oshkor qilardi (ustiga bo'sh, 0 oluvchili xabar yozilardi).
    //
    // ⚠ `AND` ICHIDA — `userBranchCondition()` ning o'zi `OR` qaytaradi.
    // ⚠ 404, 403 EMAS: mavjud bo'lmagan ID bilan AYNI javob.
    const branchCond = userBranchCondition();
    const teacherWhere: Record<string, any> = {
      id: String(teacherId),
      role: ROLES.TEACHER,
      isActive: true,
      isDeleted: false,
    };
    if (branchCond) teacherWhere.AND = [branchCond];

    const teacher = await this.prisma.user.findFirst({
      where: teacherWhere as never,
      select: { id: true, firstName: true, lastName: true },
    });
    if (!teacher) throw new ApiError(404, "O'qituvchi topilmadi");

    const finalChannels = channels?.length ? [...new Set(channels)] : ['inapp', 'telegram'];
    const displayName =
      teacher.firstName || `${teacher.firstName} ${teacher.lastName}`.trim();
    const body = message?.trim() || this.defaultBirthdayBody(displayName);

    return this.notifications.send(
      {
        title: title?.trim() || DEFAULT_BIRTHDAY_TITLE,
        body,
        category: 'holiday',
        channels: finalChannels,
        audience: { type: 'individual', userIds: [String(teacherId)] },
        isAuto: false,
      },
      currentUser,
    );
  }

  // ───────────── PUL YO'LI: BAYRAM KUNLARI TO'PLAMI ─────────────

  /**
   * Faol bayramlar ro'yxatining QISQA MUDDATLI keshi.
   *
   * ⚠ TTL 60 SONIYA VA U OSHIRILMASIN: bu PER-PROCESS kesh va ko'p
   * instansli deploy'da bir instans boshqasining keshini
   * INVALIDATSIYA QILA OLMAYDI. Eskirish oynasi shu 60 soniya bilan
   * cheklanadi. Bayram CRUD kam bo'ladi, davomat hot-path'i esa
   * tez-tez chaqiriladi — shuning uchun kesh o'zi kerak.
   */
  private holidayCache: {
    audiencesKey: string;
    expires: number;
    holidays: Array<{ isRecurring: boolean; year: number | null; month: number; day: number }>;
  } | null = null;

  private static readonly HOLIDAY_CACHE_TTL_MS = 60 * 1000;

  invalidateHolidayCache(): void {
    this.holidayCache = null;
  }

  private async loadActiveHolidays(audiences: string[]) {
    const key = audiences.slice().sort().join(',');
    if (
      this.holidayCache &&
      this.holidayCache.audiencesKey === key &&
      this.holidayCache.expires > Date.now()
    ) {
      return this.holidayCache.holidays;
    }
    const holidays = await this.prisma.holiday.findMany({
      where: { isActive: true, audience: { in: audiences } } as never,
      select: { isRecurring: true, year: true, month: true, day: true },
    });
    this.holidayCache = {
      audiencesKey: key,
      holidays,
      expires: Date.now() + HolidaysService.HOLIDAY_CACHE_TTL_MS,
    };
    return holidays;
  }

  /**
   * `[from, to]` oralig'idagi bayram kunlarining `dateKey` to'plami.
   *
   * ⚠⚠ DAVOMAT, TO'LOV VA MAOSH SHU FUNKSIYAGA TAYANADI: bu kunlar
   * dars kuni SANALMAYDI, ya'ni natija to'g'ridan-to'g'ri foizga va
   * hisoblangan summaga ta'sir qiladi.
   *
   * ⚠ SANA OSHIB KETISH QO'RIQLOVI: noto'g'ri kun (kabisa bo'lmagan
   * yilda 29-fev, 30 kunlik oyda 31) `Date.UTC` da KEYINGI OYGA ko'chib
   * ketardi va O'SHA kun bayram deb belgilanardi. Shuning uchun hosil
   * qilingan sana qayta tekshiriladi.
   */
  async holidayKeySetForRange(
    from: Date | string | number,
    to: Date | string | number,
    audiences: string[] = ['all', 'students'],
  ): Promise<Set<string>> {
    const start = toUtcMidnight(from).getTime();
    const end = toUtcMidnight(to).getTime();
    if (!(start <= end)) return new Set();

    const holidays = await this.loadActiveHolidays(audiences);

    const fromYear = new Date(start).getUTCFullYear();
    const toYear = new Date(end).getUTCFullYear();

    const set = new Set<string>();
    for (const h of holidays) {
      const years = h.isRecurring
        ? Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i)
        : [h.year];
      for (const y of years) {
        if (!y) continue;
        const d = new Date(Date.UTC(y, h.month - 1, h.day, 0, 0, 0, 0));
        if (d.getUTCMonth() !== h.month - 1 || d.getUTCDate() !== h.day) continue;
        const t = d.getTime();
        if (t >= start && t <= end) {
          const key = dateKeyOf(d);
          if (key) set.add(key);
        }
      }
    }
    return set;
  }
}
