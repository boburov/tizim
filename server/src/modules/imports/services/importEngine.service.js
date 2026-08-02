import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { readSheet } from "./sheetReader.service.js";

export const ROW_STATUS = Object.freeze({
  OK: "ok", // tekshiruvdan o'tdi, yozishga tayyor
  ERROR: "error", // xato bor - yozilmaydi
  DUPLICATE: "duplicate", // takror - yozilmaydi
  IMPORTED: "imported", // yozildi
  PENDING: "pending", // yozilmadi: tasdiq kutmoqda (chiqim limiti)
  FAILED: "failed", // yozishda xato
});

// Ko'rib chiqishda (preview) client'ga yuboriladigan maksimal qator.
// Qolganlari faqat statistikaga kiradi - 5000 qatorlik jadval brauzerni
// qotirib qo'yardi va foydalanuvchi baribir hammasini ko'rmaydi.
const PREVIEW_LIMIT = 200;

/**
 * UMUMIY IMPORT DVIGATELI.
 *
 * Importer (modulga xos qism) shu shartnomani bajaradi:
 *   key, label, permission, columns[]
 *   prepare(rawRows)            -> ctx (ommaviy qidiruvlar: o'quvchi, guruh...)
 *   validateRow(raw, ctx)       -> { errors: [{field?, message}], data }
 *   dedupeKey?(data)            -> string|null  (qator "shaxsiyati")
 *   commitRow(data, ctx, opts)  -> { status, message? }
 *
 * NEGA prepare() alohida: har bir qator uchun DB'ga borish 5000 qatorda
 * 15 000 so'rov bo'lardi. prepare BIR MARTA hammasini yuklab, Map/Set
 * ko'rinishida beradi - validatsiya sof xotirada ishlaydi.
 */

const validateAll = async (importer, rows) => {
  const ctx = await importer.prepare(rows.map((r) => r.raw));

  const seenInFile = new Map(); // dedupeKey -> birinchi uchragan qator
  const results = [];

  for (const { rowNumber, raw } of rows) {
    let errors = [];
    let data = null;

    try {
      const out = importer.validateRow(raw, ctx);
      errors = out.errors || [];
      data = out.data;
    } catch (e) {
      // Importer'dagi kutilmagan xato BUTUN importni to'xtatmasin -
      // shu qator xato deb belgilanadi, qolganlari tekshirilaveradi.
      logger.error({ err: e, rowNumber }, "Import qatorini tekshirishda xato");
      errors = [{ message: "Qatorni tekshirib bo'lmadi" }];
    }

    let status = errors.length ? ROW_STATUS.ERROR : ROW_STATUS.OK;

    // ── Takrorlarni aniqlash ──
    if (!errors.length && importer.dedupeKey) {
      const key = importer.dedupeKey(data);
      if (key) {
        // 1) Fayl ichida takror
        if (seenInFile.has(key)) {
          errors.push({
            message: `Fayl ichida takrorlangan (${seenInFile.get(key)}-qator bilan bir xil)`,
          });
          status = ROW_STATUS.DUPLICATE;
        } else {
          seenInFile.set(key, rowNumber);
          // 2) Bazada allaqachon bor
          if (ctx.existingKeys?.has(key)) {
            errors.push({ message: "Bu yozuv bazada allaqachon mavjud" });
            status = ROW_STATUS.DUPLICATE;
          }
        }
      }
    }

    results.push({ rowNumber, raw, data, errors, status });
  }

  return { ctx, results };
};

const summarize = (results) => {
  const count = (s) => results.filter((r) => r.status === s).length;
  return {
    total: results.length,
    valid: count(ROW_STATUS.OK),
    error: count(ROW_STATUS.ERROR),
    duplicate: count(ROW_STATUS.DUPLICATE),
    imported: count(ROW_STATUS.IMPORTED),
    pending: count(ROW_STATUS.PENDING),
    failed: count(ROW_STATUS.FAILED),
  };
};

// Client'ga yuboriladigan yengil ko'rinish (ichki `data` yuborilmaydi -
// unda ObjectId va xizmat maydonlari bor).
const toWireRow = (r) => ({
  rowNumber: r.rowNumber,
  status: r.status,
  errors: r.errors,
  raw: r.raw,
  message: r.message || null,
});

/**
 * 1-BOSQICH: faylni o'qib, tekshirib, natijani QAYTARADI. Hech narsa yozilmaydi.
 */
