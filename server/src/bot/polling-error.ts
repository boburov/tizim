import type { Logger } from '@nestjs/common';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POLLING XATOLARI TASNIFI VA HISOBOTI.
 *
 * ── MUAMMO ──
 *
 * `EFATAL: Error: read ECONNRESET` — Telegram uzun so'rovni (long poll)
 * yopganda tushadigan ODDIY tarmoq uzilishi. `node-telegram-bot-api`
 * kutubxonasi undan KEYIN ham polling'ni davom ettiradi
 * (`telegramPolling.js` → `.finally()` da yangi `setTimeout`), ya'ni bu
 * xato o'z-o'zidan tuzaladi va HECH NARSA yo'qolmaydi.
 *
 * Lekin u `logger.error` bilan STACK bilan yozilardi va:
 *   • tarmoq uzilganda 300 ms'da bir marta log'ni to'ldirardi;
 *   • HAQIQIY nosozliklardan (401 — token yaroqsiz, 409 — ikkinchi
 *     poller) ajralmasdi, ya'ni "shovqin" ichida ular ko'rinmay qolardi.
 *
 * ── YECHIM ──
 *
 * Xato TURI bo'yicha ajratiladi va TAKRORLARI BOSILADI:
 *   • o'tkinchi (transient) tarmoq xatosi → `warn`, seriyada BIR marta;
 *   • seriya {@link ESCALATE_AFTER} dan oshsa → BIR marta `error`
 *     ("aloqa umuman yo'q" — bu allaqachon odam aralashuvi);
 *   • 409 Conflict → `warn`, daqiqada bir marta (ikkinchi poller!);
 *   • 401 Unauthorized → `error` + FATAL: polling to'xtatiladi, chunki
 *     u hech qachon o'zidan tuzalmaydi va 300 ms'da bir marta
 *     Telegram'ga tekin so'rov yuborib turardi.
 *
 * ⚠ MUVAFFAQIYAT HODISASI YO'Q. Kutubxona "poll o'tdi" deb signal
 * bermaydi, shuning uchun tiklanish JIMLIK bilan o'lchanadi: seriya
 * boshlangach {@link QUIET_MS} davomida yangi xato kelmasa — tiklandi.
 * Chegara long-poll (10 s) + interval (300 ms) dan sezilarli katta,
 * aks holda har bir sog'lom tsikl "tiklandi" deb hisoblanardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type PollingErrorKind = 'transient' | 'conflict' | 'unauthorized' | 'unknown';

/** ⚠ `node-telegram-bot-api` xatosi: `FatalError` asl xatoni `cause` da saqlaydi. */
export interface PollingErrorLike {
  code?: string;
  message?: string;
  cause?: unknown;
  response?: { statusCode?: number; body?: { description?: string } };
}

/**
 * O'tkinchi tarmoq kodlari.
 *
 * ⚠ ENOTFOUND/EAI_AGAIN ham SHU YERDA: DNS tushib qolishi ham vaqtinchalik
 * va polling tsikli uni o'zi qaytarib oladi. Ularni "fatal" deb bilish
 * DNS bir soniyaga tebrangan joyda botni butunlay o'chirib qo'yardi.
 */
const TRANSIENT_CODES = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENETDOWN',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPROTO',
] as const;

const TRANSIENT_RE = new RegExp(`\\b(${TRANSIENT_CODES.join('|')})\\b|socket hang up`, 'i');

/** Xatoning eng ichki `code` i (`FatalError` → `cause.code`). */
const codeChainOf = (err: PollingErrorLike | undefined): string => {
  const parts: string[] = [];
  let cur: unknown = err;
  // ⚠ Chuqurlik cheklangan: `cause` halqasi (self-reference) bo'lsa
  // cheksiz aylanmaslik uchun.
  for (let i = 0; i < 5 && cur && typeof cur === 'object'; i += 1) {
    const node = cur as PollingErrorLike;
    if (node.code) parts.push(node.code);
    if (node.message) parts.push(node.message);
    cur = node.cause;
  }
  return parts.join(' ');
};

const statusOf = (err: PollingErrorLike | undefined): number | undefined =>
  err?.response?.statusCode;

const descriptionOf = (err: PollingErrorLike | undefined): string =>
  String(err?.response?.body?.description || '');

export const classifyPollingError = (err: PollingErrorLike | undefined): PollingErrorKind => {
  const status = statusOf(err);
  const desc = descriptionOf(err);

  // ⚠ 401 BIRINCHI tekshiriladi: token yaroqsiz bo'lsa qolgan hech
  // qanday tasnif ahamiyatga ega emas.
  if (status === 401 || /unauthorized/i.test(desc)) return 'unauthorized';

  // 409 — YOKI webhook o'rnatilgan, YOKI boshqa jarayon `getUpdates`
  // qilyapti. Ikkalasi ham odam qarashini talab qiladi.
  if (status === 409 || /terminated by other getupdates|conflict/i.test(desc)) return 'conflict';

  if (TRANSIENT_RE.test(codeChainOf(err))) return 'transient';

  // 5xx — Telegram tomonidagi vaqtinchalik nosozlik, tarmoq xatosi bilan
  // bir xil muomala qilinadi (o'zi tuzaladi).
  if (typeof status === 'number' && status >= 500) return 'transient';

  return 'unknown';
};

/** Log qatorini qisqartiradi — stack o'rniga bitta o'qiladigan satr. */
export const pollingErrorLine = (err: PollingErrorLike | undefined): string => {
  const status = statusOf(err);
  const desc = descriptionOf(err);
  const msg = String(err?.message || err?.code || 'nomaʻlum xato');
  return [msg, status ? `(HTTP ${status})` : '', desc && desc !== msg ? `— ${desc}` : '']
    .filter(Boolean)
    .join(' ');
};

