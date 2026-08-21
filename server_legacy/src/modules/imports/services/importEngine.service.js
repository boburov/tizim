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

// JADVAL OQIMIDA bir martada yuboriladigan maksimal qator.
//
// readSheet'dagi MAX_IMPORT_ROWS (5000) dan PAST - ataylab. Bu qatorlar
// ImportJob hujjatiga saqlanadi (Mongo hujjat chegarasi 16 MB) va
// brauzerda TAHRIRLANADIGAN jadvalga chiziladi. 5000 qatorli grid
// har bosishda qayta render bo'lib, sekin kompyuterda ishlatib
// bo'lmas holga kelardi.
export const MAX_GRID_ROWS = 2000;

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
 * Ixtiyoriy (faqat JADVAL oqimini qo'llab-quvvatlaydigan importerlar):
 *   gridEnabled: true
 *   draftRow(raw, ctx, helpers) -> raw  (autofill: login/parol/sana/filial)
 *   previewRow?(data, ctx)      -> object  (hisoblangan ustunlar: oylar, qarz)
 *
 * NEGA prepare() alohida: har bir qator uchun DB'ga borish 5000 qatorda
 * 15 000 so'rov bo'lardi. prepare BIR MARTA hammasini yuklab, Map/Set
 * ko'rinishida beradi - validatsiya sof xotirada ishlaydi.
 */

// preparedCtx berilsa qayta qurilmaydi (draft oqimida ctx allaqachon
// qurilgan bo'ladi - ikkinchi marta qurish barcha ommaviy qidiruvlarni
// takrorlardi).
const validateAll = async (importer, rows, preparedCtx = null, actor = {}) => {
  const ctx = preparedCtx || (await importer.prepare(rows.map((r) => r.raw), actor));

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

    // HISOBLANGAN USTUNLAR (faqat jadval oqimi). Masalan o'quvchida:
    // "necha oy qarz yaratiladi", "jami summa", "yakuniy balans".
    // Foydalanuvchi "Yaratish"ni bosishdan OLDIN natijani ko'rishi -
    // `+`/`-` ishorasidagi har qanday chalkashlikni yo'q qiladi.
    let preview = null;
    if (data && importer.previewRow) {
      try {
        preview = await importer.previewRow(data, ctx);
      } catch (e) {
        logger.warn({ err: e, rowNumber }, "Import qatori ko'rinishini hisoblab bo'lmadi");
      }
    }

    results.push({ rowNumber, raw, data, errors, status, preview });
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
  // Hisoblangan (faqat o'qish uchun) ustunlar - jadval oqimida.
  preview: r.preview || null,
});

/**
 * 1-BOSQICH: faylni o'qib, tekshirib, natijani QAYTARADI. Hech narsa yozilmaydi.
 */
