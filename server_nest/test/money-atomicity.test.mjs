/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B20 — `applyPaidDelta` TRANZAKSIYADAN CHIQIB KETMASLIGI.
 *
 * UCHTA PUL YO'LI × IKKI STEK = 6 ta o'lchov.
 *
 *   teacherSalary  → `teacher_salaries.paidAmount`
 *   staffPayroll   → `staff_payrolls.paidAmount`
 *   studentPayment → `student_payments.paidAmount`
 *
 * ── QANDAY XATO EDI ──
 *
 * To'lov yozuvchi servis `applyPaidDelta` ni tranzaksiya ICHIDA
 * `{ capToRemaining: true, tx }` bilan chaqiradi. `teacherSalary` va
 * `staffPayroll` da imzo `tx` ni QABUL QILMASDI (yoki qabul qilib
 * TASHLAB YUBORARDI) va xom `UPDATE` GLOBAL klientda — tranzaksiyadan
 * TASHQARIDA — bajarilardi.
 *
 * O'LCHANGAN EDI (HEAD kodiga qarshi):
 *   tranzaksiya ICHIDA  → paidAmount = 50000
 *   ROLLBACK'DAN KEYIN  → paidAmount = 50000   ← OMON QOLDI
 *
 * OQIBATI: to'lov qatori va jurnal yozuvi ROLLBACK bo'lardi, `paidAmount`
 * esa o'sganicha qolardi — maosh/to'lov "TO'LANGAN" ko'rinib, unga mos
 * PUL YOZUVI BO'LMASDI. Bu hisobotdagi farq emas, PUL XAVFSIZLIGI xatosi.
 *
 * ── BU TEST NEGA HTTP ORQALI EMAS ──
 *
 * Xato faqat tranzaksiya YIQILGANDA ko'rinadi. HTTP orqali yiqilishni
 * ishonchli keltirib chiqarib bo'lmaydi, "yiqilishni majburlash" esa
 * mahsulot kodini tahrirlashni talab qilardi — ya'ni test o'zi sinayotgan
 * narsani o'zgartirardi. Shuning uchun servis TO'G'RIDAN-TO'G'RI
 * chaqiriladi va tranzaksiya ATAYLAB bekor qilinadi.
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
 * Har bir yo'l uchun o'ziga xos qator (year=2099, month=12) YARATILADI va
 * `finally` da QATTIQ o'chiriladi. Haqiqiy moliya qatorlariga TEGILMAYDI.
 * Tozalash API'ga TAYANMAYDI — to'g'ridan-to'g'ri Prisma.
 *
 * ISHLATISH:
 *   node --env-file=../server/.env test/money-atomicity.test.mjs
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

const AMOUNT = 50000;

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PUL YO'LLARI — har biri o'z fixture'ini yaratadi va o'chiradi.
 *
 * `delegate` — Prisma model nomi (`teacherSalary` / `staffPayroll` /
 * `studentPayment`). Fixture yaratish, o'qish va o'chirish shu orqali.
 * ═══════════════════════════════════════════════════════════════════════
 */
const PATHS = [
  {
    key: 'teacherSalary',
    delegate: 'teacherSalary',
    express: ['modules/teacherSalary/services/teacherSalary.service.js', 'applyPaidDelta'],
    nest: ['modules/teacher-salary/teacher-salary.service.js', 'TeacherSalaryService'],
    /** @returns fixture `data` yoki `null` (old shart bajarilmasa) */
    fixture: async (prisma) => {
      const teacher = await prisma.user.findFirst({
        where: { role: 'teacher', isDeleted: false }, select: { id: true },
      });
      const branch = await prisma.branch.findFirst({
        where: { isDeleted: false }, select: { id: true },
      });
      if (!teacher || !branch) return null;
      return {
        branchId: branch.id, teacherId: teacher.id, kind: 'base',
        year: 2099, month: 12, expectedAmount: 100000, paidAmount: 0,
      };
    },
  },
  {
    key: 'staffPayroll',
    delegate: 'staffPayroll',
    express: ['modules/staffPayroll/services/staffPayroll.service.js', 'applyPaidDelta'],
    nest: ['modules/staff-payroll/staff-payroll.service.js', 'StaffPayrollService'],
    fixture: async (prisma) => {
      // ⚠ `@@unique([employeeId, year, month])` — bandligini tekshirmasdan
      // yaratsak mavjud qatorga urilib, xato "atomiklik yiqildi" ga
      // o'xshab ko'rinardi. Bo'sh xodim tanlanadi.
      const branch = await prisma.branch.findFirst({
        where: { isDeleted: false }, select: { id: true },
      });
      const staff = await prisma.user.findFirst({
        where: {
          isDeleted: false,
          role: { notIn: ['student'] },
          NOT: { staffPayrolls: { some: { year: 2099, month: 12 } } },
        },
        select: { id: true },
      });
      if (!staff || !branch) return null;
      return {
        branchId: branch.id, employeeId: staff.id,
        year: 2099, month: 12, finalAmount: 100000, paidAmount: 0,
      };
    },
  },
  {
    key: 'studentPayment',
    delegate: 'studentPayment',
    express: ['modules/finance/services/studentPayment.service.js', 'applyPaidDelta'],
    nest: ['modules/finance/student-payment.service.js', 'StudentPaymentService'],
    fixture: async (prisma) => {
      const group = await prisma.group.findFirst({
        where: { isDeleted: false }, select: { id: true, branchId: true },
      });
      const student = await prisma.user.findFirst({
        where: { role: 'student', isDeleted: false }, select: { id: true },
      });
      if (!group || !student) return null;
      return {
        branchId: group.branchId, studentId: student.id, groupId: group.id,
        year: 2099, month: 12, expectedAmount: 100000, paidAmount: 0,
      };
    },
  },
];

