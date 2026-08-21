import { Inject, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/env.validation.js';
import type { ExportColumn, ExportDataset } from './export-registry.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * XLSX QURUVCHI (`exports/services/xlsxWriter.service.js` KO'CHIRMASI).
 *
 * ── ⚠ NEGA "so'm" KATAKDA EMAS, SARLAVHADA ──
 * Har katakka "12 000 so'm" deb MATN yozilsa, Excel uni SON deb
 * KO'RMAYDI — foydalanuvchi ustunni yig'a olmaydi, saralay olmaydi,
 * filtrlay olmaydi. Katakda TOZA SON turadi, birlik esa sarlavhada.
 *
 * ── ⚠ NEGA BUFER, STREAM EMAS ──
 * Stream bilan javob sarlavhalari DARHOL yuboriladi va oradagi xato
 * yarim yozilgan, OCHILMAYDIGAN faylga aylanadi — foydalanuvchi xato
 * o'rniga BUZUQ FAYL oladi. Bufer bilan xato hali ham toza JSON bo'lib
 * qaytadi; qator chegarasi (`MAX_SYNC_ROWS`) xotirani ushlab turadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const NUM_FMT: Record<string, string> = {
  money: '#,##0',
  int: '#,##0',
  date: 'dd.mm.yyyy',
};

const HEADER_FILL: any = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' },
};
const HEADER_FONT: any = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
const THIN_BORDER: any = { style: 'thin', color: { argb: 'FFE2E8F0' } };

const isNumeric = (type: string) => type === 'money' || type === 'int';

const applyHeaderStyle = (row: any) => {
  row.height = 22;
  row.eachCell((cell: any) => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFCBD5E1' } } };
  });
};

@Injectable()
export class XlsxWriterService {
  private readonly appName: string;

  constructor(@Inject(ConfigService) config: ConfigService<AppConfig, true>) {
    this.appName = config.get('APP_NAME', { infer: true }) as string;
  }

  /**
   * MA'LUMOT VARAG'I — "bu son qayerdan chiqdi?" savoliga javob.
   *
   * ⚠ OXIRGI VARAQ: Excel BIRINCHI varaqni ochadi va foydalanuvchi
   * darhol ma'lumotni ko'rishi kerak.
   */
  private addInfoSheet(workbook: any, meta: any) {
    const ws = workbook.addWorksheet("Ma'lumot");
    ws.columns = [
      { key: 'label', width: 26 },
      { key: 'value', width: 52 },
    ];

    const rows: [string, unknown][] = [
      ['Hisobot', meta.datasetLabel],
      ['Yuklab oldi', meta.actorName],
      ['Sana', meta.generatedAt],
      ['Filial', meta.branchLabel],
      ['Qatorlar soni', meta.rowCount],
      ['Filtrlar', meta.filterLabel || '—'],
      ['Ustunlar', meta.columnLabel],
    ];

    for (const [label, value] of rows) {
      const row = ws.addRow({ label, value });
      row.getCell('label').font = { bold: true, color: { argb: 'FF475569' } };
      if (value instanceof Date) row.getCell('value').numFmt = 'dd.mm.yyyy hh:mm';
      row.getCell('value').alignment = { wrapText: true, vertical: 'top' };
    }
  }

  async buildWorkbook({ dataset, columns, rows, meta }: {
    dataset: ExportDataset;
    columns: ExportColumn[];
    rows: Record<string, unknown>[];
    meta: any;
  }): Promise<ArrayBuffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = this.appName;
    workbook.created = new Date();

    const ws = workbook.addWorksheet(dataset.sheetName, {
      // Sarlavha qatori doim ko'rinib tursin (uzun ro'yxatda aylantirganda).
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    ws.columns = columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || 18,
    }));
    applyHeaderStyle(ws.getRow(1));

    for (const row of rows) {
      const added = ws.addRow(row);
      added.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
        const col = columns[colNumber - 1];
        if (!col) return;
        if (NUM_FMT[col.type]) cell.numFmt = NUM_FMT[col.type];
        cell.border = { bottom: THIN_BORDER };
      });
    }

    /**
     * JAMI qatori — faqat SONLI ustunlar uchun.
     *
     * ⚠ NEGA `SUM()` FORMULASI, tayyor son EMAS: foydalanuvchi Excel'da
     * avtofiltr bilan qator YASHIRSA, qattiq son eskirib qoladi va
     * NOTO'G'RI yig'indi ko'rsatadi. Formula esa qayta hisoblanadi.
     */
    if (rows.length > 0 && columns.some((c) => isNumeric(c.type))) {
      const firstDataRow = 2;
      const lastDataRow = rows.length + 1;
      const totalRow = ws.addRow({});
      totalRow.getCell(1).value = 'JAMI';

      columns.forEach((col, idx) => {
        const cell = totalRow.getCell(idx + 1);
        if (isNumeric(col.type) && col.type !== 'int') {
          const letter = ws.getColumn(idx + 1).letter;
          cell.value = {
            formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`,
          } as never;
          cell.numFmt = NUM_FMT[col.type];
        }
        cell.font = { bold: true };
        cell.fill = HEADER_FILL;
        cell.border = { top: { style: 'medium', color: { argb: 'FFCBD5E1' } } };
      });
    }

    // ⚠ Avtofiltr FAQAT ma'lumot qatorlariga — JAMI qatori tashqarida
    // qolsin, aks holda filtrlaganda u ham YASHIRINIB ketardi.
    if (rows.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: rows.length + 1, column: columns.length },
      };
    }

    this.addInfoSheet(workbook, {
      ...meta,
      datasetLabel: dataset.label,
      rowCount: rows.length,
      columnLabel: columns.map((c) => c.header).join(', '),
    });

    return workbook.xlsx.writeBuffer();
  }
}