export const preview = async ({ importer, buffer, fileName }) => {
  const { rows, missingHeaders, unknownHeaders } = await readSheet(
    buffer,
    fileName,
    importer.columns,
  );

  if (missingHeaders.length) {
    throw new ApiError(
      400,
      `Faylda majburiy ustun(lar) yo'q: ${missingHeaders.join(", ")}. ` +
        `Shablonni yuklab olib ishlatishni tavsiya qilamiz`,
      { code: "IMPORT_MISSING_COLUMNS", details: { missingHeaders } },
    );
  }

  if (!rows.length) {
    throw new ApiError(400, "Faylda ma'lumot qatori topilmadi");
  }

  const { results } = await validateAll(importer, rows);

  return {
    summary: summarize(results),
    unknownHeaders,
    // Xatoli qatorlar BIRINCHI ko'rsatiladi - foydalanuvchi tuzatishi
    // kerak bo'lgan narsani qidirib o'tirmasin.
    rows: [...results]
      .sort((a, b) => {
        const bad = (r) => (r.status === ROW_STATUS.OK ? 1 : 0);
        return bad(a) - bad(b) || a.rowNumber - b.rowNumber;
      })
      .slice(0, PREVIEW_LIMIT)
      .map(toWireRow),
    truncated: results.length > PREVIEW_LIMIT,
  };
};

/**
 * 2-BOSQICH: faylni QAYTA o'qib, qayta tekshirib, to'g'ri qatorlarni yozadi.
 *
 * NEGA qayta tekshiriladi (preview natijasini saqlab qo'yish emas):
 *  • Ko'rib chiqish bilan tasdiq orasida ma'lumot o'zgargan bo'lishi mumkin
 *    (boshqa kassir o'sha to'lovni kiritib ulgurgan) - eski natija bo'yicha
 *    yozsak, dublikat tekshiruvi eskirgan bo'lardi.
 *  • Server tomonda vaqtinchalik holat saqlanmaydi - ko'lam kengayganda
 *    "preview token" muddati/tozalash muammosi tug'ilmaydi.
 *  • Client yuborgan qatorlarga ISHONMAYMIZ - aks holda foydalanuvchi
 *    tekshiruvdan o'tmagan ma'lumotni tasdiq bosqichida kiritib yuborardi.
 *
 * ATOMIKLIK: har QATOR alohida atomik (domen servisi ichida runFinanceTxn
 * bor). Butun faylni bitta tranzaksiyaga o'rash ATAYLAB qilinmagan:
 * 5000 qatorlik tranzaksiya Mongo cheklovlariga uriladi, bitta yomon
 * qator hammasini bekor qilardi va "qisman muvaffaqiyat + hisobot"
 * talabini bajarib bo'lmasdi. Qator darajasida atomiklik pul yarim
 * holatda qolmasligini kafolatlaydi - talab qilinadigan narsa shu.
 */
export const commit = async ({ importer, buffer, fileName, currentUser }) => {
  const { rows } = await readSheet(buffer, fileName, importer.columns);
  if (!rows.length) throw new ApiError(400, "Faylda ma'lumot qatori topilmadi");

  const { ctx, results } = await validateAll(importer, rows);

  for (const row of results) {
    if (row.status !== ROW_STATUS.OK) continue;
    try {
      const out = await importer.commitRow(row.data, ctx, { currentUser });
      row.status = out?.status || ROW_STATUS.IMPORTED;
      row.message = out?.message || null;
    } catch (e) {
      // Bitta qator yiqilsa qolganlari davom etadi (talab).
      row.status = ROW_STATUS.FAILED;
      row.errors = [{ message: e?.message || "Yozishda xato" }];
      row.message = e?.message || null;
      if (!e?.isOperational) {
        logger.error({ err: e, rowNumber: row.rowNumber }, "Import qatorini yozishda xato");
      }
    }
  }

  const failedRows = results
    .filter((r) => r.status !== ROW_STATUS.IMPORTED && r.status !== ROW_STATUS.PENDING)
    .map(toWireRow);

  return {
    summary: summarize(results),
    // Xato qatorlar TO'LIQ qaytadi (kesilmaydi) - foydalanuvchi ularni
    // Excel qilib yuklab olib, tuzatib qayta yuklaydi.
    failedRows,
    rows: results.slice(0, PREVIEW_LIMIT).map(toWireRow),
  };
};
