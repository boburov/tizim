import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { JobDefinition } from '../job.types.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TTL TOZALASH — `server/src/jobs/ttlCleanup.job.js` NING KO'CHIRMASI.
 *
 * NEGA BU JOB UMUMAN KERAK: Mongo'da eskirgan hujjatni bazaning O'ZI
 * o'chirardi (`expireAfterSeconds` indeksi). PostgreSQL'da bunday
 * mexanizm YO'Q. Hech kim tozalamasa jadvallar cheksiz o'sadi va bir kun
 * disk to'ladi — buni oldindan sezish qiyin, chunki HECH QANDAY XATO
 * chiqmaydi.
 *
 * ⚠ MUDDATLAR ESKI MONGO INDEKSLARIDAN AYNAN KO'CHIRILGAN. O'zgartirish
 * ma'lumot saqlash siyosatini o'zgartiradi, ya'ni ONGLI qaror bo'lishi
 * kerak:
 *   ai_runs        — 90 kun
 *   ai_usage_logs  — 400 kun   (hisob-kitob tarixi uzoqroq turadi)
 *   caches         — `expiresAt` o'tgani
 *   refresh_tokens — `expiresAt` o'tgani YOKI `revokedAt` to'ldirilgani
 *
 * ── NEGA BU JOB BIRINCHI BO'LIB KO'CHIRILDI ──
 *
 * Uning BIRORTA biznes servisiga bog'liqligi yo'q — faqat 4 ta
 * `deleteMany`. Ya'ni "job ko'chirilmaydi, toki servislari tayyor
 * bo'lmaguncha" qoidasi uni to'smaydi.
 *
 * ── IKKILANISH XAVFI ──
 *
 * YO'Q darajada past: `deleteMany` idempotent, ikkinchi yurish 0 qator
 * o'chiradi. Shunga qaramay job standart holda O'CHIQ — himoya qoidasi
 * "xavfsiz job" uchun ham buzilmaydi (§4, WORKERS-DEPENDENCY-MATRIX.md).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const AI_RUN_RETENTION_DAYS = 90;
const AI_USAGE_RETENTION_DAYS = 400;

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

@Injectable()
export class TtlCleanupJob implements JobDefinition {
  /** ⚠ Express bilan aynan bir xil nom. */
  readonly name = 'daily.ttl-cleanup';
  /** Express `jobs/index.js`: `every("15 3 * * *", TTL_CLEANUP_JOB)`. */
  readonly cron = '15 3 * * *';

  private readonly logger = new Logger('Job:ttl-cleanup');

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async run(): Promise<void> {
    const now = new Date();

    const [caches, tokens, aiRuns, aiUsage] = await Promise.all([
      this.prisma.cache.deleteMany({ where: { expiresAt: { lt: now } } }),

      this.prisma.refreshToken.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }],
        },
      }),

      this.prisma.aiRun.deleteMany({
        where: { startedAt: { lt: daysAgo(AI_RUN_RETENTION_DAYS) } },
      }),

      this.prisma.aiUsageLog.deleteMany({
        where: { createdAt: { lt: daysAgo(AI_USAGE_RETENTION_DAYS) } },
      }),
    ]);

    this.logger.log(
      `TTL tozalash bajarildi — caches: ${caches.count}, ` +
        `refreshTokens: ${tokens.count}, aiRuns: ${aiRuns.count}, ` +
        `aiUsageLogs: ${aiUsage.count}`,
    );
  }
}
