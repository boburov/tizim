import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import env from "../../../config/env.js";
import logger from "../../../config/logger.js";
import ApiError from "../../../utils/ApiError.js";
import prisma from "../../../config/prisma.js";
import { withLegacyId } from "../../../utils/serialize.js";

// Mongo modelidagi konstanta shu yerga ko'chdi (model fayli o'chiriladi).
export const USAGE_KEY = "global";

// ───────────────────────────────────────────────────────────────────────
// KVOTA HISOBI
//
// Band hajm ATOMIK hisoblagichda turadi (StorageUsage), agregatsiyada
// emas. Sabab: agregatsiya faqat o'qish, kvota tekshiruvi esa
// "o'qi -> qaror qil -> yoz". Ikki so'rov bir vaqtda o'qisa ikkalasi ham
// "joy bor" javobini oladi va ikkalasi ham yozadi - chegara oshib ketadi.
// Ko'p instansli deploy'da bu kafolatlangan holat, shuning uchun joy
// YOZISHDAN OLDIN shartli $inc bilan band qilinadi.
// ───────────────────────────────────────────────────────────────────────

/** Hisoblagich hujjati borligini kafolatlaydi (birinchi ishga tushish). */
const ensureCounter = async () => {
  const existing = await prisma.storageUsage.findUnique({ where: { key: USAGE_KEY } });
  if (existing) return existing;

  // Eski o'rnatmalarda fayllar bor, hisoblagich yo'q - shuning uchun
  // noldan emas, MAVJUD fayllardan boshlaymiz.
  const { usedBytes } = await aggregateFromFiles();
  try {
    return await prisma.storageUsage.create({
      data: { key: USAGE_KEY, usedBytes, reconciledAt: new Date() },
    });
  } catch (err) {
    // Ikki instans bir vaqtda yaratmoqchi bo'lsa biri unique xatosini
    // oladi - bu xato emas, hujjat allaqachon bor degani.
    // Mongo: E11000 → Prisma: P2002.
    if (err?.code === "P2002") {
      return prisma.storageUsage.findUnique({ where: { key: USAGE_KEY } });
    }
    throw err;
  }
};

const aggregateFromFiles = async () => {
  // Mongo: aggregate([$match, $group $sum]) → Prisma: aggregate({_sum,_count}).
  const row = await prisma.storedFile.aggregate({
    where: { isDeleted: false },
    _sum: { size: true },
    _count: { _all: true },
  });
  return { usedBytes: row._sum.size || 0, fileCount: row._count._all || 0 };
};

/**
 * Hisoblagichni HAQIQAT (diskdagi fayllar ro'yxati) bo'yicha qayta
 * hisoblaydi.
 *
 * Kerak bo'ladigan holat: jarayon joyni band qilib, faylni yozishdan
 * oldin yiqilsa, hisoblagichda "band" bo'lgan bayt qolib ketadi. Bu
 * kvotani ASTA-SEKIN yeydi, shuning uchun server har ishga tushganda
 * tekislanadi.
 */
export const reconcile = async () => {
  const { usedBytes, fileCount } = await aggregateFromFiles();
  // `new: false` - Mongo ESKI hujjatni qaytarardi (drift hisoblash uchun).
  // Prisma upsert HAR DOIM yangisini qaytaradi, shuning uchun eskisini
  // OLDIN o'qib olamiz.
  const before = await prisma.storageUsage.findUnique({
    where: { key: USAGE_KEY },
  });
  await prisma.storageUsage.upsert({
    where: { key: USAGE_KEY },
    update: { usedBytes, reconciledAt: new Date() },
    create: { key: USAGE_KEY, usedBytes, reconciledAt: new Date() },
  });

  const drift = (before?.usedBytes ?? usedBytes) - usedBytes;
  if (drift !== 0) {
    logger.warn(
      { drift, usedBytes, fileCount },
      "Saqlash hisoblagichi haqiqat bilan mos emas edi - tekislandi",
    );
  }
  return { usedBytes, fileCount, drift };
};

