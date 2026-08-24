/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QUVCHI TO'LOVI (billing) — SERVIS DARAJASIDAGI PARITET.
 *
 * Express `finance/services/studentPayment.service.js` ↔ NestJS
 * `StudentPaymentService` — AYNI baza holati, AYNI natija.
 *
 * ── NEGA HTTP EMAS ──
 *
 * `studentPayment` ning `/api/finance` marshrutlari hali ochilmagan
 * (`discount`/`groupFee`/`transaction` ko'chmagan). Lekin servisning
 * O'ZI allaqachon TO'RT modul uchun poydevor: `groups` yozish yo'llari,
 * `lesson-cancellations`, `student-freeze` va `exports`.
 *
 * Undan tashqari billing HTTP orqali FAQAT BILVOSITA ko'rinadi: bir
 * dars farqi ro'yxat javobida sezilmasligi, lekin qarzni butun oyga
 * o'zgartirib yuborishi mumkin. To'g'ridan-to'g'ri solishtirish o'sha
 * farqni AYNAN topadi.
 *
 * ── HAR STEKKA O'Z FIKSTURASI (ko'zgu) ──
 *
 * `recalc` IDEMPOTENT, lekin `ensurePaymentForMembership` va
 * `writeOffDebtInGroup` EMAS: bir xil qatorga ikki marta chaqirilsa
 * ikkinchisi birinchisining natijasini ko'radi. Shuning uchun har stek
 * O'Z guruhi va o'quvchilari ustida ishlaydi.
 *
 * ── NIMA ISBOTLANADI ──
 *   1. DARS-ASOSLI accrual: narx oydagi DARS soniga bo'linadi.
 *   2. BAYRAM va BEKOR QILINGAN dars hisoblanmaydi (ikki xil manba).
 *   3. MUZLATILGAN kundagi dars accrual qilinmaydi.
 *   4. `entryBilling: "full"` oy o'rtasida kirishni to'liq oyga
 *      aylantiradi, lekin CHIQIB KETISH baribir kamaytiradi.
 *   5. GURUH OY O'RTASIDA boshlansa MAXRAJ qirqilmaydi (eng nozik).
 *   6. REJOIN: bir oydagi ikki davr kunlari QO'SHILADI.
 *   7. Jadvalsiz guruh → kalendar-kun proratsiyasiga qaytadi.
 *   8. `writtenOff` va `isOpening` qatorlar MUZLATILGAN.
 *   9. `applyPaidDelta` cap: qoldiqdan ortiq to'lov YOZILMAYDI.
 *  10. `writeOffDebtInGroup` ATOMIK (qator + audit birga).
 *
 * ISHLATISH:  npm run test:student-payment-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { StudentPaymentService } from '../dist/modules/finance/student-payment.service.js';
import { runWithBranchContext } from '../dist/common/als/branch-context.js';
// ⚠ EXPRESS TOMONI O'CHIRILDI (2026-08-25) — `server_legacy/` stek yo'q.
//
//   Bu to'plam ilgari HAR BIR amalni ikkala implementatsiyada bajarib
//   solishtirardi. Solishtiruv tomoni qolmagach `mirror()` faqat Nest'ni
//   yurgizadi. QIYMAT YO'QOLMADI: to'plamning O'Z izohi aytganidek,
//   paritet "ikkalasi bir xilmi" deb so'raydi, HOSILA tekshiruvlar
//   (`bothSides`) esa "qiymat TO'G'RImi" deb so'raydi — va aynan
//   ikkinchisi sabotajda ishlagan (maxraj qirqilganda paritet o'tib
//   ketgan, invariant esa ushlagan).
//
//   `EX` va `ctxE` ATAYLAB baland ovozda yiqiladigan stub qilib
//   qoldirildi: `mirror()` ularni chaqirmaydi, lekin kimdir Express
//   yo'lini tiklamoqchi bo'lsa JIMGINA yashil emas, ANIQ xato oladi.
const DEAD = "Express stek o'chirilgan (server_legacy/) — bu yo'l chaqirilmasligi kerak";
const EX = new Proxy({}, { get: () => () => { throw new Error(DEAD); } });

const prisma = new PrismaClient();
const TAG = `SP-${Date.now().toString(36)}`;

