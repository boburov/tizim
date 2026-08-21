import ExcelJS from "exceljs";
import env from "../../../config/env.js";

const REQUIRED_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
const OPTIONAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
const ERROR_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
const HEADER_FONT = { bold: true, size: 11, color: { argb: "FF0F172A" } };

const styleHeader = (row, columns) => {
  row.height = 26;
  row.eachCell((cell, col) => {
    const meta = columns[col - 1];
    cell.font = HEADER_FONT;
    // Majburiy ustunlar SARIQ, ixtiyoriylari kulrang - foydalanuvchi
    // qaysi ustunni to'ldirishi shartligini yo'riqnomani o'qimasdan ko'radi.
    cell.fill = meta?.required ? REQUIRED_FILL : OPTIONAL_FILL;
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: "FFCBD5E1" } } };
  });
};

/**
 * Import shabloni: sarlavhalar + namuna qator + yo'riqnoma varag'i.
 *
 * NEGA namuna qator bor: bo'sh shablonda foydalanuvchi sanani qanday
 * yozishni ("2025-06-15" mi "15.06.2025" mi) taxmin qiladi va birinchi
 * urinish deyarli doim xato bilan qaytadi. Namuna buni yo'q qiladi.
 * Namuna qator import paytida O'TKAZIB YUBORILMAYDI - foydalanuvchi uni
 * o'chirishi kerak; shuning uchun u ko'zga tashlanadigan qilib yozilgan.
 */
export const buildTemplate = async (importer) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = env.APP_NAME;
  workbook.created = new Date();

  const ws = workbook.addWorksheet(importer.sheetName || "Ma'lumot", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const columns = importer.columns;
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width || 20,
  }));
  styleHeader(ws.getRow(1), columns);

  // Namuna qator.
  const example = {};
  for (const c of columns) example[c.key] = c.example ?? "";
  const exampleRow = ws.addRow(example);
  exampleRow.eachCell((cell) => {
    cell.font = { italic: true, color: { argb: "FF94A3B8" } };
  });

  // ── Yo'riqnoma varag'i ──
  const help = workbook.addWorksheet("Yo'riqnoma");
  help.columns = [
    { key: "col", width: 26 },
    { key: "req", width: 12 },
    { key: "rule", width: 62 },
  ];
  const head = help.addRow({ col: "Ustun", req: "Majburiy", rule: "Qoida" });
  head.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = OPTIONAL_FILL;
  });

  for (const c of columns) {
    const row = help.addRow({
      col: c.header,
      req: c.required ? "Ha" : "Yo'q",
      rule: c.note || "",
    });
    row.getCell("col").font = { bold: true };
    row.getCell("rule").alignment = { wrapText: true, vertical: "top" };
  }

  help.addRow({});
  const note = help.addRow({
    col: "DIQQAT",
    req: "",
    rule:
      "Ikkinchi qatordagi kulrang NAMUNA qatorni o'chirib tashlang - " +
      "aks holda u ham import qilinishga urinadi va xato beradi.",
  });
  note.getCell("col").font = { bold: true, color: { argb: "FFB91C1C" } };
  note.getCell("rule").alignment = { wrapText: true, vertical: "top" };

  return workbook.xlsx.writeBuffer();
};

/**
 * Xatolik hisoboti: faqat o'tmagan qatorlar + "Xatolar" ustuni.
 *
 * Foydalanuvchi shu faylni ochib, xatolarni tuzatib, "Xatolar" ustunini
 * o'chirib QAYTA yuklaydi - shuning uchun ustunlar shablon bilan bir xil
 * tartibda va bir xil sarlavha bilan chiqadi.
 */
export const buildErrorReport = async (importer, failedRows) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = env.APP_NAME;
  workbook.created = new Date();

  const ws = workbook.addWorksheet("Xatolar", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const columns = [
    { key: "_rowNumber", header: "Qator", width: 8, required: false },
    ...importer.columns,
    { key: "_errors", header: "Xatolar", width: 52, required: false },
  ];
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 20 }));
  styleHeader(ws.getRow(1), columns);

  for (const row of failedRows) {
    const values = { _rowNumber: row.rowNumber };
    for (const c of importer.columns) {
      const v = row.raw?.[c.key];
      // Sana obyektlari Excel'da sana bo'lib chiqsin, qolgani matn.
      values[c.key] = v instanceof Date ? v : v == null ? "" : v;
    }
    values._errors = (row.errors || [])
      .map((e) => (e.field ? `${e.field}: ${e.message}` : e.message))
      .join("; ");

    const added = ws.addRow(values);
    added.getCell("_errors").fill = ERROR_FILL;
    added.getCell("_errors").alignment = { wrapText: true, vertical: "top" };
  }

  if (failedRows.length) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: failedRows.length + 1, column: columns.length },
    };
  }

  return workbook.xlsx.writeBuffer();
};
