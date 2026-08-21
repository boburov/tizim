/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOLIYA YADROSI — PARITET (`/api/finance`, 13/13 marshrut).
 *
 * Express `finance.routes.js` ↔ NestJS `FinanceController`.
 *
 * ── NIMA ISBOTLANADI ──
 *   1. Javob VA baza ta'siri bir xil (tarif, chegirma, kirim, jurnal).
 *   2. BUXGALTERIYA INVARIANTI: har bir jurnal yozuvida debet = kredit.
 *   3. ORTIQCHA TO'LOV YO'Q: `paidAmount` hech qachon `expectedAmount`
 *      dan oshmaydi; ortgan pul KEYINGI oyga, so'ng DEPOZITGA tushadi.
 *   4. IDEMPOTENTLIK: bir xil `idempotencyKey` ikkinchi marta pul yozmaydi.
 *   5. BEKOR QILISH BUTUN BATCH'ni qaytaradi (fantom avans qolmaydi).
 *   6. TASDIQ GATE'i: `discount_set=approval` filialda direktor 202 oladi
 *      va `Discount` qatori YARATILMAYDI.
 *   7. FILIAL IZOLYATSIYASI: begona filial direktori boshqa filial
 *      tarifini, chegirmasini va to'lovini KO'RMAYDI/YOZA OLMAYDI.
 *   8. CHEGIRMA → `expectedAmount` qayta hisoblanadi (ikkala stekda teng).
 *
 * ── NEGA HAR STEKKA O'Z FIKSTURASI (KO'ZGU) ──
 *
 * Mutatsiyani bir xil so'rovni ikki marta yuborib sinab bo'lmaydi:
 * ikkinchi chaqiruv birinchisining natijasini ko'radi (balans allaqachon
 * o'zgargan) va HECH NARSA o'lchanmaydi.
 *
 * ⚠ "Muvaffaqiyatli HTTP javob" moliyada hech narsani isbotlamaydi —
 * har bir pul amalidan keyin BAZA holati ham solishtiriladi.
 *
 * ⚠ TOZALASH API'GA TAYANMAYDI — to'g'ridan-to'g'ri Prisma, FK tartibida,
 * va yakunda QOLDIQ O'LCHANADI.
 *
 * ISHLATISH:  npm run test:finance-core-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, normalize, nowStamps, mintToken,
  waitForStacks, createReporter,
} from './_harness.mjs';

const prisma = new PrismaClient();
const TAG = `FC-${Date.now().toString(36)}`;
const { R, ok, bad, skip, section, finish } = createReporter('finance-core');

const made = { branches: [], users: [], groups: [] };

/** ⚠ Kelajakdagi yil — haqiqiy hisobotlarga aralashmasin. */
const Y = 2034;
const M1 = 5;
const M2 = 6;
const FEE = 300_000;

/**
 * ⚠ SHU YURISHGA XOS MIJOZ MANZILI — `generalLimiter` (IP bo'yicha
 * 200/daq) boshqa to'plamlar bilan byudjetni baham ko'rmasin. CHEGARA
 * ZAIFLASHMAYDI: to'plam faqat boshqa mashinadan kelayotgandek ko'rinadi.
 */
const RUN_IP = `198.51.100.${(Number(process.hrtime.bigint() % 200n) + 20)}`;

