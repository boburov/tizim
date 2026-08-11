import ExcelJS from "exceljs";
import env from "../../../config/env.js";

// Excel raqam formatlari.
//
// NEGA "so'm" katakda EMAS, sarlavhada: agar har katakka "12 000 so'm"
// deb matn yozilsa, Excel uni SON deb ko'rmaydi - foydalanuvchi ustunni
// yig'a olmaydi, saralay olmaydi, filtrlay olmaydi. Shuning uchun katakda
// toza son turadi, birlik esa sarlavhada ("To'langan (so'm)").
const NUM_FMT = {
  money: "#,##0",
  int: "#,##0",
  date: "dd.mm.yyyy",
};

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
const HEADER_FONT = { bold: true, size: 11, color: { argb: "FF0F172A" } };
const THIN_BORDER = { style: "thin", color: { argb: "FFE2E8F0" } };

const isNumeric = (type) => type === "money" || type === "int";

const applyHeaderStyle = (row) => {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: "FFCBD5E1" } } };
  });
};

// Ma'lumot varag'i: "bu son qayerdan chiqdi?" savoliga javob.
// Oxirgi varaq - Excel birinchi varaqni ochadi, foydalanuvchi darhol
// ma'lumotni ko'rishi kerak.
const addInfoSheet = (workbook, meta) => {
  const ws = workbook.addWorksheet("Ma'lumot");
  ws.columns = [
    { key: "label", width: 26 },
    { key: "value", width: 52 },
  ];

  const rows = [
    ["Hisobot", meta.datasetLabel],
    ["Yuklab oldi", meta.actorName],
    ["Sana", meta.generatedAt],
    ["Filial", meta.branchLabel],
    ["Qatorlar soni", meta.rowCount],
    ["Filtrlar", meta.filterLabel || "—"],
    ["Ustunlar", meta.columnLabel],
  ];

  for (const [label, value] of rows) {
    const row = ws.addRow({ label, value });
    row.getCell("label").font = { bold: true, color: { argb: "FF475569" } };
    if (value instanceof Date) row.getCell("value").numFmt = "dd.mm.yyyy hh:mm";
    row.getCell("value").alignment = { wrapText: true, vertical: "top" };
  }
};

/**
 * Ustunlar + qatorlardan XLSX buferini quradi.
 *
 * NEGA bufer, stream EMAS (1-bosqich): stream bilan javob sarlavhalari
 * darhol yuboriladi va oradagi xato yarim yozilgan, ochilmaydigan faylga
 * aylanadi - foydalanuvchi xato o'rniga buzuq fayl oladi. Bufer bilan
 * xato hali ham toza JSON bo'lib qaytadi. Qator chegarasi (MAX_SYNC_ROWS)
 * xotirani ushlab turadi. Katta hajm 2-bosqichda Agenda job + stream
 * bilan qo'shiladi; `rows` allaqachon massiv sifatida ajratilgani uchun
 * u yerda faqat sink almashadi, dataset'lar tegilmaydi.
 *
 * @param {{dataset: object, columns: Array, rows: Array<object>, meta: object}} params
 * @returns {Promise<Buffer>}
 */
export const buildWorkbook = async ({ dataset, columns, rows, meta }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = env.APP_NAME;
  workbook.created = new Date();

  const ws = workbook.addWorksheet(dataset.sheetName, {
    // Sarlavha qatori doim ko'rinib tursin (uzun ro'yxatda aylantirganda).
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width || 18,
  }));
  applyHeaderStyle(ws.getRow(1));

  for (const row of rows) {
    const added = ws.addRow(row);
    added.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const col = columns[colNumber - 1];
      if (!col) return;
      if (NUM_FMT[col.type]) cell.numFmt = NUM_FMT[col.type];
      cell.border = { bottom: THIN_BORDER };
    });
  }

  // JAMI qatori - faqat sonli ustunlar uchun.
  //
  // NEGA SUM() formulasi, tayyor son EMAS: foydalanuvchi Excel'da
  // avtofiltr bilan qator yashirsa, qattiq son eskirib qoladi va
  // noto'g'ri yig'indi ko'rsatadi. Formula esa qayta hisoblanadi.
  if (rows.length > 0 && columns.some((c) => isNumeric(c.type))) {
    const firstDataRow = 2;
    const lastDataRow = rows.length + 1;
    const totalRow = ws.addRow({});
    totalRow.getCell(1).value = "JAMI";

    columns.forEach((col, idx) => {
      const cell = totalRow.getCell(idx + 1);
      if (isNumeric(col.type) && col.type !== "int") {
        const letter = ws.getColumn(idx + 1).letter;
        cell.value = { formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})` };
        cell.numFmt = NUM_FMT[col.type];
      }
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
      cell.border = { top: { style: "medium", color: { argb: "FFCBD5E1" } } };
    });
  }

  // Avtofiltr faqat ma'lumot qatorlariga (JAMI qatori tashqarida qolsin -
  // aks holda filtrlaganda u ham yashirinib ketardi).
  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: columns.length },
    };
  }

  addInfoSheet(workbook, {
    ...meta,
    datasetLabel: dataset.label,
    rowCount: rows.length,
    columnLabel: columns.map((c) => c.header).join(", "),
  });

  return workbook.xlsx.writeBuffer();
};

export default buildWorkbook;
