import { Logger } from '@nestjs/common';
import {
  createExtendedPrismaClient,
  type ExtendedPrismaClient,
} from '../prisma/prisma.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SEED YURGIZGICH — barcha seed skriptlari uchun umumiy qobiq.
 *
 * ── NEGA `NestFactory.createApplicationContext` EMAS ──
 *
 * Bu NestJS'dagi odatiy naqsh, lekin bu loyihada u XAVFLI. `AppModule`
 * ichida `JobsModule` va `BotModule` bor va ikkalasi ham
 * `onApplicationBootstrap` da o'zini ishga tushiradi — `createApplicationContext`
 * esa bu hook'ni CHAQIRADI. Ya'ni oddiy `seed:permissions` buyrug'i:
 *   • 25 ta cron ishini IKKINCHI marta ro'yxatga olardi (ishlab turgan
 *     server allaqachon ularni yurgizyapti — ikkilangan bildirishnoma,
 *     ikkilangan maosh hisobi);
 *   • Telegram polling'ini ikkinchi nusxada ochishga urinardi.
 * Ikkalasi ham env bayrog'i bilan o'chirilgan bo'lishi MUMKIN, lekin
 * seed ularning qiymatiga TAYANMASLIGI kerak: `.env` da hozir
 * `NEST_WORKERS_ENABLED=true` va `TELEGRAM_BOT_ENABLED=true`.
 *
 * Ko'chirilgan seed'larning HECH BIRIGA Nest servisi kerak emas — ular
 * faqat Prisma bilan ishlaydi (Express tomonida ham shunday edi). Shuning
 * uchun bu yerda DI konteyneri umuman ochilmaydi.
 *
 * ⚠ Nest SERVISIGA tayanadigan seed kerak bo'lsa (masalan `journalBackfill`
 * — u `journal.service` ni chaqiradi), o'shanda `createApplicationContext`
 * kerak bo'ladi va u paytda yuqoridagi bayroqlarni MAJBURAN o'chirish shart.
 *
 * ── KLIENT NEGA `createExtendedPrismaClient` ──
 *
 * Xom `new PrismaClient()` kengaytmalarni OLMAYDI: `passwordHash` niqobi,
 * Decimal→son normalizatsiyasi va jurnal o'zgarmasligi qo'riqchisi
 * yo'qoladi. Seed pul ustunlariga tegsa, xato JIMGINA bo'lardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface SeedContext {
  prisma: ExtendedPrismaClient;
  logger: Logger;
}

/**
 * Seed'ni yurgizadi va JARAYONNI YOPADI.
 *
 * Xato bo'lsa `process.exitCode = 1` — `process.exit(1)` EMAS: Prisma
 * ulanishi yopilishiga ulgurmay jarayon o'lsa PostgreSQL tomonda ochiq
 * sessiya qolib ketadi.
 */
export const runSeed = async (
  name: string,
  fn: (ctx: SeedContext) => Promise<void>,
): Promise<void> => {
  const logger = new Logger(`seed:${name}`);
  const prisma = createExtendedPrismaClient();

  try {
    await prisma.$connect();
    await fn({ prisma, logger });
    logger.log('Tayyor');
  } catch (err) {
    logger.error(`Seed xato: ${(err as Error).message}`, (err as Error).stack);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};
