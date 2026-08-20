import { z } from 'zod';
import path from 'node:path';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MUHIT O'ZGARUVCHILARI — `server/src/config/env.js` NING KO'ZGUSI.
 *
 * HECH BIR O'ZGARUVCHI QAYTA NOMLANMADI. Ikkala ilova (Express va NestJS)
 * bir vaqtda, BITTA `.env` fayl bilan ishlaydi — shuning uchun nom yoki
 * standart qiymat farq qilsa, ikki ilova bir xil sozlamani boshqacha
 * o'qib, sababi topilmaydigan farqlar bergan bo'lardi.
 *
 * YAGONA YANGI O'ZGARUVCHI — `NEST_PORT`.
 * Sabab: Express `PORT` (5000) da turibdi va u O'CHIRILMAYDI (Faza 1
 * qo'shimcha, almashtiruvchi emas). Ikkalasi bitta portni egallay olmaydi,
 * shuning uchun NestJS alohida portda ko'tariladi. `PORT` TEGILMAYDI.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Musbat son; bo'sh, nol yoki buzuq qiymatda standartga qaytadi. */
const positiveNumber = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((raw) => {
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    });

const boolish = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((raw) =>
      raw === undefined || raw === '' ? fallback : raw.toLowerCase() === 'true',
    );

