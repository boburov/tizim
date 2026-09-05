import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { AuthService } from '../auth/index.js';
import { PermissionService } from '../../common/rbac/permission.service.js';
import { comparePassword } from '../../common/utils/password.js';
import { normalizePhone, isPhoneLike } from '../../common/utils/phone.js';
import { verifyInitData, type InitDataUser } from '../../bot/init-data.js';
import type { AppConfig } from '../../config/env.validation.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TELEGRAM MINI-ILOVA AUTENTIFIKATSIYASI —
 * `server/src/modules/botAuth/services/botAuth.service.js` dan.
 *
 * ── ⚠⚠ EXPRESS VERSIYASI HOZIR ISHLAMAYDI ⚠⚠
 *
 * U Prisma sxemasiga MOS KELMAYDIGAN so'rovlar yozadi va shuning uchun
 * ikkala marshrut ham 500 beradi:
 *
 *   • `where: { login: ... }`            → `User` da bunday maydon yo'q
 *                                          (autentifikatsiya kaliti —
 *                                          `username`);
 *   • `include: { role: true, branches: true }`
 *                                        → `role` SKALYAR (`String`),
 *                                          `branches` esa umuman yo'q
 *                                          (`branchAssignments`);
 *   • `comparePassword(password, c.password)`
 *                                        → maydon `passwordHash` va u
 *                                          global `omit` bilan yashirin;
 *   • `issueTokens({ userId, permissions, ... })`
 *                                        → haqiqiy imzo
 *                                          `issueTokens(user, {userAgent, ip})`,
 *                                          ya'ni `payload.sub` = undefined.
 *
 * Shuning uchun bu yerda BUZILISH emas, MAQSAD ko'chirildi. Xulq
 * `modules/auth` dagi ishlaydigan login oqimiga tayanadi.
 *
 * ── SAQLANGAN MAQSADLI XULQ ──
 *
 * 1. `initData` HMAC — yagona autentifikatsiya dalili (`/verify` uchun);
 * 2. KO'P-AKKAUNT: bitta Telegram bir nechta `User` ga bog'lanadi.
 *    Eski bog'lanish UZILMAYDI; upsert `(telegramId, userId)` JUFTLIGI
 *    bo'yicha. Aynan shuning uchun `/login` da telefon bo'yicha BARCHA
 *    nomzodlar aylanib chiqiladi va parol MOS KELGANI tanlanadi —
 *    `auth.login` dagi "birinchi qatorni ol" mantig'i bu yerda
 *    NOTO'G'RI bo'lardi (ona ikki farzandiga bir telefon).
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class BotAuthService {
  private readonly logger = new Logger('BotAuth');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly permissions: PermissionService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * initData'ni tekshiradi va Telegram foydalanuvchisini qaytaradi.
   *
   * ⚠ IKKI TOKEN QO'LLAB-QUVVATLANADI (`TELEGRAM_BOT_TOKEN` va
   * `..._2`): bot almashtirilayotganda eski mini-ilova sessiyalari
   * darhol yiqilib qolmasligi uchun.
   */
  private requireTgUser(initData: string): InitDataUser {
    const tokens = [
      this.config.get('TELEGRAM_BOT_TOKEN', { infer: true }),
      this.config.get('TELEGRAM_BOT_TOKEN_2', { infer: true }),
    ].filter(Boolean) as string[];

    if (tokens.length === 0) throw new ApiError(503, 'Bot konfiguratsiyalanmagan');

    const result = verifyInitData(initData, tokens);
    if (!result.ok) {
      this.logger.warn(
        `Telegram initData verify failed: ${result.reason} ` +
          `${result.debug ? JSON.stringify(result.debug) : ''}`,
      );
      // ⚠ ESKIRGAN sessiya ALOHIDA xabar oladi: odam nima qilishini
      // bilishi kerak ("qayta oching"), "tasdiqlanmadi" esa uni
      // boshi berk ko'chaga olib borardi.
      if (result.reason === 'expired') {
        throw new ApiError(401, 'Sessiya muddati tugagan, qayta oching');
      }
      throw new ApiError(401, "Telegram ma'lumotlari tasdiqlanmadi");
    }
    return result.user;
  }

  /**
   * Telegram ID ni `User` ga bog'laydi.
   *
   * ⚠ ESKI BOG'LANISH UZILMAYDI. Upsert `(telegramId, userId)` juftligi
   * bo'yicha: juftlik bor bo'lsa yangilanadi, yo'q bo'lsa YANGI qator
   * qo'shiladi. Shuning uchun bitta Telegram istalgancha akkauntga
   * birika oladi — bu ATAYLAB shunday (ota-ona bir nechta farzand
   * hisobini ko'radi).
   */
  private async linkTelegram(tgUser: InitDataUser, userId: string): Promise<void> {
    const telegramId = BigInt(tgUser.id);
    const uid = String(userId);

    const data = {
      // Chat = shaxsiy chat, ya'ni `chatId === telegramId`.
      chatId: telegramId,
      username: tgUser.username ? String(tgUser.username).toLowerCase() : null,
      firstName: tgUser.first_name || '',
      lastName: tgUser.last_name || '',
      languageCode: tgUser.language_code || 'uz',
    };

    // ⚠ `upsert` ISHLATIB BO'LMAYDI: `(telegramId, userId)` sxemada
    // QISMAN unique (`WHERE userId IS NOT NULL`), ya'ni Prisma uni
    // `where` sifatida qabul qilmaydi.
    const existing = await this.prisma.botUser.findFirst({
      where: { telegramId, userId: uid },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.botUser.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.botUser.create({ data: { telegramId, userId: uid, ...data } });
    }
  }

  private async roleMetaFor(user: { role: string }) {
    const role = await this.permissions.resolveRole(user.role);
    // ⚠ MUZLATILGAN ROL — parol/imzo to'g'ri bo'lsa ham KIRA OLMAYDI.
    // `auth.login` bilan bir xil 403 va bir xil matn.
    if (role.isFrozen) {
      throw new ApiError(
        403,
        role.frozenReason
          ? `Rolingiz muzlatilgan: ${role.frozenReason}`
          : 'Sizning rolingiz muzlatilgan. Administratorga murojaat qiling',
      );
    }
    return {
      value: role.value,
      label: role.label,
      roleType: role.roleType,
      defaultPath: role.defaultPath,
    };
  }

  /**
   * `/verify` — Telegram imzosi bo'yicha AVTOMATIK kirish.
   *
   * Bog'lanmagan bo'lsa 200 va `{ linked: false }` qaytadi (xato EMAS):
   * mini-ilova shu javobga qarab login formasini ko'rsatadi. 401 bersak
   * klientdagi interceptor uni "sessiya tugadi" deb talqin qilib,
   * login sahifasiga cheksiz yo'naltirardi.
   */
  async verifyAndIssue({
    initData,
    userAgent,
    ip,
  }: {
    initData: string;
    userAgent?: string;
    ip?: string;
  }) {
    const tgUser = this.requireTgUser(initData);

    const botUser = await this.prisma.botUser.findFirst({
      where: { telegramId: BigInt(tgUser.id), userId: { not: null } },
      // ⚠ Eng OXIRGI bog'langan akkaunt. Bir nechta bo'lsa odam
      // "oxirgi kirganim" ni kutadi.
      orderBy: { updatedAt: 'desc' },
      include: { user: true },
    });

    const user = botUser?.user;
    if (!user) return { linked: false as const };

    if (!user.isActive || user.isDeleted) throw new ApiError(403, 'Akkaunt bloklangan');

    const roleMeta = await this.roleMetaFor(user);

    // Fon yangilanishi: username/ism o'zgargan bo'lsa sinxronlanadi.
    // ⚠ `await` QILINMAYDI — kirish tezligi shunga bog'lanib qolmasin.
    this.linkTelegram(tgUser, user.id).catch((err) =>
      this.logger.error("Fon tgUser link yangilanishida xato", err),
    );

    const { accessToken, refreshToken } = await this.auth.issueTokens(user, { userAgent, ip });
    return {
      linked: true as const,
      accessToken,
      refreshToken,
      user: this.auth.sanitizeUser(user as never),
      roleMeta,
    };
  }

  /**
   * `/login` — login/telefon + parol bilan kirish VA Telegram'ni bog'lash.
   *
   * Klient (BotAuthPage) aynan shu oqimni ishlatadi: "har safar login
   * so'raymiz, shunda bitta Telegram istalgancha akkauntga bog'lanadi".
   */
  async loginAndLink({
    initData,
    login,
    password,
    userAgent,
    ip,
  }: {
    initData: string;
    login: string;
    password: string;
    userAgent?: string;
    ip?: string;
  }) {
    const tgUser = this.requireTgUser(initData);

    const trimmed = String(login || '').trim();
    if (!trimmed) throw new ApiError(400, 'Login kerak');

    // Parol xeshi bilan o'qilgan foydalanuvchi (`omit: { passwordHash: false }`).
    let user:
      | { id: string; role: string; isActive: boolean; passwordHash: string; [k: string]: unknown }
      | null = null;

    if (isPhoneLike(trimmed)) {
      // ⚠ KO'P-AKKAUNT: telefon UNIQUE EMAS. `auth.login` dagi
      // "birinchi qator" mantig'i bu yerda noto'g'ri bo'lardi — parol
      // bo'yicha AYNAN QAYSI odam ekanini aniqlaymiz.
      const phone = normalizePhone(trimmed);
      const candidates = await this.prisma.user.findMany({
        where: { phone, isDeleted: false },
        omit: { passwordHash: false },
        // Tartib barqaror bo'lsin (Postgres'da ORDER BY siz kafolat yo'q).
        orderBy: { createdAt: 'asc' },
      });
      for (const c of candidates) {
        if (await comparePassword(password, c.passwordHash)) {
          user = c;
          break;
        }
      }
    } else {
      const candidate = await this.prisma.user.findFirst({
        where: { username: trimmed.toLowerCase(), isDeleted: false },
        omit: { passwordHash: false },
      });
      if (candidate && (await comparePassword(password, candidate.passwordHash))) {
        user = candidate;
      }
    }

    // ⚠ YAGONA XATO MATNI: "login yo'q" va "parol noto'g'ri" ni
    // ajratish akkaunt sanashga (enumeration) yo'l ochardi.
    if (!user) throw new ApiError(401, "Login/telefon yoki parol noto'g'ri");

    // ⚠ ARXIVLANGAN AKKAUNT — 401 EMAS, 403. Farq ATAYLAB: parol
    // TO'G'RI edi, muammo boshqa joyda. 401 bersak odam parolini
    // qayta-qayta terib, sababni hech qachon bilmasdi.
    // (Express `botAuth` da ham aynan shunday ajratilgan.)
    if (!user.isActive) throw new ApiError(403, 'Akkaunt bloklangan');

    const roleMeta = await this.roleMetaFor(user);

    // ⚠ BOG'LASH TOKENDAN OLDIN va `await` bilan: bog'lash yiqilsa
    // odam kirgan-u Telegram bog'lanmagan holatda qolardi — keyingi
    // safar `/verify` uni tanimasdi.
    await this.linkTelegram(tgUser, String(user.id));

    const { accessToken, refreshToken } = await this.auth.issueTokens(user, { userAgent, ip });

    return {
      accessToken,
      refreshToken,
      user: this.auth.sanitizeUser(user),
      roleMeta,
    };
  }
}
