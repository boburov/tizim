import prisma from "../config/prisma.js";

// Davomat↔to'lov korrelatsiya hisobotining BAZA-backed keshi.
// Ko'p-instansli deploy'da bo'linadi: bir instansda invalidate qilinsa,
// barcha instanslar yangi ma'lumotni oladi (in-process Map muammosi yo'q).
//
// MUDDATI O'TGAN QATORLARNI KIM O'CHIRADI: Mongo'da TTL indeksi
// (`expireAfterSeconds: 0`) buni o'zi qilardi. PostgreSQL'da bunday
// mexanizm YO'Q - `jobs/ttlCleanup.job.js` har kuni tozalaydi. Shuning
// uchun o'qishda `expiresAt` QO'LDA tekshiriladi (pastda): muddati
// o'tgan qator jadvalda bir necha soat turishi mumkin va uni
// "topildi" deb qaytarish eskirgan hisobot berardi.
const PREFIX = "correlation:";
const TTL_MS = 5 * 60 * 1000;

export const correlationCacheGet = async (key) => {
  try {
    const row = await prisma.cache.findUnique({
      where: { key: PREFIX + key },
      select: { value: true, expiresAt: true },
    });
    if (row && row.expiresAt > new Date()) return row.value;
  } catch {
    /* kesh xatosi - shunchaki cache-miss deb hisoblaymiz */
  }
  return null;
};

export const correlationCacheSet = async (key, data) => {
  try {
    const expiresAt = new Date(Date.now() + TTL_MS);
    // Mongo `updateOne(..., { upsert: true })` → Prisma `upsert`.
    // `key` unique bo'lgani uchun ikkala tomon ham xavfsiz.
    await prisma.cache.upsert({
      where: { key: PREFIX + key },
      update: { value: data, expiresAt },
      create: { key: PREFIX + key, value: data, expiresAt },
    });
  } catch {
    /* kesh yozib bo'lmadi - muhim emas */
  }
};

// Sinxron chaqiruvchilar uchun ham xavfsiz: promise qaytaradi, ichida try/catch
// (await qilinmasa ham unhandled rejection bermaydi).
export const correlationCacheInvalidate = async (year, month) => {
  try {
    if (year && month) {
      await prisma.cache.deleteMany({ where: { key: `${PREFIX}${year}-${month}` } });
    } else {
      // Mongo'da bu RegExp edi. Postgres'da prefiks bo'yicha `startsWith` -
      // u indeksdan foydalana oladi, RegExp esa yo'q.
      await prisma.cache.deleteMany({ where: { key: { startsWith: PREFIX } } });
    }
  } catch {
    /* noop */
  }
};
