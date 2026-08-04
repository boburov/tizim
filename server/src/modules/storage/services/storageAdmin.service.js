import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import StoredFile from "../../../models/storedFile.model.js";
import Assignment from "../../../models/assignment.model.js";
import StorageSettings, {
  CLEANUP_FREQUENCIES,
  FREQUENCY_DAYS,
} from "../../../models/storageSettings.model.js";
import * as storageService from "./storage.service.js";

const SETTINGS_ID = "default";

// Bir yurishda ko'pi bilan nechta fayl o'chiriladi. Chegarasiz qoldirilsa
// 50 000 faylli markazda job soatlab ishlab, diskni va bazani band qilardi.
// Qolgani keyingi yurishda o'chadi - avto-tozalash shoshilinch ish emas.
const CLEANUP_BATCH = 500;

export const getSettings = async () =>
  StorageSettings.findOneAndUpdate(
    { _id: SETTINGS_ID },
    { $setOnInsert: { _id: SETTINGS_ID } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

export const updateSettings = async (body) => {
  const doc = await getSettings();

  if (body.autoCleanupEnabled !== undefined) {
    doc.autoCleanupEnabled = !!body.autoCleanupEnabled;
  }
  if (body.frequency !== undefined) {
    if (!CLEANUP_FREQUENCIES.includes(body.frequency)) {
      throw new ApiError(400, "Noto'g'ri chastota");
    }
    doc.frequency = body.frequency;
  }
  if (body.olderThanDays !== undefined) {
    const v = Number(body.olderThanDays);
    if (!Number.isInteger(v) || v < 1 || v > 3650) {
      throw new ApiError(400, "Muddat 1 kundan 3650 kungacha bo'lishi kerak");
    }
    doc.olderThanDays = v;
  }

  await doc.save();
  return doc;
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
  const filter = { isDeleted: { $ne: true } };

  if (all) return filter;

  const days = Number(olderThanDays);
  if (!Number.isFinite(days) || days < 1) {
    throw new ApiError(400, "Muddat yoki 'hammasi' bayrog'i ko'rsatilishi kerak");
  }
  filter.createdAt = { $lt: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
  return filter;
};

/**
 * Nechta fayl va qancha joy o'chishini OLDINDAN hisoblaydi (hech narsa
 * o'chirmasdan). Tasdiqlash oynasi shu raqamni ko'rsatadi - "23 ta fayl,
 * 340 MB" degani "davom etasizmi?" degan savolni ma'noli qiladi.
 */
export const previewCleanup = async ({ all = false, olderThanDays } = {}) => {
  const filter = buildFilter({ all, olderThanDays });
  const [row] = await StoredFile.aggregate([
    { $match: filter },
    { $group: { _id: null, files: { $sum: 1 }, bytes: { $sum: "$size" } } },
  ]);
  return { files: row?.files || 0, bytes: row?.bytes || 0 };
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

  const files = await StoredFile.find(filter)
    .select({ _id: 1, relPath: 1, size: 1 })
    .sort({ createdAt: 1 }) // eng eskisidan boshlaymiz
    .limit(CLEANUP_BATCH)
    .lean();

  let deleted = 0;
  let freedBytes = 0;
  const deletedIds = [];

  for (const f of files) {
    try {
      await storageService.removeFile(f, userId);
      deleted += 1;
      freedBytes += f.size || 0;
      deletedIds.push(f._id);
    } catch (err) {
      logger.warn({ err, fileId: f._id }, "Faylni tozalashda xato - o'tkazib yuborildi");
    }
  }

  // Vazifadagi havolani ham uzamiz: aks holda tafsilot sahifasida
  // yuklab bo'lmaydigan "Yuklab olish" tugmasi turaverardi.
  if (deletedIds.length) {
    await Assignment.updateMany(
      { file: { $in: deletedIds } },
      { $set: { file: null, fileRemovedAt: new Date() } },
    );
  }

  // Chegaraga tegdikmi - demak yana qolgan bo'lishi mumkin.
  const remaining = await StoredFile.countDocuments(filter);

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

  settings.lastRunAt = new Date();
  settings.lastRunDeleted = result.deleted;
  settings.lastRunFreedBytes = result.freedBytes;
  await settings.save();

  logger.info(
    { ...result, frequency: settings.frequency },
    "Avto-tozalash bajarildi",
  );
  return { skipped: false, ...result };
};

/** Saqlagichdagi fayllar ro'yxati (admin ko'radi: nima joy egallayapti). */
export const listFiles = async ({ page, limit, skip, sort = "size" }) => {
  const filter = { isDeleted: { $ne: true } };
  // Standart tartib - KATTASIDAN kichigiga: "joy qayoqqa ketdi?" degan
  // savolga javob birinchi qatorda turishi kerak.
  const sortSpec = sort === "date" ? { createdAt: -1 } : { size: -1 };

  const [items, total] = await Promise.all([
    StoredFile.find(filter)
      .sort(sortSpec)
      .skip(skip)
      .limit(limit)
      .populate("uploadedBy", { firstName: 1, lastName: 1 })
      .lean(),
    StoredFile.countDocuments(filter),
  ]);

  // Fayl qaysi vazifaga tegishli - admin kontekstsiz o'chirmasin.
  const assignments = await Assignment.find(
    { file: { $in: items.map((f) => f._id) } },
    { title: 1, file: 1 },
  ).lean();
  const byFile = new Map(assignments.map((a) => [String(a.file), a]));

  return {
    items: items.map((f) => ({
      ...f,
      assignment: byFile.get(String(f._id)) || null,
    })),
    total,
  };
};

/** Bitta faylni o'chirish (admin qo'lda). */
export const removeFileById = async (fileId, userId) => {
  const file = await StoredFile.findById(fileId).lean();
  if (!file || file.isDeleted) throw new ApiError(404, "Fayl topilmadi");

  await storageService.removeFile(file, userId);
  await Assignment.updateMany(
    { file: file._id },
    { $set: { file: null, fileRemovedAt: new Date() } },
  );

  return { _id: file._id, freedBytes: file.size || 0 };
};
