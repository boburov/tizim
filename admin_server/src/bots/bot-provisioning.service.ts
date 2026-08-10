import { Injectable, Logger } from '@nestjs/common';
import { Bot, BotTemplate } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { GithubService } from '../github/github.service.js';
import { b64, runScript, tailLog } from '../provisioning/script-runner.js';
import { decryptSecret } from '../common/crypto/secrets.util.js';

/**
 * Botni VPS'ga chiqaradigan qatlam — `ProvisioningService` ning bot uchun
 * ko'zgusi: skriptni ENV bilan chaqiradi, natijaga qarab holatni yangilaydi.
 *
 * Hamma metodlar FON rejimida ishlaydi (`void` qaytaradi va kutilmaydi):
 * deploy bir necha daqiqa davom etishi mumkin, HTTP so'rov esa darhol
 * javob berishi kerak. Panel holatni so'rab turadi.
 */
@Injectable()
export class BotProvisioningService {
  private readonly logger = new Logger(BotProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubService,
  ) {}

  /** Webhook manzili — wildcard subdomen ostida. */
  webhookUrlFor(slug: string): string | null {
    const base = (process.env.BOTS_BASE_DOMAIN || '').replace(/^\.+|\.+$/g, '');
    return base ? `https://${slug}.${base}/hook` : null;
  }

