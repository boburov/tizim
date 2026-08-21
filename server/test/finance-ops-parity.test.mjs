/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOLIYAVIY AMALLAR — PARITET (FAZA 7.5)
 *
 * Express `/api/finance-ops` (8 marshrut) ↔ NestJS ekvivalenti.
 *
 * Qaytarim · ichki o'tkazma · egasining puli · byudjet (CRUD).
 *
 * ── NIMA ISBOTLANADI ──
 *   1. Javob VA baza ta'siri bir xil (jurnal yozuvi, qoldiqlar).
 *   2. IDEMPOTENTLIK: bir xil `idempotencyKey` bilan ikkinchi so'rov
 *      YANGI yozuv YARATMAYDI (`duplicate: true`).
 *   3. QAYTARIM asl to'lovdan oshib ketolmaydi.
 *   4. EGASINING PULI daromadga ham, xarajatga ham TEGMAYDI.
 *   5. BYUDJET JURNALGA YOZILMAYDI — reja, pul harakati emas.
 *   6. Byudjet o'chirish YUMSHOQ (hujjat qoladi).
 *   7. Konkurentlik: 20 bir vaqtdagi bir xil kalitli o'tkazma —
 *      jurnalda AYNAN BITTA yozuv.
 *   8. Filial ko'lami va ruxsatlar.
 *
 * ── ⚠ EXPRESS'DAGI XATO ATAYLAB PINLANGAN ──
 *
 * `financeOps.service.js` `isBranchAllowed(currentUser, branchId)` deb
 * chaqiradi, yordamchi esa BITTA argument oladi — ya'ni `currentUser`
 * `branchId` o'rniga tushadi va tekshiruv amalda `canSeeAllBranches`
 * ga aylanadi. Natijada FILIAL DIREKTORI o'z filialida ham
 * o'tkazma/egasi puli amalini bajara OLMAYDI (403).
 *
 * Bu FAIL-CLOSED nuqson (ruxsat BERMAYDI), shuning uchun NestJS'da
 * ATAYLAB AYNAN takrorlangan — aks holda ikki stek ajralib ketardi.
 * Test buni PINLAYDI: Express tuzatilgan kunda bu tekshiruv YIQILADI
 * va e'tibor tortadi.
 *
 * ISHLATISH:  npm run test:finance-ops-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, normalize, nowStamps, mintToken,
  waitForStacks, createReporter,
} from './_harness.mjs';

const prisma = new PrismaClient();
const TAG = `FO-${Date.now().toString(36)}`;
const { R, ok, bad, skip, section, finish } = createReporter('finance-ops');

const made = { branches: [], users: [], groups: [] };

/** ⚠ Tezlik chegarasi (200/daq) — yolg'on qizil bermasin. */
const rateLimited = (r) =>
  r?.status === 429 ||
  /so'rovlar soni juda ko'p/i.test(String(r?.body?.message || ''));

const cleanup = async () => {
  const b = made.branches;
  if (!b.length) return;
  try {
    await prisma.budgetLine.deleteMany({ where: { budget: { branchId: { in: b } } } });
    await prisma.budget.deleteMany({ where: { branchId: { in: b } } });
    await prisma.refund.deleteMany({ where: { branchId: { in: b } } });
    await prisma.paymentTransaction.deleteMany({ where: { branchId: { in: b } } });
    await prisma.studentPayment.deleteMany({ where: { branchId: { in: b } } });
    const es = await prisma.journalEntry.findMany({
      where: { branchId: { in: b } }, select: { id: true } });
    const eids = es.map((e) => e.id);
    await prisma.journalLine.deleteMany({ where: { entryId: { in: eids } } });
    await prisma.journalLine.deleteMany({ where: { account: { branchId: { in: b } } } });
    await prisma.journalEntry.deleteMany({ where: { id: { in: eids } } });
    await prisma.financialAuditLog.deleteMany({ where: { branchId: { in: b } } });
    await prisma.account.deleteMany({ where: { branchId: { in: b } } });
    await prisma.groupMembership.deleteMany({ where: { groupId: { in: made.groups } } });
    await prisma.group.deleteMany({ where: { id: { in: made.groups } } });
    await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    await prisma.branch.deleteMany({ where: { id: { in: b } } });
  } catch (e) {
    console.error('  ⚠ tozalash xatosi:', e.message);
  }
};