export const envSchema = z.object({
  NODE_ENV: z.string().default('development'),

  // Express PORT'iga TEGILMAYDI — pastda `NEST_PORT` alohida o'qiladi.
  PORT: positiveNumber(5000),
  NEST_PORT: positiveNumber(5001),

  APP_NAME: z.string().optional().transform((v) => (v ?? '').trim() || 'Bayyina'),

  // ── MAJBURIY (yo'q bo'lsa ishga tushmaydi — Express `need()` kabi) ──
  DATABASE_URL: z.string().min(1, "ENV o'zgaruvchisi yo'q: DATABASE_URL"),
  JWT_ACCESS_SECRET: z.string().min(1, "ENV o'zgaruvchisi yo'q: JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: z.string().min(1, "ENV o'zgaruvchisi yo'q: JWT_REFRESH_SECRET"),
  COOKIE_SECRET: z.string().min(1, "ENV o'zgaruvchisi yo'q: COOKIE_SECRET"),

  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  COOKIE_DOMAIN: z.string().default('localhost'),

  CLIENT_URL: z.string().default('http://localhost:5173'),

  // ── Ixtiyoriy integratsiyalar (bo'sh bo'lsa xizmat o'chiq) ──
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_BOT_TOKEN_2: z.string().default(''),
  TELEGRAM_BOT_ENABLED: boolish(false),
  TELEGRAM_BOT_WEBAPP_URL: z.string().default(''),

  ADMIN_API_URL: z.string().default(''),
  TENANT_ID: z.string().default(''),
  HEARTBEAT_SECRET: z.string().default(''),
  ENFORCE_LIMITS: boolish(true),

  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  AI_MONTHLY_CALL_CAP: positiveNumber(4000),

  STORAGE_QUOTA_GB: positiveNumber(5),
  MAX_UPLOAD_MB: positiveNumber(5),
  UPLOAD_DIR: z.string().default('uploads'),

  REDIS_URL: z.string().default(''),
  REDIS_PREFIX: z.string().default(''),
  IMPORT_SYNC_MAX_ROWS: positiveNumber(50),
  IMPORT_QUEUE_CONCURRENCY: positiveNumber(1),

  TZ_NAME: z.string().default('Asia/Tashkent'),

  // ═══════════════════════════════════════════════════════════════════════
  // ⚠⚠ FON ISHLARI VA BOT — IKKILANISH HIMOYASI ⚠⚠
  //
  // Express `server/` HOZIR yagona worker va yagona Telegram poller.
  // Quyidagi ikki bayroq standart holda `false` — ya'ni NestJS jarayoni
  // pg-boss navbatlariga TEGMAYDI va Telegram'ni POLL QILMAYDI.
  //
  // Ularni yoqish — ONGLI kesib o'tish (cutover) qarori: avval Express
  // tomonidagi mos oila TO'XTATILADI, keyin bu yerda yoqiladi. Ikkalasi
  // bir vaqtda ishlasa dublikat bildirishnoma, dublikat Telegram xabari
  // va (moliya oilasida) dublikat pul harakati kelib chiqardi.
  //
  // Batafsil: `server_nest/WORKERS-DEPENDENCY-MATRIX.md` §4.
  // ═══════════════════════════════════════════════════════════════════════

  /** pg-boss worker'lari umuman ishga tushsinmi. */
  NEST_WORKERS_ENABLED: boolish(false),

  /**
   * IZOLYATSIYA RO'YXATI — vergul bilan ajratilgan job nomlari.
   *
   * `NEST_WORKERS_ENABLED=true` bo'lsa ham FAQAT shu ro'yxatdagi joblar
   * ro'yxatga olinadi. Bo'sh bo'lsa — hech biri (fail-closed).
   * `*` — hammasi (FAQAT to'liq cutover'dan keyin).
   *
   * Masalan:  NEST_WORKER_JOBS=daily.ttl-cleanup
   */
  NEST_WORKER_JOBS: z.string().default(''),

  /**
   * Telegram polling'ni SHU jarayon boshlasinmi.
   *
   * `false` bo'lsa bot nusxasi baribir yaratiladi (xabar YUBORISH
   * polling talab qilmaydi), lekin `startPolling()` chaqirilmaydi.
   * `true` bo'lganda ham `bot_locks` jadvalidagi `poller` qulfi
   * (Express bilan BIR XIL) ikkinchi pollerni to'sadi.
   */
  NEST_BOT_POLLING: boolish(false),
});

export type RawEnv = z.infer<typeof envSchema>;

/**
 * Hosila qiymatlar — Express `env.js` dagi mantiq bilan AYNAN bir xil.
 * `CLIENT_URL` vergul bilan ajratilgan ro'yxat; `*` barcha domenga ruxsat.
 */
export const buildConfig = (raw: RawEnv) => {
  const clientUrls = String(raw.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowAllOrigins = clientUrls.includes('*');
  const realUrls = clientUrls.filter((u) => u !== '*');
  const primaryUrl = realUrls[0] || 'http://localhost:5173';

  return {
    ...raw,
    isProd: raw.NODE_ENV === 'production',
    CLIENT_URL: primaryUrl,
    CLIENT_URLS: realUrls,
    ALLOW_ALL_ORIGINS: allowAllOrigins,
    TELEGRAM_BOT_WEBAPP_URL:
      raw.TELEGRAM_BOT_WEBAPP_URL || `${primaryUrl}/bot-auth`,
    REDIS_PREFIX: raw.REDIS_PREFIX || raw.TENANT_ID || 'lc',
    // Chegaralar BAYTGA aylantiriladi (Express bilan bir xil).
    STORAGE_QUOTA_BYTES: Math.round(raw.STORAGE_QUOTA_GB * 1024 * 1024 * 1024),
    MAX_UPLOAD_BYTES: Math.round(raw.MAX_UPLOAD_MB * 1024 * 1024),
    /**
     * ⚠ FAYL PAPKASI — EXPRESS BILAN AYNAN BIR XIL USULDA YECHILADI
     * (`path.resolve(process.cwd(), ...)`).
     *
     * ⚠⚠ IKKI STEK BOSHQA PAPKADAN ISHGA TUSHADI (`server/` va
     * `server_nest/`), ya'ni NISBIY qiymatda ular IKKI XIL papkani
     * ko'rsatadi: `server/uploads` va `server_nest/uploads`. Baza esa
     * BITTA — natijada NestJS orqali o'chirilgan fayl diskda QOLIB
     * ketardi (`unlink` xatosi yutiladi), kvota hisoblagichi esa
     * kamayardi. Ya'ni joy "bo'shadi" deb ko'rinardi, aslida yo'q.
     *
     * Shuning uchun ikki stek birga ishlaganda `UPLOAD_DIR` MUTLAQ yo'l
     * bo'lishi SHART (yoki ikkalasi bir xil `cwd` dan yurishi kerak).
     * `StorageService` ishga tushganda buni tekshiradi va
     * ogohlantiradi.
     */
    UPLOAD_DIR: path.resolve(process.cwd(), raw.UPLOAD_DIR || 'uploads'),
  };
};

export type AppConfig = ReturnType<typeof buildConfig>;

/** ConfigModule uchun: tekshiradi va hosila qiymatlarni qo'shadi. */
export const validateEnv = (raw: Record<string, unknown>): AppConfig => {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.errors
      .map((e) => `  • ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Muhit sozlamalari noto'g'ri:\n${details}`);
  }
  return buildConfig(parsed.data);
};
