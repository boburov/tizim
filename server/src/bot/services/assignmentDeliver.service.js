import logger from "../../config/logger.js";
import { getBot } from "../config/bot.instance.js";
import { markBlocked } from "./botUser.service.js";

// Telegram hujjat izohi (caption) chegarasi - 1024 belgi. Undan uzun matn
// alohida xabar bo'lib ketadi, aks holda Telegram butun so'rovni rad etardi.
const CAPTION_LIMIT = 1024;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Bloklash/deaktivatsiya xatosi - qayta urinilmaydi.
const isBlockedError = (err) => {
  const status = err?.response?.statusCode;
  const desc = String(err?.response?.body?.description || err?.message || "");
  return (
    status === 403 ||
    /bot was blocked|user is deactivated|chat not found|bot can't initiate/i.test(
      desc,
    )
  );
};

const retryAfterOf = (err) =>
  Number(err?.response?.body?.parameters?.retry_after) || 0;

const reasonOf = (err) =>
  err?.response?.body?.description || err?.message || "send-failed";

const formatDue = (dueDate) => {
  if (!dueDate) return "";
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `\n\n⏳ Muddat: ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};

/** Vazifa matni: sarlavha + tavsif + muddat. */
export const formatAssignmentText = ({ title, body, dueDate }) => {
  const head = `📝 Yangi vazifa: ${title}`;
  const text = body ? `${head}\n\n${body}` : head;
  return `${text}${formatDue(dueDate)}`;
};

/**
 * Bitta chatga vazifani yetkazadi.
 *
 * Qaytadi: { ok, reason?, transient?, telegramFileId? }
 *   transient=true - vaqtinchalik nosozlik, terminal status sifatida
 *   saqlanmaydi (keyingi urinishda qayta uriniladi).
 *
 * telegramFileId - Telegram fayl nusxasini saqlab qo'ygan bo'lsa qaytadi.
 * Chaqiruvchi uni keshlab, keyingi o'quvchilarga BUFER o'rniga shu ID ni
 * beradi: 30 kishilik guruh uchun bu 30 ta yuklashni 1 taga tushiradi.
 */
export const deliverAssignmentToChat = async (
  { chatId, telegramId },
  { title, body, dueDate, file },
) => {
  const bot = getBot();
  if (!bot) return { ok: false, reason: "bot-not-running", transient: true };

  const text = formatAssignmentText({ title, body, dueDate });

  const attempt = async () => {
    // Faylsiz vazifa - oddiy matn.
    if (!file) {
      await bot.sendMessage(chatId, text);
      return {};
    }

    // Matn caption'ga sig'sa - bitta xabar (fayl + izoh birga ko'rinadi).
    // Sig'masa avval matn, keyin fayl: teskarisi bo'lsa uzun matn faylni
    // ekranda ancha pastga surib yuborardi.
    const useCaption = text.length <= CAPTION_LIMIT;
    if (!useCaption) await bot.sendMessage(chatId, text);

    const payload = file.telegramFileId || file.buffer;
    const sent = await bot.sendDocument(
      chatId,
      payload,
      useCaption ? { caption: text } : {},
      // Bufer yuborilganda Telegram kutubxonasiga fayl nomi va turini
      // ALOHIDA berish kerak - aks holda hujjat "blob" nomi bilan ketadi.
      file.telegramFileId
        ? undefined
        : { filename: file.originalName, contentType: file.mimeType },
    );
    return { telegramFileId: sent?.document?.file_id || null };
  };

  try {
    const res = await attempt();
    return { ok: true, ...res };
  } catch (err) {
    // 429 - rate limit: retry_after kutib bir marta qayta urinamiz.
    if (err?.response?.statusCode === 429) {
      await sleep(Math.min((retryAfterOf(err) || 1) * 1000, 5000));
      try {
        const res = await attempt();
        return { ok: true, ...res };
      } catch (err2) {
        if (isBlockedError(err2)) {
          if (telegramId) await markBlocked(telegramId, true).catch(() => null);
          return { ok: false, reason: "blocked" };
        }
        return { ok: false, reason: reasonOf(err2), transient: true };
      }
    }

    if (isBlockedError(err)) {
      if (telegramId) await markBlocked(telegramId, true).catch(() => null);
      logger.info({ telegramId }, "O'quvchi botni bloklagan - vazifa yetmadi");
      return { ok: false, reason: "blocked" };
    }

    logger.warn({ err, chatId }, "Vazifani yetkazib bo'lmadi");
    return { ok: false, reason: reasonOf(err) };
  }
};
