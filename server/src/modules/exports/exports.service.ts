import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { XlsxWriterService } from './xlsx-writer.service.js';
import type { ExportColumn, ExportDataset } from './export-registry.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EKSPORT OQIMI (`exports/services/exports.service.js` KO'CHIRMASI).
 *
 * ⚠ 1-BOSQICH CHEGARASI: sinxron eksport shu qatordan OSHMAYDI. Butun
 * jadval XOTIRADA yig'iladi va bitta HTTP javobida yuboriladi —
 * chegarasiz katta filial BIR SO'ROV bilan serverni xotiradan chiqarib
 * yubora olardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const MAX_SYNC_ROWS = 5000;

/** Servislarga beriladigan sahifa hajmi (5000 qator = 10 ta so'rov). */
const PAGE_SIZE = 500;

@Injectable()
export class ExportsService {
  constructor(private readonly xlsx: XlsxWriterService) {}

  /**
   * Dataset'ni SAHIFAMA-SAHIFA aylanib, barcha qatorlarni yig'adi.
   *
   * ⚠ `fetchPage` MAVJUD `list` servisini chaqiradi, ya'ni filial
   * filtri va soft-delete shartlari AVTOMATIK qo'llanadi. Bu funksiya
   * hech qanday qo'shimcha filtr QO'SHMAYDI va OLIB TASHLAMAYDI.
   */
  async collectRows(dataset: ExportDataset, filters: any) {
    const rows: Record<string, unknown>[] = [];
    let page = 1;

    for (;;) {
       
      const result = await dataset.fetchPage({ filters, page, limit: PAGE_SIZE });
      const items = result?.items || [];
      const total = Number(result?.total ?? 0);

      // ⚠ Chegarani BIRINCHI sahifadayoq tekshiramiz: 40 000 qatorni
      // yig'ib bo'lgach xato berish MA'NOSIZ — server allaqachon
      // xotirani yegan.
      if (page === 1 && total > MAX_SYNC_ROWS) {
        throw new ApiError(
          413,
          `Juda ko'p ma'lumot (${total.toLocaleString('uz-UZ')} qator). ` +
            `Bir martada ${MAX_SYNC_ROWS.toLocaleString('uz-UZ')} qatorgacha yuklab olish mumkin. ` +
            `Filtrlarni toraytiring (oy, guruh yoki holat tanlang).`,
          { code: 'EXPORT_TOO_LARGE' },
        );
      }

      for (const item of items) rows.push(dataset.mapRow(item));

      if (items.length < PAGE_SIZE || rows.length >= total) break;
      page += 1;

      // Xavfsizlik to'sig'i: `total` noto'g'ri hisoblansa ham CHEKSIZ
      // halqaga tushmaymiz.
      if (rows.length >= MAX_SYNC_ROWS) break;
    }

    return rows;
  }

  /** To'liq eksport oqimi: qatorlarni yig'ish → XLSX qurish. */
  async generateXlsx({ dataset, columns, filters, meta }: {
    dataset: ExportDataset;
    columns: ExportColumn[];
    filters: any;
    meta: any;
  }) {
    if (!columns.length) throw new ApiError(400, 'Kamida bitta ustun tanlang');

    const rows = await this.collectRows(dataset, filters);
    const buffer = await this.xlsx.buildWorkbook({ dataset, columns, rows, meta });
    return { buffer, rowCount: rows.length };
  }
}
