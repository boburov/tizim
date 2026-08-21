import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DAVOMAT↔TO'LOV KORRELATSIYA HISOBOTINING KESHI —
 * `helpers/correlationCache.js` NING KO'CHIRMASI.
 *
 * ⚠ BAZA-BACKED, in-process `Map` EMAS. Ko'p-instansli deploy'da bir
 * instansda invalidatsiya qilinsa BARCHA instanslar yangi ma'lumotni
 * oladi. `Map` bo'lsa boshqa instans eskirgan hisobotni ko'rsatib
 * turaverardi.
 *
 * ⚠ MUDDATI O'TGANNI KIM O'CHIRADI: Mongo'da TTL indeksi
 * (`expireAfterSeconds: 0`) o'zi qilardi; PostgreSQL'da bunday mexanizm
 * YO'Q — `jobs/ttlCleanup.job.js` kuniga bir marta tozalaydi. Shuning
 * uchun O'QISHDA `expiresAt` QO'LDA tekshiriladi: muddati o'tgan qator
 * jadvalda bir necha soat turishi mumkin va uni "topildi" deb qaytarish
 * ESKIRGAN hisobot berardi.
 *
 * ⚠ NEGA `attendance` BILAN BIRGA KO'CHDI: `bulkRecord` yozgandan keyin
 * shu oy keshini bekor qiladi. Ko'chirilmasa NestJS davomatni yozardi-yu
 * keshni bekor qilmasdi — hisobot eski raqamda qolib ketardi va buni
 * hech narsa ko'rsatmasdi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const PREFIX = 'correlation:';
const TTL_MS = 5 * 60 * 1000;

@Injectable()
export class CorrelationCacheService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get(key: string): Promise<unknown | null> {
    try {
      const row = await this.prisma.cache.findUnique({
        where: { key: PREFIX + key },
        select: { value: true, expiresAt: true },
      });
      if (row && row.expiresAt > new Date()) return row.value;
    } catch {
      /* kesh xatosi — shunchaki cache-miss deb hisoblaymiz */
    }
    return null;
  }

  async set(key: string, data: unknown): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + TTL_MS);
      await this.prisma.cache.upsert({
        where: { key: PREFIX + key },
        update: { value: data as never, expiresAt },
        create: { key: PREFIX + key, value: data as never, expiresAt },
      });
    } catch {
      /* kesh yozib bo'lmadi — muhim emas */
    }
  }

  /**
   * ⚠ XATO YUTILADI — ATAYLAB. Chaqiruvchilar buni `await` QILMAYDI
   * (davomat saqlangandan keyin fon amali). Ichkarida `try/catch`
   * bo'lmasa kesh xatosi unhandled rejection bo'lib jarayonni
   * yiqitardi — davomat esa allaqachon saqlangan bo'lardi.
   *
   * `startsWith` — Mongo'dagi RegExp o'rniga: u indeksdan foydalana
   * oladi, RegExp esa yo'q.
   */
  async invalidate(year?: number, month?: number): Promise<void> {
    try {
      if (year && month) {
        await this.prisma.cache.deleteMany({
          where: { key: `${PREFIX}${year}-${month}` },
        });
      } else {
        await this.prisma.cache.deleteMany({
          where: { key: { startsWith: PREFIX } },
        });
      }
    } catch {
      /* noop */
    }
  }
}