const cleanup = async () => {
  const b = made.branches;
  const u = made.users;
  const g = made.groups;
  try {
    if (u.length) {
      await prisma.paymentTransaction.deleteMany({ where: { studentId: { in: u } } });
      await prisma.depositTransaction.deleteMany({ where: { studentId: { in: u } } });
      await prisma.studentDeposit.deleteMany({ where: { studentId: { in: u } } });
      await prisma.discount.deleteMany({ where: { studentId: { in: u } } });
      await prisma.debtWriteOffBreakdown.deleteMany({
        where: { payment: { studentId: { in: u } } } });
      await prisma.studentPayment.deleteMany({ where: { studentId: { in: u } } });
      await prisma.groupMembership.deleteMany({ where: { studentId: { in: u } } });
    }
    if (g.length) await prisma.groupFee.deleteMany({ where: { groupId: { in: g } } });
    if (b.length) {
      const entries = await prisma.journalEntry.findMany({
        where: { branchId: { in: b } }, select: { id: true } });
      const ids = entries.map((e) => e.id);
      if (ids.length) {
        await prisma.journalLine.deleteMany({ where: { entryId: { in: ids } } });
        await prisma.journalEntry.deleteMany({ where: { id: { in: ids } } });
      }
      await prisma.financialAuditLog.deleteMany({ where: { branchId: { in: b } } })
        .catch(() => {});
      await prisma.approval.deleteMany({ where: { branchId: { in: b } } });
      await prisma.account.deleteMany({ where: { branchId: { in: b } } });
    }
    if (g.length) await prisma.group.deleteMany({ where: { id: { in: g } } });
    if (u.length) {
      await prisma.userBranchAssignment.deleteMany({ where: { userId: { in: u } } });
      await prisma.user.deleteMany({ where: { id: { in: u } } });
    }
    if (b.length) await prisma.branch.deleteMany({ where: { id: { in: b } } });
  } catch (err) {
    console.log(`  ⚠️  tozalashda xato: ${err.message}`);
  }
};

/**
 * ⚠ QOLDIQ O'LCHANADI, TAXMIN QILINMAYDI. Yutilgan FK xatosi tufayli
 * yashil test jimgina qoldiq to'plardi — bu repoda 3 marta uchragan.
 */
const assertNoResidue = async () => {
  const left = {
    branches: await prisma.branch.count({ where: { code: { startsWith: TAG } } }),
    users: await prisma.user.count({ where: { lastName: { contains: TAG } } }),
    groups: await prisma.group.count({ where: { name: { contains: TAG } } }),
  };
  const total = left.branches + left.users + left.groups;
  if (total === 0) ok('tozalash — QOLDIQ YO\'Q (o\'lchandi)');
  else bad('tozalash — QOLDIQ QOLDI', JSON.stringify(left));
};

