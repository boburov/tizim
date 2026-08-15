import { PrismaClient } from "@prisma/client";
import env from "./env.js";
import logger from "./logger.js";

// ═══════════════════════════════════════════════════════════════════════════
// Prisma klienti — eski `config/db.js` (mongoose.connect) o'rniga.
//
// NEGA BITTA GLOBAL NUSXA: har `new PrismaClient()` o'z ulanish hovuzini
// (connection pool) ochadi. Modul har safar qayta yuklansa (nodemon,
// testlar) hovuzlar to'planib, PostgreSQL `too many clients` bilan rad
// eta boshlaydi. `globalThis` da saqlash shuni oldini oladi.
// ═══════════════════════════════════════════════════════════════════════════

const globalForPrisma = globalThis;

const createClient = () =>
  new PrismaClient({
    // `passwordHash` HECH QACHON o'z-o'zidan qaytmaydi.
    //
    // Bu Mongoose'dagi `select: false` ning aynan ekvivalenti
    // (qarang: eski user.model.js). Ehtiyot chorasi ataylab shu
    // qatlamda: xesh javobga tushib qolishi uchun kimdir uni ochiq
    // so'rashi kerak bo'ladi, unutish bilan sizib chiqmaydi.
    //
    // Kerak bo'lganda (faqat login va parol tekshiruvida):
    //     prisma.user.findFirst({ omit: { passwordHash: false }, ... })
    omit: {
      user: { passwordHash: true },
    },
    log:
      env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "warn" },
            { emit: "event", level: "error" },
          ]
        : [{ emit: "event", level: "error" }],
  });

const prisma = globalForPrisma.__prisma ?? createClient();

if (!globalForPrisma.__prisma) {
  prisma.$on("error", (e) => logger.error({ prisma: e }, "Prisma xatosi"));
  if (env.NODE_ENV === "development") {
    prisma.$on("warn", (e) => logger.warn({ prisma: e }, "Prisma ogohlantirishi"));
  }
  globalForPrisma.__prisma = prisma;
}

// ─────────────────────────────────────────────────────────────────────────
// MONGO'DAN QOLGAN FARQ: TTL indekslari.
//
// MongoDB `expireAfterSeconds` bilan eskirgan hujjatni O'ZI o'chirardi.
// PostgreSQL'da bunday mexanizm yo'q. Shuning uchun quyidagi jadvallar
// endi `jobs/ttlCleanup.job.js` tomonidan tozalanadi:
//     caches         — expiresAt bo'yicha
//     refresh_tokens — expiresAt bo'yicha
//     ai_runs        — 90 kun
//     ai_usage_logs  — 400 kun
//
// Agar o'sha job o'chirilsa jadvallar CHEKSIZ o'sadi — bu jimgina
// disk to'lishiga olib keladi.
// ─────────────────────────────────────────────────────────────────────────

export const connectDB = async () => {
  await prisma.$connect();
  // Ulanish haqiqatan tirikligini tekshiramiz: $connect() hovuz yaratadi,
  // lekin birinchi so'rovgacha xatoni ko'rsatmasligi mumkin.
  await prisma.$queryRaw`SELECT 1`;
  logger.info("PostgreSQL ulandi (Prisma)");
};

export const disconnectDB = async () => {
  await prisma.$disconnect();
  logger.info("PostgreSQL uzildi");
};

export default prisma;
