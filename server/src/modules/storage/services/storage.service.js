import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import env from "../../../config/env.js";
import logger from "../../../config/logger.js";
import ApiError from "../../../utils/ApiError.js";
import StoredFile from "../../../models/storedFile.model.js";

// Kvota agregatsiyasi keshi. Sidebar indikatori har sahifada so'raydi,
// shuning uchun har so'rovda kolleksiyani yig'ish ortiqcha yuk bo'lardi.
// Qisqa TTL: yozish amallari keshni ATAYLAB tozalaydi (invalidateUsage),
// ya'ni foydalanuvchi o'z faylini yuklagach raqamni DARHOL yangilangan
// holda ko'radi - eskirgan qiymat faqat boshqa sessiyalarda ko'rinadi.
const USAGE_TTL_MS = 15 * 1000;
let usageCache = null;

export const invalidateUsage = () => {
  usageCache = null;
};

const aggregateUsage = async () => {
  const [row] = await StoredFile.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    { $group: { _id: null, usedBytes: { $sum: "$size" }, fileCount: { $sum: 1 } } },
  ]);
  return {
    usedBytes: row?.usedBytes || 0,
    fileCount: row?.fileCount || 0,
  };
};

/**
 * Markazning fayl kvotasi holati.
 *
 * Sidebar indikatori ham, yuklashdan oldingi tekshiruv ham shu yagona
 * manbadan oziqlanadi - aks holda UI "joy bor" deb turib, server rad
 * etadigan holat kelib chiqardi.
 */
export const getUsage = async () => {
  if (usageCache && Date.now() - usageCache.at < USAGE_TTL_MS) {
    return usageCache.value;
  }

  const { usedBytes, fileCount } = await aggregateUsage();
  const quotaBytes = env.STORAGE_QUOTA_BYTES;
  const freeBytes = Math.max(0, quotaBytes - usedBytes);

  const value = {
    usedBytes,
    quotaBytes,
    freeBytes,
    fileCount,
    // Bitta fayl chegarasi ham shu javobda: forma "5 MB gacha" deb
    // yozishi uchun alohida so'rov kerak bo'lmasin.
    maxUploadBytes: env.MAX_UPLOAD_BYTES,
    percent: quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0,
    isFull: freeBytes < env.MAX_UPLOAD_BYTES,
  };

  usageCache = { at: Date.now(), value };
  return value;
};

/**
 * Fayl kvotaga SIG'ADIMI. Sig'masa - 507 bilan to'xtatadi.
 *
 * NEGA 507 (Insufficient Storage): 400 "sen noto'g'ri yubording" degani,
 * 413 esa "fayl juda katta" degani. Bu yerda esa fayl to'g'ri va o'lchami
 * ham joyida - markazning JOYI tugagan. Klient shu kodga qarab boshqacha
 * xabar ko'rsatadi ("joy bo'shating", "faylni kichraytiring" emas).
 */
export const assertQuota = async (incomingBytes) => {
  const size = Number(incomingBytes) || 0;

  if (size > env.MAX_UPLOAD_BYTES) {
    throw new ApiError(
      413,
      `Fayl juda katta. Bitta fayl uchun chegara: ${formatBytes(env.MAX_UPLOAD_BYTES)}`,
      {
        code: "FILE_TOO_LARGE",
        details: { size, maxUploadBytes: env.MAX_UPLOAD_BYTES },
      },
    );
  }

  const usage = await getUsage();
  if (usage.usedBytes + size > usage.quotaBytes) {
    throw new ApiError(
      507,
      `Saqlash joyi to'lgan (${formatBytes(usage.usedBytes)} / ${formatBytes(
        usage.quotaBytes,
      )}). Eski fayllarni o'chirib joy bo'shating.`,
      {
        code: "STORAGE_QUOTA_EXCEEDED",
        details: {
          usedBytes: usage.usedBytes,
          quotaBytes: usage.quotaBytes,
          freeBytes: usage.freeBytes,
          incomingBytes: size,
        },
      },
    );
  }

  return usage;
};