/**
 * Joyni ATOMIK band qiladi. Sig'masa null qaytadi (chaqiruvchi 507 beradi).
 *
 * Shart hujjatning O'ZIDA: `usedBytes <= quota - size`. MongoDB bitta
 * hujjatga bo'lgan findOneAndUpdate'ni atomik bajaradi, ya'ni shart
 * bajarilmasa hech narsa o'zgarmaydi va parallel ikkinchi so'rov shu
 * yerda to'xtaydi.
 */
const reserve = async (size) => {
  await ensureCounter();
  const quota = env.STORAGE_QUOTA_BYTES;

  // ATOMIKLIK: shart `WHERE` ichida - PostgreSQL `UPDATE ... WHERE` ni
  // qator darajasida atomik bajaradi. Ya'ni ikkita parallel yuklash
  // kvotani birgalikda oshirib yubora olmaydi: ikkinchisining sharti
  // birinchisi yozgandan keyin tekshiriladi va `count = 0` qaytadi.
  //
  // `updateMany` ATAYLAB (`update` emas): `update` faqat unique maydon
  // bo'yicha ishlaydi va qo'shimcha shart qo'ya olmaydi.
  const res = await prisma.storageUsage.updateMany({
    where: { key: USAGE_KEY, usedBytes: { lte: quota - size } },
    data: { usedBytes: { increment: size } },
  });
  if (res.count !== 1) return null;

  return prisma.storageUsage.findUnique({ where: { key: USAGE_KEY } });
};

/** Band qilingan joyni qaytaradi (yozish yiqilsa yoki fayl o'chsa). */
const release = async (size) => {
  if (!size) return;
  await prisma.storageUsage.updateMany({
    where: { key: USAGE_KEY },
    data: { usedBytes: { decrement: size } },
  });
  // Hisoblagich manfiyga tushib ketmasin (ikki marta release bo'lsa) -
  // manfiy qiymat keyingi kvota tekshiruvini yolg'on "bo'sh" qilib
  // ko'rsatardi.
  await prisma.storageUsage.updateMany({
    where: { key: USAGE_KEY, usedBytes: { lt: 0 } },
    data: { usedBytes: 0 },
  });
};

/**
 * Markazning fayl kvotasi holati.
 *
 * Sidebar indikatori ham, formadagi tekshiruv ham shu yagona manbadan
 * oziqlanadi - aks holda UI "joy bor" deb turib, server rad etardi.
 *
 * KESH YO'Q: bu bitta kichik hujjatni o'qish (indekslangan), qimmat
 * emas. Ilgari 15 soniyalik kesh bor edi va aynan u xavfli edi -
 * kvota tekshiruvi eskirgan, KICHIKROQ raqamni ko'rib faylni
 * o'tkazib yuborishi mumkin edi. Klient tomonda TanStack allaqachon
 * 30 soniya keshlaydi, ya'ni so'rovlar soni baribir kam.
 */
export const getUsage = async () => {
  const counter = await ensureCounter();
  const usedBytes = Math.max(0, counter?.usedBytes || 0);
  const quotaBytes = env.STORAGE_QUOTA_BYTES;
  const freeBytes = Math.max(0, quotaBytes - usedBytes);
  // Fayl SONI hisoblagichda saqlanmaydi - u kvota qaroriga ta'sir
  // qilmaydi, shuning uchun indekslangan countDocuments yetarli
  // (bayt yig'indisi kabi agregatsiya kerak emas).
  const fileCount = await prisma.storedFile.count({ where: { isDeleted: false } });

  return {
    usedBytes,
    quotaBytes,
    freeBytes,
    fileCount,
    // Bitta fayl chegarasi ham shu javobda: forma "5 MB gacha" deb
    // yozishi uchun alohida so'rov kerak bo'lmasin.
    maxUploadBytes: env.MAX_UPLOAD_BYTES,
    percent: quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0,
    // "To'lgan" = eng katta ruxsat etilgan fayl ham sig'maydi. Aynan shu
    // paytda UI fayl tanlashni butunlay bekor qiladi.
    isFull: freeBytes < env.MAX_UPLOAD_BYTES,
  };
};

/** Bitta fayl chegarasi (kvotadan MUSTAQIL tekshiruv). */
const assertFileSize = (size) => {
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
};