const makeFixture = async (label) => {
  const branch = await prisma.branch.create({
    data: { name: `${TAG} ${label}`, code: `${TAG}${label}` } });
  const other = await prisma.branch.create({
    data: { name: `${TAG} ${label} B`, code: `${TAG}${label}B` } });
  made.branches.push(branch.id, other.id);

  const mk = async (n, role, home) => {
    const u = await prisma.user.create({
      data: {
        firstName: n, lastName: `${TAG}${label}`,
        username: `${n.toLowerCase()}_${TAG.toLowerCase()}_${label.toLowerCase()}`,
        passwordHash: 'x', role, homeBranchId: home,
      } });
    made.users.push(u.id);
    return u;
  };
  const student = await mk('Talaba', 'student', branch.id);
  const dir = await mk('Dir', 'director', branch.id);
  const group = await prisma.group.create({
    data: { branchId: branch.id, name: `${TAG}${label} guruh` } });
  made.groups.push(group.id);

  // Asl to'lov — qaytarim uchun.
  const plan = await prisma.studentPayment.create({
    data: {
      branchId: branch.id, studentId: student.id, groupId: group.id,
      year: 2034, month: 3, expectedAmount: 1_000_000, paidAmount: 800_000,
      baseFee: 1_000_000, status: 'partial',
    } });
  const orig = await prisma.paymentTransaction.create({
    data: {
      branchId: branch.id, paymentId: plan.id, studentId: student.id,
      groupId: group.id, year: 2034, month: 3, amount: 800_000,
      method: 'cash', paidAt: new Date(Date.UTC(2034, 2, 5)),
    } });

  // Kassaga pul — o'tkazma va qaytarim uchun.
  const ensure = async (kind) => {
    const f = await prisma.account.findFirst({
      where: { branchId: branch.id, kind, counterpartyBranchId: null } });
    return f || prisma.account.create({ data: { branchId: branch.id, kind } });
  };
  const cash = await ensure('cash');
  const equity = await ensure('equity');
  await prisma.journalEntry.create({
    data: {
      branchId: branch.id, date: new Date(Date.UTC(2034, 2, 1)), kind: 'opening',
      memo: `${TAG} ochilish`, totalDebit: 20_000_000, totalCredit: 20_000_000,
      lines: { create: [
        { accountId: cash.id, accountKind: 'cash', debit: 20_000_000, credit: 0 },
        { accountId: equity.id, accountKind: 'equity', debit: 0, credit: 20_000_000 },
      ] },
    } });

  return { branch, other, student, dir, group, plan, orig };
};

