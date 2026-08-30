import { Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { SheetReaderService } from './sheet-reader.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMUMIY IMPORT DVIGATELI (`imports/services/importEngine.service.js`).
 *
 * Importer (modulga xos qism) shu shartnomani bajaradi:
 *   `key`, `label`, `permission`, `columns[]`
 *   `prepare(rawRows, actor)`     → ctx (ommaviy qidiruvlar)
 *   `validateRow(raw, ctx)`       → `{ errors: [{field?, message}], data }`
 *   `dedupeKey?(data)`            → `string | null` (qator "shaxsiyati")
 *   `commitRow(data, ctx, opts)`  → `{ status, message? }`
 * Ixtiyoriy (JADVAL oqimi): `gridEnabled`, `draftRow`, `previewRow`.
 *
 * ⚠ NEGA `prepare()` ALOHIDA: har bir qator uchun DB'ga borish 5000
 * qatorda 15 000 so'rov bo'lardi. `prepare` BIR MARTA hammasini yuklab,
 * `Map`/`Set` ko'rinishida beradi — validatsiya SOF XOTIRADA ishlaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const ROW_STATUS = Object.freeze({
  OK: 'ok', // tekshiruvdan o'tdi, yozishga tayyor
  ERROR: 'error', // xato bor — yozilmaydi
  DUPLICATE: 'duplicate', // takror — yozilmaydi
  IMPORTED: 'imported', // yozildi
  PENDING: 'pending', // yozilmadi: tasdiq kutmoqda (chiqim limiti)
  FAILED: 'failed', // yozishda xato
});

/**
 * Ko'rib chiqishda (preview) client'ga yuboriladigan MAKSIMAL qator.
 * Qolganlari faqat statistikaga kiradi — 5000 qatorlik jadval brauzerni
 * QOTIRIB qo'yardi va foydalanuvchi baribir hammasini ko'rmaydi.
 */
const PREVIEW_LIMIT = 200;

/**
 * JADVAL OQIMIDA bir martada yuboriladigan MAKSIMAL qator.
 *
 * ⚠ `MAX_IMPORT_ROWS` (5000) dan PAST — ATAYLAB. Bu qatorlar `ImportJob`
 * yozuviga saqlanadi va brauzerda TAHRIRLANADIGAN jadvalga chiziladi.
 * 5000 qatorlik grid har bosishda qayta render bo'lib, sekin kompyuterda
 * ishlatib bo'lmas holga kelardi.
 */
export const MAX_GRID_ROWS = 2000;

export interface Importer {
  key: string;
  label: string;
  fileBase: string;
  sheetName?: string;
  permission: string;
  extraPermissions?: string[];
  /**
   * TARIF imkoniyati (`imports.finance` kabi). Bo'sh bo'lsa importer
   * modul kalitining O'ZI bilan ochiladi.
   *
   * ⚠ RUXSATDAN FARQI: `permission` — "menda shu ishga HAQ bormi" (rol),
   * bu esa "bu importer shu loyihada SOTIB OLINGANMI" (tarif). Ikkisi
   * ortogonal: to'liq huquqli owner ham tarifda yo'q importerni
   * ko'rmaydi.
   */
  capability?: string;
  gridEnabled?: boolean;
  columns: any[];
  prepare(rawRows: any[], actor?: any): Promise<any>;
  validateRow(raw: any, ctx: any): { errors: any[]; data: any };
  dedupeKey?(data: any): string | null;
  previewRow?(data: any, ctx: any): any;
  draftRow?(raw: any, ctx: any): any;
  commitRow(data: any, ctx: any, opts: any): Promise<{ status?: string; message?: string }>;
}

@Injectable()
export class ImportEngineService {
  private readonly logger = new Logger('ImportEngine');

  constructor(@Inject(SheetReaderService) private readonly sheets: SheetReaderService) {}

