import { Injectable, Logger } from '@nestjs/common';
import { SshService } from '../vps/ssh.service.js';
import { decryptSecret } from '../common/crypto/secrets.util.js';
import {
  generateTempPassword,
  hashTenantPassword,
  isTenantPasswordHashed,
} from '../common/crypto/tenant-password.util.js';
import { Client } from 'pg';
import { tenantPgDsn, type TenantDsnSource } from '../common/db/tenant-dsn.js';

/**
 * TENANT BAZASIGA TO'G'RIDAN-TO'G'RI ULANISH
 *
 * ─── NEGA IKKINCHI PrismaClient EMAS ───
 *
 * 1) Prisma `datasource` ni GENERATSIYA vaqtida biladi. Tenant schema'si
 *    uchun ikkinchi klient generatsiya qilish kerak bo'lardi (alohida
 *    `output`, alohida `prisma generate`, alohida `postinstall`).
 *
 * 2) SCHEMA DRIFT — asosiy sabab. Tenant VPS'da migratsiya kechikkan
 *    bo'lishi mumkin. Prisma bunga yumshoq munosabatda bo'lmaydi: u O'ZI
 *    generatsiya qilingan schema'ni haqiqat deb biladi va mavjud bo'lmagan
 *    ustunni so'rab yiqiladi. Xom SQL esa faqat O'ZI yozgan 7 ta ustunga
 *    bog'liq — ular `users` jadvalining eng barqaror qismi.
 *
 * 3) Har tenantga alohida PrismaClient = alohida connection pool.
 *    50 tenant × pool = Postgres `max_connections` tugaydi.
 *
 * ─── ULANISH SIKLI ───
 *
 * Pool YO'Q, har amalga bitta `Client`. Bu amallar kamdan-kam bajariladi
 * (tenant yaratish, panelda parolni ochish) — tirik pool 50 ta bo'sh
 * ulanishni ushlab turishdan boshqa hech narsa qilmasdi.
 */
@Injectable()
export class TenantDbService {
  private readonly logger = new Logger(TenantDbService.name);

  constructor(private readonly ssh: SshService) {}

  /**
   * Bitta amal uchun ulanadi, tugagach ULANISHNI YOPADI.
   *
   * Timeout'lar ataylab qisqa: tenant boshqa VPS'da bo'lib, u javob
   * bermay qolsa, admin panel so'rovi cheksiz osilib qolmasin.
   */
  private async withClient<T>(
    tenant: TenantDsnSource,
    fn: (client: Client) => Promise<T>,
  ): Promise<T> {
    // ── MASOFAVIY VPS: SSH TUNNEL ──
    //
    // Tenant boshqa mashinada bo'lsa uning Postgres'i tashqariga OCHIQ
    // EMAS (va ochilmasligi kerak). `pg` mijozi `stream` opsiyasi bilan
    // tayyor soketni qabul qiladi — ssh2 `forwardOut` aynan shunday
    // duplex oqim beradi: admin_server → SSH → VPS ichidagi 127.0.0.1:5432.
    // SQL kodi o'zgarmaydi, DSN esa VPS'ning O'Z bazaviy URL'idan
    // (`vps.postgresBaseUrl`, shifrlangan) olinadi.
    const remote = tenant.vps && !tenant.vps.isLocal ? tenant.vps : null;
    const tunnel = remote ? await this.ssh.openPgTunnel(remote as never) : null;

    const dsn = remote ? this.remoteDsn(remote, tenant.dbName) : tenantPgDsn(tenant);
    const client = new Client({
      connectionString: dsn,
      connectionTimeoutMillis: 8_000,
      statement_timeout: 5_000,
      query_timeout: 5_000,
      ...(tunnel ? { stream: () => tunnel.stream } : {}),
    } as never);

    await client.connect();
    try {
      return await fn(client);
    } finally {
      // `end()` yiqilsa ham asosiy natijani yo'qotmaymiz.
      await client.end().catch(() => undefined);
      tunnel?.close();
    }
  }

  /** VPS'ning o'z Postgres URL'i + tenant bazasi. Host tunnel tomonida hal bo'ladi. */
  private remoteDsn(vps: NonNullable<TenantDsnSource['vps']>, dbName: string): string {
    const base = (vps.postgresBaseUrl ? decryptSecret(vps.postgresBaseUrl) : 'postgresql://postgres:postgres@127.0.0.1:5432').replace(/\/+$/, '');
    return `${base}/${dbName}`;
  }

