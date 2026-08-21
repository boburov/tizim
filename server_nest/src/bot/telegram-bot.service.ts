import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import TelegramBot from 'node-telegram-bot-api';
import type { AppConfig } from '../config/env.validation.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BOT NUSXASI — `server/src/bot/config/bot.instance.js` KO'CHIRMASI.
 *
 * ⚠ `polling: false` bilan yaratiladi. Nusxa bo'lishi va polling qilishi
 * IKKI BOSHQA narsa:
 *   • XABAR YUBORISH uchun faqat token kerak — polling shart emas;
 *   • XABAR OLISH (buyruqlar) uchun polling kerak, va u YAGONA bo'lishi
 *     shart (`BotPollLockService`).
 *
 * Aynan shu ajratma tufayli NestJS "faqat yuborish" rejimida tirik
 * bo'la oladi, Express esa buyruqlarni qabul qilishda davom etadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger('Bot');
  private bot: TelegramBot | null = null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /**
   * Bot sozlanganmi. ⚠ Express bilan bir xil ikki shart: bayroq YOQIQ
   * va token BO'SH EMAS. Bayroq yoqiq-u token yo'q bo'lsa — bu sozlash
   * xatosi, jimgina o'tkazib yuborilmaydi (pastda ogohlantiriladi).
   */
  isConfigured(): boolean {
    return Boolean(
      this.config.get('TELEGRAM_BOT_ENABLED', { infer: true }) &&
        this.config.get('TELEGRAM_BOT_TOKEN', { infer: true }),
    );
  }

  /** Mavjud nusxa yoki `null`. Yetkazish servislari shuni tekshiradi. */
  get(): TelegramBot | null {
    return this.bot;
  }

  create(): TelegramBot | null {
    if (this.bot) return this.bot;
    const token = this.config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    if (!token) return null;
    this.bot = new TelegramBot(token, { polling: false });
    return this.bot;
  }

  destroy(): void {
    this.bot = null;
  }

  appName(): string {
    return this.config.get('APP_NAME', { infer: true });
  }

  webAppUrl(): string {
    return this.config.get('TELEGRAM_BOT_WEBAPP_URL', { infer: true });
  }

  warnIfMisconfigured(): void {
    if (
      this.config.get('TELEGRAM_BOT_ENABLED', { infer: true }) &&
      !this.config.get('TELEGRAM_BOT_TOKEN', { infer: true })
    ) {
      this.logger.warn("TELEGRAM_BOT_TOKEN bo'sh, bot ishga tushirilmadi");
    }
  }
}
