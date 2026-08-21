import env from "../../../config/env.js";
import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { HOLIDAY_AUDIENCES } from "../../../constants/calendar.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import * as notificationsService from "../../notifications/services/notifications.service.js";
import {
  dateKeyOf,
  toUtcMidnight,
  localTodayMidnight,
} from "../../../helpers/attendance.helper.js";

// ─────────────────────────────────────────────────────────────────
// MONGO → PRISMA
//
// Bu servis PUL YO'LIDA turadi: `holidayKeySetForRange()` ni davomat,
// o'quvchi to'lovi (proratsiya) VA o'qituvchining soatbay maoshi
// chaqiradi. Bayram kuni dars kuni sanalmaydi, ya'ni bu yerdagi har
// bir xato to'g'ridan-to'g'ri hisoblangan summani o'zgartiradi.
//
// Shuning uchun sana mantig'iga (recurring/one-time, oy oshib ketish
// qo'riqlovi, kesh TTL) UMUMAN tegilmadi - faqat so'rovlar almashdi.
// ─────────────────────────────────────────────────────────────────

const CREATED_BY = { select: { id: true, firstName: true, lastName: true } };

export const list = async ({
  search,
  audience,
  includeInactive = false,
  includePast = false,
  page = 1,
  limit = 100,
}) => {
  const where = {};
  if (!includeInactive) where.isActive = true;
  if (audience) where.audience = audience;
  if (search && search.trim()) {
    // RegExp KERAK EMAS: `contains` xom satrni qidiradi va Prisma LIKE
    // maxsus belgilarini o'zi ekranlaydi (eski `escapeRegex` olib tashlandi).
    where.name = { contains: search.trim(), mode: "insensitive" };
  }
  if (!includePast) {
    // One-time bayramlardan o'tganlarini chiqarib tashlash
    const currentYear = new Date().getUTCFullYear();
    where.OR = [
      { isRecurring: true },
      { isRecurring: false, year: { gte: currentYear } },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.holiday.findMany({
      where,
      orderBy: [{ month: "asc" }, { day: "asc" }],
      skip,
      take: limit,
      include: { createdBy: CREATED_BY },
    }),
    prisma.holiday.count({ where }),
  ]);
  return { items: withLegacyIds(items), total, page, limit };
};

// Ichki o'qish: XOM Prisma yozuvi (update/softRemove shundan foydalanadi).
const loadHoliday = async (id) => {
  const doc = await prisma.holiday.findUnique({
    where: { id: String(id) },
    include: { createdBy: CREATED_BY },
  });
  if (!doc) throw new ApiError(404, "Bayram topilmadi");
  return doc;
};

export const getById = async (id) => withLegacyId(await loadHoliday(id));

const validateBody = (body) => {
  if (body.audience && !HOLIDAY_AUDIENCES.includes(body.audience)) {
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
    // Oyga mos kun chegarasi (recurring uchun Fev 29 ruxsat - kabisa yillarda ishlaydi)
    const m = body.month !== undefined ? Number(body.month) : null;
    if (m) {
      const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
      if (d > maxDay) {
        throw new ApiError(
          400,
          `${m}-oy uchun kun ${maxDay} dan oshmasligi kerak`,
        );
      }
    }
  }
};

export const create = async (body, currentUser) => {
  validateBody(body);
  const trimmed = String(body.name || "").trim();
  if (!trimmed) throw new ApiError(400, "Nom kerak");

  const isRecurring = body.isRecurring !== false;
  const year = isRecurring ? null : Number(body.year);
  if (!isRecurring && (!year || year < 2000 || year > 2100)) {
    throw new ApiError(400, "Bir martalik bayram uchun to'g'ri yil kerak");
  }

  const doc = await prisma.holiday.create({
    data: {
      name: trimmed,
      isRecurring,
      month: Number(body.month),
      day: Number(body.day),
      year,
      message: String(body.message),
      audience: body.audience || "all",
      createdById: currentUser?.id || currentUser?._id || null,
    },
    include: { createdBy: CREATED_BY },
  });
  invalidateHolidayCache();
  return withLegacyId(doc);
};

