import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TELEGRAM POLLING QULFI — `server/src/bot/index.js` KO'CHIRMASI.
 *
 * ── NEGA QULF UMUMAN KERAK ──
 *
 * Telegram bitta bot tokeni uchun FAQAT BITTA `getUpdates` oqimiga ruxsat
 * beradi. Ikkinchi jarayon polling boshlasa Telegram 409 Conflict qaytaradi
 * va ikkala nusxa ham yangilanishlarni NAVBAT BILAN o'g'irlab, xabarlar
 * tasodifiy tarzda yo'qola boshlaydi.
 *
 * ── ⚠ ID, TTL VA XULQ EXPRESS BILAN AYNAN BIR XIL ──
 *
 * `bot_locks.id = "poller"`, TTL 90 soniya, yangilash har 30 soniyada.
 * AYNAN shuning uchun bu qulf IKKI ILOVA ORASIDA ham ishlaydi: Express
 * ishlab turganda NestJS qulfni OLA OLMAYDI va jimgina "faqat yuborish"
 * rejimida qoladi. Id yoki TTL farq qilsa himoya YO'QOLADI — ikkalasi
 * ham o'zini yagona poller deb hisoblardi.
 *
 * ── FAIL-OPEN ──
 *
 * Baza xatosida `true` qaytadi. Sabab Express'dagi bilan bir xil:
 * "hech kim polling qilmayapti" regressiyasi "ikki poller" ehtimolidan
 * ko'ra qimmatroq. ⚠ Lekin bu YAGONA joy emas: NestJS tomonda polling
 * `NEST_BOT_POLLING` bilan ham yopilgan, ya'ni fail-open faqat o'sha
 * bayroq ATAYLAB yoqilganda ish beradi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const LOCK_ID = 'poller';
const LOCK_TTL_MS = 90 * 1000;

@Injectable()
export class BotPollLockService {
  private readonly logger = new Logger('Bot:lock');
  /** Nusxa belgisi — Express bilan bir xil shakl (`pid-timestamp`). */
  private readonly holder = `${process.pid}-${Date.now()}`;
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  get holderId(): string {
    return this.holder;
  }

  async acquire(): Promise<boolean> {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

      // ⚠ ATOMIK: `updateMany` shart bilan. `findFirst` + `update` ga
      // bo'lish poygani qaytarardi — ikki jarayon bir vaqtda "bo'sh"
      // deb ko'rib, ikkalasi ham yozardi.
      const res = await this.prisma.botLock.updateMany({
        where: {
          id: LOCK_ID,
          OR: [{ expiresAt: { lte: now } }, { holder: this.holder }],
        },
        data: { holder: this.holder, expiresAt },
      });
      if (res.count > 0) return true;

      // Qator umuman yo'q bo'lsa (birinchi ishga tushish) — yaratamiz.
      // Band bo'lsa unique buzilishi (P2002) tushadi → `false`.
      try {
        await this.prisma.botLock.create({
          data: { id: LOCK_ID, holder: this.holder, expiresAt },
        });
        return true;
      } catch (err) {
        if ((err as { code?: string })?.code === 'P2002') return false;
        throw err;
      }
    } catch (err) {
      this.logger.warn(
        `Bot qulfini olishda xato — fail-open (polling yoqiladi): ${String(err)}`,
      );
      return true;
    }
  }

  /**
   * Qulfni tirik ushlab turadi. ⚠ TTL/3 = 30 soniya: bitta o'tkazib
   * yuborilgan yangilash qulfni yo'qotmasligi kerak, aks holda boshqa
   * jarayon polling'ni tortib olib, 409 boshlanardi.
   */
  startHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      this.acquire().catch(() => null);
    }, LOCK_TTL_MS / 3);
    // `unref` — bu taymer jarayonni tirik ushlab turmasin.
    this.heartbeat.unref?.();
  }

  async release(): Promise<void> {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    // ⚠ FAQAT O'ZINIKINI o'chiradi (`holder` shartda). Shartsiz
    // `delete` boshqa tirik jarayonning qulfini uzib qo'yardi.
    await this.prisma.botLock
      .deleteMany({ where: { id: LOCK_ID, holder: this.holder } })
      .catch(() => null);
  }
}
