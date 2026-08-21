/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B20 — `applyPaidDelta` TRANZAKSIYADAN CHIQIB KETMASLIGI (ikkala stek).
 *
 * ── QANDAY XATO EDI ──
 *
 * `salaryTransaction.writeSalaryTransaction()` `applyPaidDelta` ni
 * tranzaksiya ICHIDA `{ capToRemaining: true, tx }` bilan chaqiradi.
 * Lekin imzo `tx` ni QABUL QILIB, uni JIMGINA TASHLAB YUBORARDI va xom
 * `UPDATE` GLOBAL klientda — tranzaksiyadan TASHQARIDA — bajarilardi.
 *
 * O'LCHANDI (HEAD kodiga qarshi, ikkala stekda):
 *   tranzaksiya ICHIDA  → paidAmount = 50000
 *   ROLLBACK'DAN KEYIN  → paidAmount = 50000   ← OMON QOLDI
 *
 * OQIBATI: `salaryTransaction.create` yoki `postTeacherPayroll` yiqilsa
 * to'lov qatori va jurnal yozuvi ROLLBACK bo'lardi, `paidAmount` esa
 * o'sganicha qolardi — maosh "TO'LANGAN" ko'rinib, unga mos PUL YOZUVI
 * BO'LMASDI. Bu hisobotdagi farq emas, PUL XAVFSIZLIGI xatosi.
 *
 * ── BU TEST NEGA HTTP ORQALI EMAS ──
 *
 * Xato faqat tranzaksiya YIQILGANDA ko'rinadi. HTTP orqali yiqilishni
 * ishonchli keltirib chiqarib bo'lmaydi (u ichki holatga bog'liq), va
 * "yiqilishni majburlash" uchun mahsulot kodini o'zgartirish kerak
 * bo'lardi — ya'ni test o'zi sinayotgan narsani tahrirlardi.
 *
 * Shuning uchun servis TO'G'RIDAN-TO'G'RI chaqiriladi va tranzaksiya
 * ATAYLAB bekor qilinadi. Bu xatoning AYNAN mexanizmini o'lchaydi.
 *
 * ── MUSBAT NAZORAT (SHART) ──
 *
 * Yozuv tranzaksiya ICHIDA sodir bo'lganini avval ISBOTLAYMIZ
 * (`paidAmount === 50000`). Usiz har qanday xato — ulanish tugashi,
 * yaroqsiz SQL — "0 qoldi" natijasini berardi va test uni "atomiklik
 * ishlayapti" deb YOLG'ON YASHIL yozardi. Shu tuzoqqa bir marta
 * tushilgan: `$executeRaw` 42601 bilan yiqilganda zond "B20 yopilgan"
 * deb xabar qilgan edi.
 *
 * ── FIXTURE ──
 * O'ziga xos `TeacherSalary` qatori YARATILADI (year=2099) va yakunda
 * QATTIQ o'chiriladi. Haqiqiy maosh qatorlariga TEGILMAYDI.
 *
 * ISHLATISH:
 *   node --env-file=../server/.env test/teacher-salary-atomicity.test.mjs
 *   EXPRESS_SRC=<yo'l> NEST_DIST=<yo'l> ... (boshqa ish daraxti uchun)
 * ═══════════════════════════════════════════════════════════════════════════
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EXPRESS_SRC = process.env.EXPRESS_SRC || path.join(ROOT, 'server/src');
const NEST_DIST = process.env.NEST_DIST || fileURLToPath(new URL('../dist/', import.meta.url));

const R = { pass: 0, fail: 0, unmeasured: 0 };
const ok = (n) => { R.pass += 1; console.log(`  ✅ ${n}`); };
const bad = (n, m) => { R.fail += 1; console.log(`  ❌ ${n}\n      ${m}`); };
const skip = (n, m) => { R.unmeasured += 1; console.log(`  ⚠️  ${n} — O'LCHANMADI: ${m}`); };
const url = (p) => pathToFileURL(p).href;

/**
 * BITTA STEK UCHUN SINOV.
 *
 * @param name    stek nomi
 * @param prisma  o'sha stek ISHLATADIGAN klient (kengaytmalari bilan —
 *                boshqa nusxadan olingan `tx` xom SQL parametrlarini
 *                buzadi va 42601 beradi)
 * @param apply   `(salaryId, delta, { capToRemaining, tx }) => ...`
 */