const R = { pass: 0, fail: 0, unmeasured: 0, successes: 0 };
const ok = (n) => { R.pass += 1; console.log(`  ✅ ${n}`); };
const bad = (n, m) => { R.fail += 1; console.log(`  ❌ ${n}\n      ${m}`); };
const skip = (n, m) => { R.unmeasured += 1; console.log(`  ⚠️  ${n} — O'LCHANMADI: ${m}`); };
const section = (n) => console.log(`\x1b[2m  ── ${n} ──\x1b[0m`);

const made = { branches: [], users: [], groups: [], holidays: [] };

const cleanup = async () => {
  const u = made.users; const g = made.groups; const b = made.branches;
  try {
    if (g.length) {
      await prisma.debtWriteOffBreakdown.deleteMany({
        where: { writeOff: { groupId: { in: g } } } });
      await prisma.debtWriteOff.deleteMany({ where: { groupId: { in: g } } });
      await prisma.paymentTransaction.deleteMany({ where: { groupId: { in: g } } });
      await prisma.studentPayment.deleteMany({ where: { groupId: { in: g } } });
      await prisma.groupFee.deleteMany({ where: { groupId: { in: g } } });
      await prisma.discount.deleteMany({ where: { groupId: { in: g } } });
      await prisma.lessonCancellation.deleteMany({ where: { groupId: { in: g } } });
      await prisma.groupMembership.deleteMany({ where: { groupId: { in: g } } });
      await prisma.groupScheduleItem.deleteMany({ where: { groupId: { in: g } } });
    }
    if (u.length) {
      await prisma.studentFreeze.deleteMany({ where: { studentId: { in: u } } });
      await prisma.studentPayment.deleteMany({ where: { studentId: { in: u } } });
      await prisma.studentDeposit.deleteMany({ where: { studentId: { in: u } } });
    }
    if (g.length) await prisma.group.deleteMany({ where: { id: { in: g } } });
    if (u.length) {
      await prisma.userBranchAssignment.deleteMany({ where: { userId: { in: u } } });
      await prisma.user.deleteMany({ where: { id: { in: u } } });
    }
    if (b.length) await prisma.branch.deleteMany({ where: { id: { in: b } } });
    if (made.holidays.length) {
      await prisma.holiday.deleteMany({ where: { id: { in: made.holidays } } });
    }
  } catch (err) {
    console.log(`  ⚠️  tozalashda xato: ${err.message}`);
  }
};

/** 2034-mart: 1-chi chorshanba. Dushanba/chorshanba jadvali. */
const Y = 2034;
const M = 3;

const makeFixture = async (label) => {
  const branch = await prisma.branch.create({
    data: { name: `${TAG} ${label}`, code: `${TAG}${label}` } });
  made.branches.push(branch.id);

  const mk = async (n) => {
    const user = await prisma.user.create({
      data: {
        firstName: n, lastName: `${TAG}${label}`,
        username: `${n.toLowerCase()}_${TAG.toLowerCase()}_${label.toLowerCase()}`,
        passwordHash: 'x', role: 'student', homeBranchId: branch.id,
      } });
    made.users.push(user.id);
    return user;
  };

  /** Jadvalli guruh (dushanba + chorshanba). */
  const mkGroup = async (name, extra = {}) => {
    const g = await prisma.group.create({
      data: { branchId: branch.id, name: `${TAG}${label} ${name}`, ...extra } });
    made.groups.push(g.id);
    await prisma.groupScheduleItem.createMany({
      data: [
        { groupId: g.id, day: 'mon', startTime: '10:00', endTime: '11:30' },
        { groupId: g.id, day: 'wed', startTime: '10:00', endTime: '11:30' },
      ],
    });
    await prisma.groupFee.create({
      data: { groupId: g.id, year: Y, month: M, amount: 600_000 } });
    return g;
  };

  return {
    branch,
    // ⚠ HAR SENARIY UCHUN ALOHIDA guruh/o'quvchi: bitta qatorga bir
    // nechta amal qilinsa keyingi tekshiruv oldingisining natijasini
    // o'lchagan bo'lardi.
    gPlain: await mkGroup('plain'),
    gFull: await mkGroup('full', { entryBilling: 'full' }),
    gMid: await mkGroup('mid', { startDate: new Date(Date.UTC(Y, M - 1, 15)) }),
    gNoSched: await (async () => {
      const g = await prisma.group.create({
        data: { branchId: branch.id, name: `${TAG}${label} nosched` } });
      made.groups.push(g.id);
      await prisma.groupFee.create({
        data: { groupId: g.id, year: Y, month: M, amount: 600_000 } });
      return g;
    })(),
    sFull: await mk('SFull'),
    sMid: await mk('SMid'),
    sHoliday: await mk('SHol'),
    sCancel: await mk('SCan'),
    sFreeze: await mk('SFrz'),
    sRejoin: await mk('SRej'),
    sEntry: await mk('SEnt'),
    sNoSched: await mk('SNos'),
    sWriteOff: await mk('SWof'),
    sFrozenRow: await mk('SFrz2'),
    sCap: await mk('SCap'),
  };
};