/** Seriya shu qadar uzaysa — bir marta `error` darajasiga ko'tariladi. */
const ESCALATE_AFTER = 20;
/** Shuncha vaqt yangi xato kelmasa — seriya tugadi, ya'ni tiklandi. */
const QUIET_MS = 30_000;
/** 409 shu oraliqda faqat bir marta yoziladi. */
const CONFLICT_LOG_INTERVAL_MS = 60_000;

/**
 * Polling xatolari uchun log "gate" i.
 *
 * ⚠ HOLATLI (stateful) va BITTA bot nusxasiga tegishli. Har bir
 * `registerHandlers` chaqiruvi o'zinikini yaratadi.
 */
export class PollingErrorReporter {
  private streak = 0;
  private streakStartedAt = 0;
  private streakSignature = '';
  private escalated = false;
  private quietTimer: NodeJS.Timeout | null = null;
  // ⚠ `0` EMAS: soat nolga yaqin bo'lganda (testdagi soxta soat, yoki
  // yangi jarayonning monotonik soati) BIRINCHI 409 ham "yaqinda
  // yozilgan" deb bosilib qolardi.
  private lastConflictAt = Number.NEGATIVE_INFINITY;
  private fatalReported = false;

  constructor(
    private readonly logger: Logger,
    private readonly onFatal?: (reason: string) => void,
    private readonly now: () => number = () => Date.now(),
  ) {}

  handle(err: PollingErrorLike | undefined): PollingErrorKind {
    const kind = classifyPollingError(err);
    const line = pollingErrorLine(err);

    switch (kind) {
      case 'unauthorized':
        // ⚠ QAYTA URINISH FOYDASIZ: token almashtirilmaguncha har bir
        // so'rov 401 qaytaradi. Polling to'xtatiladi (qulf ham bo'shaydi).
        if (!this.fatalReported) {
          this.fatalReported = true;
          this.logger.error(
            `Telegram polling toʻxtatildi — token rad etildi: ${line}. ` +
              'TELEGRAM_BOT_TOKEN ni tekshiring.',
          );
          this.onFatal?.(line);
        }
        return kind;

      case 'conflict': {
        // ⚠ ERROR EMAS, WARN: kutubxona 409 da webhook'ni yechib qayta
        // uriniadi va ko'p hollarda o'zi tuzaladi. Lekin TAKRORLANSA —
        // bu ikkinchi poller demak, ya'ni xabarlar navbat bilan
        // o'gʻorlanadi (qarang: BotPollLockService).
        const t = this.now();
        if (t - this.lastConflictAt >= CONFLICT_LOG_INTERVAL_MS) {
          this.lastConflictAt = t;
          this.logger.warn(
            `Telegram 409 Conflict — boshqa jarayon ham polling qilyapti ` +
              `yoki webhook oʻrnatilgan: ${line}`,
          );
        }
        return kind;
      }

      case 'transient':
        this.note('warn', `Telegram polling uzildi (oʻtkinchi): ${line}`, line);
        return kind;

      default:
        this.note('error', `Telegram polling xatosi: ${line}`, line);
        return kind;
    }
  }

  /** Jarayon to'xtayotganda — osilib qolgan taymerni tozalaydi. */
  dispose(): void {
    if (this.quietTimer) {
      clearTimeout(this.quietTimer);
      this.quietTimer = null;
    }
    this.streak = 0;
    this.escalated = false;
    this.streakSignature = '';
  }

  /** Test va diagnostika uchun joriy holat. */
  state(): { streak: number; escalated: boolean } {
    return { streak: this.streak, escalated: this.escalated };
  }

  /**
   * Seriyani yuritadi: birinchi xato yoziladi, takrorlari BOSILADI,
   * seriya uzaysa bir marta ko'tariladi, jimlikdan keyin "tiklandi".
   */
  private note(level: 'warn' | 'error', message: string, signature: string): void {
    // Xato TURI o'zgarsa — bu boshqa nosozlik, yangi seriya boshlanadi
    // (aks holda ECONNRESET seriyasi ichida yangi, boshqa xato jim qolardi).
    if (signature !== this.streakSignature) {
      this.flushRecovery();
      this.streakSignature = signature;
    }

    this.streak += 1;
    if (this.streak === 1) {
      this.streakStartedAt = this.now();
      this.logger[level](message);
    } else if (this.streak === ESCALATE_AFTER) {
      this.escalated = true;
      const secs = Math.round((this.now() - this.streakStartedAt) / 1000);
      this.logger.error(
        `Telegram polling ${this.streak} marta ketma-ket uzildi (${secs} s) — ` +
          `aloqa tiklanmayapti: ${signature}`,
      );
    }

    this.armQuietTimer();
  }

  private armQuietTimer(): void {
    if (this.quietTimer) clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(() => {
      this.quietTimer = null;
      this.flushRecovery();
    }, QUIET_MS);
    // ⚠ `unref` — bu taymer jarayonni tirik ushlab turmasin.
    this.quietTimer.unref?.();
  }

  private flushRecovery(): void {
    if (this.streak === 0) return;
    const count = this.streak;
    const secs = Math.round((this.now() - this.streakStartedAt) / 1000);
    const escalated = this.escalated;
    this.streak = 0;
    this.escalated = false;
    this.streakSignature = '';
    // Bitta yakka xato uchun "tiklandi" yozish shovqin — u allaqachon
    // yozilgan va o'zi tuzalgan.
    if (count < 2) return;
    const text = `Telegram polling tiklandi — ${count} ta xato, ${secs} s davom etdi`;
    if (escalated) this.logger.warn(text);
    else this.logger.log(text);
  }
}