  /** Tenant bazasi mavjud va `users` jadvali bormi. */
  async isReachable(tenant: TenantDsnSource): Promise<boolean> {
    try {
      return await this.withClient(tenant, async (c) => {
        const r = await c.query(`SELECT to_regclass('public.users') AS t`);
        return r.rows[0]?.t !== null;
      });
    } catch (err) {
      this.logger.warn(
        `Tenant bazasiga ulanib bo'lmadi (${tenant.dbName}): ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Mavjud egani o'qiydi.
   *
   * ⚠⚠ PAROL QAYTARILMAYDI — NA OCHIQ, NA HASH.
   *
   * Ilgari bu metod `passwordHash` ustunini shundayligicha qaytarardi
   * va u ochiq matn edi: panel ko'z tugmasi bilan ko'rsatardi. Endi
   * parol umuman API'dan CHIQMAYDI. O'rniga `passwordSet` — parol
   * bormi, va `hashed` — u qaytarib bo'lmaydigan formatdami.
   *
   * `hashed: false` — ESKI hisob: parol bazada hali ochiq yotibdi.
   * Panel buni ogohlantirish sifatida ko'rsatadi va "qayta o'rnatish"
   * bilan hash'ga o'tkazishni taklif qiladi. Avtomatik o'girib
   * bo'lmaydi: ochiq matndan hash yasash mumkin, lekin o'sha lahzada
   * mijozning amaldagi paroli o'zgarmagani uchun bu XAVFSIZ va TO'G'RI
   * amal — shuning uchun `upgradeOwnerHash()` da qilinadi.
   */
  async findOwner(tenant: TenantDsnSource): Promise<TenantOwner | null> {
    return this.withClient(tenant, async (c) => {
      const r = await c.query(
        `SELECT id, username, "passwordHash", "isActive", "createdAt"
           FROM public.users
          WHERE role = 'owner' AND "isDeleted" = false
          ORDER BY "createdAt" ASC
          LIMIT 1`,
      );
      const row = r.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        username: row.username,
        // ⚠ `password` MAYDONI YO'Q — ataylab.
        passwordSet: Boolean(row.passwordHash),
        hashed: isTenantPasswordHashed(row.passwordHash),
        isActive: row.isActive,
        createdAt: row.createdAt,
      };
    });
  }

  /**
   * Eski ochiq parolni hash'ga o'giradi — parolni O'ZGARTIRMASDAN.
   *
   * Mijoz o'z parolini bilishda davom etadi va u ishlaydi
   * (`comparePassword` ikkala formatni ham tushunadi). O'zgargan
   * yagona narsa: bazadan endi uni O'QIB BO'LMAYDI.
   *
   * ⚠ Faqat OCHIQ qiymat uchun. Hash allaqachon bo'lsa tegilmaydi.
   */
  async upgradeOwnerHash(tenant: TenantDsnSource): Promise<'upgraded' | 'already' | 'missing'> {
    return this.withClient(tenant, async (c) => {
      const r = await c.query(
        `SELECT id, "passwordHash" FROM public.users
          WHERE role = 'owner' AND "isDeleted" = false
          ORDER BY "createdAt" ASC LIMIT 1`,
      );
      const row = r.rows[0];
      if (!row || !row.passwordHash) return 'missing';
      if (isTenantPasswordHashed(row.passwordHash)) return 'already';

      const hash = await hashTenantPassword(String(row.passwordHash));
      await c.query(`UPDATE public.users SET "passwordHash" = $1, "updatedAt" = NOW() WHERE id = $2`, [
        hash,
        row.id,
      ]);
      this.logger.log(`Ega paroli hash'ga o'girildi (${tenant.dbName})`);
      return 'upgraded';
    });
  }

  /**
   * Ega hisobini yaratadi.
   *
   * ⚠ PAROL HASH QILINADI (`scrypt$...`). Bu tenant tomonidagi
   * `comparePassword` bilan MOS: u endi ikkala formatni ham tushunadi
   * (`server/src/common/utils/password.ts`). Ilgari bu yerda ochiq matn
   * yozilardi va sabab haqli edi — tenant faqat `===` qilardi. Endi
   * tenant tomoni yangilandi, shuning uchun hash xavfsiz.
   *
   * ⚠ ESKI TENANTLAR: kodi yangilanmagan markazda `comparePassword`
   * hamon `===` bo'ladi va HASH BILAN KIRIB BO'LMAYDI. Shuning uchun
   * yangi ega FAQAT provisioning oqimida yaratiladi — o'sha oqim
   * kodning eng yangi versiyasini deploy qiladi, ya'ni format doim mos.
   *
   * `homeBranchId` ataylab bo'sh: tenant birinchi `/auth/me` da
   * `ensureMainBranch()` bilan asosiy filialni o'zi yaratadi.
   *
   * `roles` jadvaliga yozuv shart emas: ega `["*"]` bypass'iga ega
   * (`permission.service.ts`), ya'ni rol yozuvisiz ham to'liq huquqli.
   */
  async createOwner(
    tenant: TenantDsnSource,
    input: { username: string; password: string; firstName?: string; lastName?: string },
  ): Promise<TenantOwner> {
    return this.withClient(tenant, async (c) => {
      const r = await c.query(
        `INSERT INTO public.users
           ("firstName","lastName","username","passwordHash","role","isActive","updatedAt")
         VALUES ($1,$2,$3,$4,'owner',true, NOW())
         ON CONFLICT ("username") DO NOTHING
         RETURNING id, username, "passwordHash", "isActive", "createdAt"`,
        [
          input.firstName?.trim() || 'Bosh',
          input.lastName?.trim() || 'Ega',
          input.username,
          // Qaytarib bo'lmaydigan hash — ochiq parol bazaga TUSHMAYDI.
          await hashTenantPassword(input.password),
        ],
      );

      const row = r.rows[0];
      if (!row) {
        // `DO NOTHING` jimgina o'tadi. Buni "yaratildi" deb ko'rsatish
        // panelni yolg'onchi qilardi: admin parolni mijozga aytadi, mijoz
        // esa kira olmaydi.
        throw new Error(
          `"${input.username}" logini bu bazada allaqachon band — ega yaratilmadi`,
        );
      }

      return {
        id: row.id,
        username: row.username,
        passwordSet: true,
        hashed: true,
        isActive: row.isActive,
        createdAt: row.createdAt,
      };
    });
  }

  /**
   * Vaqtinchalik parol yaratib o'rnatadi va uni BIR MARTA qaytaradi.
   *
   * Chaqiruvchi javobni ko'rsatgandan keyin hech qayerda saqlamaydi:
   * bazada faqat hash qoladi, ya'ni bu qiymatni ikkinchi marta olish
   * IMKONSIZ. Aynan shu maqsad.
   */
  async resetOwnerPassword(
    tenant: TenantDsnSource,
    ownerId: string,
  ): Promise<{ password: string }> {
    const password = generateTempPassword();
    await this.setOwnerPassword(tenant, ownerId, password);
    return { password };
  }

  /** Mavjud eganing parolini almashtiradi. */
  async setOwnerPassword(
    tenant: TenantDsnSource,
    ownerId: string,
    password: string,
  ): Promise<void> {
    await this.withClient(tenant, async (c) => {
      const r = await c.query(
        `UPDATE public.users
            SET "passwordHash" = $2, "updatedAt" = NOW()
          WHERE id = $1 AND role = 'owner' AND "isDeleted" = false`,
        // Hash — ochiq parol bazaga hech qachon yozilmaydi.
        [ownerId, await hashTenantPassword(password)],
      );
      if (r.rowCount === 0) throw new Error('Ega topilmadi');

      // Tirik sessiyalar bekor qilinadi — tenant `changePassword` ham
      // aynan shunday qiladi (`auth.service.ts`), aks holda eski parol
      // bilan ochilgan seans ishlab turaverardi.
      await c
        .query(`DELETE FROM public.refresh_tokens WHERE "userId" = $1`, [ownerId])
        .catch(() => undefined);
    });
  }
}

/**
 * Ega hisobi — PAROLSIZ.
 *
 * ⚠ `password` maydoni ATAYLAB YO'Q. U ilgari bor edi va ochiq matn
 * tutardi. Uni qaytarish endi imkonsiz: bazada hash yotadi. Panelga
 * kerak bo'lgan yagona narsa — parol o'rnatilganmi va u himoyalanganmi.
 */
export interface TenantOwner {
  id: string;
  username: string;
  /** Parol umuman o'rnatilganmi. */
  passwordSet: boolean;
  /** Qaytarib bo'lmaydigan formatdami (`false` = eski ochiq yozuv). */
  hashed: boolean;
  isActive: boolean;
  createdAt: Date;
}
