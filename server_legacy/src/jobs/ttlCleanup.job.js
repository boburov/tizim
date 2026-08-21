import prisma from "../config/prisma.js";
import logger from "../config/logger.js";

export const JOB_NAME = "daily.ttl-cleanup";

// ═══════════════════════════════════════════════════════════════════════════
// TTL TOZALASH — MongoDB'dagi `expireAfterSeconds` indeksining o'rnini bosadi.
//
// NEGA BU JOB UMUMAN KERAK:
//   Mongo'da eskirgan hujjatni bazaning O'ZI o'chirardi (TTL indeks).
//   PostgreSQL'da bunday mexanizm YO'Q. Agar hech kim tozalamasa, quyidagi
//   jadvallar cheksiz o'sadi va bir kun kelib disk to'lib qoladi —
//   buni oldindan sezish qiyin, chunki hech qanday xato chiqmaydi.
//
// MUDDATLAR eski modellardagi indekslardan AYNAN ko'chirildi:
//   ai_runs        — 90 kun   (aiRun.model.js:     expireAfterSeconds 90d)
//   ai_usage_logs  — 400 kun  (aiUsageLog.model.js: expireAfterSeconds 400d)
//   caches         — expiresAt o'tgani                (cache.model.js)
//   refresh_tokens — expiresAt o'tgani yoki bekor qilingani
//
// DIQQAT: refresh_tokens uchun shart eski `cleanupExpiredTokens.job.js`
// bilan bir xil — muddati o'tgan YOKI revokedAt to'ldirilgan tokenlar.
// ═══════════════════════════════════════════════════════════════════════════

const AI_RUN_RETENTION_DAYS = 90;
const AI_USAGE_RETENTION_DAYS = 400;

const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

export default function defineTtlCleanup(scheduler) {
  scheduler.define(JOB_NAME, async () => {
    const now = new Date();

    const [caches, tokens, aiRuns, aiUsage] = await Promise.all([
      prisma.cache.deleteMany({ where: { expiresAt: { lt: now } } }),

      prisma.refreshToken.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }],
        },
      }),

      prisma.aiRun.deleteMany({
        where: { startedAt: { lt: daysAgo(AI_RUN_RETENTION_DAYS) } },
      }),

      prisma.aiUsageLog.deleteMany({
        where: { createdAt: { lt: daysAgo(AI_USAGE_RETENTION_DAYS) } },
      }),
    ]);

    logger.info(
      {
        caches: caches.count,
        refreshTokens: tokens.count,
        aiRuns: aiRuns.count,
        aiUsageLogs: aiUsage.count,
      },
      "TTL tozalash bajarildi (Mongo TTL indekslari o'rniga)",
    );
  });
}