const checkStack = async (name, prisma, apply) => {
  const teacher = await prisma.user.findFirst({
    where: { role: 'teacher', isDeleted: false }, select: { id: true },
  });
  const branch = await prisma.branch.findFirst({
    where: { isDeleted: false }, select: { id: true },
  });
  if (!teacher || !branch) { skip(`${name}`, "o'qituvchi yoki filial yo'q"); return; }

  // ⚠ O'Z FIXTURE'I: year=2099 — hech qanday hisobotga tushmaydi.
  const row = await prisma.teacherSalary.create({
    data: {
      branchId: branch.id, teacherId: teacher.id, kind: 'base',
      year: 2099, month: 12, expectedAmount: 100000, paidAmount: 0,
    },
    select: { id: true },
  });

  try {
    let wroteInside = false;
    try {
      await prisma.$transaction(async (tx) => {
        const upd = await apply(row.id, 50000, { capToRemaining: true, tx });
        if (!upd) throw new Error('applyPaidDelta null qaytardi — yozuv BO\'LMADI');
        const inside = await tx.teacherSalary.findUnique({
          where: { id: row.id }, select: { paidAmount: true },
        });
        wroteInside = Number(inside.paidAmount) === 50000;
        if (!wroteInside) {
          throw new Error(`ichkarida kutilgan 50000, keldi ${inside.paidAmount}`);
        }
        // ATAYLAB: tranzaksiya bekor qilinadi.
        throw new Error('__ROLLBACK__');
      });
    } catch (err) {
      if (err.message !== '__ROLLBACK__' && !wroteInside) {
        // ⚠ MUSBAT NAZORAT YIQILDI — natija hech nimani anglatmaydi.
        skip(`${name}: atomiklik`, `yozuv sodir bo'lmadi: ${err.message}`);
        return;
      }
    }
    if (!wroteInside) { skip(`${name}: atomiklik`, "yozuv sodir bo'lmadi"); return; }
    ok(`${name}: MUSBAT NAZORAT — yozuv tranzaksiya ichida ko'rindi (50000)`);

    const after = await prisma.teacherSalary.findUnique({
      where: { id: row.id }, select: { paidAmount: true },
    });
    const left = Number(after.paidAmount);
    if (left === 0) {
      ok(`${name}: ROLLBACK \`paidAmount\` ni ham qaytardi (B20 yopiq)`);
    } else {
      bad(
        `${name}: B20 — YOZUV ROLLBACK'DAN OMON QOLDI`,
        `rollback'dan keyin paidAmount=${left}, kutilgan 0. ` +
          '`applyPaidDelta` `tx` ni e\'tiborsiz qoldirmoqda — maosh ' +
          '"to\'langan" ko\'rinib, pul yozuvi bo\'lmasligi mumkin.',
      );
    }
  } finally {
    // ⚠ FIXTURE QATTIQ o'chiriladi (yumshoq o'chirish ustuni yo'q — B22).
    await prisma.teacherSalary.deleteMany({ where: { id: row.id } });
  }
};

console.log('\n\x1b[1mB20 — MAOSH BALANSI ATOMIKLIGI\x1b[0m\n');

// ═══════════════════ EXPRESS ═══════════════════
let expressPrisma = null;
try {
  expressPrisma = (await import(url(path.join(EXPRESS_SRC, 'config/prisma.js')))).default;
  const svc = await import(
    url(path.join(EXPRESS_SRC, 'modules/teacherSalary/services/teacherSalary.service.js'))
  );
  await checkStack('express', expressPrisma, svc.applyPaidDelta);
} catch (err) {
  skip('express', err.message);
}

// ═══════════════════ NESTJS ═══════════════════
//
// ⚠ HTTP EMAS, DI KONTEKSTI: `createApplicationContext` kontrollerlarni
// ko'tarmaydi, ya'ni port ham, tezlik chegarasi ham aralashmaydi.
try {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import(url(path.join(NEST_DIST, 'app.module.js')));
  const { TeacherSalaryService } = await import(
    url(path.join(NEST_DIST, 'modules/teacher-salary/teacher-salary.service.js'))
  );
  const { PrismaService } = await import(url(path.join(NEST_DIST, 'prisma/prisma.service.js')));

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const salaries = app.get(TeacherSalaryService);
    const prisma = app.get(PrismaService);
    await checkStack('nest', prisma, (id, d, opts) => salaries.applyPaidDelta(id, d, opts));
  } finally {
    await app.close();
  }
} catch (err) {
  skip('nest', err.message);
}

if (expressPrisma) await expressPrisma.$disconnect();
console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
process.exit(R.fail || R.unmeasured ? 1 : 0);