  /**
   * Botning `.env` mazmunini yig'adi.
   *
   * BOT_TOKEN shu yerda ochiladi (bazada shifrlangan turadi) va skriptga
   * base64 ichida ketadi — buyruq qatorida ko'rinmaydi, ya'ni VPS'dagi
   * `ps` chiqishiga tushmaydi.
   */
  private buildEnvFile(bot: Bot & { env: { key: string; value: string; isSecret: boolean }[] }): string {
    const lines: string[] = [
      '# Bu fayl admin panel tomonidan yaratilgan — qo\'lda tahrirlash foydasiz,',
      '# keyingi deploy ustidan yozadi.',
      '',
      `BOT_TOKEN=${decryptSecret(bot.tokenEnc)}`,
      `BOT_MODE=${bot.mode}`,
    ];

    if (bot.mode === 'WEBHOOK') {
      const url = bot.webhookUrl || this.webhookUrlFor(bot.slug);
      if (url) lines.push(`WEBHOOK_URL=${url}`);
      if (bot.webhookSecret) lines.push(`WEBHOOK_SECRET=${bot.webhookSecret}`);
      if (bot.port) lines.push(`PORT=${bot.port}`);
    }

    for (const item of bot.env) {
      const value = item.isSecret ? decryptSecret(item.value) : item.value;
      lines.push(`${item.key}=${value}`);
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Private repo uchun URL ichiga GitHub tokenini qo'yadi.
   *
   * Token faqat ENV orqali skriptga beriladi va o'sha yerda URL'ga
   * qo'shiladi — bu yerda emas, chunki to'liq URL logga tushib qolishi
   * mumkin va u holda token logda ochiq yotardi.
   */
  private gitToken(): string {
    return this.github.isConfigured() ? this.github.token : '';
  }

  private baseEnv(
    bot: Bot & { env: any[]; template: BotTemplate | null },
  ): Record<string, string> {
    const env: Record<string, string> = {
      BOT_SLUG: bot.slug,
      BOT_NAME: bot.name,
      BOT_RUNTIME: bot.runtime,
      BOT_MODE: bot.mode,
      BOT_SOURCE: bot.source,
      BOT_PM2_NAME: bot.pm2Name,
      BOT_ENV_B64: b64(this.buildEnvFile(bot)),
      // Skript setWebhook/deleteWebhook uchun ishlatadi.
      BOT_TOKEN: decryptSecret(bot.tokenEnc),
    };

    if (bot.source === 'REPO') {
      env.BOT_REPO_URL = bot.repoUrl || '';
      env.BOT_REPO_BRANCH = bot.repoBranch || 'main';
      env.GIT_TOKEN = this.gitToken();
    } else {
      env.BOT_TEMPLATE_DIR = bot.template?.templateDir || '';
      env.BOT_ENTRY_FILE = bot.template?.entryFile || '';
    }

    if (bot.mode === 'WEBHOOK') {
      env.BOT_WEBHOOK_URL = bot.webhookUrl || '';
      env.BOT_WEBHOOK_SECRET = bot.webhookSecret || '';
      env.BOT_PORT = bot.port ? String(bot.port) : '';
    }

    return env;
  }

  private async load(botId: string) {
    return this.prisma.bot.findUnique({
      where: { id: botId },
      include: { env: true, template: true },
    });
  }

  /**
   * Botni deploy qiladi (birinchi marta ham, qayta ham — skript ikkalasini
   * ham uddalaydi: papka bo'lsa `git reset`, bo'lmasa `clone`).
   */
  async deploy(botId: string): Promise<void> {
    const bot = await this.load(botId);
    if (!bot) return;

    await this.prisma.bot.update({
      where: { id: botId },
      data: { status: 'PROVISIONING', failureReason: null, deployLog: '' },
    });

    const scriptPath =
      process.env.BOT_PROVISION_SCRIPT || '/root/admin/bot-provision.sh';

    this.logger.log(`Bot deploy boshlandi: ${bot.slug} (${bot.runtime}/${bot.mode})`);

    const { code, log } = await runScript(scriptPath, this.baseEnv(bot));

    if (code === 0) {
      await this.prisma.bot.update({
        where: { id: botId },
        data: {
          status: 'ACTIVE',
          deployLog: tailLog(log),
          failureReason: null,
          lastDeployedAt: new Date(),
        },
      });
      this.logger.log(`Bot deploy tugadi: ${bot.slug} ✅`);
    } else {
      await this.prisma.bot.update({
        where: { id: botId },
        data: {
          status: 'FAILED',
          deployLog: tailLog(log),
          failureReason:
            code === -1
              ? `Skript ishga tushmadi (${scriptPath} mavjudmi?)`
              : `bot-provision.sh xato kodi bilan tugadi: ${code}`,
        },
      });
      this.logger.error(`Bot deploy yiqildi: ${bot.slug} (kod ${code})`);
    }
  }

  /**
   * Botni VPS'dan butunlay o'chiradi.
   *
   * Skript yiqilsa ham yozuv `DELETED` ga o'tadi: aks holda panelda
   * o'chirib bo'lmaydigan yozuv qolib ketardi. Xato sababi `failureReason`
   * da saqlanadi, qoldiqlarni qo'lda tozalash mumkin.
   */
  async deprovision(botId: string): Promise<void> {
    const bot = await this.load(botId);
    if (!bot) return;

    await this.prisma.bot.update({
      where: { id: botId },
      data: { status: 'DEPROVISIONING' },
    });

    const scriptPath =
      process.env.BOT_DEPROVISION_SCRIPT || '/root/admin/bot-deprovision.sh';

    const { code, log } = await runScript(scriptPath, {
      BOT_SLUG: bot.slug,
      BOT_RUNTIME: bot.runtime,
      BOT_MODE: bot.mode,
      BOT_PM2_NAME: bot.pm2Name,
      BOT_TOKEN: decryptSecret(bot.tokenEnc),
      BOT_DOMAIN: bot.webhookUrl ? new URL(bot.webhookUrl).hostname : '',
    });

    await this.prisma.bot.update({
      where: { id: botId },
      data: {
        status: 'DELETED',
        deployLog: tailLog(log),
        failureReason:
          code === 0 ? null : `O'chirishda xato (kod ${code}) — qoldiqlarni tekshiring`,
      },
    });
  }

  /**
   * pm2 orqali to'xtatish/ishga tushirish yoki webhook'ni olib qo'yish.
   * Kichik amallar, alohida skript kerak emas — bir qatorlik buyruq.
   */
  async control(botId: string, action: 'stop' | 'start'): Promise<void> {
    const bot = await this.load(botId);
    if (!bot) return;

    const scriptPath =
      process.env.BOT_PROVISION_SCRIPT || '/root/admin/bot-provision.sh';

    const { code, log } = await runScript(scriptPath, {
      ...this.baseEnv(bot),
      BOT_ACTION: action, // skript shu bayroqni ko'rib faqat shu amalni bajaradi
    });

    await this.prisma.bot.update({
      where: { id: botId },
      data: {
        status: code === 0 ? (action === 'stop' ? 'STOPPED' : 'ACTIVE') : 'FAILED',
        deployLog: tailLog(log),
        failureReason: code === 0 ? null : `${action} bajarilmadi (kod ${code})`,
      },
    });
  }

  /**
   * Ishlab turgan botning logi (deploy logi emas — u DB'da yotadi).
   *
   * Alohida skript yaratilmadi: `bot-provision.sh` `BOT_ACTION=logs` bilan
   * chaqirilganda faqat logni chiqaradi. Uchinchi fayl ikkita joyda bir xil
   * yo'llarni (pm2 nomi, nginx log yo'li) takrorlashga majbur qilardi.
   */
  async logs(botId: string, lines: number): Promise<string> {
    const bot = await this.load(botId);
    if (!bot) return '';

    const scriptPath =
      process.env.BOT_PROVISION_SCRIPT || '/root/admin/bot-provision.sh';

    const { log } = await runScript(scriptPath, {
      ...this.baseEnv(bot),
      BOT_ACTION: 'logs',
      BOT_LOG_LINES: String(lines),
    });

    return log.trim() || "Log bo'sh.";
  }
}