export const update = async (id, body) => {
  const doc = await loadHoliday(id);
  validateBody(body);

  // Mongoose'da hujjat mutatsiya qilinib `save()` chaqirilardi. Prisma'da
  // o'zgarishlar `data` ga yig'iladi. `next` - "saqlangandan keyingi holat":
  // pastdagi `isRecurring` qoidasi AYNI chaqiruvda kelgan yangi qiymatga
  // tayanishi kerak, eski yozuvdagiga emas.
  const data = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.message !== undefined) data.message = String(body.message);
  if (body.audience !== undefined) data.audience = body.audience;
  if (body.month !== undefined) data.month = Number(body.month);
  if (body.day !== undefined) data.day = Number(body.day);
  if (body.isActive !== undefined) data.isActive = !!body.isActive;

  if (body.isRecurring !== undefined) data.isRecurring = !!body.isRecurring;

  const nextIsRecurring =
    body.isRecurring !== undefined ? !!body.isRecurring : doc.isRecurring;

  if (nextIsRecurring) {
    // Har yilgi bayramda aniq yil ma'nosiz - tozalanadi.
    data.year = null;
  } else if (body.year !== undefined) {
    const y = Number(body.year);
    if (!y || y < 2000 || y > 2100) {
      throw new ApiError(400, "Yil 2000-2100 oralig'ida bo'lishi kerak");
    }
    data.year = y;
  }

  const saved = await prisma.holiday.update({
    where: { id: doc.id },
    data,
    include: { createdBy: CREATED_BY },
  });
  invalidateHolidayCache();
  return withLegacyId(saved);
};

export const softRemove = async (id) => {
  const doc = await loadHoliday(id);
  const saved = await prisma.holiday.update({
    where: { id: doc.id },
    data: { isActive: false },
    include: { createdBy: CREATED_BY },
  });
  invalidateHolidayCache();
  return withLegacyId(saved);
};

// Ikki instant bir xil MAHALLIY (Asia/Tashkent) kalendar kuniga tegishlimi.
// localTodayMidnight UTC+5 ga siljitib UTC-midnight ko'rinishini beradi, shuning
// uchun siljitilgan kunlarni UTC bo'yicha solishtirish = mahalliy kun solishtiruvi.
const sameLocalDay = (a, b) => {
  if (!a || !b) return false;
  return localTodayMidnight(a).getTime() === localTodayMidnight(b).getTime();
};

// Bugungi mos faol bayramlar (Agenda jobi uchun).
// "Bugun" MAHALLIY (Asia/Tashkent) kalendar kuni bo'yicha aniqlanadi - cron ham
// mahalliy vaqtda ishlaydi. Aks holda job UTC 00:00 dan oldin (Toshkent 00:00-05:00)
// ishlasa, xom UTC sanasi kechagi kunni ko'rsatib, bayram noto'g'ri kuni yuborilardi.
export const getTodayHolidays = async (now = new Date()) => {
  const local = localTodayMidnight(now);
  const month = local.getUTCMonth() + 1;
  const day = local.getUTCDate();
  const year = local.getUTCFullYear();

  const all = await prisma.holiday.findMany({
    where: { isActive: true, month, day },
  });

  return withLegacyIds(all.filter((h) => h.isRecurring || h.year === year));
};