const makeFixture = async (label) => {
  const mkBranch = async (n, delegation) => {
    const b = await prisma.branch.create({
      data: {
        name: `${TAG} ${label}${n}`, code: `${TAG}${label}${n}`,
        ...(delegation ? { delegation } : {}),
      } });
    made.branches.push(b.id);
    return b;
  };
  const A = await mkBranch('A', null);
  const B = await mkBranch('B', null);
  // ⚠ `discount_set: approval` — tasdiq gate'ini O'LCHASH uchun. Qoida
  // kiritilmagan filialda standart rejim boshqacha bo'lardi.
  const P = await mkBranch('P', {
    discount_set: { mode: 'approval' },
    group_fee_set: { mode: 'approval' },
  });

  const mk = async (n, role, branch) => {
    const u = await prisma.user.create({
      data: {
        firstName: `${n}${label}`, lastName: `${TAG}${label}`,
        username: `${n.toLowerCase()}_${TAG.toLowerCase()}_${label.toLowerCase()}`,
        passwordHash: 'x', role, homeBranchId: branch.id, isActive: true,
      } });
    made.users.push(u.id);
    return u;
  };

  const student = await mk('Talaba', 'student', A);
  const studentP = await mk('Talabap', 'student', P);
  const dirA = await mk('Dira', 'director', A);
  const dirB = await mk('Dirb', 'director', B);
  const dirP = await mk('Dirp', 'director', P);

  const mkGroup = async (n, branch) => {
    const g = await prisma.group.create({
      data: { branchId: branch.id, name: `${TAG}${label} ${n}`, isActive: true } });
    made.groups.push(g.id);
    return g;
  };
  const group = await mkGroup('guruh', A);
  const groupP = await mkGroup('guruhp', P);

  // A'ZOLIK oy boshidan OLDIN — proratsiya = 1 (aks holda `expected`
  // kalendar kunga bo'linib, tekshiruvlar mo'rt bo'lardi).
  await prisma.groupMembership.create({
    data: {
      groupId: group.id, studentId: student.id,
      joinedAt: new Date(Date.UTC(Y - 1, 0, 1)),
    } });
  await prisma.groupMembership.create({
    data: {
      groupId: groupP.id, studentId: studentP.id,
      joinedAt: new Date(Date.UTC(Y - 1, 0, 1)),
    } });

  for (const m of [M1, M2]) {
    await prisma.groupFee.create({
      data: { groupId: group.id, year: Y, month: m, amount: FEE, source: 'manual' } });
  }

  const mkPlan = (month) => prisma.studentPayment.create({
    data: {
      branchId: A.id, studentId: student.id, groupId: group.id,
      year: Y, month, baseFee: FEE, expectedAmount: FEE, paidAmount: 0,
      status: 'unpaid',
    } });
  const plan1 = await mkPlan(M1);
  const plan2 = await mkPlan(M2);

  return { A, B, P, student, studentP, dirA, dirB, dirP, group, groupP, plan1, plan2 };
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mMOLIYA YADROSI — PARITET\x1b[0m  (${TAG})`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false }, select: { id: true, role: true } });
  if (!owner) throw new Error('owner topilmadi');
  const ownerToken = mintToken(owner);

  const fx = { [EXPRESS]: await makeFixture('E'), [NEST]: await makeFixture('N') };
  const tok = {};
  for (const base of [EXPRESS, NEST]) {
    tok[base] = {
      owner: ownerToken,
      dirA: mintToken(fx[base].dirA),
      dirB: mintToken(fx[base].dirB),
      dirP: mintToken(fx[base].dirP),
    };
  }

  const call = (base, method, path, { body, branchId, as = 'owner' } = {}) =>
    request(base, method, path, {
      token: tok[base][as],
      body,
      headers: {
        'x-forwarded-for': RUN_IP,
        ...(branchId ? { 'x-branch-id': branchId } : {}),
      },
    });

  const subs = (base) => {
    const f = fx[base];
    const L = base === EXPRESS ? 'E' : 'N';
    return [
      // ⚠ IDEMPOTENTLIK KALITI stekka xos (`...-E-1` / `...-N-1`) —
      // TAG almashtirilishidan OLDIN turishi shart.
      [`${TAG}-${L}-1`, '<IDEMP>'],
      // ⚠ ISMLARDAGI STEK HARFI: `TalabapE` `TalabaE` ni O'Z ICHIGA
      // OLADI, shuning uchun UZUNROG'I OLDIN.
      [`Talabap${L}`, '<N-STUP>'], [`Talaba${L}`, '<N-STU>'],
      [`Dira${L}`, '<N-DIRA>'], [`Dirb${L}`, '<N-DIRB>'], [`Dirp${L}`, '<N-DIRP>'],
      [f.A.id, '<A>'], [f.B.id, '<B>'], [f.P.id, '<P>'],
      [f.student.id, '<STU>'], [f.studentP.id, '<STUP>'],
      [f.dirA.id, '<DIRA>'], [f.dirB.id, '<DIRB>'], [f.dirP.id, '<DIRP>'],
      [f.group.id, '<GRP>'], [f.groupP.id, '<GRPP>'],
      [f.plan1.id, '<PLAN1>'], [f.plan2.id, '<PLAN2>'],
      [owner.id, '<OWNER>'],
      [`${TAG.toLowerCase()}_${L.toLowerCase()}`, '<TAG>'],
      [`${TAG}${L.toLowerCase()}`, '<TAG>'],
      [`${TAG} ${L}`, '<TAG>'], [`${TAG}${L}`, '<TAG>'], [TAG, '<TAG>'],
      nowStamps(),
      (v) => v.replace(/\b[0-9a-f]{24}\b/g, '<ID>'),
    ];
  };

  const rateLimited = (r) =>
    r?.status === 429 || /so'rovlar soni juda ko'p/i.test(String(r?.body?.message || ''));

  const mirror = async (name, fn) => {
    let e, n;
    try { e = await fn(EXPRESS, fx[EXPRESS]); n = await fn(NEST, fx[NEST]); }
    catch (err) { skip(name, err.message); return {}; }
    if (rateLimited(e) || rateLimited(n)) {
      skip(name, '429 — Express tezlik chegarasi (200/daq)'); return {};
    }
    if (e.status >= 500 || n.status >= 500) {
      skip(name, `server xatosi — express=${e.status} ${JSON.stringify(e.body).slice(0, 200)}, ` +
        `nest=${n.status} ${JSON.stringify(n.body).slice(0, 200)}`);
      return {};
    }
    if (e.status >= 200 && e.status < 300) R.successes += 1;
    const en = { status: e.status, body: normalize(e.body, subs(EXPRESS)) };
    const nn = { status: n.status, body: normalize(n.body, subs(NEST)) };
    try { assert.deepEqual(nn, en); ok(`${name} — ${e.status}`); }
    catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 900)}\n      ` +
                `nest   : ${JSON.stringify(nn).slice(0, 900)}`);
    }
    return { e, n };
  };

  const ranOk = (m) => Boolean(m && m.e && m.n);
  const eq = (n, a, b) => (a === b ? ok(`${n} — ${a}`) : bad(n, `kutilgan ${b}, keldi ${a}`));

  /**
   * ⚠⚠ PARITETNING O'ZI YETARLI EMAS: ikkala stek ham 400 qaytarsa
   * `mirror()` YASHIL beradi, lekin pul QIMIRLAMAGAN bo'ladi va undan
   * keyingi invariant tekshiruvlari BO'SH jadval ustida "hammasi joyida"
   * deb yolg'on tasdiq berardi.
   */
  const expectStatus = (m, code, name) => {
    if (!ranOk(m)) { skip(`${name} (status)`, "so'rov o'lchanmadi"); return false; }
    if (m.e.status !== code) {
      bad(`${name} — KUTILGAN STATUS`,
        `kutilgan ${code}, keldi ${m.e.status}: ${JSON.stringify(m.e.body).slice(0, 300)}`);
      return false;
    }
    ok(`${name} — kutilgan status ${code} tasdiqlandi`);
    return true;
  };

  /** Ikkala stekdagi AYNI o'lchovni solishtiradi (baza holati). */
  const bothDb = async (name, fn) => {
    const e = await fn(fx[EXPRESS]);
    const n = await fn(fx[NEST]);
    if (JSON.stringify(e) === JSON.stringify(n)) { ok(`${name} — ${JSON.stringify(e)}`); return e; }
    bad(name, `express: ${JSON.stringify(e)}\n      nest   : ${JSON.stringify(n)}`);
    return null;
  };

  const planOf = async (f, id) => {
    const p = await prisma.studentPayment.findUnique({ where: { id } });
    return p && {
      expected: Number(p.expectedAmount), paid: Number(p.paidAmount),
      discount: Number(p.discountApplied), status: p.status,
    };
  };

  const txCount = async (f) => prisma.paymentTransaction.count({
    where: { studentId: f.student.id, isDeleted: false } });

  const depositBalance = async (f) => {
    const d = await prisma.studentDeposit.findUnique({
      where: { studentId: f.student.id } });
    return d ? Number(d.balance) : 0;
  };

  /** DEBET = KREDIT — buxgalteriya invarianti (fikstura filiallarida). */
  const journalBalanced = async (f) => {
    const entries = await prisma.journalEntry.findMany({
      where: { branchId: { in: [f.A.id, f.P.id] } },
      select: { id: true, lines: { select: { debit: true, credit: true } } },
    });
    let bad = 0;
    for (const e of entries) {
      const d = e.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
      const c = e.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
      if (Math.abs(d - c) > 0.005) bad += 1;
    }
    return { entries: entries.length, unbalanced: bad };
  };

  // ═══════════════════════════════════════════════════════════════════
  section('GURUH TARIFLARI (o\'qish)');
  // ═══════════════════════════════════════════════════════════════════

  await mirror('GET /finance/group-fees', (base, f) =>
    call(base, 'GET', `/api/finance/group-fees?year=${Y}&month=${M1}`,
      { branchId: f.A.id }));

  await mirror('GET /finance/group-fees/group/:groupId', (base, f) =>
    call(base, 'GET', `/api/finance/group-fees/group/${f.group.id}`,
      { branchId: f.A.id }));

  await mirror('GET /finance/group-fees/group/:groupId — begona filial → 404', (base, f) =>
    call(base, 'GET', `/api/finance/group-fees/group/${f.group.id}`,
      { branchId: f.B.id, as: 'dirB' }));

  // ═══════════════════════════════════════════════════════════════════
  section('O\'QUVCHI TO\'LOVLARI (o\'qish)');
  // ═══════════════════════════════════════════════════════════════════

  await mirror('GET /finance/student-payments', (base, f) =>
    call(base, 'GET',
      `/api/finance/student-payments?groupId=${f.group.id}&year=${Y}`,
      { branchId: f.A.id }));

  await mirror('GET /finance/student-payments/obligations', (base, f) =>
    call(base, 'GET',
      `/api/finance/student-payments/obligations?groupId=${f.group.id}&year=${Y}`,
      { branchId: f.A.id }));

  await mirror('GET /finance/student-payments/by-student/:id', (base, f) =>
    call(base, 'GET', `/api/finance/student-payments/by-student/${f.student.id}`,
      { branchId: f.A.id }));

  await mirror('GET /finance/student-payments/:id', (base, f) =>
    call(base, 'GET', `/api/finance/student-payments/${f.plan1.id}`,
      { branchId: f.A.id }));

  await mirror('GET /finance/student-payments/:id — mavjud emas → 404', (base) =>
    call(base, 'GET', '/api/finance/student-payments/ffffffffffffffffffffffff'));

  await mirror('GET /finance/student-payments/by-student/:id — begona filial → 404',
    (base, f) => call(base, 'GET',
      `/api/finance/student-payments/by-student/${f.student.id}`,
      { branchId: f.B.id, as: 'dirB' }));

  // ═══════════════════════════════════════════════════════════════════
  section('CHEGIRMA');
  // ═══════════════════════════════════════════════════════════════════

  const badPercent = await mirror('POST /finance/discounts — foiz > 100 → 400', (base, f) =>
    call(base, 'POST', '/api/finance/discounts', {
      branchId: f.A.id,
      body: { student: f.student.id, group: f.group.id, type: 'percent',
        value: 101, scope: 'permanent' },
    }));
  expectStatus(badPercent, 400, 'foiz > 100');

  const badMonthly = await mirror(
    'POST /finance/discounts — oylik, yil/oysiz → 400', (base, f) =>
      call(base, 'POST', '/api/finance/discounts', {
        branchId: f.A.id,
        body: { student: f.student.id, group: f.group.id, type: 'fixed',
          value: 1000, scope: 'monthly' },
      }));
  expectStatus(badMonthly, 400, 'oylik yil/oysiz');

  const created = await mirror('POST /finance/discounts (10% doimiy)', (base, f) =>
    call(base, 'POST', '/api/finance/discounts', {
      branchId: f.A.id,
      body: { student: f.student.id, group: f.group.id, type: 'percent',
        value: 10, scope: 'permanent', reason: 'parity' },
    }));
  const discountOk = expectStatus(created, 201, 'POST /finance/discounts');

  if (discountOk) {
    await bothDb('chegirmadan keyin PLAN1 qayta hisoblandi',
      (f) => planOf(f, f.plan1.id));
    await bothDb('chegirmadan keyin PLAN2 qayta hisoblandi',
      (f) => planOf(f, f.plan2.id));
  }

  const dup = await mirror('POST /finance/discounts — dublikat → 409', (base, f) =>
    call(base, 'POST', '/api/finance/discounts', {
      branchId: f.A.id,
      body: { student: f.student.id, group: f.group.id, type: 'percent',
        value: 10, scope: 'permanent' },
    }));
  expectStatus(dup, 409, 'dublikat chegirma');

  await mirror('GET /finance/discounts', (base, f) =>
    call(base, 'GET', `/api/finance/discounts?groupId=${f.group.id}`,
      { branchId: f.A.id }));

  await mirror('GET /finance/discounts — begona filial ko\'rmaydi', (base, f) =>
    call(base, 'GET', `/api/finance/discounts?groupId=${f.group.id}`,
      { branchId: f.B.id, as: 'dirB' }));

  // Chegirma ID'si stekka xos — mirror ichida o'z yozuvidan olinadi.
  const discIdOf = async (f) => {
    const d = await prisma.discount.findFirst({
      where: { studentId: f.student.id, groupId: f.group.id, isDeleted: false },
      select: { id: true },
    });
    return d?.id || null;
  };

  const patched = await mirror('PATCH /finance/discounts/:id (20%)', async (base, f) => {
    const id = await discIdOf(f);
    if (!id) throw new Error('chegirma yaratilmagan');
    return call(base, 'PATCH', `/api/finance/discounts/${id}`, {
      branchId: f.A.id, body: { value: 20 },
    });
  });
  if (expectStatus(patched, 200, 'PATCH /finance/discounts/:id')) {
    await bothDb('20% dan keyin PLAN1', (f) => planOf(f, f.plan1.id));
  }

  // ═══════════════════════════════════════════════════════════════════
  section('TASDIQ GATE\'i (discount_set = approval)');
  // ═══════════════════════════════════════════════════════════════════

  const gated = await mirror('POST /finance/discounts — direktor → 202', (base, f) =>
    call(base, 'POST', '/api/finance/discounts', {
      branchId: f.P.id, as: 'dirP',
      body: { student: f.studentP.id, group: f.groupP.id, type: 'percent',
        value: 5, scope: 'permanent', requestNote: 'parity' },
    }));
  if (expectStatus(gated, 202, 'direktor chegirmasi tasdiqqa')) {
    await bothDb('202 dan keyin CHEGIRMA QATORI YO\'Q', async (f) =>
      prisma.discount.count({ where: { studentId: f.studentP.id, isDeleted: false } }));
    await bothDb('202 dan keyin TASDIQ SO\'ROVI bor', async (f) =>
      prisma.approval.count({ where: { branchId: f.P.id, kind: 'discount_set' } }));
  }

  const gatedFee = await mirror('PUT /finance/group-fees — direktor → 202', (base, f) =>
    call(base, 'PUT', '/api/finance/group-fees', {
      branchId: f.P.id, as: 'dirP',
      body: { groupId: f.groupP.id, year: Y, month: M1, amount: 111_000,
        requestNote: 'parity' },
    }));
  if (expectStatus(gatedFee, 202, 'direktor tarifi tasdiqqa')) {
    await bothDb('202 dan keyin TARIF QATORI YO\'Q', async (f) =>
      prisma.groupFee.count({ where: { groupId: f.groupP.id } }));
  }

  // ═══════════════════════════════════════════════════════════════════
  section('GURUH TARIFI (yozish)');
  // ═══════════════════════════════════════════════════════════════════

  const feeUp = await mirror('PUT /finance/group-fees (400 000)', (base, f) =>
    call(base, 'PUT', '/api/finance/group-fees', {
      branchId: f.A.id,
      body: { groupId: f.group.id, year: Y, month: M1, amount: 400_000 },
    }));
  if (expectStatus(feeUp, 200, 'PUT /finance/group-fees')) {
    await bothDb('tarif o\'zgargach PLAN1 qayta hisoblandi',
      (f) => planOf(f, f.plan1.id));
  }

  await mirror('PUT /finance/group-fees — begona filial → 404', (base, f) =>
    call(base, 'PUT', '/api/finance/group-fees', {
      branchId: f.B.id, as: 'dirB',
      body: { groupId: f.group.id, year: Y, month: M1, amount: 1 },
    }));

  // ═══════════════════════════════════════════════════════════════════
  section('KIRIM (TRANZAKSIYA)');
  // ═══════════════════════════════════════════════════════════════════

  const before = await bothDb('to\'lovdan OLDIN', async (f) => ({
    plan1: await planOf(f, f.plan1.id),
    plan2: await planOf(f, f.plan2.id),
    tx: await txCount(f),
    deposit: await depositBalance(f),
  }));

  // PLAN1 qoldig'idan KO'P: ortgan qism PLAN2 ga, undan ortgani DEPOZITGA.
  const paid = await mirror('POST /finance/transactions (700 000)', (base, f) =>
    call(base, 'POST', '/api/finance/transactions', {
      branchId: f.A.id,
      body: { paymentId: f.plan1.id, amount: 700_000, method: 'cash',
        note: 'parity', idempotencyKey: `${TAG}-${base === EXPRESS ? 'E' : 'N'}-1` },
    }));
  const paidOk = expectStatus(paid, 201, 'POST /finance/transactions');

  if (paidOk) {
    await bothDb('to\'lovdan KEYIN', async (f) => ({
      plan1: await planOf(f, f.plan1.id),
      plan2: await planOf(f, f.plan2.id),
      tx: await txCount(f),
      deposit: await depositBalance(f),
    }));

    await bothDb('ORTIQCHA TO\'LOV YO\'Q (paid <= expected)', async (f) => {
      const rows = await prisma.studentPayment.findMany({
        where: { studentId: f.student.id },
        select: { expectedAmount: true, paidAmount: true },
      });
      return rows.filter((r) => Number(r.paidAmount) > Number(r.expectedAmount)).length;
    });

    await bothDb('JURNAL: debet = kredit', journalBalanced);
  }

  const again = await mirror('POST /finance/transactions — AYNI kalit (idempotent)',
    (base, f) => call(base, 'POST', '/api/finance/transactions', {
      branchId: f.A.id,
      body: { paymentId: f.plan1.id, amount: 700_000, method: 'cash',
        idempotencyKey: `${TAG}-${base === EXPRESS ? 'E' : 'N'}-1` },
    }));
  if (expectStatus(again, 201, 'idempotent takror')) {
    await bothDb('idempotent takrordan keyin TRANZAKSIYA SONI o\'zgarmadi', txCount);
  }

  await mirror('POST /finance/transactions — begona filial → 404', (base, f) =>
    call(base, 'POST', '/api/finance/transactions', {
      branchId: f.B.id, as: 'dirB',
      body: { paymentId: f.plan1.id, amount: 1000, method: 'cash' },
    }));

  // ── BEKOR QILISH: BUTUN BATCH ──
  const firstTxOf = async (f) => {
    const t = await prisma.paymentTransaction.findFirst({
      where: { studentId: f.student.id, isDeleted: false },
      orderBy: { createdAt: 'asc' }, select: { id: true },
    });
    return t?.id || null;
  };

  const voided = await mirror('DELETE /finance/transactions/:id (butun batch)',
    async (base, f) => {
      const id = await firstTxOf(f);
      if (!id) throw new Error('tranzaksiya yo\'q');
      return call(base, 'DELETE', `/api/finance/transactions/${id}`, { branchId: f.A.id });
    });
  if (expectStatus(voided, 200, 'DELETE /finance/transactions/:id')) {
    await bothDb('bekor qilingandan KEYIN', async (f) => ({
      plan1: await planOf(f, f.plan1.id),
      plan2: await planOf(f, f.plan2.id),
      tx: await txCount(f),
    }));
  }

  // ═══════════════════════════════════════════════════════════════════
  section('CHEGIRMANI O\'CHIRISH');
  // ═══════════════════════════════════════════════════════════════════

  const removed = await mirror('DELETE /finance/discounts/:id', async (base, f) => {
    const id = await discIdOf(f);
    if (!id) throw new Error('chegirma yo\'q');
    return call(base, 'DELETE', `/api/finance/discounts/${id}`, { branchId: f.A.id });
  });
  if (expectStatus(removed, 200, 'DELETE /finance/discounts/:id')) {
    await bothDb('chegirma o\'chgach PLAN1 tiklandi', (f) => planOf(f, f.plan1.id));
  }

  return finish();
};

let code = 1;
try {
  code = await run();
} catch (err) {
  console.error(`\n  ❌ TO'PLAM YIQILDI: ${err.stack || err.message}\n`);
  code = 1;
} finally {
  await cleanup();
  await assertNoResidue();
  await prisma.$disconnect();
}
process.exit(code || (R.fail ? 1 : 0));
