import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { TenantsService } from '../tenants/tenants.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOYIHA LOGOSI — YUKLASH VA YETKAZISH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── QAYERDA SAQLANADI ──
 *
 * Admin VPS'ida, `ADMIN_UPLOADS_DIR` ichida. Hamma tenantning logosi bir
 * joyda: fayl dev paneldan yuklanadi va dev panel shu serverda turadi.
 *
 * ⚠ REPO ICHIGA YOZILMAYDI (`admin_server/uploads` emas). Keyingi deploy
 * papkani tozalab yuborardi va hamma logo jimgina yo'qolardi — sayt esa
 * buzilmasdi, faqat rasm o'rnida bo'shliq qolardi.
 *
 * ── QANDAY YETKAZILADI ──
 *
 * `Tenant.logoUrl` → `VITE_APP_LOGO` → tenant `client/.env` → Vite BUILD
 * paytida ichiga tushadi. Ya'ni logo almashtirilishi client'ni qayta
 * qurishni talab qiladi (`rebuild` rejimi, ~1-2 daqiqa).
 *
 * Shuning uchun yuklashdan keyin qo'llash DARHOL va AVTOMATIK boshlanadi:
 * qo'lda "Qo'llash" bosishni kutish "logoni yukladim, lekin saytda
 * ko'rinmayapti" holatini yaratardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Ruxsat etilgan turlar.
 *
 * ⚠ SVG YO'Q — ATAYLAB. SVG ichida `<script>` bo'lishi mumkin va u ADMIN
 * DOMENIDA ochiladi (fayl shu yerdan beriladi), ya'ni bizning sessiya
 * cookie'larimiz doirasida. Logo uchun PNG/WebP yetarli.
 *
 * Qoida tenant tomonidagi oq ro'yxat bilan bir falsafada
 * (`server/src/common/middleware/upload-attachment.ts`), lekin import
 * qilib bo'lmaydi — boshqa ilova, boshqa `node_modules`.
 */
const ALLOWED = [
  { mime: 'image/png', ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  // WebP: "RIFF" + 4 bayt hajm + "WEBP" — 8-11 baytlarni alohida tekshiramiz.
  { mime: 'image/webp', ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] },
] as const;

/** 512 KB. Logo — kichik rasm; kattasi faqat optimizatsiya qilinmaganini bildiradi. */
export const MAX_LOGO_BYTES = 512 * 1024;

export const uploadsDir = (): string =>
  process.env.ADMIN_UPLOADS_DIR || '/root/admin/uploads';

/**
 * Fayl ochiq beriladigan ildiz.
 *
 * ⚠ `ADMIN_API_PUBLIC_URL` NI TO'G'RIDAN-TO'G'RI ISHLATMANG: unda `/api`
 * bor (`settings.service.ts` uni shunday ishlatadi), logo esa global
 * prefiksdan TASHQARIDA beriladi (`app.use('/uploads', ...)`).
 */
export const publicRoot = (): string =>
  (process.env.ADMIN_PUBLIC_URL || process.env.ADMIN_API_PUBLIC_URL || '')
    .replace(/\/+$/, '')
    .replace(/\/api$/, '');

@Injectable()
export class TenantLogoService {
  private readonly logger = new Logger(TenantLogoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly tenants: TenantsService,
  ) {}

  /**
   * Fayl turini MAGIC BAYTLAR bo'yicha aniqlaydi.
   *
   * ⚠ `file.mimetype` GA ISHONILMAYDI: uni brauzer yuboradi va u
   * o'zgartirilishi mumkin. `.exe` faylni `logo.png` deb nomlab
   * `image/png` sarlavhasi bilan yuborish — bir qatorlik ish.
   */
  private detect(buf: Buffer) {
    for (const type of ALLOWED) {
      const ok = type.magic.every((b, i) => buf[i] === b);
      if (!ok) continue;
      // WebP uchun qo'shimcha shart: 8-11 baytlar "WEBP".
      if (type.mime === 'image/webp' && buf.subarray(8, 12).toString('ascii') !== 'WEBP') {
        continue;
      }
      return type;
    }
    return null;
  }

  async upload(tenantId: string, file?: { buffer: Buffer; size: number }) {
    if (!file?.buffer?.length) throw new BadRequestException('Fayl yuborilmadi');
    if (file.size > MAX_LOGO_BYTES) {
      throw new BadRequestException(
        `Fayl juda katta (${Math.round(file.size / 1024)} KB). Chegara — 512 KB`,
      );
    }

    const type = this.detect(file.buffer);
    if (!type) {
      throw new BadRequestException(
        'Faqat PNG, JPEG yoki WebP. (SVG qabul qilinmaydi — xavfsizlik sababli.)',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Loyiha topilmadi');

    // Nom fayl MAZMUNIDAN: bir xil rasm qayta yuklansa yangi fayl
    // yaratilmaydi, boshqa rasm esa yangi URL oladi — ya'ni brauzer keshi
    // o'zi yangilanadi (`immutable` sarlavhasi bilan xavfsiz).
    const hash = createHash('sha256').update(file.buffer).digest('hex').slice(0, 16);
    const dir = join(uploadsDir(), 'tenants', tenantId);
    const name = `logo-${hash}.${type.ext}`;

    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), file.buffer, { mode: 0o644 });

    const url = `${publicRoot()}/uploads/tenants/${tenantId}/${name}`;
    return this.apply(tenant.id, url, tenant.logoUrl);
  }

  /** Logoni olib tashlaydi — tenant client standart `/logo.svg` ga qaytadi. */
  async remove(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Loyiha topilmadi');
    return this.apply(tenant.id, null, tenant.logoUrl);
  }

  /**
   * `logoUrl` ni yozadi va qo'llashni boshlaydi.
   *
   * ── ⚠ POYGA ──
   *
   * `applyPending()` allaqachon `APPLYING` holatida 409 tashlaydi, ya'ni
   * ikki qo'llash bir vaqtda ketmaydi. Lekin 409 ushlanmasa so'rov xato
   * bo'lib qaytardi — holbuki LOGO SAQLANDI. Shuning uchun 409 xato emas:
   * `markPending()` belgisi qo'yilgan va navbatdagi qo'llash uni oladi.
   */
  private async apply(tenantId: string, url: string | null, previous: string | null) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { logoUrl: url },
    });

    // Eski faylni o'chirish — yangisi muvaffaqiyatli yozilgandan KEYIN.
    // Xato bo'lsa jimgina o'tamiz: yetim fayl 20 KB joy oladi, o'chirish
    // xatosi esa butun amalni yiqitardi.
    if (previous && previous !== url && previous.includes('/uploads/tenants/')) {
      const rel = previous.split('/uploads/')[1];
      if (rel) await unlink(join(uploadsDir(), rel)).catch(() => undefined);
    }

    const diff = await this.settings.markPending(tenantId);

    let applied = false;
    let message = "Logo saqlandi. Sayt qayta qurilmoqda (1-2 daqiqa).";
    try {
      await this.tenants.applyPending(tenantId);
      applied = true;
    } catch (err) {
      applied = false;
      message =
        "Logo saqlandi, lekin hozir boshqa qo'llash ketyapti — o'zgarish navbatda turadi.";
      this.logger.warn(`Logo apply kutilmoqda (${tenantId}): ${(err as Error).message}`);
    }

    return { logoUrl: url, applied, pendingCount: diff.length, message };
  }
}