export const markSent = async (id, now = new Date()) => {
  await prisma.holiday.update({
    where: { id: String(id) },
    data: { lastSentAt: now },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// O'qituvchilar tug'ilgan kunlari (bildirishnomalar/bayramlar bo'limi uchun)
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

// Berilgan yildagi tug'ilgan kun (UTC yarim tun timestamp'i).
// 29-fevralda tug'ilganlar kabisa bo'lmagan yilda oyning oxirgi kuniga (28-fev)
// tushiriladi - aks holda Date.UTC keyingi oyga "ko'chib" ketardi.
const birthdayTsForYear = (year, bMonth, bDay) => {
  const ts = Date.UTC(year, bMonth, bDay);
  if (new Date(ts).getUTCMonth() !== bMonth) {
    return Date.UTC(year, bMonth + 1, 0); // shu oyning oxirgi kuni
  }
  return ts;
};

// O'qituvchilarning yaqinlashib kelayotgan tug'ilgan kunlari - eng yaqinidan
// eng uzog'igacha tartiblab qaytaradi. "Bugun" Asia/Tashkent mahalliy kuni.
// Ro'yxat har kuni o'zgaradi (bugungi kunga nisbatan qolgan kunlar hisoblanadi).
export const listTeacherBirthdays = async (now = new Date()) => {
  const teachers = await prisma.user.findMany({
    where: {
      role: ROLES.TEACHER,
      isActive: true,
      isDeleted: false,
      birthDate: { not: null },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      username: true,
      birthDate: true,
    },
  });

  const today = localTodayMidnight(now);
  const todayTs = today.getTime();
  const ty = today.getUTCFullYear();

  const items = teachers.map((t) => {
    const b = new Date(t.birthDate);
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
      // `_id` ATAYLAB saqlanadi - client shu nom bo'yicha o'qiydi
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
      (a.lastName || "").localeCompare(b.lastName || "") ||
      (a.firstName || "").localeCompare(b.firstName || ""),
  );
  return items;
};

const DEFAULT_BIRTHDAY_TITLE = "Tug'ilgan kun muborak!";

const defaultBirthdayBody = (name) =>
  `Hurmatli ${name}, tug'ilgan kuningiz muborak bo'lsin! ` +
  `Sizga mustahkam salomatlik, tinimsiz muvaffaqiyat va baxt tilaymiz. ` +
  `${env.APP_NAME} jamoasi.`;

// Bitta o'qituvchiga tabrik (tug'ilgan kun) bildirishnomasini yuboradi.
// channels: ["telegram"] (tg orqali), ["inapp"] (platforma) yoki ikkalasi.
export const congratulateTeacher = async (
  teacherId,
  { channels, message, title },
  currentUser,
) => {
  const teacher = await prisma.user.findFirst({
    where: {
      id: String(teacherId),
      role: ROLES.TEACHER,
      isActive: true,
      isDeleted: false,
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!teacher) throw new ApiError(404, "O'qituvchi topilmadi");

  const finalChannels = channels?.length
    ? [...new Set(channels)]
    : ["inapp", "telegram"];
  const displayName = teacher.firstName || `${teacher.firstName} ${teacher.lastName}`.trim();
  const body = message?.trim() || defaultBirthdayBody(displayName);

  return notificationsService.send(
    {
      title: title?.trim() || DEFAULT_BIRTHDAY_TITLE,
      body,
      category: "holiday",
      channels: finalChannels,
      audience: { type: "individual", userIds: [String(teacherId)] },
      isAuto: false,
    },
    currentUser,
  );
};

export const isAlreadySentToday = (holiday, now = new Date()) =>
  sameLocalDay(holiday.lastSentAt, now);

// Aktiv bayramlar ro'yxatining qisqa muddatli keshi (har so'rovda DB urilmasin).
// Bayram CRUD juda kam, davomat hot path'i tez-tez chaqiriladi.
// Per-process kesh - TTL qisqa (60s) tutiladi: bayram CRUD kam, lekin ko'p-instansli
// deploy'da boshqa instans keshini invalidate qila olmaydi, shuning uchun eskirish
// oynasi 60s bilan cheklanadi (bir instansda CRUD bo'lsa o'sha instans darrov tozalaydi).
let _holidayCache = null; // { audiencesKey, expires, holidays }
const HOLIDAY_CACHE_TTL_MS = 60 * 1000;

export const invalidateHolidayCache = () => {
  _holidayCache = null;
};

const loadActiveHolidays = async (audiences) => {
  const key = audiences.slice().sort().join(",");
  if (
    _holidayCache &&
    _holidayCache.audiencesKey === key &&
    _holidayCache.expires > Date.now()
  ) {
    return _holidayCache.holidays;
  }
  const holidays = await prisma.holiday.findMany({
    where: { isActive: true, audience: { in: audiences } },
    select: { isRecurring: true, year: true, month: true, day: true },
  });
  _holidayCache = {
    audiencesKey: key,
    holidays,
    expires: Date.now() + HOLIDAY_CACHE_TTL_MS,
  };
  return holidays;
};

// [from, to] oralig'ida o'quvchilarga taalluqli bayram kunlarining dateKey Set'i.
// Davomat hisobida shu kunlar dars kuni emas deb qaraladi → foizga ta'sir qilmaydi.
// Recurring (har yil) va one-time (ma'lum yil) bayramlar ham qamrab olinadi.
export const holidayKeySetForRange = async (
  from,
  to,
  audiences = ["all", "students"],
) => {
  const start = toUtcMidnight(from).getTime();
  const end = toUtcMidnight(to).getTime();
  if (!(start <= end)) return new Set();

  const holidays = await loadActiveHolidays(audiences);

  const fromYear = new Date(start).getUTCFullYear();
  const toYear = new Date(end).getUTCFullYear();

  const set = new Set();
  for (const h of holidays) {
    const years = h.isRecurring
      ? Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i)
      : [h.year];
    for (const y of years) {
      if (!y) continue;
      const d = new Date(Date.UTC(y, h.month - 1, h.day, 0, 0, 0, 0));
      // Date overflow qo'riqlovi: noto'g'ri kun (mas. Fev 29 kabisa bo'lmagan yil,
      // 30-kunlik oyda 31) keyingi oyga "ko'chib" ketmasligi uchun tekshiramiz.
      if (d.getUTCMonth() !== h.month - 1 || d.getUTCDate() !== h.day) continue;
      const t = d.getTime();
      if (t >= start && t <= end) set.add(dateKeyOf(d));
    }
  }
  return set;
};