// Fayl nomidan xavfsiz kengaytma. Nuqtadan keyingi 10 tagacha harf/raqam
// qolgani hammasi tashlanadi: "rasm.png.exe" ham, "..%2f" ham zararsizlanadi.
const safeExtension = (originalName) => {
  const ext = path.extname(String(originalName || "")).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : "";
};

/**
 * Buferni diskka yozadi va StoredFile hujjatini yaratadi.
 *
 * Kvota tekshiruvi shu yerda QAYTA bajariladi (handler'da ham bo'lsa-da):
 * tekshiruv bilan yozish orasida boshqa so'rov joyni egallab qo'ygan
 * bo'lishi mumkin. Bu poygani butunlay yopmaydi (buning uchun tranzaksion
 * hisoblagich kerak), lekin oynani millisekundlarga qisqartiradi.
 */
export const saveBuffer = async ({
  buffer,
  originalName,
  mimeType,
  userId,
  purpose = "assignment",
}) => {
  if (!buffer?.length) throw new ApiError(400, "Fayl bo'sh");
  await assertQuota(buffer.length);

  // YYYY/MM bo'yicha papkalash: bitta papkada o'n minglab fayl to'planib
  // qolmasin (ba'zi fayl tizimlarida bu ro'yxatlashni sekinlashtiradi).
  const now = new Date();
  const subDir = path.join(
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0"),
  );
  const storedName = `${crypto.randomUUID()}${safeExtension(originalName)}`;
  const relPath = path.join(subDir, storedName);
  const absDir = path.join(env.UPLOAD_DIR, subDir);
  const absPath = path.join(env.UPLOAD_DIR, relPath);

  await fs.mkdir(absDir, { recursive: true });
  await fs.writeFile(absPath, buffer);

  try {
    const doc = await StoredFile.create({
      originalName: String(originalName || "fayl").slice(0, 255),
      storedName,
      relPath,
      mimeType: mimeType || "application/octet-stream",
      size: buffer.length,
      purpose,
      uploadedBy: userId || null,
    });
    invalidateUsage();
    return doc;
  } catch (err) {
    // Baza yozuvi yaratilmasa diskdagi fayl YETIM qolardi: u kvotada
    // ko'rinmaydi, lekin joyni egallab turadi. Shuning uchun tozalaymiz.
    await fs.unlink(absPath).catch(() => null);
    throw err;
  }
};

/** Faylning diskdagi to'liq yo'li (o'qish/yuborish uchun). */
export const absolutePathOf = (storedFile) =>
  path.join(env.UPLOAD_DIR, storedFile.relPath);

/** Faylni o'qiydi. Diskda topilmasa 404. */
export const readFile = async (storedFile) => {
  try {
    return await fs.readFile(absolutePathOf(storedFile));
  } catch (err) {
    logger.error(
      { err, fileId: storedFile._id },
      "Saqlangan fayl diskda topilmadi",
    );
    throw new ApiError(404, "Fayl topilmadi");
  }
};

/**
 * Faylni diskdan o'chiradi va hujjatni arxivlaydi (soft-delete).
 *
 * Hujjat ATAYLAB butunlay o'chirilmaydi: vazifa tarixida "fayl bor edi"
 * degani ko'rinib tursin. Kvota esa faqat isDeleted=false bo'yicha
 * yig'ilgani uchun joy darhol bo'shaydi.
 */
export const removeFile = async (storedFile, userId) => {
  if (!storedFile) return;
  await fs.unlink(absolutePathOf(storedFile)).catch(() => null);
  await StoredFile.updateOne(
    { _id: storedFile._id },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId || null,
        telegramFileId: null,
      },
    },
  );
  invalidateUsage();
};

/** Telegram file_id ni keshlaydi - keyingi yuborishlar tez bo'lsin. */
export const cacheTelegramFileId = async (fileId, telegramFileId) => {
  if (!fileId || !telegramFileId) return;
  await StoredFile.updateOne({ _id: fileId }, { $set: { telegramFileId } }).catch(
    () => null,
  );
};

/** Baytni odam o'qiydigan ko'rinishga o'giradi ("4.2 MB"). */
export const formatBytes = (bytes) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
};
