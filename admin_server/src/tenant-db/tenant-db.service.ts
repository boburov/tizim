import { Injectable, Logger } from '@nestjs/common';
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
    const client = new Client({
      connectionString: tenantPgDsn(tenant),
      connectionTimeoutMillis: 5_000,
      statement_timeout: 5_000,
      query_timeout: 5_000,
    });

    await client.connect();
    try {
      return await fn(client);
    } finally {
      // `end()` yiqilsa ham asosiy natijani yo'qotmaymiz.
      await client.end().catch(() => undefined);
    }
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
   * ⚠ PAROL OCHIQ MATNDA QAYTADI. Bu tenant tomonidagi ATAYLAB qabul
   * qilingan qaror (`server/src/common/utils/password.ts` — `hashPassword`
   * hech narsa qilmaydi). Prisma'ning global `omit` qoidasi xom SQL'ga
   * ta'sir qilmaydi — bu ham ataylab: panel parolni ko'rsatishi kerak.
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
        password: row.passwordHash,
        isActive: row.isActive,
        createdAt: row.createdAt,
      };
    });
  }

  /**
   * Ega hisobini yaratadi.
   *
   * ⚠ PAROLNI HASH QILMANG. `admin_server` da `bcrypt` bor va uni bu yerda
   * ishlatish juda oson — lekin tenant `comparePassword` oddiy `===`
   * taqqoslash qiladi, ya'ni hash yozilsa mijoz O'Z TIZIMIGA KIRA OLMAYDI
   * va sabab hech qayerda ko'rinmaydi.
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
          // ⚠ ochiq matn — yuqoridagi izohga qarang
          input.password,
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
        password: row.passwordHash,
        isActive: row.isActive,
        createdAt: row.createdAt,
      };
    });
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
        [ownerId, password],
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

export interface TenantOwner {
  id: string;
  username: string;
  /** ⚠ ochiq matn */
  password: string;
  isActive: boolean;
  createdAt: Date;
}
