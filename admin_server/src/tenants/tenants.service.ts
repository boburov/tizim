import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProvisioningService } from '../provisioning/provisioning.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { GithubService } from '../github/github.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';

const PORT_MIN = Number(process.env.TENANT_PORT_MIN || 5100);
const PORT_MAX = Number(process.env.TENANT_PORT_MAX || 5999);

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: ProvisioningService,
    private readonly settings: SettingsService,
    private readonly github: GithubService,
  ) {}

  /** Nomdan xavfsiz slug hosil qiladi (DB nomi/pm2 nomi uchun asos). */
  private slugify(input: string): string {
    const base = input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
    return base || 'tenant';
  }

  /**
   * NOYOB DB nomi generatsiyasi — hech qachon takrorlanmaydi.
   * slug + qisqa tasodifiy suffiks; DB'da unique bo'lguncha qayta uriniladi.
   */
  private async generateUniqueDbName(name: string): Promise<string> {
    const slug = this.slugify(name);
    for (let attempt = 0; attempt < 10; attempt++) {
      const suffix = randomBytes(4).toString('hex'); // 8 hex belgi
      const candidate = `tenant_${slug}_${suffix}`.replace(/-/g, '_');
      const exists = await this.prisma.tenant.findUnique({
        where: { dbName: candidate },
      });
      if (!exists) return candidate;
    }
    // Deyarli imkonsiz — 8 hex 4 mlrd variant
    throw new ConflictException("Noyob DB nomi hosil qilinmadi, qayta urining");
  }

  /** Bo'sh portni tanlaydi (diapazon ichida, band bo'lmaganini). */
  private async pickFreePort(): Promise<number> {
    const used = await this.prisma.tenant.findMany({ select: { port: true } });
    const usedSet = new Set(used.map((u) => u.port));
    for (let p = PORT_MIN; p <= PORT_MAX; p++) {
      if (!usedSet.has(p)) return p;
    }
    throw new ConflictException("Bo'sh port qolmadi");
  }

  async create(dto: CreateTenantDto, createdBy?: string, customerId?: string) {
    // Domen bandligini tekshirish
    const domainTaken = await this.prisma.tenant.findUnique({
      where: { domain: dto.domain },
    });
    if (domainTaken) {
      throw new ConflictException('Bu domen allaqachon band');
    }

    // Tanlangan tizim mavjud va faolmi
    const template = await this.prisma.systemTemplate.findUnique({
      where: { id: dto.systemTemplateId },
    });
    if (!template || !template.isActive) {
      throw new BadRequestException("Tanlangan tizim mavjud emas yoki faol emas");
    }

    const dbName = await this.generateUniqueDbName(dto.name);
    const port = await this.pickFreePort();
    // pm2 nomi ham noyob bo'lishi kerak — dbName'dan olamiz (u allaqachon noyob)
    const pm2Name = `${dbName}-api`;
    // Tenant server usage yuborishda shu kalit bilan o'zini tanitadi
    const heartbeatSecret = randomBytes(32).toString('hex');

    // GitHub integratsiyasi o'chiq bo'lsa yoki mijoz so'ramasa — repo yo'q.
    const wantsRepo = dto.createRepo !== false && this.github.isConfigured();

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.name,
        domain: dto.domain,
        brandColor: dto.brandColor,
        brandBackground: dto.brandBackground || null,
        brandColorDark: dto.brandColorDark || null,
        brandBackgroundDark: dto.brandBackgroundDark || null,
        logoUrl: dto.logoUrl,
        dbName,
        pm2Name,
        port,
        heartbeatSecret,
        systemTemplateId: dto.systemTemplateId,
        customerId: customerId ?? null,
        status: 'DRAFT',
        gitStatus: wantsRepo ? 'PENDING' : 'DISABLED',
        createdBy,
        serverIp: process.env.SERVER_PUBLIC_IP || null,
      },
    });

    // Bot tokeni endi sozlama sifatida yashaydi (shifrlangan holda) —
    // `Tenant.botToken` ustuni faqat eski yozuvlar uchun qoldirilgan.
    if (dto.botToken) {
      await this.settings.seedInitial(
        tenant.id,
        { TELEGRAM_BOT_TOKEN: dto.botToken, TELEGRAM_BOT_ENABLED: 'true' },
        createdBy,
      );
    }

    // Provisioning'ni fon rejimida boshlaymiz — javob darrov qaytadi
    this.provisioning
      .provision(tenant.id)
      .catch((err) =>
        this.logger.error(`Provisioning boshlashda xato: ${err.message}`),
      );

    return this.withDnsInfo(tenant);
  }

  /**
   * Brend ma'lumotlarini yangilaydi.
   *
   * Ranglar client `.env` ga tushadi, ya'ni o'zgarish faqat client QAYTA
   * QURILGANDA ko'rinadi. Shuning uchun bu yerda darrov qo'llanmaydi —
   * "Qo'llash" tugmasi bosilishini kutadi va panel kutilayotgan
   * o'zgarishlar ro'yxatida ko'rsatib turadi.
   */
  async updateBrand(id: string, dto: UpdateBrandDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant topilmadi');
    if (tenant.status === 'DELETED') {
      throw new ConflictException("O'chirilgan loyihani tahrirlab bo'lmaydi");
    }

    // Bo'sh satr — rangni olib tashlash (null), berilmagan maydon — tegilmaydi
    const emptyToNull = (v?: string) => (v === undefined ? undefined : v || null);

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        brandColor: dto.brandColor ?? undefined,
        brandBackground: emptyToNull(dto.brandBackground),
        brandColorDark: emptyToNull(dto.brandColorDark),
        brandBackgroundDark: emptyToNull(dto.brandBackgroundDark),
        logoUrl: emptyToNull(dto.logoUrl),
      },
    });

    const { config } = await this.settings.resolve(id);
    const diff = this.settings.computeDiff(updated, config);

    if (diff.length && updated.applyStatus !== 'APPLYING') {
      await this.prisma.tenant.update({
        where: { id },
        data: { applyStatus: 'PENDING' },
      });
    }

    return {
      ok: true,
      tenant: this.withDnsInfo(updated),
      pending: {
        count: diff.length,
        applies: this.settings.applyModeFor(diff),
        entries: diff,
      },
    };
  }

  // ─────────────────────────────────────────────── sozlamalar va qo'llash

  /** Panel uchun sozlamalar ro'yxati + kutilayotgan o'zgarishlar. */
  describeSettings(id: string) {
    return this.settings.describe(id);
  }

  updateSettings(id: string, values: Record<string, unknown>, updatedBy?: string) {
    return this.settings.update(id, values, updatedBy);
  }

  /**
   * Kutilayotgan o'zgarishlarni tenantga yetkazadi.
   * Kerakli amal (restart / rebuild) farqdan o'zi aniqlanadi.
   */
  async applyPending(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant topilmadi');

    if (tenant.status === 'DELETED') {
      throw new ConflictException("O'chirilgan loyihaga sozlama qo'llab bo'lmaydi");
    }
    if (tenant.status === 'PROVISIONING' || tenant.status === 'DEPROVISIONING') {
      throw new ConflictException('Jarayon ketmoqda — tugashini kuting');
    }
    if (tenant.applyStatus === 'APPLYING') {
      throw new ConflictException("Qo'llash allaqachon ketmoqda");
    }

    const { config } = await this.settings.resolve(id);
    const diff = this.settings.computeDiff(tenant, config);

    if (!diff.length) {
      return { ok: true, applied: false, message: "Qo'llanmagan o'zgarish yo'q" };
    }

    const mode = this.settings.applyModeFor(diff);
    if (mode === 'none') {
      // Faqat ta'sirsiz maydonlar o'zgargan — skript chaqirmasdan suratni
      // yangilaymiz, aks holda "kutilmoqda" belgisi abadiy osilib qolardi.
      await this.settings.markApplied(id, config);
      return { ok: true, applied: false, message: "O'zgarish qayta ishga tushirishni talab qilmaydi" };
    }

    this.provisioning
      .applyConfig(id, mode)
      .catch((err) => this.logger.error(`Qo'llashda xato: ${err.message}`));

    return {
      ok: true,
      applied: true,
      mode,
      count: diff.length,
      message:
        mode === 'rebuild'
          ? "Client qayta qurilmoqda — 1-2 daqiqa vaqt oladi"
          : 'Server qayta ishga tushirilmoqda',
    };
  }

  // ──────────────────────────────────────────────────────── GitHub repo

  /** Repo holati va integratsiya sozlanganmi — panel uchun. */
  async repoInfo(id: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        gitStatus: true,
        repoFullName: true,
        repoUrl: true,
        repoPrivate: true,
        repoError: true,
        lastPushedAt: true,
        gitLog: true,
        deployToken: true,
      },
    });
    if (!t) throw new NotFoundException('Tenant topilmadi');

    return {
      ...t,
      // Deploy tokeni panelga ochiq ketmaydi — faqat "bormi" degan javob
      deployToken: undefined,
      hasDeployToken: Boolean(t.deployToken),
      integrationReady: this.github.isConfigured(),
      owner: this.github.owner || null,
    };
  }

  /** Reponi yaratadi (yo'q bo'lsa) va kodni qayta yuboradi. */
  async syncRepo(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant topilmadi');

    if (!this.github.isConfigured()) {
      throw new BadRequestException(
        "GitHub integratsiyasi sozlanmagan — admin_server/.env da GITHUB_TOKEN va GITHUB_OWNER kerak",
      );
    }
    if (tenant.status === 'DELETED') {
      throw new ConflictException("O'chirilgan loyiha kodini yuborib bo'lmaydi");
    }
    if (tenant.status === 'PROVISIONING') {
      throw new ConflictException('Provisioning ketmoqda — tugashini kuting');
    }

    this.provisioning
      .pushToRepo(id)
      .catch((err) => this.logger.error(`Repo sinxronlashda xato: ${err.message}`));

    return { ok: true, status: 'PUSHING' };
  }

  /**
   * Tenant repo workflow'i chaqiradigan deploy hook.
   *
   * Autentifikatsiya — faqat shu tenantga tegishli token. Token noto'g'ri
   * bo'lsa qaysi tenant nazarda tutilgani ham aytilmaydi: hook ochiq
   * internetda turadi, xato xabari orqali ma'lumot sizib chiqmasligi kerak.
   */
  async deployHook(token: string, ref?: string) {
    if (!token || token.length < 32) {
      throw new UnauthorizedException('Deploy tokeni yaroqsiz');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { deployToken: token },
    });
    if (!tenant) throw new UnauthorizedException('Deploy tokeni yaroqsiz');

    if (tenant.status !== 'ACTIVE') {
      throw new ConflictException(
        `Loyiha holati "${tenant.status}" — deploy qilinmadi`,
      );
    }
    if (tenant.applyStatus === 'APPLYING') {
      throw new ConflictException('Oldingi deploy hali tugamagan');
    }

    this.logger.log(
      `Deploy hook: ${tenant.domain}${ref ? ` (ref=${ref.slice(0, 12)})` : ''}`,
    );

    this.provisioning
      .applyConfig(tenant.id, 'deploy')
      .catch((err) => this.logger.error(`Deploy hook xatosi: ${err.message}`));

    return { ok: true, tenant: tenant.domain, status: 'DEPLOYING' };
  }

  /** DNS uchun kerakli IP va yo'riqnomani javobga qo'shadi. */
  private withDnsInfo(tenant: any) {
    const ip = tenant.serverIp || process.env.SERVER_PUBLIC_IP || null;
    return {
      ...tenant,
      dns: {
        // Cloudflare'ga qo'shiladigan A record
        recordType: 'A',
        name: tenant.domain,
        ip,
        note: ip
          ? `Cloudflare'da "${tenant.domain}" uchun A record → ${ip} qo'shing (proxy: DNS only tavsiya)`
          : "SERVER_PUBLIC_IP .env'da sozlanmagan — IP ni qo'lda kiriting",
      },
    };
  }

  async findAll() {
    const list = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { systemTemplate: { select: { name: true, key: true } } },
    });
    return list.map((t) => this.withDnsInfo(t));
  }

  async findOne(id: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { id },
      include: { systemTemplate: true },
    });
    if (!t) throw new NotFoundException('Tenant topilmadi');
    return this.withDnsInfo(t);
  }

  /**
   * Sayt preview'i uchun URL va uning tirikligi.
   * Tekshiruv admin serverdan turib qilinadi — brauzer CORS'ga tushmasligi uchun.
   */
  async preview(id: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, domain: true, status: true, name: true },
    });
    if (!t) throw new NotFoundException('Tenant topilmadi');

    if (t.status === 'DELETED') {
      return {
        url: null,
        domain: null,
        status: t.status,
        reachable: false,
        checkedAt: new Date().toISOString(),
        message: "Loyiha o'chirilgan — sayt mavjud emas",
      };
    }

    // probe qaysi sxema (https/http) javob berganini o'zi aniqlab, url ni qaytaradi
    const probe = await this.probeSite(t.domain);

    return {
      domain: t.domain,
      status: t.status,
      checkedAt: new Date().toISOString(),
      ...probe,
      message:
        probe.reachable
          ? null
          : t.status === 'PROVISIONING'
            ? "Loyiha hali yaratilmoqda — sayt tayyor bo'lgach ko'rinadi"
            : t.status === 'FAILED'
              ? 'Provisioning xato bilan tugagan — sayt ishga tushmagan'
              : "Sayt javob bermadi. DNS hali tarqalmagan yoki nginx/PM2 to'xtagan bo'lishi mumkin",
    };
  }

  /** Avval HTTPS, u ishlamasa HTTP — qaysi biri javob bersa o'shani qaytaradi. */
  private async probeSite(domain: string) {
    const started = Date.now();
    for (const scheme of ['https', 'http'] as const) {
      const url = `${scheme}://${domain}`;
      try {
        const res = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(6000),
        });
        return {
          url,
          reachable: res.ok,
          httpStatus: res.status,
          scheme,
          elapsedMs: Date.now() - started,
          error: res.ok ? null : `HTTP ${res.status}`,
        };
      } catch (err: any) {
        // HTTPS ishlamasa (sertifikat yo'q) — HTTP bilan qayta urinamiz
        if (scheme === 'http') {
          return {
            url: `https://${domain}`,
            reachable: false,
            httpStatus: null,
            scheme: null,
            elapsedMs: Date.now() - started,
            // fetch xatolarida asl sabab cause ichida bo'ladi (ENOTFOUND, ECONNREFUSED...)
            error:
              err?.name === 'TimeoutError'
                ? 'Timeout (6s)'
                : err?.cause?.message || err?.message,
          };
        }
      }
    }
    // Bu yerga yetib kelmaydi, TS uchun
    return {
      url: `https://${domain}`,
      reachable: false,
      httpStatus: null,
      scheme: null,
      elapsedMs: Date.now() - started,
      error: 'Nomalum xato',
    };
  }

  /** Muvaffaqiyatsiz provisioning'ni qayta urinish. */
  async retry(id: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { id },
      include: { systemTemplate: true },
    });
    if (!t) throw new NotFoundException('Tenant topilmadi');
    if (t.status === 'PROVISIONING') {
      throw new ConflictException('Provisioning allaqachon ketmoqda');
    }
    if (t.status === 'DEPROVISIONING') {
      throw new ConflictException("O'chirish jarayoni ketmoqda");
    }
    if (t.status === 'DELETED') {
      throw new ConflictException(
        "O'chirilgan tenantni qayta tiklab bo'lmaydi — yangisini yarating",
      );
    }
    // Fon rejimida — javob darrov qaytadi, holat panelda kuzatiladi
    this.provisioning
      .provision(t.id)
      .catch((err) => this.logger.error(`Qayta urinishda xato: ${err.message}`));

    return { ok: true, status: 'PROVISIONING' };
  }

  /**
   * Tenantni VPS'dan o'chiradi (deprovision). Yozuv Postgres'da DELETED
   * holatida qoladi — port/dbName qayta ishlatilmasligi va tarix saqlanishi uchun.
   * Domenni bo'shatamiz, aks holda o'sha domen bilan yangi tenant yaratib bo'lmaydi.
   */
  async remove(id: string, confirmDomain: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tenant topilmadi');

    // Noto'g'ri tenantni o'chirib yubormaslik uchun domen tasdiqlanadi
    if (confirmDomain !== t.domain) {
      throw new BadRequestException(
        `Tasdiqlash uchun domenni aynan yozing: ${t.domain}`,
      );
    }
    if (t.status === 'DEPROVISIONING') {
      throw new ConflictException("O'chirish allaqachon ketmoqda");
    }
    if (t.status === 'DELETED') {
      throw new ConflictException('Bu tenant allaqachon o\'chirilgan');
    }
    if (t.status === 'PROVISIONING') {
      throw new ConflictException(
        "Provisioning ketmoqda — tugashini kuting, keyin o'chiring",
      );
    }

    // Domen va noyob maydonlarni bo'shatamiz (arxiv yozuvi qoladi).
    // Suffiks qo'shamiz, chunki bu ustunlar @unique.
    const freed = `deleted_${Date.now()}_${t.domain}`.slice(0, 200);
    await this.prisma.tenant.update({
      where: { id },
      data: { domain: freed, heartbeatSecret: null },
    });

    this.provisioning
      .deprovision({
        tenantId: t.id,
        dbName: t.dbName,
        domain: t.domain, // skriptga ASL domen ketadi
        pm2Name: t.pm2Name,
        repoFullName: t.repoFullName,
      })
      .catch((err) => this.logger.error(`Deprovisioningda xato: ${err.message}`));

    return { ok: true, status: 'DEPROVISIONING' };
  }

  /**
   * DELETED tenant yozuvini Postgres'dan butunlay o'chiradi (arxivni tozalash).
   * VPS resurslariga tegmaydi — ular allaqachon o'chirilgan bo'lishi kerak.
   */
  async purge(id: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tenant topilmadi');
    if (t.status !== 'DELETED') {
      throw new ConflictException(
        "Faqat o'chirilgan (DELETED) tenant yozuvini tozalash mumkin",
      );
    }
    await this.prisma.tenant.delete({ where: { id } });
    return { ok: true };
  }
}