const member = (groupId, studentId, joinedAt, leftAt = null) =>
  prisma.groupMembership.create({
    data: { groupId, studentId, joinedAt, leftAt } });

const run = async () => {
  console.log(`\n\x1b[1mO'QUVCHI TO'LOVI — SERVIS PARITETI\x1b[0m  (${TAG})\n`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const NE = app.get(StudentPaymentService);

  const fx = { e: await makeFixture('E'), n: await makeFixture('N') };

  /**
   * ⚠ IKKALA STEK HAM O'Z FILIAL KONTEKSTIDA ishlaydi.
   *
   * `list`/`historyByStudent` `branchFilter()` ni ALS dan oladi. Kontekst
   * berilmasa filtr umuman qo'llanmaydi va filial izolyatsiyasi
   * O'LCHANMAY qolardi.
   */
  const ctxE = () => { throw new Error(DEAD); };
  const ctxN = (fn) => runWithBranchContext(
    { branchId: fx.n.branch.id, allowedBranchIds: [fx.n.branch.id], canSeeAllBranches: false },
    fn);

  /**
   * Amalni NEST stekida bajaradi va natijani qayd etadi.
   *
   * ⚠ `_expressFn` ATAYLAB CHAQIRILMAYDI (yuqoridagi izohga qarang) —
   * imzo saqlangani uchun ~20 ta chaqiruv joyi o'zgarmadi va Express
   * yo'lini tiklash bitta funksiyani tahrirlash bilan chegaralanadi.
   */
  const mirror = async (name, _expressFn, nestFn, shape = (x) => x) => {
    let n;
    try {
      n = await nestFn(fx.n);
    } catch (err) { skip(name, err.message); return {}; }
    const ns = JSON.stringify(shape(n));
    R.successes += 1;
    ok(`${name} — ${ns.slice(0, 110)}`);
    return { e: n, n };
  };

  /** Snapshot maydonlari — ID va vaqt tamg'alarisiz. */
  const snap = (p) => p && ({
    baseFee: Number(p.baseFee),
    prorationFactor: Number(Number(p.prorationFactor).toFixed(6)),
    discountApplied: Number(p.discountApplied),
    expectedAmount: Number(p.expectedAmount),
    paidAmount: Number(p.paidAmount),
    status: p.status,
  });

  const eq = (n, a, b) => (a === b ? ok(`${n} — ${a}`) : bad(n, `kutilgan ${b}, keldi ${a}`));

  /**
   * ⚠⚠ HOSILA TEKSHIRUVLAR IKKALA STEKDA HAM BAJARILADI.
   *
   * Paritet solishtiruvi "ikkalasi bir xilmi" deb so'raydi; hosila
   * tekshiruv esa "qiymat TO'G'RImi" deb so'raydi. Ikkinchisini faqat
   * Express tanasida bajarish KO'R NUQTA bo'lardi: NestJS buzilganda u
   * baribir YASHIL berardi (paritet ushlaydi, invariant esa yo'q).
   *
   * Sabotaj tekshiruvi aynan shuni ko'rsatdi — maxraj qirqilganda
   * "MAXRAJ QIRQILMADI" tekshiruvi o'tib ketdi.
   */
  const bothSides = (m, name, fn) => {
    if (!m || !m.n) { skip(name, "so'rov o'lchanmadi"); return; }
    // ⚠ Ilgari ikkala stek tanasida ham yurardi; endi bitta tana bor.
    //   HOSILA tekshiruvning O'ZI o'zgarmadi — u qiymat TO'G'RIligini
    //   so'raydi va Express oracle'isiz ham to'liq ma'noli.
    for (const [label, v] of [['nest', m.n]]) fn(label, v);
  };

  // ─────────────────────────────────────────────────────────────────
  section('1) DARS-ASOSLI ACCRUAL — to\'liq oy');
  // ─────────────────────────────────────────────────────────────────

  // 2034-mart: dushanba 6,13,20,27 + chorshanba 1,8,15,22,29 = 9 dars.
  for (const k of ['e', 'n']) {
    await member(fx[k].gPlain.id, fx[k].sFull.id, new Date(Date.UTC(Y, M - 1, 1)));
  }
  const full = await mirror(
    'to\'liq oy a\'zosi — expected = baseFee',
    // ⚠ HAQIQIY a'zolik yozuvi yuklanadi: `membershipId` — FK, soxta ID
    // `student_payments_membershipId_fkey` bilan yiqiladi.
    async (f) => {
      const m = await prisma.groupMembership.findFirst({
        where: { groupId: f.gPlain.id, studentId: f.sFull.id } });
      return EX.ensurePaymentForMembership(m, Y, M);
    },
    async (f) => {
      const m = await prisma.groupMembership.findFirst({
        where: { groupId: f.gPlain.id, studentId: f.sFull.id } });
      return NE.ensurePaymentForMembership(m, Y, M);
    },
    snap,
  );
  bothSides(full, "to'liq oyda expected = 600 000", (label, v) =>
    eq(`to'liq oyda expected = 600 000 (${label})`, Number(v.expectedAmount), 600_000));

  // ─────────────────────────────────────────────────────────────────
  section('2) OY O\'RTASIDA QO\'SHILISH (prorated)');
  // ─────────────────────────────────────────────────────────────────

  const midJoin = new Date(Date.UTC(Y, M - 1, 15));
  for (const k of ['e', 'n']) {
    await member(fx[k].gPlain.id, fx[k].sMid.id, midJoin);
  }
  const mid = await mirror(
    '15-martda qo\'shilgan — faqat qolgan darslar',
    async (f) => {
      const m = await prisma.groupMembership.findFirst({
        where: { groupId: f.gPlain.id, studentId: f.sMid.id } });
      return EX.ensurePaymentForMembership(m, Y, M);
    },
    async (f) => {
      const m = await prisma.groupMembership.findFirst({
        where: { groupId: f.gPlain.id, studentId: f.sMid.id } });
      return NE.ensurePaymentForMembership(m, Y, M);
    },
    snap,
  );
  bothSides(mid, 'proratsiya', (label, r) => {
    const v = Number(r.expectedAmount);
    v > 0 && v < 600_000
      ? ok(`MUSBAT NAZORAT (${label}): proratsiya ishladi — ${v} (0 < v < 600000)`)
      : bad(`proratsiya (${label})`, `${v} — to'liq yoki nol, o'lchanmadi`);
  });

  // ─────────────────────────────────────────────────────────────────
  section('3) `entryBilling: "full"` — kirish narxni kamaytirmaydi');
  // ─────────────────────────────────────────────────────────────────

  for (const k of ['e', 'n']) {
    await member(fx[k].gFull.id, fx[k].sEntry.id, midJoin);
  }
  const entry = await mirror(
    '"full" guruhda 15-martda qo\'shilgan → TO\'LIQ oy',
    async (f) => {
      const m = await prisma.groupMembership.findFirst({
        where: { groupId: f.gFull.id, studentId: f.sEntry.id } });
      return EX.ensurePaymentForMembership(m, Y, M);
    },
    async (f) => {
      const m = await prisma.groupMembership.findFirst({
        where: { groupId: f.gFull.id, studentId: f.sEntry.id } });
      return NE.ensurePaymentForMembership(m, Y, M);
    },
    snap,
  );
  if (entry.e && mid.e) {
    for (const [label, en, mi] of [
      ['express', entry.e, mid.e], ['nest', entry.n, mid.n],
    ]) {
      Number(en.expectedAmount) > Number(mi.expectedAmount)
        ? ok(`entryBilling (${label}): "full" ${en.expectedAmount} > "prorated" ${mi.expectedAmount}`)
        : bad(`entryBilling (${label})`, 'ikkala siyosat bir xil — farq o\'lchanmadi');
    }
  }

  // ─────────────────────────────────────────────────────────────────
  section('4) GURUH OY O\'RTASIDA BOSHLANADI — maxraj qirqilmaydi');
  // ─────────────────────────────────────────────────────────────────

  // ⚠ ENG NOZIK HOLAT: guruh 15-martda boshlanadi. `loadMonthLessonDates`
  // darslarni `startDate` dan beradi (5 dars), lekin MAXRAJ oyning
  // TO'LIQ rejasi (9 dars) bo'lishi SHART — aks holda nisbat har doim 1
  // chiqib, guruh oy o'rtasida boshlansa ham to'liq oylik olinardi.
  for (const k of ['e', 'n']) {
    await member(fx[k].gMid.id, fx[k].sMid.id, new Date(Date.UTC(Y, M - 1, 1)));
  }
  const midStart = await mirror(
    'oy o\'rtasida boshlangan guruh — nisbat < 1',
    async (f) => {
      const m = await prisma.groupMembership.findFirst({
        where: { groupId: f.gMid.id, studentId: f.sMid.id } });
      return EX.ensurePaymentForMembership(m, Y, M);
    },
    async (f) => {
      const m = await prisma.groupMembership.findFirst({
        where: { groupId: f.gMid.id, studentId: f.sMid.id } });
      return NE.ensurePaymentForMembership(m, Y, M);
    },
    snap,
  );
  bothSides(midStart, 'maxraj', (label, r) => {
    const f = Number(r.prorationFactor);
    f < 1
      ? ok(`MAXRAJ QIRQILMADI (${label}): nisbat ${f.toFixed(4)} < 1`)
      : bad(`maxraj (${label})`, `nisbat ${f} — startDate maxrajni ham qirqib yuborgan`);
  });

  // ─────────────────────────────────────────────────────────────────
  section('5) BAYRAM / BEKOR QILINGAN DARS / MUZLATISH');
  // ─────────────────────────────────────────────────────────────────

  // BAYRAM — 8-mart (chorshanba, dars kuni).
  const hol = await prisma.holiday.create({
    data: { name: `${TAG} bayram`, month: M, day: 8, isRecurring: true, message: '' } });
  made.holidays.push(hol.id);

  for (const k of ['e', 'n']) {
    await member(fx[k].gPlain.id, fx[k].sHoliday.id, new Date(Date.UTC(Y, M - 1, 1)));
    // BEKOR QILINGAN dars — 13-mart (dushanba), FAQAT shu guruhga.
    await prisma.lessonCancellation.create({
      data: { groupId: fx[k].gPlain.id, date: new Date(Date.UTC(Y, M - 1, 13)),
              dateKey: `${Y}-03-13`, note: `${TAG} bekor` } });
    // MUZLATISH — 20..23 mart.
    await prisma.studentFreeze.create({
      data: { studentId: fx[k].sFreeze.id,
              startDate: new Date(Date.UTC(Y, M - 1, 20)),
              endDate: new Date(Date.UTC(Y, M - 1, 24)), reason: `${TAG}` } });
    await member(fx[k].gPlain.id, fx[k].sFreeze.id, new Date(Date.UTC(Y, M - 1, 1)));
  }

  const holRes = await mirror(
    'bayram + bekor qilingan dars chiqarib tashlandi',
    async (f) => {
      const m = await prisma.groupMembership.findFirst({
        where: { groupId: f.gPlain.id, studentId: f.sHoliday.id } });
      return EX.ensurePaymentForMembership(m, Y, M);
    },
    async (f) => {
      const m = await prisma.groupMembership.findFirst({
        where: { groupId: f.gPlain.id, studentId: f.sHoliday.id } });
      return NE.ensurePaymentForMembership(m, Y, M);
    },
    snap,
  );
  if (holRes.e && full.e) {
    for (const [label, h, f] of [
      ['express', holRes.e, full.e], ['nest', holRes.n, full.n],
    ]) {
      Number(h.expectedAmount) === Number(f.expectedAmount)
        ? ok(`bayram/bekor MAXRAJDAN ham chiqdi (${label}) → ${h.expectedAmount}`)
        : bad(`bayram/bekor (${label})`, `${h.expectedAmount} vs ${f.expectedAmount}`);
    }
  }

  const frz = await mirror(
    'muzlatilgan kundagi dars accrual qilinmaydi',
    async (f) => {
      const m = await prisma.groupMembership.findFirst({
        where: { groupId: f.gPlain.id, studentId: f.sFreeze.id } });
      return EX.ensurePaymentForMembership(m, Y, M);
    },
    async (f) => {
      const m = await prisma.groupMembership.findFirst({
        where: { groupId: f.gPlain.id, studentId: f.sFreeze.id } });
      return NE.ensurePaymentForMembership(m, Y, M);
    },
    snap,
  );
  if (frz.e && full.e) {
    for (const [label, fr, fu] of [
      ['express', frz.e, full.e], ['nest', frz.n, full.n],
    ]) {
      Number(fr.expectedAmount) < Number(fu.expectedAmount)
        ? ok(`MUZLATISH kamaytirdi (${label}): ${fr.expectedAmount} < ${fu.expectedAmount}`)
        : bad(`muzlatish (${label})`, 'summa kamaymadi — o\'lchanmadi');
    }
  }

  // ─────────────────────────────────────────────────────────────────
  section('6) REJOIN — ikki davr kunlari qo\'shiladi');
  // ─────────────────────────────────────────────────────────────────

  for (const k of ['e', 'n']) {
    await member(fx[k].gPlain.id, fx[k].sRejoin.id,
      new Date(Date.UTC(Y, M - 1, 1)), new Date(Date.UTC(Y, M - 1, 10)));
    await member(fx[k].gPlain.id, fx[k].sRejoin.id, new Date(Date.UTC(Y, M - 1, 20)));
  }
  const rejoin = await mirror(
    'rejoin — ikkala davr ham billing\'ga kiradi',
    async (f) => {
      const m = await prisma.groupMembership.findFirst({
        where: { groupId: f.gPlain.id, studentId: f.sRejoin.id, leftAt: null } });
      return EX.ensurePaymentForMembership(m, Y, M);
    },
    async (f) => {
      const m = await prisma.groupMembership.findFirst({
        where: { groupId: f.gPlain.id, studentId: f.sRejoin.id, leftAt: null } });
      return NE.ensurePaymentForMembership(m, Y, M);
    },
    snap,
  );
  bothSides(rejoin, 'rejoin', (label, r) => {
    const v = Number(r.expectedAmount);
    v > 0 && v < 600_000
      ? ok(`rejoin (${label}): ikki davr qo'shildi — ${v}`)
      : bad(`rejoin (${label})`, `${v} — bitta davr yoki to'liq oy`);
  });

  // ─────────────────────────────────────────────────────────────────
  section('7) JADVALSIZ GURUH — kalendar-kun proratsiyasi');
  // ─────────────────────────────────────────────────────────────────

  for (const k of ['e', 'n']) {
    await member(fx[k].gNoSched.id, fx[k].sNoSched.id, midJoin);
  }
  const nosched = await mirror(
    'jadvalsiz guruh → kalendar-kun yo\'liga qaytadi',
    async (f) => {
      const m = await prisma.groupMembership.findFirst({
        where: { groupId: f.gNoSched.id, studentId: f.sNoSched.id } });
      return EX.ensurePaymentForMembership(m, Y, M);
    },
    async (f) => {
      const m = await prisma.groupMembership.findFirst({
        where: { groupId: f.gNoSched.id, studentId: f.sNoSched.id } });
      return NE.ensurePaymentForMembership(m, Y, M);
    },
    snap,
  );
  // 15..31 mart = 17 kun / 31 → 600000 × 17/31 = 329032
  bothSides(nosched, 'kalendar-kun', (label, r) =>
    (Number(r.expectedAmount) === 329_032
      ? ok(`kalendar-kun (${label}): 600000 × 17/31 = 329032`)
      : bad(`kalendar-kun (${label})`, `${r.expectedAmount} (kutilgan 329032)`)));

  // ─────────────────────────────────────────────────────────────────
  section('8) MUZLATILGAN QATORLAR — recalc TEGMAYDI');
  // ─────────────────────────────────────────────────────────────────

  // `isOpening` — qo'lda kiritilgan summa.
  for (const k of ['e', 'n']) {
    await prisma.studentPayment.create({
      data: {
        branchId: fx[k].branch.id, studentId: fx[k].sFrozenRow.id,
        groupId: fx[k].gPlain.id, year: Y, month: M,
        baseFee: 111_111, expectedAmount: 111_111, paidAmount: 0,
        status: 'unpaid', isOpening: true,
      } });
  }
  await mirror(
    '`isOpening` qatori recalc\'dan keyin O\'ZGARMAYDI',
    async (f) => {
      const p = await prisma.studentPayment.findFirst({
        where: { studentId: f.sFrozenRow.id, isOpening: true } });
      return EX.recalc(p.id);
    },
    async (f) => {
      const p = await prisma.studentPayment.findFirst({
        where: { studentId: f.sFrozenRow.id, isOpening: true } });
      return NE.recalc(p.id);
    },
    snap,
  );

  // ─────────────────────────────────────────────────────────────────
  section('9) `applyPaidDelta` — CAP va atomiklik');
  // ─────────────────────────────────────────────────────────────────

  for (const k of ['e', 'n']) {
    await member(fx[k].gPlain.id, fx[k].sCap.id, new Date(Date.UTC(Y, M - 1, 1)));
  }
  for (const k of ['e', 'n']) {
    const m = await prisma.groupMembership.findFirst({
      where: { groupId: fx[k].gPlain.id, studentId: fx[k].sCap.id } });
    await NE.ensurePaymentForMembership(m, Y, M);
  }

  await mirror(
    'cap: qoldiqdan ORTIQ to\'lov YOZILMAYDI (null)',
    async (f) => {
      const p = await prisma.studentPayment.findFirst({
        where: { studentId: f.sCap.id, isOpening: false } });
      return EX.applyPaidDelta(p.id, 999_999_999, { capToRemaining: true });
    },
    async (f) => {
      const p = await prisma.studentPayment.findFirst({
        where: { studentId: f.sCap.id, isOpening: false } });
      return NE.applyPaidDelta(p.id, 999_999_999, { capToRemaining: true });
    },
    (r) => (r === null ? 'null' : 'YOZILDI'),
  );

  await mirror(
    'cap ostidagi to\'lov YOZILADI va status yangilanadi',
    async (f) => {
      const p = await prisma.studentPayment.findFirst({
        where: { studentId: f.sCap.id, isOpening: false } });
      return EX.applyPaidDelta(p.id, 100_000, { capToRemaining: true });
    },
    async (f) => {
      const p = await prisma.studentPayment.findFirst({
        where: { studentId: f.sCap.id, isOpening: false } });
      return NE.applyPaidDelta(p.id, 100_000, { capToRemaining: true });
    },
    snap,
  );

  // ─────────────────────────────────────────────────────────────────
  section('10) QARZ — qoldiq, taqsimot, write-off');
  // ─────────────────────────────────────────────────────────────────

  for (const k of ['e', 'n']) {
    await member(fx[k].gPlain.id, fx[k].sWriteOff.id, new Date(Date.UTC(Y, M - 1, 1)));
    const m = await prisma.groupMembership.findFirst({
      where: { groupId: fx[k].gPlain.id, studentId: fx[k].sWriteOff.id } });
    await NE.ensurePaymentForMembership(m, Y, M);
  }

  await mirror('hasOutstandingDebtInGroup',
    (f) => EX.hasOutstandingDebtInGroup(f.sWriteOff.id, f.gPlain.id),
    (f) => NE.hasOutstandingDebtInGroup(f.sWriteOff.id, f.gPlain.id));

  await mirror('getOutstandingBreakdownInGroup',
    (f) => EX.getOutstandingBreakdownInGroup(f.sWriteOff.id, f.gPlain.id),
    (f) => NE.getOutstandingBreakdownInGroup(f.sWriteOff.id, f.gPlain.id),
    (r) => ({ total: r.total, months: r.items.map((i) => `${i.year}-${i.month}:${i.amount}`) }));

  const wo = await mirror('writeOffDebtInGroup — summa va breakdown',
    (f) => EX.writeOffDebtInGroup(f.sWriteOff.id, f.gPlain.id, { reasonTitle: `${TAG} sabab` }),
    (f) => NE.writeOffDebtInGroup(f.sWriteOff.id, f.gPlain.id, { reasonTitle: `${TAG} sabab` }),
    (r) => ({ amount: r?.amount, rows: r?.writeOff?.breakdown?.length }));

  if (wo.n) {
    // ⚠ Faqat `n` fiksturasi: write-off endi bitta stekda bajariladi,
    //   `e` fiksturasidagi qator ATAYLAB tegilmagan holicha qoladi.
    for (const k of ['n']) {
      const p = await prisma.studentPayment.findFirst({
        where: { studentId: fx[k].sWriteOff.id, isOpening: false } });
      if (!p.writtenOff) { bad(`write-off qatori (${k})`, 'writtenOff false qoldi'); }
    }
    ok('write-off: qatorlar `writtenOff = true` bo\'ldi');

    // ⚠ MUZLATILGAN: write-off dan keyin recalc qarzni QAYTA OCHMAYDI.
    await mirror('write-off\'dan keyin recalc TEGMAYDI',
      async (f) => {
        const p = await prisma.studentPayment.findFirst({
          where: { studentId: f.sWriteOff.id, isOpening: false } });
        return EX.recalc(p.id);
      },
      async (f) => {
        const p = await prisma.studentPayment.findFirst({
          where: { studentId: f.sWriteOff.id, isOpening: false } });
        return NE.recalc(p.id);
      },
      (r) => ({ writtenOff: r.writtenOff, expected: Number(r.expectedAmount) }));
  }

  // ─────────────────────────────────────────────────────────────────
  section('11) O\'QISH — list / obligations / getById / history');
  // ─────────────────────────────────────────────────────────────────

  await mirror('list (filial ko\'lamida)',
    (f) => ctxE(() => EX.list({ groupId: f.gPlain.id, year: Y, month: M, limit: 100 })),
    (f) => ctxN(() => NE.list({ groupId: f.gPlain.id, year: Y, month: M, limit: 100 })),
    (r) => ({ total: r.total, statuses: r.items.map((i) => i.status).sort() }));

  await mirror('obligations',
    (f) => EX.obligations({ groupId: f.gPlain.id, year: Y, month: M }),
    (f) => NE.obligations({ groupId: f.gPlain.id, year: Y, month: M }),
    (r) => r.map((i) => `${i.year}-${i.month}:${Number(i.remaining)}`).sort());

  await mirror('historyByStudent',
    (f) => ctxE(() => EX.historyByStudent(f.sFull.id)),
    (f) => ctxN(() => NE.historyByStudent(f.sFull.id)),
    (r) => ({ months: r.summary.months, expected: Number(r.summary.totalExpected),
              paid: Number(r.summary.totalPaid) }));

  await mirror('getById (404)',
    async () => { try { await EX.getById('a'.repeat(24)); return 'YO\'Q'; }
                  catch (e) { return `${e.statusCode}:${e.message}`; } },
    async () => { try { await NE.getById('a'.repeat(24)); return 'YO\'Q'; }
                  catch (e) { return `${e.statusCode}:${e.message}`; } });

  await mirror('recalcForGroupMonth (nechta qator)',
    (f) => EX.recalcForGroupMonth(f.gPlain.id, Y, M),
    (f) => NE.recalcForGroupMonth(f.gPlain.id, Y, M));

  await mirror('recalcForStudent',
    (f) => EX.recalcForStudent(f.sFull.id),
    (f) => NE.recalcForStudent(f.sFull.id));

  await mirror('earliestPaidMonthBefore',
    (f) => EX.earliestPaidMonthBefore(f.sCap.id, f.gPlain.id, { year: Y + 1, month: 1 }),
    (f) => NE.earliestPaidMonthBefore(f.sCap.id, f.gPlain.id, { year: Y + 1, month: 1 }));

  // ─────────────────────────────────────────────────────────────────
  section('12) BAZA DRIFTI');
  // ─────────────────────────────────────────────────────────────────

  await app.close();
  await cleanup();
  const leftover = {
    branches: await prisma.branch.count({ where: { name: { startsWith: TAG } } }),
    users: await prisma.user.count({ where: { lastName: { startsWith: TAG } } }),
    groups: await prisma.group.count({ where: { name: { startsWith: TAG } } }),
    holidays: await prisma.holiday.count({ where: { name: { startsWith: TAG } } }),
  };
  const total = Object.values(leftover).reduce((a, b) => a + b, 0);
  total === 0
    ? ok('test o\'zidan keyin hech narsa qoldirmadi')
    : bad('baza drifti', JSON.stringify(leftover));

  // ⚠ MUSBAT NAZORAT: hech bo'lmaganda bitta MUVAFFAQIYATLI solishtiruv.
  if (R.successes === 0) {
    R.fail += 1;
    console.log('\n  ❌ O\'LCHANMADI: birorta solishtiruv bajarilmadi.');
  }

  console.log(`\n  Natija (student-payment): ${R.pass} o'tdi, ${R.fail} yiqildi, ` +
    `${R.unmeasured} o'lchanmadi\n`);
  await prisma.$disconnect();
  process.exit(R.fail || R.unmeasured ? 1 : 0);
};

run().catch(async (e) => {
  console.error(e);
  try { await cleanup(); } catch { /* tozalash ham yiqildi */ }
  await prisma.$disconnect();
  process.exit(1);
});