  /**
   * ⚠ `preparedCtx` berilsa QAYTA QURILMAYDI — draft oqimida ctx
   * allaqachon qurilgan bo'ladi va ikkinchi marta qurish barcha ommaviy
   * qidiruvlarni TAKRORLARDI.
   */
  private async validateAll(
    importer: Importer, rows: any[], preparedCtx: any = null, actor: any = {},
  ) {
    const ctx = preparedCtx || (await importer.prepare(rows.map((r) => r.raw), actor));

    const seenInFile = new Map<string, number>(); // dedupeKey → birinchi qator
    const results: any[] = [];

    for (const { rowNumber, raw } of rows) {
      let errors: any[] = [];
      let data: any = null;

      try {
        const out = importer.validateRow(raw, ctx);
        errors = out.errors || [];
        data = out.data;
      } catch (e) {
        // ⚠ Importer'dagi KUTILMAGAN xato BUTUN importni to'xtatmasin —
        // shu qator xato deb belgilanadi, qolganlari tekshirilaveradi.
        this.logger.error(
          `Import qatorini tekshirishda xato (${rowNumber}): ${(e as Error).message}`,
        );
        errors = [{ message: "Qatorni tekshirib bo'lmadi" }];
      }

      let status: string = errors.length ? ROW_STATUS.ERROR : ROW_STATUS.OK;

      // ── Takrorlarni aniqlash ──
      if (!errors.length && importer.dedupeKey) {
        const key = importer.dedupeKey(data);
        if (key) {
          // 1) Fayl ICHIDA takror
          if (seenInFile.has(key)) {
            errors.push({
              message: `Fayl ichida takrorlangan (${seenInFile.get(key)}-qator bilan bir xil)`,
            });
            status = ROW_STATUS.DUPLICATE;
          } else {
            seenInFile.set(key, rowNumber);
            // 2) BAZADA allaqachon bor
            if (ctx.existingKeys?.has(key)) {
              errors.push({ message: 'Bu yozuv bazada allaqachon mavjud' });
              status = ROW_STATUS.DUPLICATE;
            }
          }
        }
      }

      // ⚠ HISOBLANGAN USTUNLAR (faqat jadval oqimi): "necha oy qarz
      // yaratiladi", "jami summa", "yakuniy balans". Foydalanuvchi
      // "Yaratish" ni bosishdan OLDIN natijani ko'rishi `+`/`-`
      // ishorasidagi har qanday chalkashlikni yo'q qiladi.
      let preview = null;
      if (data && importer.previewRow) {
        try {
          preview = await importer.previewRow(data, ctx);
        } catch (e) {
          this.logger.warn(
            `Import qatori ko'rinishini hisoblab bo'lmadi (${rowNumber}): ` +
              `${(e as Error).message}`,
          );
        }
      }

      results.push({ rowNumber, raw, data, errors, status, preview });
    }

    return { ctx, results };
  }

  private summarize(results: any[]) {
    const count = (s: string) => results.filter((r) => r.status === s).length;
    return {
      total: results.length,
      valid: count(ROW_STATUS.OK),
      error: count(ROW_STATUS.ERROR),
      duplicate: count(ROW_STATUS.DUPLICATE),
      imported: count(ROW_STATUS.IMPORTED),
      pending: count(ROW_STATUS.PENDING),
      failed: count(ROW_STATUS.FAILED),
    };
  }

  /**
   * Client'ga yuboriladigan YENGIL ko'rinish.
   * ⚠ Ichki `data` YUBORILMAYDI — unda ID va xizmat maydonlari bor.
   */
  private toWireRow(r: any) {
    return {
      rowNumber: r.rowNumber,
      status: r.status,
      errors: r.errors,
      raw: r.raw,
      message: r.message || null,
      preview: r.preview || null,
    };
  }

  /** 1-BOSQICH: faylni o'qib, tekshirib QAYTARADI. Hech narsa yozilmaydi. */
  async preview({ importer, buffer, fileName, actor = {} }: any) {
    const { rows, missingHeaders, unknownHeaders } = await this.sheets.readSheet(
      buffer, fileName, importer.columns,
    );

    if (missingHeaders.length) {
      throw new ApiError(
        400,
        `Faylda majburiy ustun(lar) yo'q: ${missingHeaders.join(', ')}. ` +
          `Shablonni yuklab olib ishlatishni tavsiya qilamiz`,
        { code: 'IMPORT_MISSING_COLUMNS', details: { missingHeaders } },
      );
    }
    if (!rows.length) throw new ApiError(400, "Faylda ma'lumot qatori topilmadi");

    const { results } = await this.validateAll(importer, rows, null, actor);

    return {
      summary: this.summarize(results),
      unknownHeaders,
      // ⚠ XATOLI qatorlar BIRINCHI ko'rsatiladi — foydalanuvchi tuzatishi
      // kerak bo'lgan narsani qidirib o'tirmasin.
      rows: [...results]
        .sort((a, b) => {
          const bad = (r: any) => (r.status === ROW_STATUS.OK ? 1 : 0);
          return bad(a) - bad(b) || a.rowNumber - b.rowNumber;
        })
        .slice(0, PREVIEW_LIMIT)
        .map((r) => this.toWireRow(r)),
      truncated: results.length > PREVIEW_LIMIT,
    };
  }

