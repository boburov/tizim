/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FON ISHI (job) SHARTNOMASI.
 *
 * Express'da job "define(name, options, handler)" ko'rinishida e'lon
 * qilinardi va jadval (cron) ALOHIDA joyda — `jobs/index.js` da — turardi.
 * Ikkisi ajralgani uchun jobni o'qib turib uning QACHON ishlashini bilib
 * bo'lmasdi va aksincha.
 *
 * Bu yerda ikkisi BITTA obyektda: nom, jadval, vaqt zonasi, qulf va
 * qayta urinish siyosati handler bilan yonma-yon turadi. Shuning uchun
 * "jadvalni saqlash" talabi ko'z bilan tekshiriladigan bo'ladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export interface JobDefinition {
  /**
   * Navbat nomi. ⚠ EXPRESS BILAN AYNAN BIR XIL BO'LISHI SHART — pg-boss
   * navbatni shu nom bo'yicha yaratadi va `pgboss.schedule` jadvalidagi
   * yozuv ham shu nomga bog'lanadi. Nom farq qilsa ikkita navbat paydo
   * bo'lardi va ish IKKI MARTA bajarilardi.
   */
  readonly name: string;

  /**
   * Cron ifodasi. `null` — jadvalsiz job: uni faqat kod chaqiradi
   * (`scheduler.now(...)` / `scheduler.schedule(...)`), masalan
   * `notification.deliver`.
   */
  readonly cron: string | null;

  /**
   * ⚠ VAQT ZONASI. Express'da BARCHA cronlar `TZ_NAME` (Asia/Tashkent)
   * bo'yicha ro'yxatga olinadi — server qaysi zonada turishidan qat'i
   * nazar. UTC serverda "20:00" Toshkentda 01:00 bo'lib, NOTO'G'RI kunni
   * qamrab olardi.
   */
  readonly timezone?: string;

  /** Bir vaqtda nechta nusxa bajariladi (Express: `concurrency`). */
  readonly concurrency?: number;

  /** Ish "osilib qolgan" deb sanaladigan vaqt, ms (Express: `lockLifetime`). */
  readonly lockLifetimeMs?: number;

  /** Qayta urinishlar soni. Express adapteridagi standart — 3. */
  readonly retryLimit?: number;

  /** Qayta urinishlar orasidagi kutish, soniya. Express standarti — 60. */
  readonly retryDelaySec?: number;

  /**
   * Ishning o'zi. `data` — `scheduler.now(name, data)` bilan berilgan
   * yuk; cron joblarida u bo'sh obyekt bo'ladi.
   *
   * XATO TASHLASH = QAYTA URINISH. Handler xato tashlasa pg-boss
   * `retryLimit` gacha qayta uradi. Xatoni yutib yuborish "muvaffaqiyat"
   * degani, ya'ni ish BOSHQA HECH QACHON takrorlanmaydi.
   */
  run(data: Record<string, unknown>): Promise<void>;
}
