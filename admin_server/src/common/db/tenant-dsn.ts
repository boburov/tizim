/**
 * TENANT BAZASI UCHUN ULANISH SATRI — YAGONA MANBA
 *
 * Bu mantiq ilgari faqat `settings.service.ts` ichida edi (tenant `.env`
 * uchun `DATABASE_URL` yozilardi). Endi admin_server tenant bazasiga O'ZI
 * ham ulanadi (ega hisobini yaratish/o'qish uchun), ya'ni satr ikki joyda
 * kerak.
 *
 * ⚠ NUSXA KO'CHIRMANG. Ikki nusxa bo'lsa va `POSTGRES_BASE_URL` formati
 * o'zgarsa — biri buziladi, ikkinchisi yo'q, va farqni hech narsa
 * ushlamaydi: tenant `.env` to'g'ri yoziladi-yu, admin panel "baza topilmadi"
 * deydi (yoki teskarisi).
 */

/** Ulanish uchun kerak bo'ladigan minimal tenant maydonlari. */
export interface TenantDsnSource {
  dbName: string;
  /**
   * Tenant qaysi mashinada turibdi. Hozir hamma tenant admin_server bilan
   * BITTA VPS'da, ya'ni bu qiymat bazaviy URL'dagi host bilan bir xil.
   * Kelajakda tenantlar boshqa VPS'ga ko'chsa — shu maydon to'ldiriladi va
   * ulanish o'sha mashinaga ketadi, boshqa hech narsa o'zgarmaydi.
   */
  serverIp?: string | null;
}

const DEFAULT_BASE = 'postgresql://postgres:postgres@127.0.0.1:5432';

/** `POSTGRES_BASE_URL` (yoki standart). Oxiridagi `/` kesiladi. */
export const postgresBaseUrl = (): string =>
  (process.env.POSTGRES_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');

/**
 * Prisma uchun ulanish satri — tenant `.env` dagi `DATABASE_URL`.
 *
 * ⚠ `?schema=public` — PRISMA parametri. `pg` uni tushunmaydi, shuning uchun
 * bu funksiya faqat `.env` uchun, `pg` esa `tenantPgDsn()` ni ishlatadi.
 */
export const tenantPrismaDsn = (tenant: TenantDsnSource): string =>
  `${postgresBaseUrl()}/${tenant.dbName}?schema=public`;

/**
 * `pg` (node-postgres) uchun ulanish satri.
 *
 * Farqi ikkita: `?schema=public` yo'q, va host `serverIp` bilan
 * almashtirilishi mumkin (ko'p-VPS holati).
 */
export const tenantPgDsn = (tenant: TenantDsnSource): string => {
  const url = new URL(`${postgresBaseUrl()}/${tenant.dbName}`);

  // Mahalliy manzillar host sifatida ishlatilmaydi: `serverIp` "127.0.0.1"
  // bo'lsa ham natija bir xil, lekin ataylab bazaviy URL'ni buzmaymiz —
  // unda port yoki boshqa host bo'lishi mumkin.
  const ip = (tenant.serverIp || '').trim();
  if (ip && ip !== '127.0.0.1' && ip !== 'localhost') {
    url.hostname = ip;
  }

  return url.toString();
};
