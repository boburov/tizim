import { Injectable, Logger } from '@nestjs/common';
import { StorageAdminService } from '../../modules/storage/storage-admin.service.js';
import { StorageService } from '../../modules/storage/storage.service.js';
import type { JobDefinition } from '../job.types.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `storage.cleanup` — `server/src/jobs/storageCleanup.job.js`.
 *
 * ── ⚠ JOB HAR KUNI YURADI, ISHNI ESA CHASTOTA BO'YICHA BAJARADI ──
 *
 * Cron chastotani AKS ETTIRMAYDI va bu ATAYLAB. Chastota (haftalik /
 * oylik / yarim yillik) sozlamadan o'zgaradi, cron esa server ishga
 * tushganda BIR MARTA ro'yxatga olinadi. Cron chastotaga bog'lansa,
 * admin "haftalik"ni "oylik"ka o'zgartirgach jadval server qayta ishga
 * tushmaguncha eski holida qolib ketardi. Kundalik yurish + sozlamadan
 * o'qish esa o'zgarishni ERTASIGA qabul qiladi.
 *
 * Vaqti (02:30) ham ataylab: token tozalash (03:00) va AI hisoblashdan
 * (01:00) tashqarida — tungi eng bo'sh oyna.
 *
 * ── ⚠ BU JOB FAYL O'CHIRADI (diskdan, qaytarib bo'lmaydi) ──
 *
 * Shuning uchun ikkilanish bu yerda nafaqat "ortiqcha ish": ikki nusxa
 * bir vaqtda yursa, biri hisoblagichni yangilayotganda ikkinchisi
 * o'chirayotgan bo'lardi. `lockLifetime` 30 daqiqa (Express bilan bir
 * xil) — katta tozalash 15 daqiqaga sig'masligi mumkin.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class StorageCleanupJob implements JobDefinition {
  readonly name = 'storage.cleanup';
  /** Express `jobs/index.js`: `every("30 2 * * *", STORAGE_CLEANUP_JOB)`. */
  readonly cron = '30 2 * * *';
  readonly concurrency = 1;
  readonly lockLifetimeMs = 30 * 60 * 1000;

  private readonly logger = new Logger('Job:storage.cleanup');

  constructor(
    private readonly admin: StorageAdminService,
    private readonly storage: StorageService,
  ) {}

  async run(): Promise<void> {
    try {
      const res = await this.admin.runScheduledCleanup();
      if (!res.skipped) this.logger.log(`Saqlagich avto-tozalandi: ${JSON.stringify(res)}`);
    } catch (err) {
      this.logger.error('Avto-tozalashda xato', err as Error);
      throw err; // pg-boss qayta urinadi
    }
  }

  /**
   * BOOT: saqlash hisoblagichini haqiqat (diskdagi fayllar) bo'yicha
   * tekislaydi — Express `index.js` dagi `reconcileStorage()`.
   *
   * Kerak bo'ladigan holat: jarayon joyni band qilib, faylni yozishdan
   * OLDIN yiqilsa, hisoblagichda "band" bayt qolib ketadi va kvota
   * asta-sekin O'Z-O'ZIDAN kamayib boradi — hech qanday xato bermay.
   *
   * ⚠ IDEMPOTENT: hisoblagich fayllar yig'indisidan QAYTA hisoblanadi,
   * ya'ni ikki marta yurishi zarar qilmaydi. Shunga qaramay u faqat
   * ishchi rejimida chaqiriladi — "kim egasi" qoidasi bitta bo'lsin.
   */
  async runOnBoot(): Promise<void> {
    await this.storage.reconcile();
  }
}
