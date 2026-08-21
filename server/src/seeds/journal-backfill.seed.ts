/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MIGRATSIYA: mavjud pul yozuvlarini JURNALGA ko'chirish (B21) —
 * `server_legacy/src/seeds/journalBackfill.seed.js` dan ko'chirilgan.
 *
 * ── NEGA KERAK ──
 * Jurnal BO'SH holatda ishga tushgan. Ulanish qo'shilgach FAQAT YANGI
 * to'lovlar unga tushadi — eski tarix esa yo'q. Natijada "kassada qancha
 * pul bor" savoliga jurnal NOL javob berardi, aslida kassada millionlab
 * so'm bo'lsa ham. Bu skript butun tarixni qayta o'ynatadi.
 *
 * ⚠ O'LCHANGAN HOLAT (2026-08-22, dev bazasi): jurnalsiz tranzaksiya
 * 0 ta, bekor qilingani 0 ta — ya'ni bu bazada skript HECH NARSA
 * o'zgartirmaydi. U ISHLAB CHIQARISH uchun tayyor turadi.
 *
 * ── IDEMPOTENTLIK ──
 * Har yozuvning `postingKey` i bor va u DB darajasida unique (qarang
 * `20260819120000_journal_posting_key`). Servis takroriy urinishda
 * mavjud yozuvni qaytaradi (`duplicate: true`). Ya'ni idempotentlik
 * skript mantiqiga emas, INDEKSGA tayanadi — skriptni istalgancha
 * qayta yugurtirish mumkin.
 *
 * ── TARTIB MUHIM ──
 * Depozitga to'ldirish QOPLASHDAN oldin yozilishi kerak — aks holda
 * oraliq holatda depozit hisobi manfiy ko'rinardi. Manbalar tartibi va
 * har biri ichida sana bo'yicha saralash buni ta'minlaydi.
 *
 * ── ISHLATISH ──
 *   npm run migrate:journal-backfill
 *   npm run migrate:journal-backfill -- --dry     (faqat sanaydi)
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { Logger } from '@nestjs/common';

/**
 * ⚠⚠ ENV BAYROQLARI IMPORTDAN OLDIN O'CHIRILADI ⚠⚠
 *
 * Bu YAGONA seed bo'lib, u Nest DI konteynerini ochadi (chunki
 * `FinancialTransactionService` va `JournalService` kerak — ular
 * Prisma'dan tashqari dimension/approval mantiqiga ham tayanadi va uni
 * qayta yozish AYNI mantiqni IKKI joyda saqlash demakdir).
 *
 * `NestFactory.createApplicationContext` `onApplicationBootstrap` ni
 * CHAQIRADI, ya'ni himoyasiz holda:
 *   • `JobsModule` 25 ta cron ishini IKKINCHI marta ro'yxatga olardi —
 *     ishlab turgan server allaqachon ularni yuritayapti (ikkilangan
 *     bildirishnoma, ikkilangan maosh hisobi);
 *   • `BotModule` ikkinchi Telegram polling'ini ochishga urinardi.
 * `.env` da hozir `NEST_WORKERS_ENABLED=true` va
 * `TELEGRAM_BOT_ENABLED=true`, ya'ni bu NAZARIY xavf EMAS.
 *
 * Shuning uchun bayroqlar shu yerda MAJBURAN o'chiriladi va `AppModule`
 * DINAMIK import qilinadi — statik import ESM'da modul tanasidan OLDIN
 * baholanadi va o'chirish KECH qolardi.
 */
process.env.NEST_WORKERS_ENABLED = 'false';
process.env.NEST_WORKER_JOBS = '';
process.env.TELEGRAM_BOT_ENABLED = 'false';
process.env.NEST_BOT_POLLING = 'false';
process.env.NEST_IMPORT_WORKER = 'false';

const isDry = process.argv.includes('--dry');
const logger = new Logger('seed:journal-backfill');

interface Tally { posted: number; skipped: number; failed: number }

