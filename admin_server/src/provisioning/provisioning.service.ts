import { Injectable, Logger } from '@nestjs/common';
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
import { b64, runScript, tailLog } from './script-runner.js';

/** Qo'llash rejimi — reconfigure.sh shu qiymatga qarab ish tutadi. */
export type ApplyKind = 'restart' | 'rebuild' | 'deploy';

@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly github: GithubService,
  ) {}

  // ────────────────────────────────────────────────────── yordamchilar

  // b64 / tail / runScript endi `script-runner.ts` da — bot deploy'i ham
  // aynan shularni ishlatadi, nusxa ko'chirilsa tuzatish ikkinchisiga
  // yetib bormasdi.
  private b64 = b64;
  private tail = tailLog;
  private runScript = runScript;

  /**
   * Tenant fayllari va `.env` mazmunini skript ENV'iga yig'adi.
   * provision.sh ham, reconfigure.sh ham bir xil to'plamni oladi —
   * ikkalasi ham fayllarni bir xil yozishi uchun.
   */
  private async buildFileEnv(tenantId: string) {
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
  private baseEnv(tenant: Tenant, templateDir: string): Record<string, string> {
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

  // ─────────────────────────────────────────────────────── provisioning

  /**
   * Yangi tenantni to'liq ishga tushiradi (fon rejimida).
   * Holat DB'da yangilanadi — panel uni 3 soniyada bir so'rab turadi.
   */
  async provision(tenantId: string): Promise<void> {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: 'PROVISIONING',
        failureReason: null,
        provisionLog: '',
        applyStatus: 'APPLYING',
      },
    });

    const { tenant, config, template, fileEnv } = await this.buildFileEnv(tenantId);

    if (!template) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'FAILED', failureReason: 'Tizim shabloni topilmadi' },
      });
      return;
    }

    const git = await this.ensureRepo(tenant);

    const scriptPath = process.env.PROVISION_SCRIPT || '/root/admin/provision.sh';

    this.logger.log(
      `Provisioning boshlandi: ${tenant.domain} (db=${tenant.dbName}, port=${tenant.port})`,
    );

    const { code, log } = await this.runScript(scriptPath, {
      ...this.baseEnv(tenant, template.templateDir),
      ...fileEnv,
      GIT_ENABLED: git ? 'true' : 'false',
      GIT_REMOTE: git?.remote || '',
      GIT_TOKEN: git?.token || '',
      GIT_BRANCH: git?.branch || 'main',
    });

    const serverIp = process.env.SERVER_PUBLIC_IP || null;

    if (code === 0) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'ACTIVE', provisionLog: this.tail(log), serverIp },
      });
      // Qo'llangan konfiguratsiya surati — endi farq hisoblanadigan nuqta shu
      await this.settings.markApplied(tenantId, config);
      await this.markGitResult(tenantId, log, git !== null);
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
  async applyConfig(tenantId: string, kind: ApplyKind): Promise<void> {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { applyStatus: 'APPLYING', applyError: null, applyLog: '' },
    });

    const { tenant, config, template, fileEnv } = await this.buildFileEnv(tenantId);

    const scriptPath = process.env.RECONFIGURE_SCRIPT || '/root/admin/reconfigure.sh';

    this.logger.log(`Qo'llash boshlandi (${kind}): ${tenant.domain}`);

    // `deploy` rejimida kod repodan tortiladi — remote va token kerak
    const needsGit = kind === 'deploy';
    const gitToken = needsGit && this.github.isConfigured() ? this.github.token : '';

    const { code, log } = await this.runScript(scriptPath, {
      ...this.baseEnv(tenant, template?.templateDir || ''),
      ...fileEnv,
      APPLY_MODE: kind,
      GIT_ENABLED: tenant.repoFullName ? 'true' : 'false',
      GIT_REMOTE: tenant.repoFullName
        ? `https://github.com/${tenant.repoFullName}.git`
        : '',
      GIT_TOKEN: gitToken,
      GIT_BRANCH: 'main',
    });

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

    const scriptPath = process.env.RECONFIGURE_SCRIPT || '/root/admin/reconfigure.sh';

    const { code, log } = await this.runScript(scriptPath, {
      ...this.baseEnv(tenant, template?.templateDir || ''),
      ...fileEnv,
      APPLY_MODE: 'push',
      GIT_ENABLED: 'true',
      GIT_REMOTE: git.remote,
      GIT_TOKEN: git.token,
      GIT_BRANCH: git.branch,
    });

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
   * O'CHIRISH EMAS: papka, MongoDB bazasi, yuklangan fayllar, nginx vhost va
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

    const scriptPath = process.env.RECONFIGURE_SCRIPT || '/root/admin/reconfigure.sh';

    this.logger.warn(`To'xtatilmoqda: ${tenant.domain} — ${reason}`);

    const { code, log } = await this.runScript(scriptPath, {
      ...this.baseEnv(tenant, ''),
      APPLY_MODE: 'suspend',
      SUSPEND_REASON: reason,
    });

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

    const scriptPath = process.env.RECONFIGURE_SCRIPT || '/root/admin/reconfigure.sh';

    this.logger.log(`Qayta yoqilmoqda: ${tenant.domain}`);

    const { code, log } = await this.runScript(scriptPath, {
      ...this.baseEnv(tenant, ''),
      APPLY_MODE: 'resume',
    });

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

    const scriptPath = process.env.DEPROVISION_SCRIPT || '/root/admin/deprovision.sh';

    this.logger.warn(`Deprovisioning boshlandi: ${input.domain} (db=${input.dbName})`);

    const { code, log } = await this.runScript(scriptPath, {
      TENANT_DB_NAME: input.dbName,
      TENANT_DOMAIN: input.domain,
      TENANT_PM2_NAME: input.pm2Name,
    });

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