const balanceOf = async (branchId, kind) => {
  const rows = await prisma.journalLine.findMany({
    where: { accountKind: kind, entry: { branchId } },
    select: { debit: true, credit: true } });
  const d = rows.reduce((s, r) => s + Number(r.debit), 0);
  const c = rows.reduce((s, r) => s + Number(r.credit), 0);
  const CREDIT = new Set(['due_to', 'deposit', 'equity', 'revenue', 'owner_capital']);
  return CREDIT.has(kind) ? c - d : d - c;
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mMOLIYAVIY AMALLAR — PARITET\x1b[0m  (${TAG})`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false }, select: { id: true, role: true } });
  if (!owner) throw new Error('owner topilmadi');
  const ownerToken = mintToken(owner);

  const fx = { [EXPRESS]: await makeFixture('E'), [NEST]: await makeFixture('N') };
  const dirToken = {};
  for (const base of [EXPRESS, NEST]) dirToken[base] = mintToken(fx[base].dir);

  const call = (base, method, path, { body, branchId, asDir } = {}) =>
    request(base, method, path, {
      token: asDir ? dirToken[base] : ownerToken,
      body,
      headers: branchId ? { 'x-branch-id': branchId } : {},
    });

  const subs = (base) => {
    const f = fx[base];
    const L = base === EXPRESS ? 'E' : 'N';
    return [
      [f.branch.id, '<A>'], [f.other.id, '<B>'],
      [f.student.id, '<STUDENT>'], [f.dir.id, '<DIR>'], [f.group.id, '<GROUP>'],
      [f.plan.id, '<PLAN>'], [f.orig.id, '<ORIG>'], [owner.id, '<OWNER>'],
      [`${TAG} ${L}`, '<TAG>'], [`${TAG}${L}`, '<TAG>'], [TAG, '<TAG>'],
      nowStamps(),
      (v) => v.replace(/\b[0-9a-f]{24}\b/g, '<ID>'),
    ];
  };

  const mirror = async (name, fn) => {
    let e, n;
    try { e = await fn(EXPRESS, fx[EXPRESS], 'e'); n = await fn(NEST, fx[NEST], 'n'); }
    catch (err) { skip(name, err.message); return {}; }
    if (rateLimited(e) || rateLimited(n)) {
      skip(name, '429 — Express tezlik chegarasi (200/daq)'); return {};
    }
    if (e.status >= 200 && e.status < 300) R.successes += 1;
    const en = { status: e.status, body: normalize(e.body, subs(EXPRESS)) };
    const nn = { status: n.status, body: normalize(n.body, subs(NEST)) };
    try { assert.deepEqual(nn, en); ok(`${name} — ${e.status}`); }
    catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 700)}\n      ` +
                `nest   : ${JSON.stringify(nn).slice(0, 700)}`);
    }
    return { e, n };
  };

  const eq = (n, a, b) => (a === b ? ok(`${n} — ${a}`) : bad(n, `kutilgan ${b}, keldi ${a}`));

  // ─────────────────────────────────────────────────────────────────
  section('1) QAYTARIM');
  // ─────────────────────────────────────────────────────────────────

  const revBefore = {}; const cashBefore = {};
  for (const base of [EXPRESS, NEST]) {
    revBefore[base] = await balanceOf(fx[base].branch.id, 'revenue');
    cashBefore[base] = await balanceOf(fx[base].branch.id, 'cash');
  }

  await mirror('POST /refunds', (base, f, s) =>
    call(base, 'POST', '/api/finance-ops/refunds', {
      branchId: f.branch.id,
      body: {
        studentId: f.student.id, groupId: f.group.id,
        originalTransactionId: f.orig.id, amount: 200_000, method: 'cash',
        reason: `${TAG} qaytarim`, idempotencyKey: `${TAG}${s}refund01`,
      },
    }));

  for (const base of [EXPRESS, NEST]) {
    const f = fx[base]; const label = base === EXPRESS ? 'express' : 'nest';
    // Qaytarim: daromad KAMAYADI, kassadan pul CHIQADI.
    eq(`qaytarim daromadni −200 000 qildi (${label})`,
      (await balanceOf(f.branch.id, 'revenue')) - revBefore[base], -200_000);
    eq(`qaytarim kassadan −200 000 chiqardi (${label})`,
      (await balanceOf(f.branch.id, 'cash')) - cashBefore[base], -200_000);
    const rows = await prisma.refund.findMany({ where: { branchId: f.branch.id } });
    eq(`bitta qaytarim hujjati (${label})`, rows.length, 1);
    eq(`holati executed (${label})`, rows[0]?.status, 'executed');
    eq(`jurnal yozuvi bog'landi (${label})`, Boolean(rows[0]?.journalEntryId), true);
  }

  // MANFIY: asl to'lovdan oshib ketgan qaytarim.
  await mirror("POST /refunds (asl to'lovdan oshdi → 400)", (base, f, s) =>
    call(base, 'POST', '/api/finance-ops/refunds', {
      branchId: f.branch.id,
      body: {
        studentId: f.student.id, originalTransactionId: f.orig.id,
        amount: 900_000, method: 'cash', reason: `${TAG} oshiq`,
        idempotencyKey: `${TAG}${s}refund02`,
      },
    }));

  // MANFIY: begona o'quvchining to'lovi.
  await mirror("POST /refunds (o'quvchi topilmadi → 404)", (base, f, s) =>
    call(base, 'POST', '/api/finance-ops/refunds', {
      branchId: f.branch.id,
      body: {
        studentId: 'a'.repeat(24), amount: 1000, method: 'cash',
        reason: `${TAG} yo'q`, idempotencyKey: `${TAG}${s}refund03`,
      },
    }));

  // MANFIY: sababsiz qaytarim (validator).
  await mirror('POST /refunds (sabab qisqa → 400)', (base, f, s) =>
    call(base, 'POST', '/api/finance-ops/refunds', {
      branchId: f.branch.id,
      body: {
        studentId: f.student.id, amount: 1000, method: 'cash', reason: 'x',
        idempotencyKey: `${TAG}${s}refund04`,
      },
    }));

  // ─────────────────────────────────────────────────────────────────
  section("2) ICHKI O'TKAZMA — idempotentlik");
  // ─────────────────────────────────────────────────────────────────

  const t1 = await mirror('POST /transfers', (base, f, s) =>
    call(base, 'POST', '/api/finance-ops/transfers', {
      branchId: f.branch.id,
      body: {
        fromMethod: 'cash', toMethod: 'bank', amount: 3_000_000,
        idempotencyKey: `${TAG}${s}transfer01`,
      },
    }));
  eq('birinchi o\'tkazma duplicate EMAS', t1.e?.body?.data?.duplicate, false);

  // AYNAN SHU kalit bilan ikkinchi so'rov — yangi yozuv BO'LMASIN.
  const t2 = await mirror('POST /transfers (bir xil kalit → duplicate)', (base, f, s) =>
    call(base, 'POST', '/api/finance-ops/transfers', {
      branchId: f.branch.id,
      body: {
        fromMethod: 'cash', toMethod: 'bank', amount: 3_000_000,
        idempotencyKey: `${TAG}${s}transfer01`,
      },
    }));
  eq('ikkinchi urinish duplicate', t2.e?.body?.data?.duplicate, true);
  eq('bir xil yozuvga ishora qiladi',
    t2.e?.body?.data?.entryId, t1.e?.body?.data?.entryId);

  for (const base of [EXPRESS, NEST]) {
    const f = fx[base]; const label = base === EXPRESS ? 'express' : 'nest';
    eq(`bankda BIR MARTA (${label})`, await balanceOf(f.branch.id, 'bank'), 3_000_000);
    eq(`o'tkazma yozuvi BITTA (${label})`,
      await prisma.journalEntry.count({
        where: { branchId: f.branch.id, kind: 'account_transfer' } }), 1);
  }

  // MANFIY: bir xil hisob (validator `refine`).
  await mirror('POST /transfers (bir xil hisob → 400)', (base, f, s) =>
    call(base, 'POST', '/api/finance-ops/transfers', {
      branchId: f.branch.id,
      body: {
        fromMethod: 'cash', toMethod: 'cash', amount: 1000,
        idempotencyKey: `${TAG}${s}transfer02`,
      },
    }));

  // ─────────────────────────────────────────────────────────────────
  section('3) KONKURENTLIK — 20 bir vaqtdagi bir xil kalit');
  // ─────────────────────────────────────────────────────────────────
  //
  // ⚠ Idempotentlik DB INDEKSIGA tayanadi, servis mantiqiga emas.
  // 20 so'rov bir vaqtda kelsa ham jurnalda AYNAN BITTA yozuv
  // bo'lishi kerak — aks holda pul 20 marta ko'chgan bo'lardi.
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base]; const label = base === EXPRESS ? 'express' : 'nest';
    const s = base === EXPRESS ? 'e' : 'n';
    const key = `${TAG}${s}race01`;
    const results = await Promise.all(Array.from({ length: 20 }, () =>
      call(base, 'POST', '/api/finance-ops/transfers', {
        branchId: f.branch.id,
        body: { fromMethod: 'cash', toMethod: 'click', amount: 500_000,
          idempotencyKey: key },
      }).catch((err) => ({ status: 0, body: { error: err.message } }))));

    if (results.some(rateLimited)) {
      skip(`konkurentlik (${label})`, '429 — tezlik chegarasi');
      continue;
    }
    // Javob har doim 201 bo'lishi mumkin (duplicate ham muvaffaqiyat),
    // shuning uchun HAQIQIY o'lchov — JURNAL.
    eq(`20 bir vaqtdagi urinishdan BITTA yozuv (${label})`,
      await prisma.journalEntry.count({
        where: { postingKey: `account_transfer:${key}` } }), 1);
    eq(`click hisobiga BIR MARTA tushdi (${label})`,
      await balanceOf(f.branch.id, 'click'), 500_000);
    const entryIds = new Set(results.map((r) => r.body?.data?.entryId).filter(Boolean));
    eq(`hamma javob BITTA yozuvga ishora qiladi (${label})`, entryIds.size, 1);
  }

  // ─────────────────────────────────────────────────────────────────
  section('4) EGASINING PULI');
  // ─────────────────────────────────────────────────────────────────

  const oRev = {}; const oExp = {};
  for (const base of [EXPRESS, NEST]) {
    oRev[base] = await balanceOf(fx[base].branch.id, 'revenue');
    oExp[base] = await balanceOf(fx[base].branch.id, 'expense');
  }

  await mirror('POST /owner-capital (investment)', (base, f, s) =>
    call(base, 'POST', '/api/finance-ops/owner-capital', {
      branchId: f.branch.id,
      body: { direction: 'investment', amount: 5_000_000, method: 'cash',
        idempotencyKey: `${TAG}${s}owner01` },
    }));
  await mirror('POST /owner-capital (withdrawal)', (base, f, s) =>
    call(base, 'POST', '/api/finance-ops/owner-capital', {
      branchId: f.branch.id,
      body: { direction: 'withdrawal', amount: 1_000_000, method: 'cash',
        idempotencyKey: `${TAG}${s}owner02` },
    }));

  for (const base of [EXPRESS, NEST]) {
    const f = fx[base]; const label = base === EXPRESS ? 'express' : 'nest';
    eq(`egasi kapitali 5M − 1M (${label})`,
      await balanceOf(f.branch.id, 'owner_capital'), 4_000_000);
    // ⚠ EGASINING PULI OPERATSION NATIJAGA KIRMAYDI.
    eq(`daromadga TEGMADI (${label})`,
      (await balanceOf(f.branch.id, 'revenue')) - oRev[base], 0);
    eq(`xarajatga TEGMADI (${label})`,
      (await balanceOf(f.branch.id, 'expense')) - oExp[base], 0);
  }

  // ─────────────────────────────────────────────────────────────────
  section('5) BYUDJET — reja, pul emas');
  // ─────────────────────────────────────────────────────────────────

  const jBefore = {};
  for (const base of [EXPRESS, NEST]) {
    jBefore[base] = await prisma.journalEntry.count({
      where: { branchId: fx[base].branch.id } });
  }

  const cat = await prisma.expenseCategory.findFirst({
    where: { isDeleted: false }, select: { id: true } });

  const b1 = await mirror('POST /budgets', (base, f) =>
    call(base, 'POST', '/api/finance-ops/budgets', {
      branchId: f.branch.id,
      body: {
        name: `${TAG} byudjet`, periodType: 'month', year: 2034, month: 3,
        lines: [
          { scope: 'total', amount: 50_000_000 },
          ...(cat ? [{ scope: 'category', categoryId: cat.id, amount: 5_000_000 }] : []),
          { scope: 'kind', categoryKind: 'payroll', amount: 20_000_000 },
        ],
      },
    }));
  const budgetId = {
    [EXPRESS]: b1.e?.body?.data?.id, [NEST]: b1.n?.body?.data?.id };

  // ⚠ BYUDJET JURNALGA YOZILMAYDI — bu modulning eng muhim qoidasi.
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    eq(`byudjet JURNALGA YOZILMADI (${label})`,
      await prisma.journalEntry.count({
        where: { branchId: fx[base].branch.id } }), jBefore[base]);
  }

  // MANFIY: bir davrga ikkinchi byudjet.
  await mirror('POST /budgets (takroriy davr → 409)', (base, f) =>
    call(base, 'POST', '/api/finance-ops/budgets', {
      branchId: f.branch.id,
      body: { periodType: 'month', year: 2034, month: 3, lines: [] },
    }));

  // MANFIY: kategoriya qatorida kategoriya yo'q.
  await mirror('POST /budgets (kategoriyasiz qator → 400)', (base, f) =>
    call(base, 'POST', '/api/finance-ops/budgets', {
      branchId: f.branch.id,
      body: { periodType: 'month', year: 2034, month: 4,
        lines: [{ scope: 'category', amount: 1000 }] },
    }));

  // MANFIY: manfiy summa (validator).
  await mirror('POST /budgets (manfiy summa → 400)', (base, f) =>
    call(base, 'POST', '/api/finance-ops/budgets', {
      branchId: f.branch.id,
      body: { periodType: 'month', year: 2034, month: 5,
        lines: [{ scope: 'total', amount: -5 }] },
    }));

  await mirror('GET /budgets', (base, f) =>
    call(base, 'GET', '/api/finance-ops/budgets?year=2034', { branchId: f.branch.id }));
  await mirror('GET /budgets/:id', (base) =>
    call(base, 'GET', `/api/finance-ops/budgets/${budgetId[base]}`, {}));
  await mirror('GET /budgets/:id (404)', (base) =>
    call(base, 'GET', `/api/finance-ops/budgets/${'a'.repeat(24)}`, {}));

  await mirror('PATCH /budgets/:id', (base) =>
    call(base, 'PATCH', `/api/finance-ops/budgets/${budgetId[base]}`, {
      body: { name: `${TAG} yangilangan`, status: 'closed',
        lines: [{ scope: 'total', amount: 60_000_000 }] },
    }));
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    // Qatorlar TO'LIQ almashtiriladi (`set` semantikasi).
    eq(`qatorlar almashtirildi (${label})`,
      await prisma.budgetLine.count({ where: { budgetId: budgetId[base] } }), 1);
  }

  await mirror('DELETE /budgets/:id', (base) =>
    call(base, 'DELETE', `/api/finance-ops/budgets/${budgetId[base]}`, {}));
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const row = await prisma.budget.findUnique({ where: { id: budgetId[base] } });
    // O'CHIRISH YUMSHOQ — hujjat qoladi.
    eq(`hujjat saqlanib qoldi (${label})`, Boolean(row), true);
    eq(`isDeleted bayrog'i (${label})`, row?.isDeleted, true);
  }
  await mirror('DELETE /budgets/:id (qayta → 404)', (base) =>
    call(base, 'DELETE', `/api/finance-ops/budgets/${budgetId[base]}`, {}));

  // ─────────────────────────────────────────────────────────────────
  section("6) ⚠ EXPRESS XATOSI PINLANGAN — direktor amalni bajara olmaydi");
  // ─────────────────────────────────────────────────────────────────
  //
  // `isBranchAllowed(currentUser, branchId)` — yordamchi BITTA argument
  // oladi, ya'ni `currentUser` `branchId` o'rniga tushadi va tekshiruv
  // amalda `canSeeAllBranches` ga aylanadi.
  //
  // Bu FAIL-CLOSED nuqson (ruxsat BERMAYDI). NestJS'da ATAYLAB aynan
  // takrorlangan. Express tuzatilgan kunda BU TEKSHIRUV YIQILADI —
  // aynan shu kerak.

  await mirror("direktor O'Z filialida o'tkazma → 403 (Express xatosi)",
    (base, f, s) => call(base, 'POST', '/api/finance-ops/transfers', {
      asDir: true, branchId: f.branch.id,
      body: { fromMethod: 'cash', toMethod: 'bank', amount: 1000,
        idempotencyKey: `${TAG}${s}dir01` },
    }));

  await mirror("direktor O'Z filialida egasi puli → 403 (Express xatosi)",
    (base, f, s) => call(base, 'POST', '/api/finance-ops/owner-capital', {
      asDir: true, branchId: f.branch.id,
      body: { direction: 'investment', amount: 1000, method: 'cash',
        idempotencyKey: `${TAG}${s}dir02` },
    }));

  // MUSBAT NAZORAT: OWNER o'sha filialda O'TADI.
  //
  // ⚠ USIZ yuqoridagi ikki tekshiruv ma'nosiz bo'lardi: "hamma 403
  // oladi" ham yashil berardi.
  await mirror("owner o'sha filialda O'TADI (musbat nazorat)",
    (base, f, s) => call(base, 'POST', '/api/finance-ops/transfers', {
      branchId: f.branch.id,
      body: { fromMethod: 'cash', toMethod: 'bank', amount: 1000,
        idempotencyKey: `${TAG}${s}own03` },
    }));

  // ─────────────────────────────────────────────────────────────────
  section('7) RUXSAT VA FILIAL KO\'LAMI');
  // ─────────────────────────────────────────────────────────────────

  for (const [m, p, body] of [
    ['POST', '/api/finance-ops/refunds', {}],
    ['POST', '/api/finance-ops/transfers', {}],
    ['POST', '/api/finance-ops/owner-capital', {}],
    ['GET', '/api/finance-ops/budgets', undefined],
    ['POST', '/api/finance-ops/budgets', {}],
  ]) {
    await mirror(`${m} ${p} — autentifikatsiyasiz → 401`, (base) =>
      request(base, m, p, { body }));
  }

  // Direktor byudjetni O'QIY oladi (`finance.read` bor), lekin
  // O'ZGARTIRA olmaydi (`finance.manage_budgets` yo'q).
  await mirror("direktor byudjetni O'QIYDI", (base, f) =>
    call(base, 'GET', '/api/finance-ops/budgets', {
      asDir: true, branchId: f.branch.id }));
  await mirror('direktor byudjet YARATA olmaydi → 403', (base, f) =>
    call(base, 'POST', '/api/finance-ops/budgets', {
      asDir: true, branchId: f.branch.id,
      body: { periodType: 'month', year: 2034, month: 9, lines: [] },
    }));

  // ─────────────────────────────────────────────────────────────────
  section('8) MUVOZANAT');
  // ─────────────────────────────────────────────────────────────────
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base]; const label = base === EXPRESS ? 'express' : 'nest';
    const entries = await prisma.journalEntry.findMany({
      where: { branchId: f.branch.id }, include: { lines: true } });
    eq(`sarlavha muvozanati (${label})`,
      entries.filter((e) => Number(e.totalDebit) !== Number(e.totalCredit)).length, 0);
    eq(`qatorlar sarlavha bilan mos (${label})`,
      entries.filter((e) => {
        const d = e.lines.reduce((s, l) => s + Number(l.debit), 0);
        const c = e.lines.reduce((s, l) => s + Number(l.credit), 0);
        return d !== Number(e.totalDebit) || c !== Number(e.totalCredit);
      }).length, 0);
  }
};

run()
  .catch((err) => { console.error('\x1b[31mTEST YIQILDI:\x1b[0m', err); R.fail += 1; })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect().catch(() => {});
    process.exit(finish());
  });
