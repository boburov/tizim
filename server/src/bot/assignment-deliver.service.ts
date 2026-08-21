import { Injectable, Logger } from '@nestjs/common';
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
 * VAZIFA YETKAZISH —
 * `server/src/bot/services/assignmentDeliver.service.js` KO'CHIRMASI.
 *
 * ISTE'MOLCHISI (`assignments` moduli + `assignment.deliver` job'i) hali
 * ko'chirilmagan — qatlam ular uchun tayyorlab qo'yildi.
 *
 * ── SAQLANISHI SHART BO'LGAN UCH DETAL ──
 *
 * 1. CAPTION CHEGARASI 1024. Undan uzun matn alohida xabar bo'lib
 *    ketadi — aks holda Telegram BUTUN so'rovni rad etardi.
 * 2. TARTIB: matn OLDIN, fayl KEYIN (caption'ga sig'masa). Teskarisi
 *    uzun matnni faylni ekranda ancha pastga surib yuborardi.
 * 3. `telegramFileId` KESHI. Chaqiruvchi qaytgan ID ni saqlab, keyingi
 *    o'quvchilarga bufer o'rniga shuni beradi: 30 kishilik guruhda bu
 *    30 ta yuklashni BITTAGA tushiradi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** ⚠ Telegram hujjat izohi chegarasi. O'ZGARTIRMANG — bu API cheklovi. */
const CAPTION_LIMIT = 1024;

export interface AssignmentFile {
  telegramFileId?: string | null;
  buffer?: Buffer | null;
  originalName?: string;
  mimeType?: string;
}

export interface AssignmentPayload {
  title: string;
  body?: string | null;
  dueDate?: Date | string | null;
  file?: AssignmentFile | null;
}

export interface AssignmentDeliveryResult {
  ok: boolean;
  reason?: string;
  transient?: boolean;
  telegramFileId?: string | null;
}

const formatDue = (dueDate?: Date | string | null): string => {
  if (!dueDate) return '';
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `\n\n⏳ Muddat: ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};

/** Vazifa matni: sarlavha + tavsif + muddat. */
export const formatAssignmentText = ({ title, body, dueDate }: AssignmentPayload): string => {
  const head = `📝 Yangi vazifa: ${title}`;
  const text = body ? `${head}\n\n${body}` : head;
  return `${text}${formatDue(dueDate)}`;
};

@Injectable()
export class AssignmentDeliverService {
  private readonly logger = new Logger('Bot:assignment');

  constructor(
    private readonly bots: TelegramBotService,
    private readonly botUsers: BotUserService,
  ) {}

  async deliverToChat(
    { chatId, telegramId }: { chatId: bigint | number; telegramId?: bigint | number | null },
    payload: AssignmentPayload,
  ): Promise<AssignmentDeliveryResult> {
    const bot = this.bots.get();
    if (!bot) return { ok: false, reason: 'bot-not-running', transient: true };

    const text = formatAssignmentText(payload);
    const target = Number(chatId);
    const file = payload.file;

    const attempt = async (): Promise<{ telegramFileId?: string | null }> => {
      // Faylsiz vazifa — oddiy matn.
      if (!file) {
        await bot.sendMessage(target, text);
        return {};
      }

      const useCaption = text.length <= CAPTION_LIMIT;
      if (!useCaption) await bot.sendMessage(target, text);

      const source = file.telegramFileId || file.buffer;
      const sent = await bot.sendDocument(
        target,
        source as never,
        useCaption ? { caption: text } : {},
        // ⚠ Bufer yuborilganda fayl nomi va turi ALOHIDA beriladi —
        // aks holda hujjat "blob" nomi bilan ketardi.
        file.telegramFileId
          ? (undefined as never)
          : ({ filename: file.originalName, contentType: file.mimeType } as never),
      );
      return { telegramFileId: sent?.document?.file_id || null };
    };

    try {
      const res = await attempt();
      return { ok: true, ...res };
    } catch (err) {
      const e = err as TelegramApiError;

      if (isRateLimited(e)) {
        await sleep(retryWaitMs(e));
        try {
          const res = await attempt();
          return { ok: true, ...res };
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
        this.logger.log(`O'quvchi botni bloklagan — vazifa yetmadi (tg ${String(telegramId)})`);
        return { ok: false, reason: 'blocked' };
      }

      this.logger.warn(`Vazifani yetkazib bo'lmadi (chat ${String(chatId)}): ${reasonOf(e)}`);
      return { ok: false, reason: reasonOf(e) };
    }
  }
}
