/**
 * Tenant sozlamalarini o'qish, saqlash va "qo'llanmagan o'zgarishlar"ni
 * hisoblash.
 *
 * Qiymat uch manbadan yig'iladi (ustunlik tartibida):
 *   1) TenantSetting — admin panelda o'zgartirilgan qiymat;
 *   2) registrdagi standart (`SETTINGS[].default`);
 *   3) tenant yozuvidan hosil qilinadigan boshqariladigan qiymatlar
 *      (port, baza, domen, brend ranglari) — bularni o'zgartirib bo'lmaydi.
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Tenant, TenantSetting } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  decryptSecret,
  encryptSecret,
  fingerprint,
  isEncryptionConfigured,
  maskSecret,
} from '../common/crypto/secrets.util.js';
import { hexToHslChannels } from '../common/color/brand-color.util.js';
import { BranchConfigService } from '../branch-config/branch-config.service.js';
import {
  BRANCHES_ENABLED_ENV_KEY,
  BRANCH_LIMIT_ENV_KEY,
} from '../branch-config/branch-config.constants.js';
import {
  ApplyMode,
  SETTINGS,
  getSetting,
  heaviestApplyMode,
  validateSettingValue,
} from './settings.registry.js';
import {
  ResolvedConfig,
  publicDefinition,
  renderClientEnv,
  renderEnvExample,
  renderServerEnv,
} from './env-renderer.js';

/** Boshqariladigan kalitlar o'zgarganda ham client qayta qurilishi kerak. */
const CLIENT_MANAGED_APPLY: ApplyMode = 'rebuild';
const SERVER_MANAGED_APPLY: ApplyMode = 'restart';

