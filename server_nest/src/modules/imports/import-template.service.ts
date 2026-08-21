import { Inject, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/env.validation.js';
import type { Importer } from './import-engine.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IMPORT SHABLONI VA XATOLIK HISOBOTI
 * (`imports/services/template.service.js` KO'CHIRMASI).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const REQUIRED_FILL: any = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' },
};
const OPTIONAL_FILL: any = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' },
};
const ERROR_FILL: any = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' },
};
const HEADER_FONT: any = { bold: true, size: 11, color: { argb: 'FF0F172A' } };

const styleHeader = (row: any, columns: any[]) => {
  row.height = 26;
  row.eachCell((cell: any, col: number) => {
    const meta = columns[col - 1];
    cell.font = HEADER_FONT;
    // ⚠ Majburiy ustunlar SARIQ, ixtiyoriylari KULRANG — foydalanuvchi
    // qaysi ustunni to'ldirishi shartligini YO'RIQNOMANI O'QIMASDAN ko'radi.
    cell.fill = meta?.required ? REQUIRED_FILL : OPTIONAL_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFCBD5E1' } } };
  });
};

@Injectable()
export class ImportTemplateService {
  private readonly appName: string;

  constructor(@Inject(ConfigService) config: ConfigService<AppConfig, true>) {
    this.appName = config.get('APP_NAME', { infer: true }) as string;
  }

  /**
   * Import shabloni: sarlavhalar + NAMUNA qator + yo'riqnoma varag'i.
   *
   * ⚠ NEGA NAMUNA QATOR BOR: bo'sh shablonda foydalanuvchi sanani qanday
   * yozishni ("2025-06-15" mi "15.06.2025" mi) TAXMIN qiladi va birinchi
   * urinish deyarli doim xato bilan qaytadi.
   *
   * ⚠ Namuna qator import paytida O'TKAZIB YUBORILMAYDI — foydalanuvchi
   * uni O'CHIRISHI kerak; shuning uchun u ko'zga tashlanadigan qilib
   * yozilgan va yo'riqnomada OCHIQ ogohlantirish bor.
   */
  async buildTemplate(importer: Importer): Promise<ArrayBuffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = this.appName;
    workbook.created = new Date();

    const ws = workbook.addWorksheet(importer.sheetName || "Ma'lumot", {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    const columns = importer.columns;
    ws.columns = columns.map((c: any) => ({
      header: c.header, key: c.key, width: c.width || 20,
    }));
    styleHeader(ws.getRow(1), columns);

    // Namuna qator.
    const example: Record<string, unknown> = {};
    for (const c of columns) example[c.key] = c.example ?? '';
    const exampleRow = ws.addRow(example);
    exampleRow.eachCell((cell: any) => {
      cell.font = { italic: true, color: { argb: 'FF94A3B8' } };
    });

    // ── Yo'riqnoma varag'i ──
    const help = workbook.addWorksheet("Yo'riqnoma");
    help.columns = [
      { key: 'col', width: 26 },
      { key: 'req', width: 12 },
      { key: 'rule', width: 62 },
    ];
    const head = help.addRow({ col: 'Ustun', req: 'Majburiy', rule: 'Qoida' });
    head.eachCell((cell: any) => {
      cell.font = HEADER_FONT;
      cell.fill = OPTIONAL_FILL;
    });

    for (const c of columns) {
      const row = help.addRow({
        col: c.header,
        req: c.required ? 'Ha' : "Yo'q",
        rule: c.note || '',
      });
      row.getCell('col').font = { bold: true };
      row.getCell('rule').alignment = { wrapText: true, vertical: 'top' };
    }

    help.addRow({});
    const note = help.addRow({
      col: 'DIQQAT',
      req: '',
      rule:
        "Ikkinchi qatordagi kulrang NAMUNA qatorni o'chirib tashlang - " +
        'aks holda u ham import qilinishga urinadi va xato beradi.',
    });
    note.getCell('col').font = { bold: true, color: { argb: 'FFB91C1C' } };
    note.getCell('rule').alignment = { wrapText: true, vertical: 'top' };

    return workbook.xlsx.writeBuffer();
  }

  /**
   * XATOLIK HISOBOTI: faqat O'TMAGAN qatorlar + "Xatolar" ustuni.
   *
   * ⚠ Foydalanuvchi shu faylni ochib, xatolarni tuzatib, "Xatolar"
   * ustunini o'chirib QAYTA yuklaydi — shuning uchun ustunlar shablon
   * bilan BIR XIL TARTIBDA va BIR XIL SARLAVHA bilan chiqadi.
   */
  async buildErrorReport(importer: Importer, failedRows: any[]): Promise<ArrayBuffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = this.appName;
    workbook.created = new Date();

    const ws = workbook.addWorksheet('Xatolar', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    const columns: any[] = [
      { key: '_rowNumber', header: 'Qator', width: 8, required: false },
      ...importer.columns,
      { key: '_errors', header: 'Xatolar', width: 52, required: false },
    ];
    ws.columns = columns.map((c) => ({
      header: c.header, key: c.key, width: c.width || 20,
    }));
    styleHeader(ws.getRow(1), columns);

    for (const row of failedRows) {
      const values: Record<string, unknown> = { _rowNumber: row.rowNumber };
      for (const c of importer.columns) {
        const v = row.raw?.[c.key];
        // Sana obyektlari Excel'da SANA bo'lib chiqsin, qolgani matn.
        values[c.key] = v instanceof Date ? v : v == null ? '' : v;
      }
      values._errors = (row.errors || [])
        .map((e: any) => (e.field ? `${e.field}: ${e.message}` : e.message))
        .join('; ');

      const added = ws.addRow(values);
      added.getCell('_errors').fill = ERROR_FILL;
      added.getCell('_errors').alignment = { wrapText: true, vertical: 'top' };
    }

    if (failedRows.length) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: failedRows.length + 1, column: columns.length },
      };
    }

    return workbook.xlsx.writeBuffer();
  }
}
