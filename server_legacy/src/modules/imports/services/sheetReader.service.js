import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import ApiError from "../../../utils/ApiError.js";

// Bir faylda qabul qilinadigan maksimal qator. Eksportdagi MAX_SYNC_ROWS
// bilan bir xil mulohaza: butun fayl xotirada tahlil qilinadi.
export const MAX_IMPORT_ROWS = 5000;

// Sarlavhalarni solishtirish uchun normallashtirish.
//
// NEGA: foydalanuvchi shablonni Excel'da ochib saqlaganda sarlavhaga
// ko'rinmas bo'shliq (NBSP), qo'shimcha probel yoki registr o'zgarishi
// kirib qolishi mumkin. Qattiq solishtirsak butun fayl "sarlavha noto'g'ri"
// bo'lib rad etilardi. O'zbekcha apostrof variantlari (' ' ʻ `) ham
// bir xil belgiga keltiriladi - klaviaturaga qarab har xil chiqadi.
const normalizeHeader = (value) =>
  String(value ?? "")
    .replace(/ /g, " ")
    .replace(/['’‘ʻʼ`]/g, "'")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

// Excel katagidan toza qiymat oladi.
//
// ExcelJS katak qiymati oddiy skalyar bo'lmasligi mumkin:
//  • formula katagi  -> { formula, result }
//  • boy matn        -> { richText: [...] }
//  • giperhavola     -> { text, hyperlink }
// Bularni tekislamasa, validatsiya "[object Object]" ni ko'radi.
const cellValue = (cell) => {
  const v = cell?.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if (v.formula !== undefined) return v.result ?? null;
    if (v.text !== undefined) return v.text;
    if (v.hyperlink !== undefined) return v.hyperlink;
    return null;
  }
  return v;
};

const isBlank = (v) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const loadWorksheet = async (buffer, fileName) => {
  const workbook = new ExcelJS.Workbook();
  const isCsv = /\.csv$/i.test(fileName || "");

  try {
    if (isCsv) {
      // ExcelJS csv o'quvchisi oqim kutadi.
      await workbook.csv.read(Readable.from(buffer));
    } else {
      await workbook.xlsx.load(buffer);
    }
  } catch {
    throw new ApiError(
      400,
      "Faylni o'qib bo'lmadi. U buzilgan yoki Excel formatida emas (.xlsx / .csv kutilgan)",
    );
  }

  // Birinchi varaq - shablon bitta varaqli. Foydalanuvchi qo'shimcha
  // varaq qo'shsa ham birinchisi ma'lumot varag'i bo'lib qoladi.
  const ws = workbook.worksheets[0];
  if (!ws) throw new ApiError(400, "Faylda ma'lumot varag'i topilmadi");
  return ws;
};

/**
 * Excel/CSV buferini ustun tavsifiga ko'ra qatorlarga aylantiradi.
 *
 * Sarlavhalar MATN bo'yicha moslanadi (ustun tartibi emas) - foydalanuvchi
 * ustunlarni joyini almashtirsa yoki keraksizini o'chirsa ham ishlaydi.
 *
 * @param {Buffer} buffer
 * @param {string} fileName
 * @param {Array<{key,header,required}>} columns - importer ustun tavsifi
 * @returns {{rows: Array<{rowNumber:number, raw:object}>, missingHeaders: string[], unknownHeaders: string[]}}
 */
export const readSheet = async (buffer, fileName, columns) => {
  const ws = await loadWorksheet(buffer, fileName);

  // ── Sarlavha qatori ──
  const headerRow = ws.getRow(1);
  const headerByCol = new Map(); // ustun raqami -> importer kaliti
  const seenHeaders = [];
  const wanted = new Map(columns.map((c) => [normalizeHeader(c.header), c.key]));

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = normalizeHeader(cellValue(cell));
    if (!text) return;
    seenHeaders.push(text);
    const key = wanted.get(text);
    if (key) headerByCol.set(colNumber, key);
  });

  if (headerByCol.size === 0) {
    throw new ApiError(
      400,
      "Sarlavha qatori topilmadi. Shablonni yuklab olib, birinchi qatordagi " +
        "sarlavhalarni o'zgartirmasdan to'ldiring",
    );
  }

  const mappedKeys = new Set(headerByCol.values());
  const missingHeaders = columns
    .filter((c) => c.required && !mappedKeys.has(c.key))
    .map((c) => c.header);
  const unknownHeaders = seenHeaders.filter((h) => !wanted.has(h));

  // ── Ma'lumot qatorlari ──
  const rows = [];
  let truncated = false;

  // rowNumber ATAYLAB Excel'dagi haqiqiy raqam: foydalanuvchi xatoni
  // faylda darhol topa olishi kerak ("12-qator" -> Excel'da 12-qator).
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // sarlavha
    if (truncated) return;

    const raw = {};
    let hasValue = false;
    for (const [colNumber, key] of headerByCol) {
      const value = cellValue(row.getCell(colNumber));
      raw[key] = value;
      if (!isBlank(value)) hasValue = true;
    }

    // Butunlay bo'sh qator - Excel'da tez-tez uchraydi (formatlangan,
    // lekin to'ldirilmagan). Uni xato deb ko'rsatish shovqin bo'lardi.
    if (!hasValue) return;

    if (rows.length >= MAX_IMPORT_ROWS) {
      truncated = true;
      return;
    }
    rows.push({ rowNumber, raw });
  });

  if (truncated) {
    throw new ApiError(
      413,
      `Faylda ${MAX_IMPORT_ROWS.toLocaleString("uz-UZ")} qatordan ko'p ma'lumot bor. ` +
        `Faylni bo'laklarga bo'lib yuklang`,
      { code: "IMPORT_TOO_LARGE" },
    );
  }

  return { rows, missingHeaders, unknownHeaders };
};

export default readSheet;