  /**
   * 2-BOSQICH: faylni QAYTA o'qib, QAYTA tekshirib, to'g'ri qatorlarni yozadi.
   *
   * ⚠ NEGA QAYTA TEKSHIRILADI (preview natijasini saqlab qo'yish emas):
   *   • ko'rib chiqish bilan tasdiq orasida ma'lumot o'zgargan bo'lishi
   *     mumkin (boshqa kassir o'sha to'lovni kiritib ulgurgan);
   *   • server tomonda VAQTINCHALIK HOLAT saqlanmaydi;
   *   • CLIENT yuborgan qatorlarga ISHONMAYMIZ.
   *
   * ⚠ ATOMIKLIK: har QATOR alohida atomik (domen servisi ichida
   * tranzaksiya bor). Butun faylni bitta tranzaksiyaga o'rash ATAYLAB
   * qilinmagan: bitta yomon qator hammasini bekor qilardi va "qisman
   * muvaffaqiyat + hisobot" talabini bajarib bo'lmasdi.
   */
  async commit({ importer, buffer, fileName, currentUser, actor = {} }: any) {
    const { rows } = await this.sheets.readSheet(buffer, fileName, importer.columns);
    if (!rows.length) throw new ApiError(400, "Faylda ma'lumot qatori topilmadi");

    const { ctx, results } = await this.validateAll(importer, rows, null, actor);

    for (const row of results) {
      if (row.status !== ROW_STATUS.OK) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        const out = await importer.commitRow(row.data, ctx, { currentUser });
        row.status = out?.status || ROW_STATUS.IMPORTED;
        row.message = out?.message || null;
      } catch (e: any) {
        // Bitta qator yiqilsa QOLGANLARI DAVOM ETADI (talab).
        row.status = ROW_STATUS.FAILED;
        row.errors = [{ message: e?.message || 'Yozishda xato' }];
        row.message = e?.message || null;
        if (!e?.isOperational) {
          this.logger.error(
            `Import qatorini yozishda xato (${row.rowNumber}): ${e?.message}`,
          );
        }
      }
    }

    const failedRows = results
      .filter((r) => r.status !== ROW_STATUS.IMPORTED && r.status !== ROW_STATUS.PENDING)
      .map((r) => this.toWireRow(r));