export const preview = async ({ importer, buffer, fileName, actor = {} }) => {
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

  const { results } = await validateAll(importer, rows, null, actor);

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
export const commit = async ({ importer, buffer, fileName, currentUser, actor = {} }) => {
  const { rows } = await readSheet(buffer, fileName, importer.columns);
  if (!rows.length) throw new ApiError(400, "Faylda ma'lumot qatori topilmadi");

  const { ctx, results } = await validateAll(importer, rows, null, actor);

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

// ═══════════════════════════════════════════════════════════════════════
//  JADVAL OQIMI (draft → tahrirlash → yaratish)
//
//  Eski oqim: fayl → preview → fayl → commit. Fayl ikki marta yuboriladi
//  va TASDIQ BOSQICHIDA QAYTA O'QILADI, ya'ni foydalanuvchi ko'rgan
//  narsani tahrirlab bo'lmaydi.
//
//  Yangi oqim: fayl → DRAFT (autofill + login/parol generatsiyasi) →
//  brauzerda tahrirlanadigan jadval → qatorlar JSON bo'lib qaytadi →
//  yaratiladi.
//
//  XAVFSIZLIK QOIDASI (o'zgarmaydi): client yuborgan `status` ga HECH
//  QACHON ishonilmaydi. commitRows() yozishdan oldin validateAll() ni
//  TO'LIQ qayta yurgizadi. Aks holda foydalanuvchi brauzerda status'ni
//  "ok" qilib, tekshiruvdan o'tmagan ma'lumotni kiritib yuborardi.
// ═══════════════════════════════════════════════════════════════════════

const assertGridSupported = (importer) => {
  if (!importer.gridEnabled) {
    throw new ApiError(
      400,
      `"${importer.label}" importi jadval rejimini qo'llab-quvvatlamaydi`,
    );
  }
};

// Client'dan kelgan qatorlarni ichki ko'rinishga keltiradi.
// rowNumber saqlanadi - foydalanuvchi jadvalda qaysi qator ekanini ko'radi.
const fromWireRows = (rows) =>
  (rows || []).map((r, i) => ({
    rowNumber: Number(r?.rowNumber) || i + 1,
    raw: r?.raw && typeof r.raw === "object" ? r.raw : {},
  }));

/**
 * 1-BOSQICH (jadval oqimi): faylni o'qib, TAHRIRLANADIGAN qoralama beradi.
 *
 * Hech narsa yozilmaydi. Har qator uchun importer'ning draftRow() si
 * bo'sh maydonlarni to'ldiradi (login, parol, sana, filial), keyin
 * hammasi odatdagidek tekshiriladi.
 */
export const draftFromFile = async ({ importer, buffer, fileName, actor = {} }) => {
  assertGridSupported(importer);

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
  if (!rows.length) throw new ApiError(400, "Faylda ma'lumot qatori topilmadi");
  if (rows.length > MAX_GRID_ROWS) {
    throw new ApiError(
      413,
      `Jadval rejimida bir faylda ${MAX_GRID_ROWS} qatordan ko'p bo'lmasligi kerak. ` +
        `Faylni bo'laklarga bo'lib yuklang`,
      { code: "IMPORT_TOO_LARGE" },
    );
  }

  const ctx = await importer.prepare(rows.map((r) => r.raw), actor);

  // AVTOTO'LDIRISH. `taken` to'plami qatordan qatorga o'sib boradi -
  // shuning uchun bir fayldagi ikkita bir xil ismli odam BOSHQA login
  // oladi. Bu to'plamsiz ikkalasiga "ali.valiyev" berilib, ikkinchisi
  // yozishda yiqilardi.
  const drafted = [];
  for (const { rowNumber, raw } of rows) {
    const filled = importer.draftRow ? await importer.draftRow(raw, ctx) : raw;
    drafted.push({ rowNumber, raw: filled });
  }

  const { results } = await validateAll(importer, drafted, ctx, actor);

  return {
    summary: summarize(results),
    unknownHeaders,
    // Jadval oqimida qatorlar TARTIBI SAQLANADI (fayldagidek) va
    // hech biri kesilmaydi - foydalanuvchi hammasini tahrirlashi kerak.
    rows: results.map(toWireRow),
    columns: importer.columns,
  };
};

/**
 * 2-BOSQICH: tahrirlangan qatorlarni QAYTA tekshiradi. Hech narsa yozilmaydi.
 * Jadvalda har o'zgarishdan keyin chaqiriladi (client debounce bilan).
 */
export const validateRows = async ({ importer, rows, actor = {} }) => {
  assertGridSupported(importer);

  const parsed = fromWireRows(rows);
  if (!parsed.length) throw new ApiError(400, "Tekshirish uchun qator yuborilmadi");
  if (parsed.length > MAX_GRID_ROWS) {
    throw new ApiError(413, `Bir martada ${MAX_GRID_ROWS} qatordan ko'p bo'lmasligi kerak`);
  }

  const { results } = await validateAll(importer, parsed, null, actor);
  return { summary: summarize(results), rows: results.map(toWireRow) };
};

/**
 * 3-BOSQICH: tahrirlangan qatorlarni YOZADI.
 *
 * ATOMIKLIK: har QATOR alohida atomik (domen servisi ichida runFinanceTxn).
 * Butun fayl bitta tranzaksiyaga o'ralmaydi - 500 qatorlik tranzaksiya
 * Mongo cheklovlariga uriladi va bitta yomon qator hammasini bekor
 * qilardi. "Qisman muvaffaqiyat + hisobot" aynan talab qilingan xulq.
 *
 * onProgress(processed) - navbat rejimida jarayonni ko'rsatish uchun.
 */
export const commitRows = async ({
  importer,
  rows,
  currentUser,
  importJobId = null,
  onProgress = null,
  actor = {},
}) => {
  assertGridSupported(importer);

  const parsed = fromWireRows(rows);
  if (!parsed.length) throw new ApiError(400, "Yozish uchun qator yuborilmadi");
  if (parsed.length > MAX_GRID_ROWS) {
    throw new ApiError(413, `Bir martada ${MAX_GRID_ROWS} qatordan ko'p bo'lmasligi kerak`);
  }

  // QAYTA TEKSHIRUV - client yuborgan holatga ishonilmaydi.
  // `actor` ham qayta uzatiladi: ruxsatga bog'liq qoidalar (masalan
  // "boshlang'ich qoldiq uchun finance.manage kerak") yozish paytida
  // ham AYNAN shu tekshiruvdan o'tishi shart.
  const { ctx, results } = await validateAll(importer, parsed, null, actor);

  let processed = 0;
  // Har necha qatorda progress yoziladi. Har qatorda yozilsa 500 qator
  // 500 ta qo'shimcha DB yozuvi bo'lardi - importning o'zidan sekinroq.
  const PROGRESS_EVERY = 10;

  for (const row of results) {
    processed += 1;
    if (row.status === ROW_STATUS.OK) {
      try {
        const out = await importer.commitRow(row.data, ctx, {
          currentUser,
          importJobId,
        });
        row.status = out?.status || ROW_STATUS.IMPORTED;
        row.message = out?.message || null;
      } catch (e) {
        // Bitta qator yiqilsa qolganlari davom etadi.
        row.status = ROW_STATUS.FAILED;
        row.errors = [{ message: e?.message || "Yozishda xato" }];
        row.message = e?.message || null;
        if (!e?.isOperational) {
          logger.error(
            { err: e, rowNumber: row.rowNumber },
            "Import qatorini yozishda xato",
          );
        }
      }
    }

    if (onProgress && (processed % PROGRESS_EVERY === 0 || processed === results.length)) {
      await onProgress(processed);
    }
  }

  return {
    summary: summarize(results),
    rows: results.map(toWireRow),
    failedRows: results
      .filter((r) => r.status !== ROW_STATUS.IMPORTED && r.status !== ROW_STATUS.PENDING)
      .map(toWireRow),
  };
};