const run = async (): Promise<void> => {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module.js');
  const { PrismaService } = await import('../prisma/prisma.service.js');
  const { FinancialTransactionService } = await import(
    '../modules/finance/financial-transaction.service.js'
  );
  const { JournalService } = await import('../modules/journal/journal.service.js');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get<any>(PrismaService);
    const fin = app.get(FinancialTransactionService);
    const journal = app.get(JournalService);

    if (isDry) logger.log("QURUQ YURISH (--dry): hech narsa yozilmaydi");

    const totals: Tally = { posted: 0, skipped: 0, failed: 0 };

    const runSource = async ({
      label, rows, post,
    }: {
      label: string;
      rows: { id: string }[];
      post: (row: { id: string }) => Promise<{ entry: unknown; duplicate: boolean; skipped?: string }>;
    }): Promise<void> => {
      let posted = 0; let skipped = 0; let failed = 0;

      for (const row of rows) {
        if (isDry) { posted += 1; continue; }
        try {
          const res = await post(row);
          if (res?.duplicate) skipped += 1;
          else if (res?.skipped || !res?.entry) skipped += 1;
          else posted += 1;
        } catch (err) {
          failed += 1;
          logger.warn(`Yozib bo'lmadi [${label}] ${row.id}: ${(err as Error).message}`);
        }
      }

      logger.log(
        `${label}: yozildi=${posted}, o'tkazildi=${skipped}, yiqildi=${failed} (jami ${rows.length})`,
      );
      totals.posted += posted; totals.skipped += skipped; totals.failed += failed;
    };

    const byDate = (f: string) => [{ [f]: 'asc' }, { id: 'asc' }];

    // 1) DEPOZITGA TO'LDIRISH — qoplashdan OLDIN bo'lishi SHART.
    await runSource({
      label: 'deposit_in',
      rows: await prisma.depositTransaction.findMany({
        where: { type: 'topup', isDeleted: false, branchId: { not: null } },
        orderBy: byDate('paidAt'),
      }),
      post: (d) => fin.postDepositTopup({ depositTransactionId: d.id }, null),
    });

    // 2) DEPOZITDAN QAYTARISH
    await runSource({
      label: 'deposit_out',
      rows: await prisma.depositTransaction.findMany({
        where: { type: 'withdraw', isDeleted: false, branchId: { not: null } },
        orderBy: byDate('paidAt'),
      }),
      post: (d) => fin.postDepositWithdraw({ depositTransactionId: d.id }, null),
    });

    // 3) O'QUVCHI TO'LOVI (depozitdan qoplanganlar BUNDAN TASHQARI)
    await runSource({
      label: 'payment',
      rows: await prisma.paymentTransaction.findMany({
        where: { isDeleted: false, source: { not: 'deposit' } },
        orderBy: byDate('paidAt'),
      }),
      post: (d) => fin.postStudentPayment({ paymentTransactionId: d.id }, null),
    });

    // 4) DEPOZITDAN OYLIKKA QOPLASH
    await runSource({
      label: 'deposit_apply',
      rows: await prisma.paymentTransaction.findMany({
        where: { isDeleted: false, source: 'deposit' },
        orderBy: byDate('paidAt'),
      }),
      post: (d) => fin.postDepositApply({ paymentTransactionId: d.id }, null),
    });

    // 5) CHIQIM (filialsizlar jurnalga tushmaydi — qarang `postExpense`)
    await runSource({
      label: 'expense',
      rows: await prisma.expense.findMany({
        where: { isDeleted: false, branchId: { not: null } },
        orderBy: byDate('spentAt'),
      }),
      post: (d) => fin.postExpense({ expenseId: d.id }, null),
    });

    // 6) O'QITUVCHI MAOSHI
    await runSource({
      label: 'salary_teacher',
      rows: await prisma.salaryTransaction.findMany({
        where: { isDeleted: false },
        orderBy: byDate('paidAt'),
      }),
      post: (d) => fin.postTeacherPayroll({ salaryTransactionId: d.id }, null),
    });

    // 7) XODIM MAOSHI
    await runSource({
      label: 'salary_staff',
      rows: await prisma.staffSalaryTransaction.findMany({
        where: { isDeleted: false },
        orderBy: byDate('paidAt'),
      }),
      post: (d) => fin.postStaffPayroll({ staffSalaryTransactionId: d.id }, null),
    });

    logger.log(
      `JAMI: yozildi=${totals.posted}, o'tkazildi=${totals.skipped}, yiqildi=${totals.failed}`,
    );

    if (!isDry) {
      // TEKSHIRUV: ko'chirishdan keyin jurnal MUVOZANATDA bo'lishi SHART.
      // Bu skriptning eng muhim qismi — u yozgan narsa buxgalteriya
      // qoidasini buzmaganini o'lchaydi.
      const check = await journal.reconcile();
      if ((check as any)?.ok) {
        logger.log('Tekshiruv: jurnal muvozanatda ✓');
      } else {
        logger.error(`TEKSHIRUV YIQILDI — jurnal nomuvozanat: ${JSON.stringify(check)}`);
        process.exitCode = 1;
      }
    }
  } catch (err) {
    logger.error(`Jurnal backfill xatosi: ${(err as Error).message}`, (err as Error).stack);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
};

void run();