    return {
      summary: this.summarize(results),
      // ⚠ Xato qatorlar TO'LIQ qaytadi (kesilmaydi) — foydalanuvchi
      // ularni Excel qilib yuklab olib, tuzatib qayta yuklaydi.
      failedRows,
      rows: results.slice(0, PREVIEW_LIMIT).map((r) => this.toWireRow(r)),
    };
  }

  // ══════════════════════════════════════════════════════════════════
  //  JADVAL OQIMI (draft → tahrirlash → yaratish)
  //
  //  ⚠ XAVFSIZLIK QOIDASI: client yuborgan `status` ga HECH QACHON
  //  ishonilmaydi. `commitRows()` yozishdan oldin `validateAll()` ni
  //  TO'LIQ qayta yurgizadi.
  // ══════════════════════════════════════════════════════════════════

  private assertGridSupported(importer: Importer) {
    if (!importer.gridEnabled) {
      throw new ApiError(
        400, `"${importer.label}" importi jadval rejimini qo'llab-quvvatlamaydi`,
      );
    }
  }

  private fromWireRows(rows: any[]) {
    return (rows || []).map((r, i) => ({
      rowNumber: Number(r?.rowNumber) || i + 1,
      raw: r?.raw && typeof r.raw === 'object' ? r.raw : {},
    }));
  }

  /** 1-BOSQICH (jadval): fayldan TAHRIRLANADIGAN qoralama. */
  async draftFromFile({ importer, buffer, fileName, actor = {} }: any) {
    this.assertGridSupported(importer);

    const { rows, missingHeaders, unknownHeaders } = await this.sheets.readSheet(
      buffer, fileName, importer.columns,
    );

    if (missingHeaders.length) {
      throw new ApiError(
        400,
        `Faylda majburiy ustun(lar) yo'q: ${missingHeaders.join(', ')}. ` +
          `Shablonni yuklab olib ishlatishni tavsiya qilamiz`,
        { code: 'IMPORT_MISSING_COLUMNS', details: { missingHeaders } },
      );
    }
    if (!rows.length) throw new ApiError(400, "Faylda ma'lumot qatori topilmadi");
    if (rows.length > MAX_GRID_ROWS) {
      throw new ApiError(
        413,
        `Jadval rejimida bir faylda ${MAX_GRID_ROWS} qatordan ko'p bo'lmasligi kerak. ` +
          `Faylni bo'laklarga bo'lib yuklang`,
        { code: 'IMPORT_TOO_LARGE' },
      );
    }

    const ctx = await importer.prepare(rows.map((r) => r.raw), actor);

    // ⚠ AVTOTO'LDIRISH: `taken` to'plami qatordan qatorga O'SIB BORADI —
    // shuning uchun bir fayldagi ikkita bir xil ismli odam BOSHQA login
    // oladi. Usiz ikkalasiga "ali.valiyev" berilib, ikkinchisi yozishda
    // yiqilardi.
    const drafted: any[] = [];
    for (const { rowNumber, raw } of rows) {
      // eslint-disable-next-line no-await-in-loop
      const filled = importer.draftRow ? await importer.draftRow(raw, ctx) : raw;
      drafted.push({ rowNumber, raw: filled });
    }

    const { results } = await this.validateAll(importer, drafted, ctx, actor);

    return {
      summary: this.summarize(results),
      unknownHeaders,
      // ⚠ Jadval oqimida qatorlar TARTIBI SAQLANADI va hech biri
      // KESILMAYDI — foydalanuvchi hammasini tahrirlashi kerak.
      rows: results.map((r) => this.toWireRow(r)),
      columns: importer.columns,
    };
  }

  /** 2-BOSQICH: tahrirlangan qatorlarni QAYTA tekshiradi (yozilmaydi). */
  async validateRows({ importer, rows, actor = {} }: any) {
    this.assertGridSupported(importer);

    const parsed = this.fromWireRows(rows);
    if (!parsed.length) throw new ApiError(400, 'Tekshirish uchun qator yuborilmadi');
    if (parsed.length > MAX_GRID_ROWS) {
      throw new ApiError(
        413, `Bir martada ${MAX_GRID_ROWS} qatordan ko'p bo'lmasligi kerak`,
      );
    }

    const { results } = await this.validateAll(importer, parsed, null, actor);
    return {
      summary: this.summarize(results),
      rows: results.map((r) => this.toWireRow(r)),
    };
  }

  /** 3-BOSQICH: tahrirlangan qatorlarni YOZADI. */
  async commitRows({
    importer, rows, currentUser, importJobId = null, onProgress = null, actor = {},
  }: any) {
    this.assertGridSupported(importer);

    const parsed = this.fromWireRows(rows);
    if (!parsed.length) throw new ApiError(400, 'Yozish uchun qator yuborilmadi');
    if (parsed.length > MAX_GRID_ROWS) {
      throw new ApiError(
        413, `Bir martada ${MAX_GRID_ROWS} qatordan ko'p bo'lmasligi kerak`,
      );
    }

    // ⚠ QAYTA TEKSHIRUV — client yuborgan holatga ISHONILMAYDI.
    // `actor` ham qayta uzatiladi: ruxsatga bog'liq qoidalar (masalan
    // "boshlang'ich qoldiq uchun `finance.manage` kerak") YOZISH paytida
    // ham AYNAN shu tekshiruvdan o'tishi shart.
    const { ctx, results } = await this.validateAll(importer, parsed, null, actor);

    let processed = 0;
    // ⚠ Har qatorda progress yozilsa 500 qator 500 ta QO'SHIMCHA DB
    // yozuvi bo'lardi — importning o'zidan sekinroq.
    const PROGRESS_EVERY = 10;

    for (const row of results) {
      processed += 1;
      if (row.status === ROW_STATUS.OK) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const out = await importer.commitRow(row.data, ctx, {
            currentUser, importJobId,
          });
          row.status = out?.status || ROW_STATUS.IMPORTED;
          row.message = out?.message || null;
        } catch (e: any) {
          row.status = ROW_STATUS.FAILED;
          row.errors = [{ message: e?.message || 'Yozishda xato' }];
          row.message = e?.message || null;
          if (!e?.isOperational) {
            this.logger.error(
              `Import qatorini yozishda xato (${row.rowNumber}): ${e?.message}`,
            );
          }
        }
      }

      if (onProgress
        && (processed % PROGRESS_EVERY === 0 || processed === results.length)) {
        // eslint-disable-next-line no-await-in-loop
        await onProgress(processed);
      }
    }

    return {
      summary: this.summarize(results),
      rows: results.map((r) => this.toWireRow(r)),
      failedRows: results
        .filter((r) => r.status !== ROW_STATUS.IMPORTED && r.status !== ROW_STATUS.PENDING)
        .map((r) => this.toWireRow(r)),
    };
  }
}
