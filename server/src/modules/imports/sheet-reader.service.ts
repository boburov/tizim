import { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { ApiError } from '../../common/errors/api-error.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXCEL/CSV O'QUVCHI (`imports/services/sheetReader.service.js`).
 *
 * ⚠ Bir faylda qabul qilinadigan maksimal qator — eksportdagi
 * `MAX_SYNC_ROWS` bilan BIR XIL mulohaza: butun fayl XOTIRADA tahlil
 * qilinadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const MAX_IMPORT_ROWS = 5000;

/**
 * Sarlavhalarni solishtirish uchun NORMALLASHTIRISH.
 *
 * ⚠ NEGA SHART: foydalanuvchi shablonni Excel'da ochib saqlaganda
 * sarlavhaga KO'RINMAS bo'shliq (NBSP), qo'shimcha probel yoki registr
 * o'zgarishi kirib qolishi mumkin. Qattiq solishtirsak BUTUN FAYL
 * "sarlavha noto'g'ri" bo'lib rad etilardi. O'zbekcha apostrof
 * variantlari (`' ’ ʻ \``) ham bir xil belgiga keltiriladi — klaviaturaga
 * qarab har xil chiqadi.
 */
const normalizeHeader = (value: unknown): string =>
  String(value ?? '')
    .replace(/ /g, ' ')
    .replace(/['’‘ʻʼ`]/g, "'")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/**
 * Excel katagidan TOZA qiymat oladi.
 *
 * ⚠ ExcelJS katak qiymati oddiy skalyar BO'LMASLIGI mumkin:
 *   formula katagi → `{ formula, result }`
 *   boy matn       → `{ richText: [...] }`
 *   giperhavola    → `{ text, hyperlink }`
 * Bularni tekislamasa validatsiya `"[object Object]"` ni ko'radi.
 */
const cellValue = (cell: any): unknown => {
  const v = cell?.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t: any) => t.text).join('');
    if (v.formula !== undefined) return v.result ?? null;
    if (v.text !== undefined) return v.text;
    if (v.hyperlink !== undefined) return v.hyperlink;
    return null;
  }
  return v;
};

const isBlank = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

export interface SheetColumn { key: string; header: string; required?: boolean }

@Injectable()
export class SheetReaderService {
  private async loadWorksheet(buffer: Buffer, fileName?: string) {
    const workbook = new ExcelJS.Workbook();
    const isCsv = /\.csv$/i.test(fileName || '');

    try {
      if (isCsv) {
        // ExcelJS csv o'quvchisi OQIM kutadi.
        await workbook.csv.read(Readable.from(buffer) as never);
      } else {
        await workbook.xlsx.load(buffer as never);
      }
    } catch {
      throw new ApiError(
        400,
        "Faylni o'qib bo'lmadi. U buzilgan yoki Excel formatida emas (.xlsx / .csv kutilgan)",
      );
    }

    // ⚠ BIRINCHI VARAQ — shablon bitta varaqli. Foydalanuvchi qo'shimcha
    // varaq qo'shsa ham birinchisi ma'lumot varag'i bo'lib qoladi.
    const ws = workbook.worksheets[0];
    if (!ws) throw new ApiError(400, "Faylda ma'lumot varag'i topilmadi");
    return ws;
  }

  /**
   * Excel/CSV buferini USTUN TAVSIFIGA ko'ra qatorlarga aylantiradi.
   *
   * ⚠ Sarlavhalar MATN bo'yicha moslanadi (ustun TARTIBI emas) —
   * foydalanuvchi ustunlar joyini almashtirsa yoki keraksizini o'chirsa
   * ham ishlaydi.
   */
  async readSheet(buffer: Buffer, fileName: string, columns: SheetColumn[]) {
    const ws = await this.loadWorksheet(buffer, fileName);

    // ── Sarlavha qatori ──
    const headerRow = ws.getRow(1);
    const headerByCol = new Map<number, string>(); // ustun raqami → importer kaliti
    const seenHeaders: string[] = [];
    const wanted = new Map(columns.map((c) => [normalizeHeader(c.header), c.key]));

    headerRow.eachCell({ includeEmpty: false }, (cell: any, colNumber: number) => {
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
    const rows: { rowNumber: number; raw: Record<string, unknown> }[] = [];
    let truncated = false;

    // ⚠ `rowNumber` ATAYLAB Excel'dagi HAQIQIY raqam: foydalanuvchi
    // xatoni faylda DARHOL topa olishi kerak ("12-qator" → Excel'da 12).
    ws.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
      if (rowNumber === 1) return; // sarlavha
      if (truncated) return;

      const raw: Record<string, unknown> = {};
      let hasValue = false;
      for (const [colNumber, key] of headerByCol) {
        const value = cellValue(row.getCell(colNumber));
        raw[key] = value;
        if (!isBlank(value)) hasValue = true;
      }

      // ⚠ BUTUNLAY BO'SH qator — Excel'da tez-tez uchraydi (formatlangan,
      // lekin to'ldirilmagan). Uni xato deb ko'rsatish SHOVQIN bo'lardi.
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
        `Faylda ${MAX_IMPORT_ROWS.toLocaleString('uz-UZ')} qatordan ko'p ma'lumot bor. ` +
          `Faylni bo'laklarga bo'lib yuklang`,
        { code: 'IMPORT_TOO_LARGE' },
      );
    }

    return { rows, missingHeaders, unknownHeaders };
  }
}
