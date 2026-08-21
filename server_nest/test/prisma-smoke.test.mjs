/**
 * PRISMA DUDBO'RON TESTI (smoke test) — FAZA 1.
 *
 * ISBOTLAYDI:
 *   1) NestJS ilovasi ko'tariladi;
 *   2) `PrismaService` DI orqali beriladi;
 *   3) PostgreSQL'ga ulanadi;
 *   4) XAVFSIZ o'qish so'rovi bajariladi;
 *   5) saqlangan Prisma xatti-harakatlari joyida;
 *   6) tartibli to'xtaydi.
 *
 * ⚠ BAZAGA HECH NARSA YOZMAYDI. Faqat `count()`, `findFirst()` va
 * `SELECT 1`. Jurnal o'zgarmasligini tekshirish uchun `update` CHAQIRILADI,
 * lekin u ATAYLAB TO'SILADI — ya'ni yozuv ham o'zgarmaydi.
 *
 * `dist/` dan ishlaydi (kompilyatsiya qilingan kod bilan), ya'ni build
 * natijasi ham tekshiriladi.
 *
 * ISHLATISH:  npm run build && npm run test:smoke
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';

const R = { pass: 0, fail: 0 };
const ok = (n, extra = '') => { R.pass += 1; console.log(`  ✅ ${n}${extra ? ` — ${extra}` : ''}`); };
const bad = (n, extra = '') => { R.fail += 1; console.log(`  ❌ ${n}${extra ? ` — ${extra}` : ''}`); };

const run = async () => {
  console.log('\n\x1b[1mNestJS poydevori — Prisma dudbo\'ron testi\x1b[0m\n');

  // ── 1. Ilova ko'tariladi (HTTP porti OCHILMAYDI) ──
  // `createApplicationContext` — ataylab: port band bo'lishi mumkin va
  // bu test HTTP emas, DI + Prisma zanjirini tekshiradi.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  ok('NestJS konteksti ko\'tarildi (AppModule)');

  try {
    // ── 2. PrismaService DI orqali keladi ──
    const prisma = app.get(PrismaService);
    prisma && typeof prisma.$queryRaw === 'function'
      ? ok('PrismaService DI orqali olindi')
      : bad('PrismaService olinmadi');

    // ── 3 + 4. Ulanish va xavfsiz o'qish ──
    const [row] = await prisma.$queryRaw`SELECT 1 AS ok`;
    Number(row?.ok) === 1
      ? ok('PostgreSQL ulanishi ishlayapti', 'SELECT 1')
      : bad('SELECT 1 kutilgan natijani bermadi');

    const users = await prisma.user.count();
    typeof users === 'number'
      ? ok('xavfsiz o\'qish so\'rovi bajarildi', `users.count() = ${users}`)
      : bad('users.count() ishlamadi');

    // ── 5. SAQLANGAN XATTI-HARAKATLAR ──
    console.log('\n  \x1b[1mSaqlangan Prisma xatti-harakatlari\x1b[0m');

    // (a) passwordHash standart holda YO'Q
    const u = await prisma.user.findFirst({ select: undefined });
    if (!u) {
      console.log('  – foydalanuvchi yo\'q, passwordHash tekshiruvi o\'tkazilmadi');
    } else {
      !('passwordHash' in u)
        ? ok('passwordHash standart javobda YO\'Q')
        : bad('passwordHash sizib chiqdi');
      const u2 = await prisma.user.findFirst({
        where: { id: u.id }, omit: { passwordHash: false },
      });
      typeof u2?.passwordHash === 'string'
        ? ok('passwordHash ochiq so\'ralganda QAYTADI')
        : bad('passwordHash ochiq so\'ralganda ham kelmadi');
    }

    // (b) Decimal → son (pul arifmetikasi satr biriktirishga aylanmasin)
    //
    // Manba bir nechta jadvaldan qidiriladi: demo ma'lumot qaysi seed
    // ishlaganiga qarab farq qiladi va tekshiruv "o'tkazib yuborildi"
    // bo'lib qolmasligi kerak — aynan shu kengaytma yo'qolsa pul
    // arifmetikasi JIMGINA satr biriktirishga aylanadi.
    const decimalSources = [
      ['journal_entries.totalDebit', () => prisma.journalEntry.findMany({ take: 2, select: { totalDebit: true } }), 'totalDebit'],
      ['group_fees.amount', () => prisma.groupFee.findMany({ take: 2, select: { amount: true } }), 'amount'],
      ['student_payments.expectedAmount', () => prisma.studentPayment.findMany({ take: 2, select: { expectedAmount: true } }), 'expectedAmount'],
    ];
    let decimalChecked = false;
    for (const [label, fetch, field] of decimalSources) {
      const rows = await fetch();
      if (rows.length < 2) continue;
      const [a, b] = [rows[0][field], rows[1][field]];
      const sum = a + b;
      typeof a === 'number' && typeof sum === 'number' && String(sum).length < 20
        ? ok('Decimal → son', `${label}: ${a} + ${b} = ${sum}`)
        : bad('Decimal normalizatsiyasi ishlamadi', `natija: ${sum} (${typeof sum})`);
      decimalChecked = true;
      break;
    }
    if (!decimalChecked) bad('Decimal tekshiruvi uchun ma\'lumot topilmadi', 'seed ishga tushiring');

    // (c) Jurnal o'zgarmasligi — update TO'SILISHI shart
    const entry = await prisma.journalEntry.findFirst({ select: { id: true } });
    if (!entry) {
      console.log('  – jurnal bo\'sh, o\'zgarmaslik tekshiruvi o\'tkazilmadi');
    } else {
      let blocked = null;
      try {
        await prisma.journalEntry.update({ where: { id: entry.id }, data: { memo: 'smoke' } });
      } catch (err) {
        blocked = err;
      }
      const body = blocked?.response ?? blocked?.message ?? '';
      const code = typeof body === 'object' ? body.code : String(body);
      blocked && /JOURNAL_IMMUTABLE/.test(JSON.stringify(body) + String(code))
        ? ok('jurnal yozuvini tahrirlash to\'sildi', 'JOURNAL_IMMUTABLE')
        : bad('jurnal o\'zgarmasligi ishlamadi', blocked ? 'boshqa xato' : 'tahrir o\'tib ketdi');
    }
  } finally {
    // ── 6. Tartibli to'xtash ──
    await app.close();
    ok('ilova tartibli yopildi (Prisma ulanishi uzildi)');
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi\n`);
  process.exit(R.fail ? 1 : 0);
};

run().catch((err) => {
  console.error('Dudbo\'ron testi xatosi:', err);
  process.exit(1);
});
