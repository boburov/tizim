/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 8.1 — O'QITUVCHI MAOSHI PARITETI (15/15 marshrut).
 *
 * ── NIMA O'LCHANADI ──
 *  1. O'qish: ro'yxat + filtrlar, bitta maosh, tarix, JORIY BALANS,
 *     majburiyatlar, stavka tarixi.
 *  2. STAVKA: belgilash (davr yopilishi), tuzatish, o'chirish (oldingi
 *     davr QAYTA OCHILADI), kesishuv rad etilishi, shakl invarianti.
 *  3. PRORATSIYA: oy o'rtasida stavka oshirilsa segmentlar QO'SHILADI.
 *  4. MUKOFOT / JARIMA + HISOB-KITOBNI YOPISH (settle).
 *  5. TO'LOV: chiqim, qoldiqdan oshmaslik, bekor qilish, JURNAL yozuvi.
 *  6. RBAC: `salary.pay` ≠ `finance.manage`; o'ziga o'zi stavka taqiqi.
 *  7. FILIAL: begona filial maoshiga to'lab bo'lmaydi (404).
 *
 * ── PUL QO'RIQCHILARI (bypass testlari) ──
 *  • qoldiqdan ORTIQ to'lov → 400 (shartli-atomik cap)
 *  • PARALLEL ikki to'lov (double-click) → faqat BITTASI o'tadi
 *  • jurnalda debit = kredit
 *  • yakunda JURNAL QOLDIG'I YO'Q
 *
 * ── BAZA GIGIYENASI ──
 * `__parity_ts_` prefiksi; yakunda FK tartibida TO'LIQ tozalash +
 * SNAPSHOT solishtiruvi (7 jadval).
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, mintToken, waitForStacks, createReporter, nowStamps,
} from './_harness.mjs';

const PREFIX = '__parity_ts_';
const T = createReporter("o'qituvchi maoshi");
const prisma = new PrismaClient();

const iso = (d) => d.toISOString().slice(0, 10);

