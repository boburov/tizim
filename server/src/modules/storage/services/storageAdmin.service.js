import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import prisma from "../../../config/prisma.js";
import {
  CLEANUP_FREQUENCIES,
  FREQUENCY_DAYS,
} from "../../../constants/storage.js";
import { withLegacyId } from "../../../utils/serialize.js";
import * as storageService from "./storage.service.js";

const SETTINGS_ID = "default";

// Bir yurishda ko'pi bilan nechta fayl o'chiriladi. Chegarasiz qoldirilsa
// 50 000 faylli markazda job soatlab ishlab, diskni va bazani band qilardi.
// Qolgani keyingi yurishda o'chadi - avto-tozalash shoshilinch ish emas.
const CLEANUP_BATCH = 500;

// YAGONA QATOR: `id` ning o'zi "default" (schema'dagi @default). Mongo'da
// bu `findOneAndUpdate(..., {upsert:true, setDefaultsOnInsert:true})` edi;
// Prisma'da `upsert` aynan shuni beradi va yo'q bo'lsa schema
// standartlari bilan yaratadi.
export const getSettings = async () =>
  prisma.storageSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {},
  });

export const updateSettings = async (body) => {
  // Qator mavjudligini kafolatlaymiz (birinchi tahrirda ham ishlashi uchun).
  await getSettings();

  const data = {};
  if (body.autoCleanupEnabled !== undefined) {
    data.autoCleanupEnabled = !!body.autoCleanupEnabled;
  }
  if (body.frequency !== undefined) {
    if (!CLEANUP_FREQUENCIES.includes(body.frequency)) {
      throw new ApiError(400, "Noto'g'ri chastota");
    }
    data.frequency = body.frequency;
  }
  if (body.olderThanDays !== undefined) {
    const v = Number(body.olderThanDays);
    if (!Number.isInteger(v) || v < 1 || v > 3650) {
      throw new ApiError(400, "Muddat 1 kundan 3650 kungacha bo'lishi kerak");
    }
    data.olderThanDays = v;
  }

  return prisma.storageSettings.update({ where: { id: SETTINGS_ID }, data });
};

/** Keyingi avto-yurish sanasi (yoqilmagan bo'lsa null). */
export const nextRunAt = (settings) => {
  if (!settings?.autoCleanupEnabled) return null;
  const stepDays = FREQUENCY_DAYS[settings.frequency] || 30;
  const base = settings.lastRunAt ? new Date(settings.lastRunAt) : new Date();
  return new Date(base.getTime() + stepDays * 24 * 60 * 60 * 1000);
};

/** Avto-tozalash vaqti keldimi (job har kuni shu savolni beradi). */
const isDue = (settings) => {
  if (!settings?.autoCleanupEnabled) return false;
  if (!settings.lastRunAt) return true; // hech qachon yurmagan - hoziroq
  return nextRunAt(settings) <= new Date();
};

/**
 * Fayllarni o'chirish uchun filtr.
 *
 * `all=true` - HAMMASINI (to'liq tozalash). `olderThanDays` - shundan
 * eski fayllar. Ikkalasi ham berilmasa xato: filtrsiz o'chirish
 * "hammasini o'chirish"ga aylanib ketardi va buni tasodifan chaqirish
 * juda oson bo'lardi.
 */
