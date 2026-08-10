import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { BotTemplate } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { BotProvisioningService } from './bot-provisioning.service.js';
import {
  BotEnvItemDto,
  CreateBotDto,
  ReplaceEnvDto,
  UpdateBotDto,
} from './dto/bot.dto.js';
import {
  decryptSecret,
  encryptSecret,
  isEncryptionConfigured,
} from '../common/crypto/secrets.util.js';
import { getMe, getWebhookInfo, TelegramError } from './telegram.util.js';

/** Bot portlari — tenant diapazoniga TEGMAYDI (aks holda to'qnashadi). */
const BOT_PORT_MIN = Number(process.env.BOT_PORT_MIN || 7000);
const BOT_PORT_MAX = Number(process.env.BOT_PORT_MAX || 7999);

@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: BotProvisioningService,
  ) {}

  // ─────────────────────────────────────────────────────── yordamchilar

  private slugify(input: string): string {
    const base = input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
    return base || 'bot';
  }

  /**
   * Noyob slug. U bir vaqtda subdomen, pm2 nomi va papka nomi bo'lgani
   * uchun band bo'lsa raqamli suffiks qo'shiladi — tasodifiy hex emas,
   * chunki bu qiymatni odam o'qiydi (savdo-bot-2 yaxshiroq).
   */
  private async uniqueSlug(desired: string): Promise<string> {
    const base = this.slugify(desired);
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? base : `${base}-${i + 1}`;
      const exists = await this.prisma.bot.findUnique({
        where: { slug: candidate },
      });
      if (!exists) return candidate;
    }
    throw new ConflictException("Noyob slug hosil qilinmadi — boshqa nom tanlang");
  }

  private async pickFreePort(): Promise<number> {
    const used = await this.prisma.bot.findMany({
      where: { port: { not: null } },
      select: { port: true },
    });
    const usedSet = new Set(used.map((u) => u.port));
    for (let p = BOT_PORT_MIN; p <= BOT_PORT_MAX; p++) {
      if (!usedSet.has(p)) return p;
    }
    throw new ConflictException("Bo'sh port qolmadi");
  }

  /**
   * Rejim runtime'dan kelib chiqadi, foydalanuvchi tanlamaydi.
   * PHP uzluksiz jarayon sifatida getUpdates qila olmaydi; Node esa
   * polling'da domensiz ishlaydi — noto'g'ri juftlik imkonsiz bo'lishi kerak.
   */
  private modeFor(runtime: 'NODEJS' | 'PHP'): 'POLLING' | 'WEBHOOK' {
    return runtime === 'PHP' ? 'WEBHOOK' : 'POLLING';
  }

  /** Tokenni Telegram'da tekshiradi. Yaroqsiz bo'lsa 400. */
  private async verifyToken(token: string) {
    try {
      return await getMe(token);
    } catch (err) {
      if (err instanceof TelegramError) {
        throw new BadRequestException(`Token tekshirilmadi: ${err.message}`);
      }
      throw err;
    }
  }

  private requireEncryption() {
    if (!isEncryptionConfigured()) {
      throw new BadRequestException(
        "SETTINGS_ENCRYPTION_KEY .env'da yo'q — bot tokenini shifrlab saqlab bo'lmaydi",
      );
    }
  }

  /**
   * Javobga chiqadigan ko'rinish — token HECH QACHON ochiq ketmaydi.
   *
   * Niqoblangan token ham qaytarilmaydi: uni yasash uchun tokenni ochish
   * kerak bo'lardi, foydasi esa yo'q — panelda `@username` ko'rsatilgani
   * qaysi bot ekanini aniqlash uchun yetarli.
   */
  private present(bot: any) {
    const { tokenEnc, webhookSecret, env, ...rest } = bot;
    return {
      ...rest,
      tokenSet: Boolean(tokenEnc),
      hasWebhookSecret: Boolean(webhookSecret),
      env: (env ?? []).map((e: any) => ({
        key: e.key,
        // Maxfiy qiymat ham ochiq qaytmaydi — faqat "bor" belgisi.
        value: e.isSecret ? '' : e.value,
        isSecret: e.isSecret,
      })),
    };
  }

  // ─────────────────────────────────────────────────────────── shablonlar

  listTemplates() {
    return this.prisma.botTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ runtime: 'asc' }, { name: 'asc' }],
    });
  }

  // ──────────────────────────────────────────────────────────────── CRUD

  async list() {
    const bots = await this.prisma.bot.findMany({
      where: { status: { not: 'DELETED' } },
      include: {
        template: { select: { key: true, name: true } },
        tenant: { select: { id: true, name: true } },
        _count: { select: { env: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return bots.map((b) => this.present(b));
  }

  async findOne(id: string) {
    const bot = await this.prisma.bot.findUnique({
      where: { id },
      include: {
        env: { orderBy: { key: 'asc' } },
        template: true,
        tenant: { select: { id: true, name: true, domain: true } },
        customer: { select: { id: true, email: true, fullName: true } },
      },
    });
    if (!bot) throw new NotFoundException('Bot topilmadi');
    return this.present(bot);
  }

  /**
   * Telegram tarafidagi haqiqiy holat — panel "deploy muvaffaqiyatli" desa
   * ham bot jim turishi mumkin (webhook xato URL'da, yoki polling rejimida
   * webhook qolib ketgan). Shu endpoint aynan o'sha farqni ko'rsatadi.
   */
  async telegramStatus(id: string) {
    const bot = await this.prisma.bot.findUnique({ where: { id } });
    if (!bot) throw new NotFoundException('Bot topilmadi');

    try {
      const info = await getWebhookInfo(decryptSecret(bot.tokenEnc));
      const expected = bot.mode === 'WEBHOOK' ? bot.webhookUrl || '' : '';
      return {
        ...info,
        expectedUrl: expected,
        /** Kutilgan holatga mos kelmasa bot xabar olmayapti. */
        inSync: (info.url || '') === expected,
      };
    } catch (err) {
      if (err instanceof TelegramError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  async create(dto: CreateBotDto, createdBy?: string) {
    this.requireEncryption();

    if (dto.source === 'REPO' && !dto.repoUrl) {
      throw new BadRequestException("REPO manbasi uchun repoUrl kerak");
    }

    let template: BotTemplate | null = null;
    if (dto.source === 'TEMPLATE') {
      if (!dto.templateId) {
        throw new BadRequestException("TEMPLATE manbasi uchun shablon tanlang");
      }
      template = await this.prisma.botTemplate.findUnique({
        where: { id: dto.templateId },
      });
      if (!template || !template.isActive) {
        throw new BadRequestException('Shablon topilmadi yoki faol emas');
      }
      if (template.runtime !== dto.runtime) {
        throw new BadRequestException(
          `Shablon ${template.runtime} uchun, siz ${dto.runtime} tanladingiz`,
        );
      }
    }

    const mode = this.modeFor(dto.runtime);

    // Sozlama tekshiruvi Telegram so'rovidan OLDIN: u mahalliy, bir zumda
    // hal bo'ladi va javobi aniq. Tarmoqqa chiqib, keyin "domen sozlanmagan"
    // deyish foydalanuvchini bekorga kuttirardi.
    if (mode === 'WEBHOOK' && !process.env.BOTS_BASE_DOMAIN) {
      throw new BadRequestException(
        "BOTS_BASE_DOMAIN .env'da yo'q — webhook botga domen berib bo'lmaydi",
      );
    }

    // Token tekshiruvi bazaga yozishdan OLDIN: yaroqsiz token bilan yozuv
    // yaratib, keyin deploy'ni yiqitish foydalanuvchini chalg'itardi.
    const me = await this.verifyToken(dto.token);

    const slug = await this.uniqueSlug(dto.slug || me.username || dto.name);

    const bot = await this.prisma.bot.create({
      data: {
        name: dto.name,
        slug,
        runtime: dto.runtime,
        mode,
        source: dto.source,
        repoUrl: dto.source === 'REPO' ? dto.repoUrl : null,
        repoBranch: dto.repoBranch || 'main',
        templateId: template?.id ?? null,
        tokenEnc: encryptSecret(dto.token),
        botUsername: me.username,
        pm2Name: `bot-${slug}`,
        // Port faqat webhook rejimidagi Node botga kerak. PHP php-fpm
        // ostida ishlaydi — unga port ajratish bo'sh joyni band qilardi.
        port:
          mode === 'WEBHOOK' && dto.runtime === 'NODEJS'
            ? await this.pickFreePort()
            : null,
        webhookUrl:
          mode === 'WEBHOOK' ? this.provisioning.webhookUrlFor(slug) : null,
        webhookSecret:
          mode === 'WEBHOOK' ? randomBytes(24).toString('hex') : null,
        tenantId: dto.tenantId || null,
        customerId: dto.customerId || null,
        status: 'DRAFT',
        createdBy,
        env: dto.env?.length
          ? { create: dto.env.map((e) => this.envRow(e)) }
          : undefined,
      },
      include: { env: true, template: true },
    });

    // Fon rejimida — HTTP javob kutmaydi.
    void this.provisioning.deploy(bot.id).catch((err) => {
      this.logger.error(`Deploy xatosi (${bot.slug}): ${err.message}`);
    });

    return this.present(bot);
  }

  private envRow(e: BotEnvItemDto) {
    return {
      key: e.key,
      value: e.isSecret ? encryptSecret(e.value) : e.value,
      isSecret: Boolean(e.isSecret),
    };
  }

  async update(id: string, dto: UpdateBotDto) {
    const bot = await this.mustFind(id);

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.repoUrl !== undefined) data.repoUrl = dto.repoUrl;
    if (dto.repoBranch !== undefined) data.repoBranch = dto.repoBranch;
    if (dto.tenantId !== undefined) data.tenantId = dto.tenantId || null;
    if (dto.customerId !== undefined) data.customerId = dto.customerId || null;

    if (dto.templateId !== undefined) {
      if (bot.source !== 'TEMPLATE') {
        throw new BadRequestException("Bu bot shablondan olinmagan");
      }
      data.templateId = dto.templateId || null;
    }

    if (dto.token) {
      this.requireEncryption();
      const me = await this.verifyToken(dto.token);
      data.tokenEnc = encryptSecret(dto.token);
      data.botUsername = me.username;
    }

    const updated = await this.prisma.bot.update({
      where: { id },
      data,
      include: { env: true, template: true },
    });
    return this.present(updated);
  }

  /**
   * env'ni TO'LIQ almashtiradi (qo'shish/o'chirishni bittada).
   *
   * Maxfiy qiymatlar javobda ochiq qaytmagani uchun, bo'sh qiymatli maxfiy
   * kalit "o'zgartirmang" degani — aks holda formani qayta yuborish
   * hamma sirlarni bo'shatib yuborardi.
   */
  async replaceEnv(id: string, dto: ReplaceEnvDto) {
    await this.mustFind(id);

    const existing = await this.prisma.botEnvVar.findMany({
      where: { botId: id },
    });
    const oldByKey = new Map(existing.map((e) => [e.key, e]));

    const rows = dto.items.map((item) => {
      if (item.isSecret && item.value === '') {
        const old = oldByKey.get(item.key);
        if (old) return { key: item.key, value: old.value, isSecret: true };
        throw new BadRequestException(
          `"${item.key}" maxfiy kaliti uchun qiymat kerak`,
        );
      }
      return this.envRow(item);
    });

    await this.prisma.$transaction([
      this.prisma.botEnvVar.deleteMany({ where: { botId: id } }),
      this.prisma.botEnvVar.createMany({
        data: rows.map((r) => ({ ...r, botId: id })),
      }),
    ]);

    return this.findOne(id);
  }

  // ───────────────────────────────────────────────────────────── amallar

  async deploy(id: string) {
    const bot = await this.mustFind(id);
    if (bot.status === 'PROVISIONING' || bot.status === 'DEPROVISIONING') {
      throw new ConflictException('Bot ustida amal bajarilyapti — kuting');
    }
    void this.provisioning.deploy(id).catch((err) => {
      this.logger.error(`Deploy xatosi (${bot.slug}): ${err.message}`);
    });
    return { ok: true, status: 'PROVISIONING' };
  }

  async control(id: string, action: 'stop' | 'start') {
    const bot = await this.mustFind(id);
    if (bot.status === 'PROVISIONING' || bot.status === 'DEPROVISIONING') {
      throw new ConflictException('Bot ustida amal bajarilyapti — kuting');
    }
    void this.provisioning.control(id, action).catch((err) => {
      this.logger.error(`${action} xatosi (${bot.slug}): ${err.message}`);
    });
    return { ok: true };
  }

  logs(id: string, lines = 200) {
    return this.mustFind(id).then(() =>
      this.provisioning.logs(id, lines).then((log) => ({ log })),
    );
  }

  async remove(id: string) {
    const bot = await this.mustFind(id);
    if (bot.status === 'DEPROVISIONING') {
      throw new ConflictException("Bot allaqachon o'chirilyapti");
    }
    void this.provisioning.deprovision(id).catch((err) => {
      this.logger.error(`O'chirish xatosi (${bot.slug}): ${err.message}`);
    });
    return { ok: true, status: 'DEPROVISIONING' };
  }

  /** Arxiv yozuvini bazadan butunlay olib tashlaydi (VPS'ga tegmaydi). */
  async purge(id: string) {
    const bot = await this.mustFind(id);
    if (bot.status !== 'DELETED') {
      throw new ConflictException(
        "Avval botni o'chiring — keyin yozuvni tozalash mumkin",
      );
    }
    await this.prisma.bot.delete({ where: { id } });
    return { ok: true };
  }

  private async mustFind(id: string) {
    const bot = await this.prisma.bot.findUnique({ where: { id } });
    if (!bot) throw new NotFoundException('Bot topilmadi');
    return bot;
  }
}