const main = async () => {
  console.log("\n\x1b[1mFAZA 8.1 — O'QITUVCHI MAOSHI PARITETI\x1b[0m\n");
  await waitForStacks();

  const actor = async (username) => {
    const u = await prisma.user.findUnique({
      where: { username },
      select: { id: true, role: true },
    });
    if (!u) throw new Error(`${username} topilmadi`);
    return mintToken(u);
  };
  const ownerToken = await actor('owner');

  const branches = await prisma.branch.findMany({
    where: { isDeleted: false, isActive: true },
    select: { id: true, name: true, isMain: true },
    orderBy: { createdAt: 'asc' },
  });
  const A = branches.find((b) => String(b.name).startsWith('DEMO'))
    || branches.find((b) => b.isMain) || branches[0];
  const B = branches.find((b) => b.id !== A.id);
  if (!A || !B) { console.log('  ❌ IKKI FILIAL KERAK'); process.exit(1); }

  const stamp = String(process.hrtime.bigint()).slice(-9);
  const made = { users: [], groups: [], salaries: [], comps: [] };
  /** Filial ko'lamini o'lchash uchun vaqtincha aktyor va rol. */
  let scopedUser = null;
  let scopedRole = null;
  const idSubs = [];
  const stampRule = nowStamps();

  const dyn = { [EXPRESS]: [], [NEST]: [] };
  const collectIds = (base, v) => {
    if (Array.isArray(v)) { v.forEach((x) => collectIds(base, x)); return; }
    if (!v || typeof v !== 'object') return;
    for (const [k, val] of Object.entries(v)) {
      if ((k === 'id' || k === '_id') && typeof val === 'string') {
        if (!dyn[base].includes(val)) dyn[base].push(val);
      } else collectIds(base, val);
    }
  };
  const seen = (base, r) => { collectIds(base, r?.body); return r; };
  const subs = () => [
    ...idSubs,
    ...dyn[EXPRESS].map((id, i) => [id, `<DYN${i}>`]),
    ...dyn[NEST].map((id, i) => [id, `<DYN${i}>`]),
    stampRule,
  ];

  // ── DB SNAPSHOT (oldin) ──
  const snapshot = async () => ({
    teacherSalary: await prisma.teacherSalary.count(),
    salaryTransaction: await prisma.salaryTransaction.count(),
    teacherCompensation: await prisma.teacherCompensation.count(),
    journalEntry: await prisma.journalEntry.count(),
    journalLine: await prisma.journalLine.count(),
    approval: await prisma.approval.count(),
    user: await prisma.user.count(),
  });
  const before = await snapshot();

  try {
    // ═════════════════════ FIXTURE ═════════════════════
    T.section('fixture');

    const mkTeacher = async (suffix, branchId = A.id, hiredAt = null) => {
      const u = await prisma.user.create({
        data: {
          username: `${PREFIX}${suffix}${stamp}`,
          firstName: 'Par', lastName: suffix, role: 'teacher',
          homeBranchId: branchId, passwordHash: 'parity-not-used',
          ...(hiredAt ? { hiredAt } : {}),
          branchAssignments: { create: [{ branchId, role: 'teacher' }] },
        },
        select: { id: true, role: true },
      });
      made.users.push(u.id);
      // `e`/`n` uchun belgi PASTDA, ikkalasi bitta tokenga tushadi.
      if (suffix !== 'e' && suffix !== 'n') idSubs.push([u.id, `<T_${suffix}>`]);
      return u;
    };

    const hired = new Date(Date.UTC(2026, 0, 1));
    // ⚠ Har stek O'Z o'qituvchisiga yozadi (bir o'qituvchiga ikkalasi
    // yozsa stavka davrlari va balans ARALASHIB ketardi). Solishtirishda
    // ikkalasi BIR XIL belgiga tushadi.
    const tE = await mkTeacher('e', A.id, hired);   // Express yozadi
    const tN = await mkTeacher('n', A.id, hired);   // NestJS yozadi
    idSubs.push([tE.id, '<T_WRITE>'], [tN.id, '<T_WRITE>']);
    const tB = await mkTeacher('b', B.id, hired);   // B filiali
    const tRead = await mkTeacher('r', A.id, hired); // faqat o'qish
    const teacherOf = (b) => (b === EXPRESS ? tE.id : tN.id);

    // O'qish uchun maosh qatorlari — IKKALA stekda ham BIR XIL bo'lsin
    // deb bitta o'qituvchiga (`tRead`) Prisma orqali yaratamiz.
    const mkSalary = async (teacherId, over = {}) => {
      const s = await prisma.teacherSalary.create({
        data: {
          branchId: A.id, teacherId, groupId: null, kind: 'base',
          year: 2026, month: 3,
          expectedAmount: 1000000, paidAmount: 0, status: 'unpaid',
          baseEarnings: 1000000, proratedFixed: 1000000,
          prorationFactor: 1, payableDays: 31, totalDays: 31,
          source: 'auto',
          ...over,
        },
        select: { id: true },
      });
      made.salaries.push(s.id);
      return s;
    };
    const readSalary = await mkSalary(tRead.id);
    idSubs.push([readSalary.id, '<S_READ>']);

    T.ok('fixture: 4 o\'qituvchi, 1 maosh qatori');

    // ═════════════════════ O'QISH ═════════════════════
    T.section("o'qish");

    for (const q of [
      '?limit=5',
      `?teacherId=${tRead.id}`,
      `?teacherId=${tRead.id}&year=2026&month=3`,
      `?teacherId=${tRead.id}&kind=base`,
      `?teacherId=${tRead.id}&status=unpaid`,
      '?limit=5&search=__yoq__',
    ]) {
      await T.both(`GET /salaries${q}`, (b) =>
        request(b, 'GET', `/api/teacher-salary/salaries${q}`,
          { token: ownerToken }), subs, seen);
    }
    await T.both('GET /salaries?limit=999 (400)', (b) =>
      request(b, 'GET', '/api/teacher-salary/salaries?limit=999',
        { token: ownerToken }), subs, seen);
    await T.both('GET /salaries/:id', (b) =>
      request(b, 'GET', `/api/teacher-salary/salaries/${readSalary.id}`,
        { token: ownerToken }), subs, seen);
    await T.both('GET /salaries/:id (404)', (b) =>
      request(b, 'GET', `/api/teacher-salary/salaries/${'a'.repeat(24)}`,
        { token: ownerToken }), subs, seen);
    await T.both('GET /salaries/by-teacher/:id', (b) =>
      request(b, 'GET', `/api/teacher-salary/salaries/by-teacher/${tRead.id}`,
        { token: ownerToken }), subs, seen);
    await T.both('GET /salaries/by-teacher/:id (404)', (b) =>
      request(b, 'GET', `/api/teacher-salary/salaries/by-teacher/${'a'.repeat(24)}`,
        { token: ownerToken }), subs, seen);
    // ⚠ MARSHRUT TARTIBI: `by-teacher/:id/balance` `/salaries/:id` dan
    // OLDIN e'lon qilinganini qulflaydi.
    await T.both('GET /salaries/by-teacher/:id/balance', (b) =>
      request(b, 'GET',
        `/api/teacher-salary/salaries/by-teacher/${tRead.id}/balance`,
        { token: ownerToken }), subs, seen);
    await T.both('GET /obligations?year=2026', (b) =>
      request(b, 'GET', '/api/teacher-salary/obligations?year=2026',
        { token: ownerToken }), subs, seen);
    await T.both('GET /obligations (yilsiz → 400)', (b) =>
      request(b, 'GET', '/api/teacher-salary/obligations',
        { token: ownerToken }), subs, seen);
    await T.both("GET /salaries (token yo'q → 401)", (b) =>
      request(b, 'GET', '/api/teacher-salary/salaries'), subs, seen);
    await T.both('GET /me/finance (owner → 403)', (b) =>
      request(b, 'GET', '/api/teacher-salary/me/finance',
        { token: ownerToken }), subs, seen);

    // ═════════════════════ STAVKA ═════════════════════
    T.section('stavka (compensation)');

    await T.both('GET /compensations/by-teacher/:id (bo\'sh)', (b) =>
      request(b, 'GET',
        `/api/teacher-salary/compensations/by-teacher/${teacherOf(b)}`,
        { token: ownerToken }), subs, seen);

    const setRes = await T.both('POST /compensations (fiksa 2 mln)', (b) =>
      request(b, 'POST', '/api/teacher-salary/compensations', {
        token: ownerToken,
        body: {
          teacher: teacherOf(b), branchId: A.id,
          effectiveFrom: '2026-01-01',
          baseType: 'fixed_monthly', baseAmount: 2000000,
          variableType: 'none',
        },
      }), subs, seen);

    await T.both("POST /compensations (ikkala qism ham 'none' → 400)", (b) =>
      request(b, 'POST', '/api/teacher-salary/compensations', {
        token: ownerToken,
        body: {
          teacher: teacherOf(b), branchId: A.id,
          effectiveFrom: '2026-02-01',
          baseType: 'none', variableType: 'none',
        },
      }), subs, seen);

    await T.both("POST /compensations (foiz > 100 → 400)", (b) =>
      request(b, 'POST', '/api/teacher-salary/compensations', {
        token: ownerToken,
        body: {
          teacher: teacherOf(b), branchId: A.id, effectiveFrom: '2026-02-01',
          baseType: 'none', variableType: 'percent', variableRate: 150,
        },
      }), subs, seen);

    // ⚠ Yangi stavka amaldagidan KEYIN boshlanishi shart.
    await T.both("POST /compensations (o'tmishdagi sana → 400)", (b) =>
      request(b, 'POST', '/api/teacher-salary/compensations', {
        token: ownerToken,
        body: {
          teacher: teacherOf(b), branchId: A.id, effectiveFrom: '2025-12-01',
          baseType: 'fixed_monthly', baseAmount: 3000000, variableType: 'none',
        },
      }), subs, seen);

    // ⚠ Ishga olingan sanadan OLDIN stavka bo'la olmaydi.
    await T.both("POST /compensations (hiredAt dan oldin → 400)", (b) =>
      request(b, 'POST', '/api/teacher-salary/compensations', {
        token: ownerToken,
        body: {
          teacher: teacherOf(b), branchId: A.id, effectiveFrom: '2025-06-01',
          baseType: 'fixed_monthly', baseAmount: 100000, variableType: 'none',
        },
      }), subs, seen);

    // OY O'RTASIDA OSHIRISH → SEGMENTLAR QO'SHILADI.
    await T.both('POST /compensations (16-martdan 3 mln)', (b) =>
      request(b, 'POST', '/api/teacher-salary/compensations', {
        token: ownerToken,
        body: {
          teacher: teacherOf(b), branchId: A.id, effectiveFrom: '2026-03-16',
          baseType: 'fixed_monthly', baseAmount: 3000000, variableType: 'none',
        },
      }), subs, seen);

    await T.both('GET /compensations/by-teacher/:id (2 davr)', (b) =>
      request(b, 'GET',
        `/api/teacher-salary/compensations/by-teacher/${teacherOf(b)}`,
        { token: ownerToken }), subs, seen);

    // ⚠ PRORATSIYA O'LCHOVI: 1–15 mart 2 mln, 16–31 mart 3 mln.
    //   2 000 000×15/31 = 967 742 ; 3 000 000×16/31 = 1 548 387
    //   jami = 2 516 129
    const marchOf = async (b) => {
      const row = await prisma.teacherSalary.findFirst({
        where: { teacherId: teacherOf(b), kind: 'base', year: 2026, month: 3 },
        select: { expectedAmount: true, payableDays: true },
      });
      return row ? Number(row.expectedAmount) : null;
    };
    const [mE, mN] = [await marchOf(EXPRESS), await marchOf(NEST)];
    const EXPECTED_MARCH = Math.round(2000000 * 15 / 31) + Math.round(3000000 * 16 / 31);
    if (mE === EXPECTED_MARCH && mN === EXPECTED_MARCH) {
      T.ok(`segment proratsiyasi AYNAN: ${mE} = 15×2mln/31 + 16×3mln/31`);
    } else {
      T.bad('segment proratsiyasi',
        `kutilgan ${EXPECTED_MARCH}, express=${mE}, nest=${mN}`);
    }

    // TUZATISH (amend).
    const compIdOf = async (b) => {
      const c = await prisma.teacherCompensation.findFirst({
        where: { teacherId: teacherOf(b), effectiveTo: null, isDeleted: false },
        select: { id: true },
      });
      return c?.id;
    };
    const amendE = await compIdOf(EXPRESS);
    const amendN = await compIdOf(NEST);
    const amendId = (b) => (b === EXPRESS ? amendE : amendN);

    await T.both('PATCH /compensations/:id (summani tuzatish)', (b) =>
      request(b, 'PATCH', `/api/teacher-salary/compensations/${amendId(b)}`,
        { token: ownerToken, body: { baseAmount: 3500000 } }), subs, seen);

    // ⚠ KESISHUV: `effectiveFrom` ni ORQAGA surish → 400.
    await T.both("PATCH /compensations/:id (sana orqaga → 400 kesishuv)", (b) =>
      request(b, 'PATCH', `/api/teacher-salary/compensations/${amendId(b)}`,
        { token: ownerToken, body: { effectiveFrom: '2026-01-15' } }), subs, seen);

    await T.both('PATCH /compensations/:id (404)', (b) =>
      request(b, 'PATCH', `/api/teacher-salary/compensations/${'a'.repeat(24)}`,
        { token: ownerToken, body: { baseAmount: 1 } }), subs, seen);

    // ═════════════════════ MUKOFOT / JARIMA ═════════════════════
    T.section('mukofot / jarima');

    const bonusRes = await T.both('POST /adjustments (mukofot 500k)', (b) =>
      request(b, 'POST', '/api/teacher-salary/adjustments', {
        token: ownerToken,
        body: {
          teacher: teacherOf(b), branchId: A.id, kind: 'bonus',
          year: 2026, month: 3, amount: 500000, reason: 'KPI paritet',
        },
      }), subs, seen);

    await T.both('POST /adjustments (jarima 200k → MANFIY expected)', (b) =>
      request(b, 'POST', '/api/teacher-salary/adjustments', {
        token: ownerToken,
        body: {
          teacher: teacherOf(b), branchId: A.id, kind: 'deduction',
          year: 2026, month: 3, amount: 200000, reason: 'Jarima paritet',
        },
      }), subs, seen);

    await T.both("POST /adjustments (sababsiz → 400)", (b) =>
      request(b, 'POST', '/api/teacher-salary/adjustments', {
        token: ownerToken,
        body: {
          teacher: teacherOf(b), kind: 'bonus',
          year: 2026, month: 3, amount: 1000, reason: '   ',
        },
      }), subs, seen);

    await T.both("POST /adjustments (o'quvchiga → 400)", async (b) => {
      const stu = await prisma.user.findFirst({
        where: { role: 'student', isDeleted: false }, select: { id: true },
      });
      return request(b, 'POST', '/api/teacher-salary/adjustments', {
        token: ownerToken,
        body: {
          teacher: stu?.id || 'a'.repeat(24), kind: 'bonus',
          year: 2026, month: 3, amount: 1000, reason: 'x',
        },
      });
    }, subs, seen);

    // ⚠ JARIMA MANFIY saqlanadimi — bevosita bazadan o'lchaymiz.
    const dedOf = async (b) => {
      const r = await prisma.teacherSalary.findFirst({
        where: { teacherId: teacherOf(b), kind: 'deduction', year: 2026, month: 3 },
        select: { expectedAmount: true },
      });
      return r ? Number(r.expectedAmount) : null;
    };
    const [dE, dN] = [await dedOf(EXPRESS), await dedOf(NEST)];
    if (dE === -200000 && dN === -200000) {
      T.ok('jarima MANFIY saqlandi (-200000, ikkala stekda ham)');
    } else {
      T.bad('jarima ishorasi', `express=${dE}, nest=${dN} (kutilgan -200000)`);
    }

    // ═════════════════════ TO'LOV (chiqim + jurnal) ═════════════════════
    T.section("to'lov (chiqim + jurnal)");

    // To'lov uchun ALOHIDA maosh qatori — har stekda O'ZINIKI.
    const payTargets = {};
    for (const b of [EXPRESS, NEST]) {
      // ⚠ 2025-YIL ATAYLAB: stavka 2026-01-01 dan boshlanadi va
      // `recomputeFrom` 2026-yilning HAR OYIGA `base` qator yaratadi —
      // 2026-05 ni tanlash unique cheklovga urilardi.
      const s = await mkSalary(teacherOf(b), { year: 2025, month: 11, expectedAmount: 300000 });
      payTargets[b] = s.id;
      idSubs.push([s.id, '<S_PAY>']);
    }

    const journalBefore = await prisma.journalEntry.count();

    await T.both("POST /transactions (100k) → 201", (b) =>
      request(b, 'POST', '/api/teacher-salary/transactions', {
        token: ownerToken,
        body: { salaryId: payTargets[b], amount: 100000, method: 'cash', note: 'paritet' },
      }), subs, seen);

    // ⚠ QOLDIQDAN ORTIQ → 400 (shartli-atomik cap).
    await T.both("POST /transactions (qoldiqdan ortiq → 400)", (b) =>
      request(b, 'POST', '/api/teacher-salary/transactions', {
        token: ownerToken,
        body: { salaryId: payTargets[b], amount: 999999, method: 'cash' },
      }), subs, seen);

    await T.both("POST /transactions (kelajak sana → 400)", (b) =>
      request(b, 'POST', '/api/teacher-salary/transactions', {
        token: ownerToken,
        body: {
          salaryId: payTargets[b], amount: 1000, method: 'cash',
          paidAt: '2099-01-01',
        },
      }), subs, seen);

    await T.both("POST /transactions (manfiy summa → 400)", (b) =>
      request(b, 'POST', '/api/teacher-salary/transactions', {
        token: ownerToken,
        body: { salaryId: payTargets[b], amount: -5, method: 'cash' },
      }), subs, seen);

    await T.both("POST /transactions (404 maosh)", (b) =>
      request(b, 'POST', '/api/teacher-salary/transactions', {
        token: ownerToken,
        body: { salaryId: 'a'.repeat(24), amount: 1000, method: 'cash' },
      }), subs, seen);

    // ── JURNAL: debit = kredit ──
    const journalAfter = await prisma.journalEntry.count();
    const newEntries = await prisma.journalEntry.findMany({
      where: { refModel: 'SalaryTransaction' },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: { id: true, lines: { select: { debit: true, credit: true } } },
    });
    if (journalAfter - journalBefore === 2 && newEntries.length === 2) {
      let balanced = true;
      for (const e of newEntries) {
        const d = e.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
        const c = e.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
        if (Math.abs(d - c) > 0.005 || d === 0) balanced = false;
      }
      if (balanced) T.ok('jurnal: 2 yozuv, har birida debit = kredit ≠ 0');
      else T.bad('jurnal balansi', 'debit ≠ kredit yoki nol');
    } else {
      T.bad('jurnal yozuvi',
        `${journalAfter - journalBefore} yozuv qo'shildi (kutilgan 2)`);
    }

    // ── PARALLEL TO'LOV (idempotentlik / poyga) ──
    //
    // ⚠ Qolgan qoldiq 200 000. IKKI so'rov BIR VAQTDA 150 000 dan
    // yuboriladi: shartli-atomik cap tufayli FAQAT BITTASI o'tishi
    // kerak. Ikkalasi ham o'tsa `paidAmount` 400 000 bo'lib,
    // `expectedAmount` (300 000) dan OSHIB ketardi.
    T.section("poyga: parallel to'lov (double-click)");

    for (const b of [EXPRESS, NEST]) {
      const [r1, r2] = await Promise.all([
        request(b, 'POST', '/api/teacher-salary/transactions', {
          token: ownerToken,
          body: { salaryId: payTargets[b], amount: 150000, method: 'cash' },
        }),
        request(b, 'POST', '/api/teacher-salary/transactions', {
          token: ownerToken,
          body: { salaryId: payTargets[b], amount: 150000, method: 'cash' },
        }),
      ]);
      const okCount = [r1, r2].filter((r) => r.status === 201).length;
      const row = await prisma.teacherSalary.findUnique({
        where: { id: payTargets[b] },
        select: { paidAmount: true, expectedAmount: true },
      });
      const paid = Number(row.paidAmount);
      const exp = Number(row.expectedAmount);
      const label = b === EXPRESS ? 'express' : 'nest';
      if (okCount === 1 && paid <= exp) {
        T.ok(`${label}: 2 parallel so'rovdan 1 tasi o'tdi, paid=${paid} ≤ ${exp}`);
      } else {
        T.bad(`${label} parallel to'lov`,
          `${okCount} ta o'tdi, paid=${paid}, expected=${exp} — CAP BUZILDI`);
      }
    }

    // ── BEKOR QILISH ──
    T.section("to'lovni bekor qilish");

    const txOf = async (b) => {
      const t = await prisma.salaryTransaction.findFirst({
        where: { salaryId: payTargets[b], isDeleted: false },
        orderBy: { createdAt: 'asc' },
        select: { id: true, amount: true },
      });
      return t;
    };
    const txE = await txOf(EXPRESS);
    const txN = await txOf(NEST);
    const txId = (b) => (b === EXPRESS ? txE?.id : txN?.id);

    if (txE && txN) {
      const paidBefore = {};
      for (const b of [EXPRESS, NEST]) {
        const r = await prisma.teacherSalary.findUnique({
          where: { id: payTargets[b] }, select: { paidAmount: true },
        });
        paidBefore[b] = Number(r.paidAmount);
      }
      await T.both('DELETE /transactions/:id', (b) =>
        request(b, 'DELETE', `/api/teacher-salary/transactions/${txId(b)}`,
          { token: ownerToken }), subs, seen);

      let ok = true;
      for (const b of [EXPRESS, NEST]) {
        const r = await prisma.teacherSalary.findUnique({
          where: { id: payTargets[b] }, select: { paidAmount: true },
        });
        const delta = paidBefore[b] - Number(r.paidAmount);
        const amt = Number(b === EXPRESS ? txE.amount : txN.amount);
        if (delta !== amt) ok = false;
      }
      if (ok) T.ok("bekor qilingach `paidAmount` AYNAN to'lov summasiga kamaydi");
      else T.bad('bekor qilish balansi', 'paidAmount noto\'g\'ri kamaydi');
    } else {
      T.skip('bekor qilish', 'tranzaksiya topilmadi');
    }

    await T.both('DELETE /transactions/:id (404)', (b) =>
      request(b, 'DELETE', `/api/teacher-salary/transactions/${'a'.repeat(24)}`,
        { token: ownerToken }), subs, seen);

    // ═════════════════════ HISOB-KITOBNI YOPISH ═════════════════════
    T.section('hisob-kitobni yopish (settle)');

    // ⚠ `branchId` OCHIQ BERILADI: owner "barcha filiallar" rejimida
    // turadi va `resolveBranchForWrite` filialsiz yozishni 400 bilan
    // rad etadi ("Avval aniq filialni tanlang"). Bu Express bilan
    // AYNAN bir xil xatti-harakat — filialsiz chaqiruv ham alohida
    // tekshiriladi (pastda).
    await T.both("POST /adjustments/settle/:id (filialsiz → 400)", (b) =>
      request(b, 'POST',
        `/api/teacher-salary/adjustments/settle/${teacherOf(b)}`,
        { token: ownerToken, body: { reason: 'filialsiz urinish' } }),
      subs, seen);

    await T.both('POST /adjustments/settle/:id', (b) =>
      request(b, 'POST',
        `/api/teacher-salary/adjustments/settle/${teacherOf(b)}`,
        { token: ownerToken, body: { reason: "Ishdan bo'shadi (paritet)", branchId: A.id } }),
      subs, seen);

    // ⚠ Ikkinchi marta — endi qoldiq YO'Q → 400.
    await T.both("POST /adjustments/settle/:id (qoldiq yo'q → 400)", (b) =>
      request(b, 'POST',
        `/api/teacher-salary/adjustments/settle/${teacherOf(b)}`,
        { token: ownerToken, body: { reason: 'ikkinchi urinish', branchId: A.id } }),
      subs, seen);

    // Balans HAQIQATAN nolga tushdimi.
    let settled = true;
    for (const b of [EXPRESS, NEST]) {
      const rows = await prisma.teacherSalary.findMany({
        where: { teacherId: teacherOf(b) },
        select: { expectedAmount: true, paidAmount: true },
      });
      const bal = rows.reduce(
        (s, r) => s + Number(r.expectedAmount) - Number(r.paidAmount), 0);
      if (bal > 0) settled = false;
    }
    if (settled) T.ok('settle: qoldiq ≤ 0 (ikkala stekda ham)');
    else T.bad('settle', 'qoldiq hali ham musbat');

    // ═════════════════════ RBAC ═════════════════════
    T.section('RBAC chegaralari');

    try {
      const staffToken = await actor('qa_staff_a');
      const alive = await T.both(
        'MUSBAT NAZORAT: qa_staff_a tirik (`/auth/me` → 200)',
        (b) => request(b, 'GET', '/api/auth/me', { token: staffToken }), subs, seen);

      if (alive.e?.status !== 200) {
        T.skip('RBAC', 'musbat nazorat 200 bermadi');
      } else {
        await T.both("`salary.read` yo'q → GET /salaries 403", (b) =>
          request(b, 'GET', '/api/teacher-salary/salaries',
            { token: staffToken }), subs, seen);
        await T.both("`finance.manage` yo'q → POST /compensations 403", (b) =>
          request(b, 'POST', '/api/teacher-salary/compensations', {
            token: staffToken,
            body: { teacher: teacherOf(b), baseType: 'fixed_monthly', baseAmount: 1 },
          }), subs, seen);
        await T.both("`salary.pay` yo'q → POST /transactions 403", (b) =>
          request(b, 'POST', '/api/teacher-salary/transactions', {
            token: staffToken,
            body: { salaryId: payTargets[b], amount: 1000, method: 'cash' },
          }), subs, seen);
        await T.both("`finance.manage` yo'q → POST /adjustments 403", (b) =>
          request(b, 'POST', '/api/teacher-salary/adjustments', {
            token: staffToken,
            body: {
              teacher: teacherOf(b), kind: 'bonus',
              year: 2026, month: 3, amount: 1, reason: 'x',
            },
          }), subs, seen);
      }
    } catch (err) {
      T.skip('RBAC', err.message);
    }

    // ═════════════════════ O'ZIGA O'ZI STAVKA TAQIQI ═════════════════════
    //
    // ⚠ BU BIZNES INVARIANTI, ruxsat masalasi EMAS: OWNER ham o'ziga
    // stavka qo'ya olmasligi kerak.
    T.section("o'ziga o'zi stavka taqiqi (selfSalary)");

    /**
     * ⚠⚠ BU TEKSHIRUV BIR MARTA SOXTA YASHIL BO'LGAN EDI ⚠⚠
     *
     * Avvalgi variant oddiy o'qituvchi tokeni bilan so'rov yuborardi.
     * Lekin `teacher` rolida `finance.manage` YO'Q — 403 ni
     * `PermissionsGuard` qaytarardi va `assertNotSelfSalary` ga
     * NAVBAT KELMASDI. Mutatsiya testi buni fosh qildi: qo'riqchi
     * OLIB TASHLANGANDA ham tekshiruv YASHIL qolgan edi.
     *
     * ⚠ Qo'riqchiga YETIB BORISH uchun aktyor AYNI paytda:
     *   • `role = "teacher"` bo'lishi kerak (`assertTeacher` talabi), VA
     *   • `finance.manage` + `approvals.decide_config` ga ega bo'lishi
     *     kerak (aks holda so'rov `requestSet` ga burilib ketadi).
     *
     * Ikkinchisi FAQAT `teacher` ROLIGA ruxsat qo'shish orqali
     * mumkin — shuning uchun ruxsatlar VAQTINCHA qo'shiladi va
     * `finally` da QAYTA OLIB TASHLANADI.
     */
    /**
     * ⚠⚠ BU TEKSHIRUV BIR MARTA SOXTA YASHIL BO'LGAN EDI ⚠⚠
     *
     * Avvalgi variant oddiy o'qituvchi tokeni bilan HTTP so'rov
     * yuborardi va 403 olardi — lekin u 403 `PermissionsGuard` dan
     * kelardi (`teacher` rolida `finance.manage` YO'Q), ya'ni
     * `assertNotSelfSalary` ga NAVBAT KELMASDI. Mutatsiya testi buni
     * fosh qildi: qo'riqchi OLIB TASHLANGANDA ham tekshiruv YASHIL
     * qolgan edi.
     *
     * ── NEGA HTTP ORQALI UMUMAN O'LCHAB BO'LMAYDI ──
     *
     * Qo'riqchiga yetib borish uchun aktyor AYNI paytda
     * `role = "teacher"` (`assertTeacher` talabi) VA `finance.manage`
     * huquqiga ega bo'lishi kerak. Buning yagona yo'li — UMUMIY
     * `teacher` roliga ruxsat qo'shish. Lekin Express rol
     * ruxsatlarini 5 DAQIQA keshlaydi
     * (`helpers/permission.helper.js`), ya'ni test davomida
     * qo'shilgan ruxsat Express'da KO'RINMAYDI: Express 403, NestJS
     * 201 beradi va bu SOXTA QIZIL bo'ladi (o'lchandi).
     *
     * Shuning uchun qo'riqchi FUNKSIYA DARAJASIDA solishtiriladi —
     * ikkala implementatsiya AYNI kirish bilan. Bu HTTP dan KUCHLIROQ:
     * u qo'riqchining O'ZINI sinaydi, uning oldidagi qatlamlarni emas.
     */
    try {
      // ⚠ ILGARI `server_legacy/src/helpers/selfSalary.guard.js` JONLI
      //   import qilinardi. Express stek o'chirilgach uning 8 holatdagi
      //   javobi `test/fixtures/express-self-salary-guard.json` ga
      //   MUZLATILDI (5 tasi TO'SILGAN) — qo'riqchi FUNKSIYA DARAJASIDA
      //   solishtirilishi o'zgarmadi.
      const nestGuard = await import('../dist/common/rbac/self-salary.guard.js');
      const GUARD_ORACLE = JSON.parse(
        readFileSync(new URL('fixtures/express-self-salary-guard.json', import.meta.url), 'utf8'),
      ).cases;

      const call = (fn, actor, target) => {
        try { fn(actor, target); return { ok: true }; }
        catch (e) { return { ok: false, status: e?.statusCode ?? null, message: e?.message }; }
      };

      const CASES = [
        ["o'ziga (id === id)", { id: 'u1' }, 'u1'],
        ["o'ziga (_id shaklida)", { _id: 'u1' }, 'u1'],
        ['boshqaga', { id: 'u1' }, 'u2'],
        ['aktyorsiz (job/seed)', null, 'u1'],
        ['nishonsiz', { id: 'u1' }, null],
        // ⚠ Express izohi ogohlantirgan XAVFSIZLIK TESHIGI: nishon sof
        // Prisma obyekti (`id`) bo'lsa ham tanilishi SHART.
        ["nishon obyekt ({ id })", { id: 'u1' }, { id: 'u1' }],
        ["nishon obyekt ({ _id })", { _id: 'u1' }, { _id: 'u1' }],
        ['aktyor `id`, nishon `_id`', { id: 'u1' }, { _id: 'u1' }],
      ];

      let blocked = 0;
      let allSame = true;
      for (const [name, actorArg, target] of CASES) {
        const a = GUARD_ORACLE[name];
        if (!a) { allSame = false; T.bad(`selfSalary: ${name}`, "oracle'da yo'q"); continue; }
        const bres = call(nestGuard.assertNotSelfSalary, actorArg, target);
        if (JSON.stringify(a) !== JSON.stringify(bres)) {
          allSame = false;
          T.bad(`selfSalary: ${name}`,
            `express=${JSON.stringify(a)} nest=${JSON.stringify(bres)}`);
        } else if (!a.ok) blocked += 1;
      }

      // ⚠ MUSBAT NAZORAT: kamida BITTA holat HAQIQATAN to'silishi shart.
      // Hammasi `ok` bo'lsa ikkala tomon ham "hech narsa qilmaydi" deb
      // bir xil bo'lardi va tekshiruv hech nimani isbotlamasdi.
      if (allSame && blocked >= 3) {
        T.ok(`selfSalary qo'riqchisi: ${CASES.length} holat bir xil, ${blocked} tasi TO'SILDI`);
      } else if (allSame) {
        T.bad("selfSalary musbat nazorati",
          `faqat ${blocked} holat to'silgan — qo'riqchi ishlamayotgan bo'lishi mumkin`);
      }
    } catch (err) {
      T.skip("o'ziga o'zi stavka taqiqi", err.message);
    }

    // ═════════════════════ FILIAL CHEGARASI ═════════════════════
    T.section("filial chegarasi");

    try {
      // ⚠ MAVJUD FIXTURE YARAMAYDI: `qa_admin_a` da `salary.read` YO'Q,
      // ya'ni u 403 ni RUXSAT qatlamida olardi va FILIAL chegarasi
      // (`branchFilter`) UMUMAN ishga tushmasdi. Shuning uchun shu
      // yerda vaqtincha aktyor yaratiladi: `salary.read` bor, FAQAT
      // A filialiga biriktirilgan.
      const perm = await prisma.permission.findFirst({
        where: { key: 'salary.read' }, select: { id: true },
      });
      if (!perm) throw new Error("`salary.read` ruxsati bazada yo'q");
      scopedRole = await prisma.role.create({
        data: {
          value: `${PREFIX}role${stamp}`, label: 'Paritet: maosh o\'qish',
          roleType: 'staff', defaultPath: '/', isSystem: false,
          permissions: { connect: [{ id: perm.id }] },
        },
        select: { id: true, value: true },
      });
      scopedUser = await prisma.user.create({
        data: {
          username: `${PREFIX}reader${stamp}`,
          firstName: 'Paritet', lastName: 'Reader',
          role: scopedRole.value, homeBranchId: A.id,
          passwordHash: 'parity-not-used',
          branchAssignments: { create: [{ branchId: A.id, role: scopedRole.value }] },
        },
        select: { id: true, role: true },
      });
      const adminA = mintToken(scopedUser);
      // B filialidagi o'qituvchiga maosh qatori.
      const sB = await prisma.teacherSalary.create({
        data: {
          branchId: B.id, teacherId: tB.id, groupId: null, kind: 'base',
          year: 2026, month: 4, expectedAmount: 500000, paidAmount: 0,
          status: 'unpaid', baseEarnings: 500000, prorationFactor: 1,
          payableDays: 30, totalDays: 30, source: 'auto',
        },
        select: { id: true },
      });
      made.salaries.push(sB.id);
      idSubs.push([sB.id, '<S_B>']);

      const pos = await T.both(
        "MUSBAT NAZORAT: A-aktyor A filial maoshini KO'RADI",
        (b) => request(b, 'GET',
          `/api/teacher-salary/salaries?teacherId=${tRead.id}`,
          { token: adminA }), subs, seen);

      if (pos.e?.status !== 200) {
        T.skip('filial chegarasi', 'musbat nazorat 200 bermadi');
      } else {
        await T.both("A-aktyor ro'yxatida B filial maoshi YO'Q", (b) =>
          request(b, 'GET',
            `/api/teacher-salary/salaries?teacherId=${tB.id}`,
            { token: adminA }), subs, seen);
      }
    } catch (err) {
      T.skip('filial chegarasi', err.message);
    }

    // ═════════════════════ STAVKANI O'CHIRISH ═════════════════════
    T.section("stavkani o'chirish (oldingi davr qayta ochiladi)");

    await T.both('DELETE /compensations/:id', (b) =>
      request(b, 'DELETE', `/api/teacher-salary/compensations/${amendId(b)}`,
        { token: ownerToken }), subs, seen);

    // ⚠ Oldingi davr `effectiveTo: null` bo'lib QAYTA OCHILDIMI.
    let reopened = true;
    for (const b of [EXPRESS, NEST]) {
      const open = await prisma.teacherCompensation.count({
        where: { teacherId: teacherOf(b), isDeleted: false, effectiveTo: null },
      });
      if (open !== 1) reopened = false;
    }
    if (reopened) T.ok("o'chirilgach oldingi davr QAYTA OCHILDI (1 ta ochiq davr)");
    else T.bad("davr qayta ochilishi", "ochiq davrlar soni 1 emas");

    await T.both('DELETE /compensations/:id (404)', (b) =>
      request(b, 'DELETE', `/api/teacher-salary/compensations/${'a'.repeat(24)}`,
        { token: ownerToken }), subs, seen);
  } catch (err) {
    T.bad('kutilmagan xato', err.stack || err.message);
  } finally {
    // ═════════════════════ TOZALASH (FK tartibida) ═════════════════════
    const tids = made.users;
    // 1) Jurnal — maosh tranzaksiyalariga bog'langan yozuvlar.
    const txIds = (await prisma.salaryTransaction.findMany({
      where: { teacherId: { in: tids } }, select: { id: true },
    })).map((t) => t.id);
    if (txIds.length) {
      const entries = await prisma.journalEntry.findMany({
        where: { refModel: 'SalaryTransaction', refId: { in: txIds } },
        select: { id: true },
      });
      const eids = entries.map((e) => e.id);
      if (eids.length) {
        // ⚠ STORNO YOZUVLARI (B21) — ular `refModel: "JournalEntry"` va
        // ASL yozuvga ishora qiladi, ya'ni yuqoridagi `SalaryTransaction`
        // bo'yicha qidiruv ularni TOPMAYDI. Ularsiz tozalash baza
        // driftini qoldirardi.
        const stornos = await prisma.journalEntry.findMany({
          where: { refModel: 'JournalEntry', refId: { in: eids } },
          select: { id: true },
        });
        eids.push(...stornos.map((e) => e.id));
        await prisma.journalLine.deleteMany({ where: { entryId: { in: eids } } });
        await prisma.journalEntry.deleteMany({ where: { id: { in: eids } } });
      }
    }
    await prisma.salaryTransaction.deleteMany({ where: { teacherId: { in: tids } } });
    await prisma.approval.deleteMany({
      where: { subjectKey: { in: tids.map((t) => `teacher_compensation:${t}`) } },
    });
    await prisma.teacherSalary.deleteMany({ where: { teacherId: { in: tids } } });
    await prisma.teacherCompensation.deleteMany({ where: { teacherId: { in: tids } } });
    if (scopedUser) {
      await prisma.userBranchAssignment.deleteMany({ where: { userId: scopedUser.id } });
      await prisma.user.deleteMany({ where: { id: scopedUser.id } });
    }
    if (scopedRole) {
      await prisma.role.deleteMany({ where: { id: scopedRole.id } });
    }
    await prisma.userBranchAssignment.deleteMany({ where: { userId: { in: tids } } });
    const goneU = await prisma.user.deleteMany({ where: { id: { in: tids } } });
    console.log(`\n  🧹 tozalandi: ${goneU.count} o'qituvchi + bog'liq yozuvlar`);

    // ── DB SNAPSHOT (keyin) ──
    const after = await snapshot();
    const drift = Object.keys(before)
      .filter((k) => before[k] !== after[k])
      .map((k) => `${k}: ${before[k]} → ${after[k]}`);
    if (drift.length === 0) {
      T.ok('BAZA DRIFTI YO\'Q (7 jadval, jurnal qoldig\'i ham yo\'q)');
    } else {
      T.bad('BAZA DRIFTI', drift.join(', '));
    }

    await prisma.$disconnect();
  }

  process.exit(T.finish());
};

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