const buildFilter = ({ all, olderThanDays }) => {
  const filter = { isDeleted: false };

  if (all) return filter;

  const days = Number(olderThanDays);
  if (!Number.isFinite(days) || days < 1) {
    throw new ApiError(400, "Muddat yoki 'hammasi' bayrog'i ko'rsatilishi kerak");
  }
  filter.createdAt = { lt: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
  return filter;
};

/**
 * Nechta fayl va qancha joy o'chishini OLDINDAN hisoblaydi (hech narsa
 * o'chirmasdan). Tasdiqlash oynasi shu raqamni ko'rsatadi - "23 ta fayl,
 * 340 MB" degani "davom etasizmi?" degan savolni ma'noli qiladi.
 */
export const previewCleanup = async ({ all = false, olderThanDays } = {}) => {
  const where = buildFilter({ all, olderThanDays });
  // Guruhlashsiz yig'indi - Mongo'dagi `$group: { _id: null }` ning
  // to'g'ridan-to'g'ri ekvivalenti.
  const row = await prisma.storedFile.aggregate({
    where,
    _count: { _all: true },
    _sum: { size: true },
  });
  return { files: row._count._all || 0, bytes: row._sum.size || 0 };
};

/**
 * Tozalashni BAJARADI.
 *
 * Fayllar bittalab o'chiriladi (removeFile): u diskdan o'chirishni,
 * hujjatni arxivlashni va kvota hisoblagichini kamaytirishni birga
 * bajaradi. Bittasi yiqilsa qolganlari davom etadi - bitta buzuq fayl
 * butun tozalashni to'xtatib qo'ymasligi kerak.
 */
export const runCleanup = async ({ all = false, olderThanDays, userId } = {}) => {
  const filter = buildFilter({ all, olderThanDays });

  const files = await prisma.storedFile.findMany({
    where: filter,
    // `id` ATAYLAB: `storageService.removeFile` uni o'qiydi.
    select: { id: true, relPath: true, size: true },
    orderBy: { createdAt: "asc" }, // eng eskisidan boshlaymiz
    take: CLEANUP_BATCH,
  });

  let deleted = 0;
  let freedBytes = 0;
  const deletedIds = [];

  for (const f of files) {
    try {
      // `removeFile` `_id` ni o'qiydi (Mongo shakli) - shuning uchun
      // uzatishdan oldin qo'shamiz.
      await storageService.removeFile(withLegacyId(f), userId);
      deleted += 1;
      freedBytes += f.size || 0;
      deletedIds.push(f.id);
    } catch (err) {
      logger.warn({ err, fileId: f.id }, "Faylni tozalashda xato - o'tkazib yuborildi");
    }
  }

  // Vazifadagi havolani ham uzamiz: aks holda tafsilot sahifasida
  // yuklab bo'lmaydigan "Yuklab olish" tugmasi turaverardi.
  if (deletedIds.length) {
    // `file` -> `fileId`: Prisma'da `file` RELATION.
    await prisma.assignment.updateMany({
      where: { fileId: { in: deletedIds } },
      data: { fileId: null, fileRemovedAt: new Date() },
    });
  }

  // Chegaraga tegdikmi - demak yana qolgan bo'lishi mumkin.
  const remaining = await prisma.storedFile.count({ where: filter });

  return { deleted, freedBytes, remaining };
};

/**
 * Avto-tozalash yurishi (Agenda job kuniga bir marta chaqiradi).
 * Vaqti kelmagan bo'lsa hech narsa qilmaydi.
 */
export const runScheduledCleanup = async () => {
  const settings = await getSettings();
  if (!isDue(settings)) return { skipped: true };

  const result = await runCleanup({
    olderThanDays: settings.olderThanDays,
    userId: null,
  });

  await prisma.storageSettings.update({
    where: { id: SETTINGS_ID },
    data: {
      lastRunAt: new Date(),
      lastRunDeleted: result.deleted,
      lastRunFreedBytes: result.freedBytes,
    },
  });

  logger.info(
    { ...result, frequency: settings.frequency },
    "Avto-tozalash bajarildi",
  );
  return { skipped: false, ...result };
};

/** Saqlagichdagi fayllar ro'yxati (admin ko'radi: nima joy egallayapti). */
export const listFiles = async ({ page, limit, skip, sort = "size" }) => {
  const where = { isDeleted: false };
  // Standart tartib - KATTASIDAN kichigiga: "joy qayoqqa ketdi?" degan
  // savolga javob birinchi qatorda turishi kerak.
  const orderBy = sort === "date" ? { createdAt: "desc" } : { size: "desc" };

  const [items, total] = await Promise.all([
    prisma.storedFile.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.storedFile.count({ where }),
  ]);

  // Fayl qaysi vazifaga tegishli - admin kontekstsiz o'chirmasin.
  const assignments = items.length
    ? await prisma.assignment.findMany({
        where: { fileId: { in: items.map((f) => f.id) } },
        select: { id: true, title: true, fileId: true },
      })
    : [];
  const byFile = new Map(assignments.map((a) => [String(a.fileId), a]));

  return {
    items: items.map((f) => ({
      ...withLegacyId(f),
      // Javobda `file` kaliti QOLADI (Mongo shakli) - klient shunga
      // tayangan bo'lishi mumkin.
      assignment: byFile.get(String(f.id))
        ? withLegacyId(byFile.get(String(f.id)))
        : null,
    })),
    total,
  };
};

/** Bitta faylni o'chirish (admin qo'lda). */
export const removeFileById = async (fileId, userId) => {
  const file = await prisma.storedFile.findUnique({
    where: { id: String(fileId) },
  });
  if (!file || file.isDeleted) throw new ApiError(404, "Fayl topilmadi");

  await storageService.removeFile(withLegacyId(file), userId);
  await prisma.assignment.updateMany({
    where: { fileId: file.id },
    data: { fileId: null, fileRemovedAt: new Date() },
  });

  return { _id: file.id, freedBytes: file.size || 0 };
};
