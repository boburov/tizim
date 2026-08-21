import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TelegramBotService } from './telegram-bot.service.js';
import { BotUserService } from './bot-user.service.js';
import {
  isBlockedError,
  isRateLimited,
  reasonOf,
  retryWaitMs,
  sleep,
  type TelegramApiError,
} from './telegram-errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BILDIRISHNOMA YETKAZISH —
 * `server/src/bot/services/notificationDeliver.service.js` KO'CHIRMASI.
 *
 * ── HOLAT ──
 *
 * Bu qatlam TAYYOR, lekin uning ISTE'MOLCHISI (`notifications` moduli va
 * `notification.deliver` job'i) hali ko'chirilmagan — ular bu yerdan
 * chaqiriladi. Qatlam ataylab OLDIN ko'chirildi: u Telegram bilan
 * muomalaning eng nozik qismini (qayta urinish, bloklash, dublikat
 * oldini olish) o'z ichiga oladi va uni har bir chaqiruvchi o'zicha
 * qayta yozsa xulq darhol uzoqlashardi.
 *
 * ── DUBLIKAT OLDINI OLISH QAYERDA ──
 *
 * ⚠ BU YERDA EMAS. U ikki bosqichda:
 *   1. `notifications.send` dagi `dedupeKey` — bir xil xabar ikkinchi
 *      marta YARATILMAYDI;
 *   2. `deliverNotification` faqat `botDeliveredAt IS NULL` oluvchilarni
 *      uradi — job qayta ishga tushsa ham bir xil odamga ikki marta
 *      ketmaydi.
 * Ikkalasi ham `notifications` moduli bilan birga ko'chadi va o'sha
 * yerda AYNAN saqlanishi shart.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** ⚠ Turkum → emoji. Foydalanuvchi ko'radigan matn — Express bilan bir xil. */
const CATEGORY_EMOJI: Record<string, string> = {
  payment_reminder: '💰',
  debt_warning: '⚠️',
  class_cancel: '❌',
  announcement: '📢',
  admin_personal: '✉️',
  teacher_message: '👨‍🏫',
  feedback_status: '📝',
  holiday: '🎉',
  attendance: '📋',
  template_based: '📨',
  other: '📨',
};

export interface NotificationPayload {
  title?: string | null;
  body: string;
  category?: string | null;
}

export interface DeliveryResult {
  ok: boolean;
  reason?: string;
  /**
   * `true` — vaqtinchalik nosozlik. ⚠ TERMINAL STATUS SIFATIDA
   * SAQLANMAYDI: saqlansa oluvchi "yetkazib bo'lmadi" deb yopilib
   * qolardi va keyingi urinishda umuman o'tkazib yuborilardi.
   */
  transient?: boolean;
}

export const formatNotification = ({ title, body, category }: NotificationPayload): string => {
  const emoji = CATEGORY_EMOJI[category || 'other'] || CATEGORY_EMOJI.other;
  if (title && title.trim()) return `${emoji} ${title}\n\n${body}`;
  return `${emoji} ${body}`;
};

@Injectable()
export class NotificationDeliverService {
  private readonly logger = new Logger('Bot:notify');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly bots: TelegramBotService,
    private readonly botUsers: BotUserService,
  ) {}

  /**
   * Bitta chatga yetkazadi.
   *
   * `telegramId` berilsa, blok holatida foydalanuvchi belgilanadi.
   */
  async deliverToChat(
    { chatId, telegramId }: { chatId: bigint | number; telegramId?: bigint | number | null },
    payload: NotificationPayload,
  ): Promise<DeliveryResult> {
    const bot = this.bots.get();
    // ⚠ `transient: true` — bot ishlamayotgani oluvchining aybi emas.
    if (!bot) return { ok: false, reason: 'bot-not-running', transient: true };

    const text = formatNotification(payload);
    const target = Number(chatId);

    try {
      await bot.sendMessage(target, text);
      return { ok: true };
    } catch (err) {
      const e = err as TelegramApiError;

      // 429 — `retry_after` kutib BIR MARTA qayta urinamiz.
      if (isRateLimited(e)) {
        await sleep(retryWaitMs(e));
        try {
          await bot.sendMessage(target, text);
          return { ok: true };
        } catch (err2) {
          const e2 = err2 as TelegramApiError;
          if (isBlockedError(e2)) {
            if (telegramId) await this.botUsers.markBlocked(telegramId).catch(() => null);
            return { ok: false, reason: 'blocked' };
          }
          return { ok: false, reason: reasonOf(e2), transient: true };
        }
      }

      if (isBlockedError(e)) {
        if (telegramId) await this.botUsers.markBlocked(telegramId).catch(() => null);
        this.logger.log(`Foydalanuvchi botni bloklagan (tg ${String(telegramId)})`);
        return { ok: false, reason: 'blocked' };
      }

      this.logger.warn(`Notification yetkazib bo'lmadi (chat ${String(chatId)}): ${reasonOf(e)}`);
      return { ok: false, reason: reasonOf(e) };
    }
  }

  /** Bitta foydalanuvchiga — bog'langan `BotUser` orqali. */
  async deliverToUser(
    userId: string | null | undefined,
    payload: NotificationPayload,
  ): Promise<DeliveryResult> {
    if (!userId) return { ok: false, reason: 'no-bot-link' };
    const bu = await this.prisma.botUser.findFirst({ where: { userId: String(userId) } });
    if (!bu || bu.isBlocked || !bu.chatId) return { ok: false, reason: 'no-bot-link' };
    return this.deliverToChat({ chatId: bu.chatId, telegramId: bu.telegramId }, payload);
  }
}