export interface ConfigDiffEntry {
  key: string;
  scope: 'server' | 'client';
  label: string;
  /** Maxfiy qiymatda "••••" — asl qiymat farqda ko'rsatilmaydi. */
  from: string;
  to: string;
  applies: ApplyMode;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly branchConfig: BranchConfigService,
  ) {}

  // ───────────────────────────────────────────────── qiymatlarni yig'ish

  /**
   * Tenant yozuvidan HOSIL QILINADIGAN qiymatlar.
   *
   * Bular panelda tahrirlanmaydi: noto'g'ri port yoki baza nomi tenantni
   * butunlay ishdan chiqaradi, to'g'ri qiymat esa allaqachon yozuvda bor.
   */
  private buildManagedValues(
    tenant: Tenant,
    /**
     * Filial konfiguratsiyasi — `BranchConfigService` hisoblab beradi.
     * Ataylab parametr: hisoblash mantig'i BITTA joyda qolsin.
     */
    branch: { branchesEnabled: boolean; limit: number },
  ): ResolvedConfig {
    // Tenant bazasi endi PostgreSQL (Prisma). Har tenantga ALOHIDA baza
    // ochiladi - nomi `tenant.dbName`, ya'ni izolyatsiya avvalgidek qat'iy.
    const pgBase =
      process.env.POSTGRES_BASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432';
    const clientUrl = `https://${tenant.domain}`;

    const server: Record<string, string> = {
      NODE_ENV: 'production',
      PORT: String(tenant.port),
      // NEST_PORT = PORT: server NestJS ilovasi (dist/main.js) aynan shu
      // portda tinglaydi va nginx `/api` ni shu portga proxy qiladi. Usiz
      // NEST_PORT default 5001 ga tushib qoladi — hamma tenant 5001'da
      // to'qnashadi va nginx tenant portiga (masalan 5101) ulanolmay API
      // 502 qaytaradi.
      NEST_PORT: String(tenant.port),
      // Brend nomi YAGONA manbadan - `tenant.name`. Server (bot matnlari,
      // {markaz} tokeni, Excel muallifi) va client (VITE_APP_NAME) ayni shu
      // qiymatni oladi, shuning uchun panelda nomni o'zgartirish ikkala
      // tomonni birdan yangilaydi.
      APP_NAME: tenant.name,
      DATABASE_URL: `${pgBase}/${tenant.dbName}?schema=public`,
      COOKIE_DOMAIN: tenant.domain,
      CLIENT_URL: clientUrl,
      ADMIN_API_URL: process.env.ADMIN_API_PUBLIC_URL || '',
      TENANT_ID: tenant.id,
      HEARTBEAT_SECRET: tenant.heartbeatSecret || '',

      // ── FILIALLAR ──
      //
      // ⚠ NEGA `.env` DA HAM BOR, HEARTBEAT'DA HAM: heartbeat har 15
      // daqiqada keladi va tenant server BIRINCHI heartbeat'gacha
      // limitlarni BILMAYDI (kesh bo'sh → "cheksiz"). Ya'ni har restart
      // dan keyin qisqa oyna ochilardi va aynan o'sha oynada mijoz
      // chegaradan ortiq filial ocha olardi.
      //
      // `.env` shu oynani yopadi: qiymat jarayon ko'tarilishi bilan
      // mavjud bo'ladi. Heartbeat esa uni restart'siz YANGILAYDI —
      // ikkalasi bir-birini almashtirmaydi, to'ldiradi.
      [BRANCHES_ENABLED_ENV_KEY]: branch.branchesEnabled ? 'true' : 'false',
      [BRANCH_LIMIT_ENV_KEY]: String(branch.limit),
    };

    const client: Record<string, string> = {
      VITE_API_URL: `${clientUrl}/api`,
      VITE_APP_NAME: tenant.name,
    };

    if (tenant.logoUrl) client.VITE_APP_LOGO = tenant.logoUrl;

    // HEX → HSL kanallari. Aylantirib bo'lmasa o'zgaruvchi UMUMAN yozilmaydi:
    // tenant client bo'sh yoki buzuq qiymatni "berilgan" deb qabul qiladi va
    // butun tema hosil qilishdan voz kechadi.
    const brandPairs: Array<[string, string | null]> = [
      ['VITE_APP_PRIMARY', tenant.brandColor],
      ['VITE_APP_BACKGROUND', tenant.brandBackground],
      ['VITE_APP_PRIMARY_DARK', tenant.brandColorDark],
      ['VITE_APP_BACKGROUND_DARK', tenant.brandBackgroundDark],
    ];

    for (const [key, hex] of brandPairs) {
      const channels = hexToHslChannels(hex);
      if (channels) client[key] = channels;
    }

    return { server, client };
  }

  /** Tenantning saqlangan sozlamalari: kalit → ochiq qiymat. */
  private decodeOverrides(rows: TenantSetting[]): Record<string, string> {
    const out: Record<string, string> = {};

    for (const row of rows) {
      try {
        out[row.key] = row.isSecret ? decryptSecret(row.value) : row.value;
      } catch (err: any) {
        // Shifr ochilmasa (kalit almashgan) — sozlamani YO'Q deb hisoblaymiz.
        // Panel butunlay ochilmay qolgandan ko'ra standartga qaytgani yaxshi.
        this.logger.error(
          `Sozlama shifri ochilmadi (tenant=${row.tenantId}, key=${row.key}): ${err.message}`,
        );
      }
    }

    return out;
  }

  /**
   * `.env` ga tushadigan YAKUNIY qiymatlar to'plami.
   * Maxfiy qiymatlar bu yerda OCHIQ — natija faqat fayl yozishga ketadi.
   */
  async resolve(tenantId: string): Promise<{ tenant: Tenant; config: ResolvedConfig }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { settings: true },
    });
    if (!tenant) throw new NotFoundException('Tenant topilmadi');

    const branch = await this.branchConfig.effective(tenantId);
    const config = this.buildManagedValues(tenant, branch);
    const overrides = this.decodeOverrides(tenant.settings);

    for (const def of SETTINGS) {
      const raw = overrides[def.key] ?? def.default ?? '';

      if (raw === '' && def.omitWhenEmpty) continue;

      const target = def.scope === 'server' ? config.server : config.client;
      target[def.key] = raw;
    }

    // ESKI YOZUVLAR: bot token ilgari `Tenant.botToken` ustunida edi.
    // Sozlamada qiymat bo'lmasa o'shanga qaytamiz — aks holda mavjud
    // tenantlarda bot birinchi "Qo'llash"da jimgina o'chib qolardi.
    if (!config.server.TELEGRAM_BOT_TOKEN && tenant.botToken) {
      config.server.TELEGRAM_BOT_TOKEN = decryptSecret(tenant.botToken);
    }

    // Tokensiz bot yoqilgan bo'lsa server ishga tushishda yiqiladi —
    // shuning uchun mos kelmagan juftlikni shu yerda to'g'irlaymiz.
    if (!config.server.TELEGRAM_BOT_TOKEN) {
      config.server.TELEGRAM_BOT_ENABLED = 'false';
    }

    return { tenant, config };
  }

  /** Yakuniy `.env` fayllari matni (provision/reconfigure skriptlari uchun). */
  async renderEnvFiles(tenantId: string) {
    const { tenant, config } = await this.resolve(tenantId);
    return {
      tenant,
      config,
      serverEnv: renderServerEnv(config),
      clientEnv: renderClientEnv(config),
      envExample: renderEnvExample(),
    };
  }

  // ───────────────────────────────────────────── qo'llanmagan o'zgarishlar

  /**
   * Qo'llangan konfiguratsiya surati.
   * Maxfiy qiymat o'rniga barmoq izi yoziladi — sirni ikki joyda saqlamaymiz.
   */
  private snapshot(config: ResolvedConfig): Prisma.JsonObject {
    const mask = (scope: Record<string, string>) => {
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(scope)) {
        const def = getSetting(key);
        const isSecretish =
          def?.type === 'secret' || key === 'HEARTBEAT_SECRET';
        out[key] = isSecretish ? `#${fingerprint(value)}` : value;
      }
      return out;
    };

    return { server: mask(config.server), client: mask(config.client) };
  }

  /** Hozirgi konfiguratsiya bilan oxirgi qo'llangani orasidagi farq. */
  computeDiff(tenant: Tenant, config: ResolvedConfig): ConfigDiffEntry[] {
    const applied = (tenant.appliedConfig as any) || null;
    const current = this.snapshot(config);

    const entries: ConfigDiffEntry[] = [];

    for (const scope of ['server', 'client'] as const) {
      const now = (current[scope] as Record<string, string>) || {};
      const before: Record<string, string> = applied?.[scope] || {};

      const keys = new Set([...Object.keys(now), ...Object.keys(before)]);

      for (const key of keys) {
        const to = now[key] ?? '';
        const from = before[key] ?? '';
        if (to === from) continue;

        const def = getSetting(key);
        const secretish = def?.type === 'secret' || key === 'HEARTBEAT_SECRET';

        entries.push({
          key,
          scope,
          label: def?.label || key,
          // Barmoq izini foydalanuvchiga ko'rsatishning ma'nosi yo'q
          from: secretish ? (from ? '••••' : '') : from,
          to: secretish ? (to ? '••••' : '') : to,
          applies:
            def?.applies ??
            (scope === 'client' ? CLIENT_MANAGED_APPLY : SERVER_MANAGED_APPLY),
        });
      }
    }

    // Hech qachon qo'llanmagan tenantda hamma narsa "yangi" bo'lib chiqadi —
    // bu to'g'ri: birinchi provisioning butun konfiguratsiyani yozadi.
    return entries.sort((a, b) => a.key.localeCompare(b.key));
  }

  /** Kutilayotgan o'zgarishlar uchun kerakli amal. */
  applyModeFor(diff: ConfigDiffEntry[]): ApplyMode {
    return heaviestApplyMode(diff.map((d) => d.applies));
  }

  /** Qo'llash muvaffaqiyatli tugagach suratni yangilaydi. */
  async markApplied(tenantId: string, config: ResolvedConfig, log?: string) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        appliedConfig: this.snapshot(config),
        applyStatus: 'IDLE',
        applyError: null,
        applyLog: log ?? undefined,
        lastAppliedAt: new Date(),
      },
    });
  }

  // ─────────────────────────────────────────────────────────── panel API

  /** Panel uchun: ta'riflar + hozirgi qiymatlar + kutilayotgan farq. */
  async describe(tenantId: string) {
    const { tenant, config } = await this.resolve(tenantId);
    const rows = await this.prisma.tenantSetting.findMany({
      where: { tenantId },
    });
    const overrides = this.decodeOverrides(rows);

    const items = SETTINGS.map((def) => {
      const hasOverride = overrides[def.key] !== undefined;
      const effective = hasOverride ? overrides[def.key] : (def.default ?? '');

      return {
        ...publicDefinition(def),
        // Maxfiy qiymat panelga HECH QACHON ochiq ketmaydi
        value: def.type === 'secret' ? maskSecret(effective) : effective,
        isSet: effective !== '',
        // Standartdan farq qiladimi — UI "o'zgartirilgan" belgisini qo'yadi
        isOverridden: hasOverride && overrides[def.key] !== (def.default ?? ''),
      };
    });

    const diff = this.computeDiff(tenant, config);

    return {
      groups: [...new Set(SETTINGS.map((s) => s.group))],
      items,
      // Boshqariladigan qiymatlar — faqat ko'rish uchun
      managed: {
        PORT: String(tenant.port),
        DATABASE_URL: `…/${tenant.dbName}?schema=public`,
        CLIENT_URL: `https://${tenant.domain}`,
        TENANT_ID: tenant.id,
        // Filial sozlamalari SHU YERDA — "faqat ko'rish" bo'limida.
        // Ular "Sozlamalar" formasida TAHRIRLANMAYDI: chegara savdo
        // qarori va uning o'z bo'limi bor (Filiallar kartasi).
        [BRANCHES_ENABLED_ENV_KEY]: config.server[BRANCHES_ENABLED_ENV_KEY],
        [BRANCH_LIMIT_ENV_KEY]: config.server[BRANCH_LIMIT_ENV_KEY],
      },
      pending: {
        count: diff.length,
        applies: this.applyModeFor(diff),
        entries: diff,
      },
      applyStatus: tenant.applyStatus,
      applyError: tenant.applyError,
      lastAppliedAt: tenant.lastAppliedAt,
      encryptionReady: isEncryptionConfigured(),
    };
  }

  /**
   * Sozlamalarni saqlaydi (qo'llamaydi — buni alohida "Qo'llash" bajaradi).
   *
   * Bo'sh qiymat = "standartga qaytar": yozuv o'chiriladi, shunda registrda
   * standart yangilansa tenant uni avtomatik oladi.
   */
  async update(
    tenantId: string,
    values: Record<string, unknown>,
    updatedBy?: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant topilmadi');
    if (tenant.status === 'DELETED') {
      throw new BadRequestException("O'chirilgan loyiha sozlamasini o'zgartirib bo'lmaydi");
    }

    const unknown = Object.keys(values).filter((k) => !getSetting(k));
    if (unknown.length) {
      throw new BadRequestException(
        `Noma'lum sozlama: ${unknown.join(', ')}`,
      );
    }

    // Avval HAMMASINI tekshiramiz — yarim saqlangan holat qolmasin
    const prepared: Array<{ key: string; value: string; isSecret: boolean }> = [];
    const errors: string[] = [];

    for (const [key, raw] of Object.entries(values)) {
      const def = getSetting(key)!;
      const result = validateSettingValue(def, raw);

      if (!result.ok) {
        errors.push(result.error!);
        continue;
      }

      if (def.type === 'secret' && result.value && !isEncryptionConfigured()) {
        errors.push(
          `${def.label}: shifrlash kaliti sozlanmagan (SETTINGS_ENCRYPTION_KEY) — ` +
            'maxfiy qiymat ochiq saqlanmaydi',
        );
        continue;
      }

      prepared.push({
        key,
        value: result.value,
        isSecret: def.type === 'secret',
      });
    }

    if (errors.length) throw new BadRequestException(errors);

    await this.prisma.$transaction(
      prepared.map((item) => {
        if (item.value === '') {
          // Standartga qaytarish — yozuvni o'chiramiz
          return this.prisma.tenantSetting.deleteMany({
            where: { tenantId, key: item.key },
          });
        }

        const stored = item.isSecret ? encryptSecret(item.value) : item.value;

        return this.prisma.tenantSetting.upsert({
          where: { tenantId_key: { tenantId, key: item.key } },
          create: {
            tenantId,
            key: item.key,
            value: stored,
            isSecret: item.isSecret,
            updatedBy,
          },
          update: { value: stored, isSecret: item.isSecret, updatedBy },
        });
      }),
    );

    // Bot tokeni endi sozlamada — eski ustunni bo'shatamiz, aks holda
    // bitta sir ikki joyda qolib ketadi.
    if (prepared.some((p) => p.key === 'TELEGRAM_BOT_TOKEN') && tenant.botToken) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { botToken: null },
      });
    }

    const { tenant: fresh, config } = await this.resolve(tenantId);
    const diff = this.computeDiff(fresh, config);

    if (diff.length && fresh.applyStatus !== 'APPLYING') {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { applyStatus: 'PENDING' },
      });
    }

    return {
      ok: true,
      pending: {
        count: diff.length,
        applies: this.applyModeFor(diff),
        entries: diff,
      },
    };
  }

  /** Tenant yaratilayotganda boshlang'ich sozlamalarni yozadi. */
  async seedInitial(
    tenantId: string,
    values: Record<string, string>,
    createdBy?: string,
  ) {
    const entries = Object.entries(values).filter(([, v]) => v);
    if (!entries.length) return;

    await this.prisma.tenantSetting.createMany({
      data: entries.map(([key, value]) => {
        const def = getSetting(key);
        const isSecret = def?.type === 'secret';
        return {
          tenantId,
          key,
          value: isSecret ? encryptSecret(value) : value,
          isSecret,
          updatedBy: createdBy,
        };
      }),
      skipDuplicates: true,
    });
  }
}
