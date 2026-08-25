import {
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramBotService } from './telegram-bot.service.js';
import { BotPollLockService } from './bot-poll-lock.service.js';
import { BotUserService } from './bot-user.service.js';
import { NotificationDeliverService } from './notification-deliver.service.js';
import { AssignmentDeliverService } from './assignment-deliver.service.js';
import { registerHandlers } from './bot.router.js';
import type { AppConfig } from '../config/env.validation.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BOT HAYOT SIKLI — `server/src/bot/index.js` KO'CHIRMASI.
 *
 * ── ⚠ IKKI POLLERGA QARSHI UCH QATLAM ──
 *
 * 1. `TELEGRAM_BOT_ENABLED` — bot umuman yoqilganmi (Express bilan
 *    umumiy sozlama);
 * 2. `NEST_BOT_POLLING` (standart `false`) — polling'ni AYNAN SHU
 *    jarayon boshlasinmi. NestJS uchun YANGI bayroq: Express'da bunday
 *    tanlov yo'q, chunki u yagona ilova edi;
 * 3. `bot_locks` jadvalidagi `poller` qulfi — Express bilan BIR XIL
 *    id va TTL, ya'ni ikkinchi jarayon qulfni OLA OLMAYDI.
 *
 * 2-qatlam bo'lmasa 3-qatlamning fail-open xulqi (baza xatosida
 * `true`) ikki pollerga yo'l ochib qo'yishi mumkin edi. Shuning uchun
 * ular BIRGA ishlaydi va biri ikkinchisini almashtirmaydi.
 *
 * ── NUSXA HAR DOIM YARATILADI ──
 *
 * Polling o'chiq bo'lsa ham `createBot()` chaqiriladi: xabar YUBORISH
 * polling talab qilmaydi va yetkazish servislari (`deliverToChat`)
 * nusxasiz `bot-not-running` qaytarardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class BotLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Bot');
  private polling = false;
  private handlers: { dispose: () => void } | null = null;
  /** Qulf band bo'lganda davriy qayta urinish taymeri. */
  private acquireRetry: NodeJS.Timeout | null = null;

  constructor(
    private readonly bots: TelegramBotService,
    private readonly lock: BotPollLockService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  isPolling(): boolean {
    return this.polling;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get('TELEGRAM_BOT_ENABLED', { infer: true })) {
      this.logger.log("Telegram bot o'chirilgan (TELEGRAM_BOT_ENABLED=false)");
      return;
    }
    this.bots.warnIfMisconfigured();
    if (!this.bots.isConfigured()) return;

    const bot = this.bots.create();
    if (!bot) return;

    // Handler'lar HAR DOIM ro'yxatga olinadi: polling boshlanmasa ular
    // shunchaki hech qachon chaqirilmaydi. Shartli ro'yxatga olish
    // "polling yoqildi, lekin buyruqlar javob bermaydi" holatini
    // yaratish xavfini tug'dirardi.
    this.handlers = registerHandlers(bot, {
      appName: this.bots.appName(),
      webAppUrl: this.bots.webAppUrl(),
      // ⚠ 401 da polling TO'XTATILADI: token yaroqsiz bo'lsa har 300 ms
      // da bir marta rad etilgan so'rov ketardi va qulf boshqa (balki
      // to'g'ri sozlangan) nusxaga ham berilmasdi.
      onFatal: (reason) => void this.stopPolling(reason),
    });

    if (!this.config.get('NEST_BOT_POLLING', { infer: true })) {
      this.logger.log(
        "Bot faqat YUBORISH rejimida (NEST_BOT_POLLING=false) — " +
          "buyruqlarni Express qabul qiladi",
      );
      return;
    }

    // ⚠ Bu yerga yetib kelish — ONGLI qaror. Qulf oxirgi to'siq.
    const canPoll = await this.lock.acquire();
    if (!canPoll) {
      // ⚠ RESTART POYGASI: deploy/qayta ishga tushishda eski jarayon
      // qulfni hali bo'shatib ulgurmagan (yoki TTL hali o'tmagan) bo'lishi
      // mumkin. Ilgari bu instans ABADIY "faqat yuborish" rejimida qolardi
      // va HECH KIM polling qilmasdi — Express olib tashlangач bu bot'ni
      // har deploy'da o'lik qilardi. Endi davriy qayta urinamiz: qulf
      // muddati o'tishi (≤90s) bilan acquire() atomik ravishda uni oladi.
      this.logger.log(
        "Qulf band — davriy qayta urinish yoqildi (hozircha faqat yuborish rejimi)",
      );
      this.scheduleAcquireRetry();
      return;
    }

    await this.beginPolling();
  }

  /** Polling'ni boshlaydi. Qulf ALLAQACHON olingan deb faraz qiladi. */
  private async beginPolling(): Promise<void> {
    const bot = this.bots.get();
    if (!bot || this.polling) return;

    await bot.startPolling({ restart: true });
    this.lock.startHeartbeat();
    this.polling = true;

    const me = await bot.getMe();
    this.logger.warn(
      `⚠ Telegram polling'ni NestJS ushladi (@${me.username}) — ` +
        "Express'da bot to'xtatilganiga ishonch hosil qiling",
    );

    await bot.setMyCommands([
      { command: 'start', description: 'Botni ishga tushirish' },
      { command: 'help', description: 'Yordam' },
    ]);
  }

  /**
   * Qulf band bo'lganda davriy qayta urinish (heartbeat bilan bir xil
   * ritm — TTL/3 = 30s). acquire() ATOMIK: faqat qulf muddati o'tgan yoki
   * bizniki bo'lsa muvaffaqiyat qaytaradi, shu bois IKKI POLLER xavfi yo'q.
   */
  private scheduleAcquireRetry(): void {
    if (this.acquireRetry) return;
    this.acquireRetry = setInterval(() => {
      void (async () => {
        if (this.polling) return;
        const ok = await this.lock.acquire().catch(() => false);
        if (!ok) return;
        this.clearAcquireRetry();
        await this.beginPolling().catch((err) =>
          this.logger.warn(`Polling'ni boshlashda xato: ${String(err)}`),
        );
      })();
    }, 30 * 1000);
    // Taymer jarayonni tirik ushlab turmasin.
    this.acquireRetry.unref?.();
  }

  private clearAcquireRetry(): void {
    if (this.acquireRetry) {
      clearInterval(this.acquireRetry);
      this.acquireRetry = null;
    }
  }

  /**
   * Polling'ni to'xtatadi va qulfni bo'shatadi — jarayonni O'LDIRMAY.
   *
   * ⚠ Nusxa TIRIK QOLADI: xabar YUBORISH token bilan ishlaydi va
   * `getUpdates` rad etilgani yetkazishga ta'sir qilmaydi (`deliverToChat`
   * nusxasiz `bot-not-running` qaytarardi).
   */
  private async stopPolling(reason: string): Promise<void> {
    this.clearAcquireRetry();
    if (!this.polling) return;
    this.polling = false;
    const bot = this.bots.get();
    await bot?.stopPolling({ cancel: true }).catch(() => null);
    await this.lock.release().catch(() => null);
    this.logger.warn(`Polling toʻxtatildi (faqat yuborish rejimi): ${reason}`);
  }

  /**
   * ⚠ QULF BOT'DAN OLDIN BO'SHATILADI. Teskari tartibda to'xtayotgan
   * jarayon qulfni 90 soniya ushlab turardi va o'rnini bosuvchi nusxa
   * shuncha vaqt buyruqlarga javob bermay turardi.
   */
  async onApplicationShutdown(): Promise<void> {
    this.clearAcquireRetry();
    await this.lock.release().catch(() => null);
    const bot = this.bots.get();
    if (!bot) return;
    if (this.polling) {
      await bot.stopPolling({ cancel: true }).catch(() => null);
      this.polling = false;
    }
    this.handlers?.dispose();
    this.handlers = null;
    this.bots.destroy();
    this.logger.log("Telegram bot to'xtatildi");
  }
}

@Module({
  providers: [
    TelegramBotService,
    BotPollLockService,
    BotUserService,
    NotificationDeliverService,
    AssignmentDeliverService,
    BotLifecycle,
  ],
  // Yetkazish servislari `notifications` va `assignments` modullariga
  // kerak bo'ladi (ular ko'chgach). `TelegramBotService` — testlar va
  // holat tekshiruvi uchun.
  exports: [
    TelegramBotService,
    BotUserService,
    NotificationDeliverService,
    AssignmentDeliverService,
    BotLifecycle,
  ],
})
export class BotModule {}