/**
 * BITTA (yo'l × stek) O'LCHOVI.
 *
 * @param label   "express: staffPayroll" kabi
 * @param prisma  o'sha stek ISHLATADIGAN klient. ⚠ BOSHQA NUSXADAN
 *                olingan `tx` xom SQL parametrlarini buzadi (42601) —
 *                shuning uchun klient stekka MOS bo'lishi shart.
 * @param apply   `(id, delta, { capToRemaining, tx }) => row|null`
 */
const checkOne = async (label, spec, prisma, apply) => {
  const data = await spec.fixture(prisma);
  if (!data) { skip(label, 'old shart uchun ma\'lumot yo\'q (foydalanuvchi/filial/guruh)'); return; }

  const model = prisma[spec.delegate];
  let row;
  try {
    row = await model.create({ data, select: { id: true } });
  } catch (err) {
    skip(label, `fixture yaratilmadi: ${err.message.split('\n')[0]}`);
    return;
  }

  try {
    let wroteInside = false;
    try {
      await prisma.$transaction(async (tx) => {
        const upd = await apply(row.id, AMOUNT, { capToRemaining: true, tx });
        if (!upd) throw new Error("applyPaidDelta null qaytardi — yozuv BO'LMADI");
        const inside = await tx[spec.delegate].findUnique({
          where: { id: row.id }, select: { paidAmount: true },
        });
        wroteInside = Number(inside.paidAmount) === AMOUNT;
        if (!wroteInside) {
          throw new Error(`ichkarida kutilgan ${AMOUNT}, keldi ${inside.paidAmount}`);
        }
        // ATAYLAB: tranzaksiya bekor qilinadi.
        throw new Error('__ROLLBACK__');
      });
    } catch (err) {
      if (err.message !== '__ROLLBACK__' && !wroteInside) {
        // ⚠ MUSBAT NAZORAT YIQILDI — natija hech nimani anglatmaydi.
        skip(label, `yozuv sodir bo'lmadi: ${err.message.split('\n')[0]}`);
        return;
      }
    }
    if (!wroteInside) { skip(label, "yozuv sodir bo'lmadi"); return; }

    const after = await model.findUnique({
      where: { id: row.id }, select: { paidAmount: true },
    });
    const left = Number(after.paidAmount);
    if (left === 0) {
      ok(`${label}: ichkarida ${AMOUNT} ko'rindi, ROLLBACK'dan keyin 0 (B20 yopiq)`);
    } else {
      bad(
        `${label}: B20 — YOZUV ROLLBACK'DAN OMON QOLDI`,
        `rollback'dan keyin paidAmount=${left}, kutilgan 0. ` +
          "`applyPaidDelta` `tx` ni e'tiborsiz qoldirmoqda — to'lov " +
          '"amalga oshgan" ko\'rinib, pul yozuvi bo\'lmasligi mumkin.',
      );
    }
  } finally {
    // ⚠ TOZALASH API'GA TAYANMAYDI — to'g'ridan-to'g'ri Prisma, va
    // `deleteMany` (yo'q qatorda ham yiqilmaydi).
    await model.deleteMany({ where: { id: row.id } }).catch(() => {});
  }
};

console.log('\n\x1b[1mB20 — PUL BALANSI ATOMIKLIGI (3 yo\'l × 2 stek)\x1b[0m\n');

// ═══════════════════════ EXPRESS ═══════════════════════
let expressPrisma = null;
try {
  expressPrisma = (await import(url(path.join(EXPRESS_SRC, 'config/prisma.js')))).default;
} catch (err) {
  skip('express', `prisma klienti yuklanmadi: ${err.message}`);
}
if (expressPrisma) {
  for (const spec of PATHS) {
    try {
      const svc = await import(url(path.join(EXPRESS_SRC, spec.express[0])));
      await checkOne(`express: ${spec.key}`, spec, expressPrisma, svc[spec.express[1]]);
    } catch (err) {
      skip(`express: ${spec.key}`, err.message.split('\n')[0]);
    }
  }
}

// ═══════════════════════ NESTJS ═══════════════════════
//
// ⚠ HTTP EMAS, DI KONTEKSTI: `createApplicationContext` kontrollerlarni
// ko'tarmaydi, ya'ni port ham, tezlik chegarasi ham aralashmaydi.
try {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import(url(path.join(NEST_DIST, 'app.module.js')));
  const { PrismaService } = await import(url(path.join(NEST_DIST, 'prisma/prisma.service.js')));

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const prisma = app.get(PrismaService);
    for (const spec of PATHS) {
      try {
        const mod = await import(url(path.join(NEST_DIST, spec.nest[0])));
        const svc = app.get(mod[spec.nest[1]]);
        await checkOne(
          `nest   : ${spec.key}`, spec, prisma,
          (id, d, opts) => svc.applyPaidDelta(id, d, opts),
        );
      } catch (err) {
        skip(`nest   : ${spec.key}`, err.message.split('\n')[0]);
      }
    }
  } finally {
    await app.close();
  }
} catch (err) {
  skip('nest', err.message.split('\n')[0]);
}

if (expressPrisma) await expressPrisma.$disconnect();
console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
process.exit(R.fail || R.unmeasured ? 1 : 0);