const quotaError = async (size) => {
  const usage = await getUsage();
  return new ApiError(
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
};

/**
 * Fayl sig'adimi - HECH NARSA yozmasdan tekshiradi (forma uchun).
 *
 * DIQQAT: bu faqat OLDINDAN ogohlantirish. Haqiqiy kafolat `saveBuffer`
 * ichidagi atomik band qilishda - shu funksiya "sig'adi" desa ham, ayni
 * o'sha lahzada boshqa so'rov joyni egallab qo'yishi mumkin.
 */
export const assertQuota = async (incomingBytes) => {
  const size = Number(incomingBytes) || 0;
  assertFileSize(size);

  const usage = await getUsage();
  if (usage.usedBytes + size > usage.quotaBytes) throw await quotaError(size);
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
 * TARTIB MUHIM va u aynan shunday bo'lishi kerak:
 *
 *   1) fayl o'lchami chegarasi        -> 413
 *   2) joyni ATOMIK band qilish       -> 507 (kvota kafolati SHU YERDA)
 *   3) diskka yozish                  -> yiqilsa joy qaytariladi
 *   4) StoredFile yaratish            -> yiqilsa fayl ham, joy ham qaytariladi
 *
 * 2-qadam yozishdan OLDIN turgani uchun ikki parallel so'rov birgalikda
 * kvotadan oshira olmaydi: ikkinchisi shartli $inc'da to'xtaydi.
 */
export const saveBuffer = async ({
  buffer,
  originalName,
  mimeType,
  userId,
  purpose = "assignment",
}) => {
  if (!buffer?.length) throw new ApiError(400, "Fayl bo'sh");
  const size = buffer.length;

  assertFileSize(size);
  if (!(await reserve(size))) throw await quotaError(size);

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

  try {
    await fs.mkdir(absDir, { recursive: true });
    await fs.writeFile(absPath, buffer);
  } catch (err) {
    // Yozilmagan fayl joy egallamasligi kerak.
    await release(size);
    throw err;
  }

  try {
    const created = await prisma.storedFile.create({
      data: {
        originalName: String(originalName || "fayl").slice(0, 255),
        storedName,
        relPath,
        mimeType: mimeType || "application/octet-stream",
        size,
        purpose,
        uploadedById: userId || null,
      },
    });
    return withLegacyId(created);
  } catch (err) {
    // Baza yozuvi yaratilmasa diskdagi fayl YETIM qolardi: u ro'yxatda
    // ko'rinmaydi, lekin joyni egallab turadi. Ikkalasini ham qaytaramiz.
    await fs.unlink(absPath).catch(() => null);
    await release(size);
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
      { err, fileId: storedFile.id || storedFile._id },
      "Saqlangan fayl diskda topilmadi",
    );
    throw new ApiError(404, "Fayl topilmadi");
  }
};

/**
 * Faylni diskdan o'chiradi, hujjatni arxivlaydi va joyni bo'shatadi.
 *
 * Hujjat ATAYLAB butunlay o'chirilmaydi: vazifa tarixida "fayl bor edi"
 * degani ko'rinib tursin.
 *
 * Hisoblagich FAQAT hujjat haqiqatan "o'chirilgan"ga o'tganda kamayadi
 * (`modifiedCount`) - aks holda ikki marta o'chirish so'rovi joyni ikki
 * marta bo'shatib, hisobni buzardi.
 */
export const removeFile = async (storedFile, userId) => {
  if (!storedFile) return;

  // Shart ichidagi `isDeleted: false` MUHIM: ikki marta o'chirish so'rovi
  // kelsa ikkinchisi `count = 0` oladi va joy IKKI MARTA bo'shatilmaydi.
  const res = await prisma.storedFile.updateMany({
    where: { id: storedFile.id || storedFile._id, isDeleted: false },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: userId || null,
      telegramFileId: null,
    },
  });

  if (!res.count) return; // allaqachon o'chirilgan - qayta hisoblamaymiz

  await fs.unlink(absolutePathOf(storedFile)).catch(() => null);
  await release(storedFile.size);
};

/** Telegram file_id ni keshlaydi - keyingi yuborishlar tez bo'lsin. */
export const cacheTelegramFileId = async (fileId, telegramFileId) => {
  if (!fileId || !telegramFileId) return;
  await prisma.storedFile
    .update({ where: { id: String(fileId) }, data: { telegramFileId } })
    .catch(() => null);
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
