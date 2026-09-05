import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Tenant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { GithubService } from '../github/github.service.js';
import {
  renderDeployWorkflow,
  renderGitignore,
  renderReadme,
  renderTenantMeta,
} from './tenant-repo.templates.js';
import { b64, tailLog } from './script-runner.js';
import { ScriptRunnerService } from './script-runner.service.js';
import { DeploymentsService } from './deployments.service.js';
import type { Vps } from '@prisma/client';
import { TenantDbService } from '../tenant-db/tenant-db.service.js';

/** Qo'llash rejimi — reconfigure.sh shu qiymatga qarab ish tutadi. */
export type ApplyKind = 'restart' | 'rebuild' | 'deploy';

@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly github: GithubService,
    private readonly tenantDb: TenantDbService,
    private readonly runner: ScriptRunnerService,
    private readonly deployments: DeploymentsService,
  ) {}

  // ────────────────────────────────────────────────────── yordamchilar

  // b64 / tail / runScript endi `script-runner.ts` da — bot deploy'i ham
  // aynan shularni ishlatadi, nusxa ko'chirilsa tuzatish ikkinchisiga
  // yetib bormasdi.
  private b64 = b64;
  private tail = tailLog;

  /**
   * Tenant fayllari va `.env` mazmunini skript ENV'iga yig'adi.
   * provision.sh ham, reconfigure.sh ham bir xil to'plamni oladi —
   * ikkalasi ham fayllarni bir xil yozishi uchun.
   */
  async buildFileEnv(tenantId: string) {
    const { tenant, config, serverEnv, clientEnv, envExample } =
      await this.settings.renderEnvFiles(tenantId);

    const template = await this.prisma.systemTemplate.findUnique({
      where: { id: tenant.systemTemplateId },
    });

    const adminApiUrl = (process.env.ADMIN_API_PUBLIC_URL || '').replace(/\/+$/, '');

    const fileEnv: Record<string, string> = {
      TENANT_SERVER_ENV_B64: this.b64(serverEnv),
      TENANT_CLIENT_ENV_B64: this.b64(clientEnv),
      TENANT_ENV_EXAMPLE_B64: this.b64(envExample),
      TENANT_GITIGNORE_B64: this.b64(renderGitignore()),
      TENANT_META_B64: this.b64(renderTenantMeta(tenant, template?.key)),
      TENANT_README_B64: this.b64(
        renderReadme({
          tenant,
          templateName: template?.name,
          adminPanelUrl: process.env.ADMIN_CLIENT_URL?.split(',')[0]?.trim(),
        }),
      ),
      TENANT_WORKFLOW_B64: adminApiUrl
        ? this.b64(renderDeployWorkflow({ adminApiUrl, domain: tenant.domain }))
        : '',
    };

    return { tenant, config, template, fileEnv };
  }

  /** Tenant asosiy ma'lumotlari — skriptga har doim kerak. */
  baseEnv(tenant: Tenant, templateDir: string): Record<string, string> {
    return {
      TENANT_DB_NAME: tenant.dbName,
      TENANT_DOMAIN: tenant.domain,
      TENANT_PM2_NAME: tenant.pm2Name,
      TENANT_PORT: String(tenant.port),
      TENANT_NAME: tenant.name,
      TENANT_TEMPLATE_DIR: templateDir,
    };
  }

  // ──────────────────────────────────────────────────────────── GitHub

  /**
   * Tenant uchun GitHub repo tayyorlaydi: repo ochadi, deploy tokenini
   * yaratib secret sifatida yozadi.
   *
   * XATO BO'LSA PROVISIONING TO'XTAMAYDI. Repo — qulaylik, sayt esa
   * mijozning tirikchiligi: GitHub tarafidagi muammo tufayli o'quv markaz
   * ishga tushmay qolishi mumkin emas. Xato `repoError` ga yoziladi va
   * panelda "Repoga qayta urinish" tugmasi paydo bo'ladi.
   */
  private async ensureRepo(tenant: Tenant): Promise<{
    remote: string;
    token: string;
    branch: string;
  } | null> {
    if (!this.github.isConfigured()) {
      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { gitStatus: 'DISABLED', repoError: null },
      });
      return null;
    }

    try {
      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { gitStatus: 'CREATING', repoError: null },
      });

      const repo = await this.github.createRepo({
        dbName: tenant.dbName,
        tenantName: tenant.name,
        domain: tenant.domain,
      });

      // Deploy tokeni bir marta yaratiladi va qayta ishlatiladi — har
      // provisioningda almashtirilsa, repodagi eski secret ishlamay qolardi.
      const deployToken = tenant.deployToken || randomBytes(32).toString('hex');

      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          repoFullName: repo.fullName,
          repoUrl: repo.htmlUrl,
          repoPrivate: repo.private,
          deployToken,
          gitStatus: 'PUSHING',
        },
      });

      // Secret yozilmasa ham repo o'zi foydali — deploy workflow'i
      // ishlamaydi, xolos. Shuning uchun bu qadam alohida ushlanadi.
      try {
        await this.github.setRepoSecret(repo.fullName, 'TENANT_DEPLOY_TOKEN', deployToken);
      } catch (err: any) {
        this.logger.error(`Repo secret yozilmadi (${repo.fullName}): ${err.message}`);
        await this.prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            repoError: `Deploy secret yozilmadi: ${err.message}. Avto-deploy ishlamaydi.`,
          },
        });
      }

      return {
        remote: `https://github.com/${repo.fullName}.git`,
        token: this.github.token,
        branch: repo.defaultBranch || 'main',
      };
    } catch (err: any) {
      this.logger.error(`GitHub repo tayyorlanmadi (${tenant.domain}): ${err.message}`);
      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { gitStatus: 'FAILED', repoError: err.message },
      });
      return null;
    }
  }


  // ────────────────────────────────────────────────────────────── VPS

  /**
   * Tenant turgan VPS (sirlar bilan — skript bajarish uchun). `null` —
   * VPS biriktirilmagan: bunda faqat LOKAL bajarish mumkin va bu eski
   * (migratsiyadan oldingi) xatti-harakat bilan bir xil.
   */
  async vpsOf(tenantId: string): Promise<Vps | null> {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { vps: true },
    });
    return t?.vps ?? null;
  }

  /** Provision uchun VPS SHART: masofaviy deploy'da "qayerga" savoli javobsiz qolmasin. */
  private async requireVps(tenantId: string): Promise<Vps> {
    const vps = await this.vpsOf(tenantId);
    if (!vps) throw new BadRequestException("Tenant hech qaysi VPS'ga biriktirilmagan — avval VPS tanlang");
    if (!vps.isActive) throw new BadRequestException(`VPS "${vps.name}" deaktivatsiya qilingan`);
    return vps;
  }

  // ─────────────────────────────────────────────────────── provisioning

  /**
   * Yangi tenantni to'liq ishga tushiradi (fon rejimida).
   * Holat DB'da yangilanadi — panel uni 3 soniyada bir so'rab turadi.
   */
  async provision(tenantId: string, owner?: ProvisionOwner, startedBy?: string | null): Promise<void> {
    // VPS — deploy'dan OLDIN hal bo'lishi shart. Xato bo'lsa holat
    // o'zgarmaydi (tenant DRAFT/FAILED da qoladi, panel sababini ko'radi).
    const vps = await this.requireVps(tenantId);
    if (await this.deployments.running(tenantId)) {
      throw new ConflictException('Bu tenantda boshqa deploy ishlayapti — tugashini kuting');
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: 'PROVISIONING',
        failureReason: null,
        provisionLog: '',
        applyStatus: 'APPLYING',
      },
    });

    const handle = await this.deployments.start({ tenantId, vpsId: vps.id, kind: 'PROVISION', startedBy });

    const { tenant, config, template, fileEnv } = await this.buildFileEnv(tenantId);

    if (!template) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'FAILED', failureReason: 'Tizim shabloni topilmadi' },
      });
      await handle.fail('Tizim shabloni topilmadi');
      return;
    }

    const git = await this.ensureRepo(tenant);

    this.logger.log(
      `Provisioning boshlandi: ${tenant.domain} (db=${tenant.dbName}, port=${tenant.port}) → VPS ${vps.name} (${vps.host})`,
    );
    handle.log(`==> VPS: ${vps.name} (${vps.isLocal ? 'lokal' : `${vps.sshUser}@${vps.host}:${vps.sshPort}`})\n`);

    const { code, log } = await this.runner.run(vps, 'provision.sh', {
      ...this.baseEnv(tenant, template.templateDir),
      ...fileEnv,
      GIT_ENABLED: git ? 'true' : 'false',
      GIT_REMOTE: git?.remote || '',
      GIT_TOKEN: git?.token || '',
      GIT_BRANCH: git?.branch || 'main',
    }, handle.log);

    // DNS uchun IP — VPS host'i. `SERVER_PUBLIC_IP` faqat lokal VPS host'i
    // 127.0.0.1 bo'lib qolgan eski o'rnatma uchun zaxira.
    const serverIp = vps.isLocal ? (process.env.SERVER_PUBLIC_IP || vps.host) : vps.host;

    if (code === 0) {
      // ── EGA HISOBI ──
      //
      // ⚠ NEGA AYNAN SHU YERDA: `users` jadvali provisioning'dan OLDIN
      // MAVJUD EMAS — baza `provision.sh` ichida yaratiladi va migratsiyalar
      // ham o'sha yerda yuriladi. Ya'ni yozish faqat skript muvaffaqiyatli
      // tugagandan keyin mumkin.
      //
      // ⚠ NEGA `provision.sh` GA ENV ORQALI UZATILMAYDI: parol shell
      // muhitiga tushsa `ps` da ko'rinardi. `.env` fayllari base64 bilan
      // uzatilgani ham aynan shu sabab.
      if (owner) {
        try {
          await this.tenantDb.createOwner({ dbName: tenant.dbName, serverIp, vps }, owner);
          this.logger.log(`Ega hisobi yaratildi: ${owner.username}@${tenant.domain}`);
        } catch (err) {
          // Kirib bo'lmaydigan loyiha ACTIVE deb ko'rsatilmasligi kerak:
          // mijoz ishlaydigan domen oladi-yu, unga kira olmaydi va buni
          // hech kim sezmaydi.
          await this.prisma.tenant.update({
            where: { id: tenantId },
            data: {
              status: 'FAILED',
              provisionLog: this.tail(log),
              serverIp,
              failureReason: `Ega hisobi yaratilmadi: ${(err as Error).message}`,
              applyStatus: 'FAILED',
              applyError: 'Ega hisobi yaratilmadi',
            },
          });
          this.logger.error(
            `Provisioning tugadi, lekin ega yaratilmadi: ${tenant.domain} ❌`,
          );
          await handle.fail(`Ega hisobi yaratilmadi: ${(err as Error).message}`);
          return;
        }
      }

      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'ACTIVE', provisionLog: this.tail(log), serverIp },
      });
      // Qo'llangan konfiguratsiya surati — endi farq hisoblanadigan nuqta shu
      await this.settings.markApplied(tenantId, config);
      await this.markGitResult(tenantId, log, git !== null);
      await handle.finish({ code });
      this.logger.log(`Provisioning tugadi: ${tenant.domain} ✅`);
    } else {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          status: 'FAILED',
          provisionLog: this.tail(log),
          failureReason: `provision.sh xato kodi bilan tugadi: ${code}`,
          applyStatus: 'FAILED',
          applyError: `Provisioning yiqildi (kod ${code})`,
        },
      });
      await handle.finish({ code });
      this.logger.error(`Provisioning muvaffaqiyatsiz: ${tenant.domain} ❌`);
    }
  }

  /**
   * Skript chiqishidan push muvaffaqiyatli bo'lganini aniqlaydi.
   * Skript maxsus belgi chiqaradi — chiqishni "taxminan" o'qishdan ko'ra
   * ishonchli.
   */
  private async markGitResult(tenantId: string, log: string, gitEnabled: boolean) {
    if (!gitEnabled) return;

    const pushed = log.includes('GIT_PUSH_OK');
    const failed = log.includes('GIT_PUSH_FAILED');

    if (pushed) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          gitStatus: 'SYNCED',
          lastPushedAt: new Date(),
          repoError: null,
          gitLog: this.tail(log),
        },
      });
    } else if (failed) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          gitStatus: 'FAILED',
          repoError: "Kod GitHub'ga yuborilmadi — logni tekshiring",
          gitLog: this.tail(log),
        },
      });
    }
  }

  // ───────────────────────────────────────────────── sozlamani qo'llash

  /**
   * Saqlangan sozlamalarni tenantga yetkazadi.
   *
   *   restart — server .env qayta yoziladi + pm2 restart
   *   rebuild — yuqoridagi + client .env va qayta build
   *   deploy  — repodan kod tortiladi, keyin to'liq rebuild
   */
  async applyConfig(tenantId: string, kind: ApplyKind, startedBy?: string | null): Promise<void> {
    const vps = await this.vpsOf(tenantId);
    if (await this.deployments.running(tenantId)) {
      throw new ConflictException('Bu tenantda boshqa deploy ishlayapti — tugashini kuting');
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { applyStatus: 'APPLYING', applyError: null, applyLog: '' },
    });

    const KIND = { restart: 'RESTART', rebuild: 'REBUILD', deploy: 'DEPLOY' } as const;
    const handle = await this.deployments.start({ tenantId, vpsId: vps?.id, kind: KIND[kind], startedBy });

    const { tenant, config, template, fileEnv } = await this.buildFileEnv(tenantId);

    this.logger.log(`Qo'llash boshlandi (${kind}): ${tenant.domain}`);

    // `deploy` rejimida kod repodan tortiladi — remote va token kerak
    const needsGit = kind === 'deploy';
    const gitToken = needsGit && this.github.isConfigured() ? this.github.token : '';

    const { code, log } = await this.runner.run(vps, 'reconfigure.sh', {
      ...this.baseEnv(tenant, template?.templateDir || ''),
      ...fileEnv,
      APPLY_MODE: kind,
      GIT_ENABLED: tenant.repoFullName ? 'true' : 'false',
      GIT_REMOTE: tenant.repoFullName
        ? `https://github.com/${tenant.repoFullName}.git`
        : '',
      GIT_TOKEN: gitToken,
      GIT_BRANCH: 'main',
    }, handle.log);

    if (code === 0) {
      await this.settings.markApplied(tenantId, config, this.tail(log));
      await this.markGitResult(tenantId, log, Boolean(tenant.repoFullName));
      this.logger.log(`Qo'llash tugadi: ${tenant.domain} ✅`);
    } else {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          applyStatus: 'FAILED',
          applyLog: this.tail(log),
          applyError: `reconfigure.sh xato kodi bilan tugadi: ${code}`,
        },
      });
      this.logger.error(`Qo'llash muvaffaqiyatsiz: ${tenant.domain} ❌`);
    }
    await handle.finish({ code });
  }

  /**
   * Kodni GitHub'ga qayta yuboradi (sozlamaga tegmasdan).
   * Repo keyinroq ulangan yoki push yiqilgan holatlar uchun.
   */
  async pushToRepo(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return;

    const git = await this.ensureRepo(tenant);
    if (!git) return;

    const { template, fileEnv } = await this.buildFileEnv(tenantId);
    const vps = await this.vpsOf(tenantId);
    const handle = await this.deployments.start({ tenantId, vpsId: vps?.id, kind: 'PUSH' });

    const { code, log } = await this.runner.run(vps, 'reconfigure.sh', {
      ...this.baseEnv(tenant, template?.templateDir || ''),
      ...fileEnv,
      APPLY_MODE: 'push',
      GIT_ENABLED: 'true',
      GIT_REMOTE: git.remote,
      GIT_TOKEN: git.token,
      GIT_BRANCH: git.branch,
    }, handle.log);

    await handle.finish({ code });
    await this.markGitResult(tenantId, log, true);

    if (code !== 0) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          gitStatus: 'FAILED',
          repoError: `Push skripti xato kodi bilan tugadi: ${code}`,
          gitLog: this.tail(log),
        },
      });
    }
  }

  // ────────────────────────────────────────── to'xtatish / qayta yoqish

  /**
   * Tenantni to'xtatadi — pm2 jarayoni o'chadi (obuna tugagan holat).
   *
   * O'CHIRISH EMAS: papka, PostgreSQL bazasi, yuklangan fayllar, nginx vhost va
   * sertifikat joyida qoladi. Shuning uchun to'lov kelgach `resume` bir
   * soniyada hammasini qaytaradi va mijoz hech narsa yo'qotmaydi.
   *
   * Skript yiqilsa status O'ZGARTIRILMAYDI: pm2 to'xtamagan bo'lsa server
   * hali ishlayapti, uni "SUSPENDED" deb belgilash panelda yolg'on holat
   * ko'rsatardi. Xato logga yoziladi va keyingi tekshiruvda qayta uriniladi.
   */
  async suspend(tenantId: string, reason: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) return false;

    this.logger.warn(`To'xtatilmoqda: ${tenant.domain} — ${reason}`);

    const vps = await this.vpsOf(tenantId);
    const handle = await this.deployments.start({
      tenantId, vpsId: vps?.id, kind: 'SUSPEND', meta: { reason },
    });

    const { code, log } = await this.runner.run(vps, 'reconfigure.sh', {
      ...this.baseEnv(tenant, ''),
      APPLY_MODE: 'suspend',
      SUSPEND_REASON: reason,
    }, handle.log);
    await handle.finish({ code });

    if (code === 0) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          status: 'SUSPENDED',
          suspendedAt: new Date(),
          suspendReason: reason,
          suspendLog: this.tail(log),
        },
      });
      this.logger.warn(`To'xtatildi: ${tenant.domain} ⏸`);
      return true;
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        suspendLog: this.tail(log),
        failureReason: `To'xtatib bo'lmadi (kod ${code}) — pm2 hali ishlayotgan bo'lishi mumkin`,
      },
    });
    this.logger.error(`To'xtatish muvaffaqiyatsiz: ${tenant.domain} (kod ${code})`);
    return false;
  }

  /** To'xtatilgan tenantni qaytaradi (to'lov keldi yoki sinov berildi). */
  async resume(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) return false;

    this.logger.log(`Qayta yoqilmoqda: ${tenant.domain}`);

    const vps = await this.vpsOf(tenantId);
    const handle = await this.deployments.start({ tenantId, vpsId: vps?.id, kind: 'RESUME' });

    const { code, log } = await this.runner.run(vps, 'reconfigure.sh', {
      ...this.baseEnv(tenant, ''),
      APPLY_MODE: 'resume',
    }, handle.log);
    await handle.finish({ code });

    if (code === 0) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          status: 'ACTIVE',
          suspendedAt: null,
          suspendReason: null,
          suspendLog: this.tail(log),
          failureReason: null,
        },
      });
      this.logger.log(`Qayta yoqildi: ${tenant.domain} ▶️`);
      return true;
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        suspendLog: this.tail(log),
        failureReason: `Qayta yoqib bo'lmadi (kod ${code}) — logni tekshiring`,
      },
    });
    this.logger.error(`Qayta yoqish muvaffaqiyatsiz: ${tenant.domain} (kod ${code})`);
    return false;
  }

  // ──────────────────────────────────────────────────── deprovisioning

  /**
   * Tenantni VPS'dan o'chiradi. Skript qisman yiqilsa ham tenant DELETED
   * bo'ladi: resurslarning bir qismi allaqachon o'chirilgan, FAILED qilib
   * qo'ysak yozuv "tirik" ko'rinadi va qayta o'chirish chalkashlik beradi.
   */
  async deprovision(input: {
    tenantId: string;
    dbName: string;
    domain: string;
    pm2Name: string;
    repoFullName?: string | null;
  }): Promise<void> {
    await this.prisma.tenant.update({
      where: { id: input.tenantId },
      data: { status: 'DEPROVISIONING', failureReason: null, deprovisionLog: '' },
    });

    this.logger.warn(`Deprovisioning boshlandi: ${input.domain} (db=${input.dbName})`);

    // ⚠ VPS `input` dan EMAS, bazadan: o'chirish HOZIR tenant turgan
    // mashinada bajarilishi shart. Chaqiruvchi eski nusxani uzatib
    // yuborsa, boshqa serverdagi tirik tenant o'chib ketardi.
    const vps = await this.vpsOf(input.tenantId);
    const handle = await this.deployments.start({
      tenantId: input.tenantId, vpsId: vps?.id, kind: 'DEPROVISION',
    });

    const { code, log } = await this.runner.run(vps, 'deprovision.sh', {
      TENANT_DB_NAME: input.dbName,
      TENANT_DOMAIN: input.domain,
      TENANT_PM2_NAME: input.pm2Name,
    }, handle.log);
    await handle.finish({ code });

    let repoNote = '';

    // Repo ATAYLAB oxirida va alohida ushlanadi: mijoz kodi va tarixi
    // VPS tozalanishi bilan birga yo'qolib ketmasligi kerak.
    if (input.repoFullName && this.github.isConfigured()) {
      try {
        const action = await this.github.disposeRepo(input.repoFullName);
        repoNote =
          action === 'deleted'
            ? `\n==> 🗑  GitHub repo o'chirildi: ${input.repoFullName}`
            : `\n==> 📦 GitHub repo arxivlandi (saqlanib qoldi): ${input.repoFullName}`;
      } catch (err: any) {
        repoNote = `\n==> ⚠️  GitHub repoga tegib bo'lmadi (${input.repoFullName}): ${err.message}`;
      }
    }

    await this.prisma.tenant.update({
      where: { id: input.tenantId },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        deprovisionLog: this.tail(log + repoNote),
        deployToken: null, // token endi ishlamasin
        failureReason:
          code === 0
            ? null
            : `deprovision.sh qisman bajarildi (kod ${code}) — logni tekshiring`,
      },
    });

    if (code === 0) {
      this.logger.warn(`Deprovisioning tugadi: ${input.domain} 🗑`);
    } else {
      this.logger.error(`Deprovisioning qisman bajarildi: ${input.domain} (kod ${code})`);
    }
  }
}

/**
 * Provisioning tugagach yaratiladigan ega hisobi.
 *
 * ⚠ Faqat XOTIRADA yuradi: admin bazasiga hech qachon yozilmaydi. Parol
 * tenant bazasida yashaydi va panel uni o'sha yerdan o'qiydi.
 */
export interface ProvisionOwner {
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
}
