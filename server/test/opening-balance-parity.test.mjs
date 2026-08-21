/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BOSHLANG'ICH QOLDIQ — PARITET (FAZA 7.8)
 *
 * Express `/api/opening-balance` (3 marshrut) ↔ NestJS ekvivalenti.
 *
 * ── NIMA ISBOTLANADI ──
 *   1. UCHALA MATERIALIZATOR bir xil moliyaviy qator yozadi:
 *      o'quvchi avansi → depozit;  o'quvchi qarzi → sintetik oylik plan;
 *      o'qituvchi      → `TeacherSalary(kind=opening, isLocked)`;
 *      xodim           → `StaffPayrollAdjustment`.
 *   2. IDEMPOTENTLIK: ikkinchi yuborish 409 va PUL IKKI MARTA YOZILMAYDI.
 *   3. ISHORA SAQLANADI: `teacher_debt` MANFIY `expectedAmount` yozadi —
 *      `Math.abs` bilan "tuzatish" qarzni AVANSGA aylantirardi.
 *   4. GURUHSIZ o'quvchi qarzi KUTIB turadi (`awaiting_group`),
 *      materializatsiya qilinmaydi, lekin yozuv YARATILADI.
 *   5. FILIAL CHEGARASI: begona filial odamiga qoldiq yozib bo'lmaydi.
 *   6. `POST /repair` OWNER-ONLY (direktor 403).
 *   7. Ro'yxat FILIAL bo'yicha kesiladi.
 *
 * ⚠ HAR STEKKA O'Z FIKSTURASI: `OpeningBalance.userId` UNIQUE, ya'ni bir
 * odamga ikki marta yozib bo'lmaydi — bir xil so'rovni ikki stekka
 * yuborish ikkinchisida 409 berardi va hech narsa o'lchanmasdi.
 *
 * ISHLATISH:  npm run test:opening-balance-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, normalize, nowStamps, mintToken,
  waitForStacks, createReporter,
} from './_harness.mjs';

const prisma = new PrismaClient();
const TAG = `OB-${Date.now().toString(36)}`;
const { R, ok, bad, skip, section, finish } = createReporter('opening-balance');

const made = { branches: [], users: [], groups: [] };

/** ⚠ Shu yurishga xos mijoz manzili — `generalLimiter` (200/daq) uchun. */
const RUN_IP = `198.51.100.${(Number(process.hrtime.bigint() % 250n) + 2)}`;

const rateLimited = (r) =>
  r?.status === 429 ||
  /so'rovlar soni juda ko'p/i.test(String(r?.body?.message || ''));

const cleanup = async () => {
  const u = made.users;
  const b = made.branches;
  try {
    if (u.length) {
      await prisma.openingBalance.deleteMany({ where: { userId: { in: u } } });
      // ⚠ EXPRESS `computePayroll` CHAQIRADI va `StaffPayroll` qatorini
      // YARATADI (NestJS'da bu chaqiruv hali ko'chirilmagan — pastdagi
      // "kutilgan farq" tekshiruviga qarang). FK `RESTRICT`, ya'ni
      // tozalamasdan foydalanuvchini o'chirib bo'lmaydi — birinchi
      // yurishda `staff_payrolls_employeeId_fkey` da yiqildi.
      await prisma.staffPayrollItem.deleteMany({
        where: { payroll: { employeeId: { in: u } } } });
      await prisma.staffSalaryTransaction.deleteMany({ where: { employeeId: { in: u } } });
      await prisma.staffPayroll.deleteMany({ where: { employeeId: { in: u } } });
      await prisma.staffPayrollAdjustment.deleteMany({ where: { employeeId: { in: u } } });
      // `computePayroll` audit izi ham qoldiradi — u ham `RESTRICT`.
      await prisma.payrollAuditLog.deleteMany({ where: { employeeId: { in: u } } });
      await prisma.teacherSalary.deleteMany({ where: { teacherId: { in: u } } });
      await prisma.paymentTransaction.deleteMany({ where: { studentId: { in: u } } });
      await prisma.depositTransaction.deleteMany({ where: { studentId: { in: u } } });
      await prisma.studentDeposit.deleteMany({ where: { studentId: { in: u } } });
      await prisma.studentPayment.deleteMany({ where: { studentId: { in: u } } });
    }
    if (b.length) {
      const entries = await prisma.journalEntry.findMany({
        where: { branchId: { in: b } }, select: { id: true } });
      const ids = entries.map((e) => e.id);
      if (ids.length) {
        await prisma.journalLine.deleteMany({ where: { entryId: { in: ids } } });
        await prisma.journalEntry.deleteMany({ where: { id: { in: ids } } });
      }
      await prisma.account.deleteMany({ where: { branchId: { in: b } } });
    }
    if (made.groups.length) {
      await prisma.group.deleteMany({ where: { id: { in: made.groups } } });
    }
    if (u.length) {
      await prisma.userBranchAssignment.deleteMany({ where: { userId: { in: u } } });
      await prisma.user.deleteMany({ where: { id: { in: u } } });
    }
    if (b.length) await prisma.branch.deleteMany({ where: { id: { in: b } } });
  } catch (err) {
    console.log(`  ⚠️  tozalashda xato: ${err.message}`);
  }
};

const makeFixture = async (label) => {
  const branch = await prisma.branch.create({
    data: { name: `${TAG} ${label}`, code: `${TAG}${label}` } });
  const other = await prisma.branch.create({
    data: { name: `${TAG} ${label}B`, code: `${TAG}${label}B` } });
  made.branches.push(branch.id, other.id);

  const mk = async (n, role, home, extra = {}) => {
    const user = await prisma.user.create({
      data: {
        firstName: n, lastName: `${TAG}${label}`,
        username: `${n.toLowerCase()}_${TAG.toLowerCase()}_${label.toLowerCase()}`,
        passwordHash: 'x', role, homeBranchId: home, ...extra,
      } });
    made.users.push(user.id);
    return user;
  };

  const group = await prisma.group.create({
    data: { branchId: branch.id, name: `${TAG}${label} guruh` } });
  made.groups.push(group.id);

  return {
    branch, other, group,
    // ⚠ HAR HOLAT UCHUN ALOHIDA odam: `userId` UNIQUE, ya'ni bitta
    // odamda faqat BITTA boshlang'ich qoldiq bo'ladi.
    stuCredit: await mk('StuCr', 'student', branch.id,
      { enrolledAt: new Date(Date.UTC(2034, 4, 1)) }),
    stuDebt: await mk('StuDb', 'student', branch.id,
      { enrolledAt: new Date(Date.UTC(2034, 4, 1)) }),
    stuNoGroup: await mk('StuNg', 'student', branch.id),
    teacher: await mk('Teach', 'teacher', branch.id),
    staff: await mk('Staff', 'director', branch.id),
    dup: await mk('Dup', 'student', branch.id),
    foreign: await mk('Foreign', 'student', other.id),
    dir: await mk('Dir', 'director', branch.id),
  };
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mBOSHLANG'ICH QOLDIQ — PARITET\x1b[0m  (${TAG})`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false }, select: { id: true, role: true } });
  if (!owner) throw new Error('owner topilmadi');
  const ownerToken = mintToken(owner);

  const fx = { [EXPRESS]: await makeFixture('E'), [NEST]: await makeFixture('N') };
  const dirToken = {};
  for (const base of [EXPRESS, NEST]) dirToken[base] = mintToken(fx[base].dir);

  const call = (base, method, path, { body, branchId, as } = {}) =>
    request(base, method, path, {
      token: as === 'dir' ? dirToken[base] : ownerToken,
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
      [f.branch.id, '<A>'], [f.other.id, '<B>'], [f.group.id, '<GRP>'],
      [f.stuCredit.id, '<STU_CR>'], [f.stuDebt.id, '<STU_DB>'],
      [f.stuNoGroup.id, '<STU_NG>'], [f.teacher.id, '<TEACH>'],
      [f.staff.id, '<STAFF>'], [f.dup.id, '<DUP>'], [f.foreign.id, '<FOREIGN>'],
      [f.dir.id, '<DIR>'], [owner.id, '<OWNER>'],
      [`${TAG.toLowerCase()}_${L.toLowerCase()}`, '<TAG>'],
      [`${TAG} ${L}`, '<TAG>'], [`${TAG}${L}`, '<TAG>'], [TAG, '<TAG>'],
      nowStamps(),
      (v) => v.replace(/\b[0-9a-f]{24}\b/g, '<ID>'),
    ];
  };

  const mirror = async (name, fn) => {
    let e, n;
    try { e = await fn(EXPRESS, fx[EXPRESS]); n = await fn(NEST, fx[NEST]); }
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

  const ranOk = (m) => Boolean(m && m.e && m.n);

  /**
   * ⚠ PUL YO'LIDA PARITETNING O'ZI YETARLI EMAS — ikkala stek ham xato
   * qaytarsa `mirror()` YASHIL beradi va undan keyingi baza tekshiruvi
   * BO'SH jadval ustida ishlab yolg'on tasdiq berardi.
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

  const bothDb = async (name, fn) => {
    const e = await fn(fx[EXPRESS]);
    const n = await fn(fx[NEST]);
    if (JSON.stringify(e) === JSON.stringify(n)) { ok(`${name} — ${JSON.stringify(e)}`); return e; }
    bad(name, `express: ${JSON.stringify(e)}\n      nest   : ${JSON.stringify(n)}`);
    return null;
  };
  const dbIf = async (m, name, fn) => {
    if (!ranOk(m)) { skip(name, "oldingi so'rov o'lchanmadi"); return null; }
    return bothDb(name, fn);
  };

  // ─────────────────────────────────────────────────────────────────
  section("1) O'QUVCHI AVANSI (+) → DEPOZIT");
  // ─────────────────────────────────────────────────────────────────

  const cr = await mirror('POST /opening-balance (o\'quvchi avansi +400k)', (base, f) =>
    call(base, 'POST', '/api/opening-balance', {
      body: { user: f.stuCredit.id, amount: 400_000, note: `${TAG} avans` } }));
  expectStatus(cr, 201, "POST /opening-balance (avans)");

  await dbIf(cr, 'avans depozitga tushdi', async (f) => {
    const d = await prisma.studentDeposit.findUnique({
      where: { studentId: f.stuCredit.id }, select: { balance: true } });
    const t = await prisma.depositTransaction.count({
      where: { studentId: f.stuCredit.id, isOpening: true } });
    return { balance: Number(d?.balance ?? 0), openingTxns: t };
  });

  await dbIf(cr, 'jurnal muvozanatli (avans)', async (f) => {
    const lines = await prisma.journalLine.findMany({
      where: { entry: { branchId: f.branch.id } }, select: { debit: true, credit: true } });
    const debit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const credit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    return { debit, credit, balanced: debit === credit, measured: lines.length > 0 };
  });

  // ⚠ IDEMPOTENTLIK: ikkinchi yuborish 409, pul IKKI MARTA yozilmaydi.
  const dup = await mirror('POST (takroriy → 409)', (base, f) =>
    call(base, 'POST', '/api/opening-balance', {
      body: { user: f.stuCredit.id, amount: 400_000 } }));
  expectStatus(dup, 409, 'POST (takroriy)');

  await dbIf(dup, "409 dan keyin balans O'ZGARMADI", async (f) => {
    const d = await prisma.studentDeposit.findUnique({
      where: { studentId: f.stuCredit.id }, select: { balance: true } });
    return { balance: Number(d?.balance ?? 0) };
  });

  // ─────────────────────────────────────────────────────────────────
  section("2) O'QUVCHI QARZI (−) → SINTETIK OYLIK PLAN");
  // ─────────────────────────────────────────────────────────────────

  const db_ = await mirror("POST (o'quvchi qarzi −250k, guruh bilan)", (base, f) =>
    call(base, 'POST', '/api/opening-balance', {
      body: { user: f.stuDebt.id, amount: -250_000, group: f.group.id } }));
  expectStatus(db_, 201, 'POST (qarz)');

  await dbIf(db_, 'sintetik plan yozildi (isOpening)', async (f) => {
    const p = await prisma.studentPayment.findFirst({
      where: { studentId: f.stuDebt.id, isOpening: true } });
    return p
      ? { expected: Number(p.expectedAmount), paid: Number(p.paidAmount),
          isOpening: p.isOpening, status: p.status }
      : { missing: true };
  });

  // ⚠ GURUHSIZ QARZ: yozuv yaratiladi, materializatsiya KUTADI.
  const ng = await mirror("POST (guruhsiz qarz → awaiting_group)", (base, f) =>
    call(base, 'POST', '/api/opening-balance', {
      body: { user: f.stuNoGroup.id, amount: -100_000 } }));
  expectStatus(ng, 201, 'POST (guruhsiz qarz)');

  await dbIf(ng, "guruhsiz qarz materializatsiya QILINMADI", async (f) => {
    const ob = await prisma.openingBalance.findUnique({
      where: { userId: f.stuNoGroup.id } });
    const plans = await prisma.studentPayment.count({
      where: { studentId: f.stuNoGroup.id } });
    return { pendingReason: ob?.pendingReason, materialized: Boolean(ob?.materializedAt),
             plans };
  });

  // ─────────────────────────────────────────────────────────────────
  section("3) O'QITUVCHI — ISHORA SAQLANADI");
  // ─────────────────────────────────────────────────────────────────

  const th = await mirror("POST (o'qituvchi QARZI −300k)", (base, f) =>
    call(base, 'POST', '/api/opening-balance', {
      body: { user: f.teacher.id, amount: -300_000 } }));
  expectStatus(th, 201, "POST (o'qituvchi qarzi)");

  // ⚠ ENG MUHIM TEKSHIRUV: `expectedAmount` MANFIY bo'lishi SHART.
  // `Math.abs` bilan "tuzatilsa" qarz AVANSGA aylanardi va o'qituvchiga
  // 300k qarzdor bo'lish o'rniga 300k to'lanardi.
  await dbIf(th, "ISHORA: o'qituvchi qarzi MANFIY yozildi", async (f) => {
    const s = await prisma.teacherSalary.findFirst({
      where: { teacherId: f.teacher.id, kind: 'opening' } });
    return s
      ? { expected: Number(s.expectedAmount), negative: Number(s.expectedAmount) < 0,
          isLocked: s.isLocked, isOpening: s.isOpening }
      : { missing: true };
  });

  // ─────────────────────────────────────────────────────────────────
  section('4) XODIM → PAYROLL TUZATISHI');
  // ─────────────────────────────────────────────────────────────────

  const st = await mirror('POST (xodim qarzi −150k)', (base, f) =>
    call(base, 'POST', '/api/opening-balance', {
      body: { user: f.staff.id, amount: -150_000 } }));
  expectStatus(st, 201, 'POST (xodim qarzi)');

  await dbIf(st, 'payroll tuzatishi yozildi', async (f) => {
    const a = await prisma.staffPayrollAdjustment.findFirst({
      where: { employeeId: f.staff.id } });
    return a ? { kind: a.kind, amount: Number(a.amount) } : { missing: true };
  });

  /**
   * ⚠⚠ ATAYLAB KUTILGAN FARQ — YASHIRILMAYDI, O'LCHANADI.
   *
   * Express `materializeStaff` oxirida `staffPayroll.computePayroll` ni
   * chaqiradi (best-effort) va u `StaffPayroll` qatorini YARATADI.
   * `staff-payroll` moduli NestJS'ga hali ko'chirilmagan, shuning uchun
   * u yerda qator yaratilmaydi — `DEFERRED_EFFECT` WARN yoziladi.
   *
   * JAVOB TANASIGA TA'SIR QILMAYDI (Express'da ham `try/catch` ichida),
   * ya'ni yuqoridagi paritet tekshiruvlari HAQIQIY. Lekin HOSILA QATOR
   * farq qiladi va buni jimgina qoldirish "hammasi bir xil" degan
   * yolg'on taassurot berardi.
   *
   * ⚠ FARQ YO'QOLSA BU TEKSHIRUV YIQILADI — ya'ni `staff-payroll`
   * ko'chgan kuni bu yerga qaytish kerakligi darhol ko'rinadi.
   */
  if (ranOk(st)) {
    const cnt = async (f) => prisma.staffPayroll.count({
      where: { employeeId: f.staff.id } });
    const eCnt = await cnt(fx[EXPRESS]);
    const nCnt = await cnt(fx[NEST]);
    if (eCnt > 0 && nCnt === 0) {
      ok(`KUTILGAN FARQ: StaffPayroll — express ${eCnt}, nest ${nCnt} ` +
         '(`computePayroll` FAZA 8.2 da ko\'chadi)');
    } else if (eCnt === nCnt) {
      bad('KUTILGAN FARQ YO\'QOLDI',
        `express ${eCnt}, nest ${nCnt} — \`staff-payroll\` ko'chgan bo'lsa ` +
        "`materializeStaff` dagi DEFERRED_EFFECT o'rniga haqiqiy chaqiruv qo'yilsin");
    } else {
      bad('StaffPayroll kutilmagan holat', `express ${eCnt}, nest ${nCnt}`);
    }
  } else {
    skip('KUTILGAN FARQ: StaffPayroll', "xodim so'rovi o'lchanmadi");
  }

  // ─────────────────────────────────────────────────────────────────
  section('5) VALIDATSIYA VA CHEGARALAR');
  // ─────────────────────────────────────────────────────────────────

  await mirror('POST (summa 0 → 400)', (base, f) =>
    call(base, 'POST', '/api/opening-balance', {
      body: { user: f.dup.id, amount: 0 } }));
  await mirror('POST (chegaradan oshdi → 400)', (base, f) =>
    call(base, 'POST', '/api/opening-balance', {
      body: { user: f.dup.id, amount: 600_000_000 } }));
  await mirror('POST (foydalanuvchi yo\'q → 404)', (base) =>
    call(base, 'POST', '/api/opening-balance', {
      body: { user: 'a'.repeat(24), amount: 1000 } }));

  // ⚠ FILIAL CHEGARASI: direktor BEGONA filial odamiga yoza olmaydi.
  const cross = await mirror('direktor BEGONA filial odamiga yoza olmaydi (403)', (base, f) =>
    call(base, 'POST', '/api/opening-balance', {
      as: 'dir', branchId: f.branch.id,
      body: { user: f.foreign.id, amount: -50_000 } }));

  // MUSBAT NAZORAT: O'SHA direktor O'Z filiali odamiga YOZA OLADI.
  const own = await mirror("MUSBAT NAZORAT: direktor O'Z filialida yoza oladi", (base, f) =>
    call(base, 'POST', '/api/opening-balance', {
      as: 'dir', branchId: f.branch.id,
      body: { user: f.dup.id, amount: -70_000, group: f.group.id } }));
  expectStatus(own, 201, "direktor o'z filialida");

  await mirror('token yo\'q → 401', (base) =>
    request(base, 'POST', '/api/opening-balance', {
      body: { user: 'x', amount: 1 }, headers: { 'x-forwarded-for': RUN_IP } }));

  // ─────────────────────────────────────────────────────────────────
  section("6) RO'YXAT VA REPAIR");
  // ─────────────────────────────────────────────────────────────────

  await mirror('GET /opening-balance', (base, f) =>
    call(base, 'GET', '/api/opening-balance?limit=50', { branchId: f.branch.id }));
  await mirror('GET /opening-balance?pendingOnly=true', (base, f) =>
    call(base, 'GET', '/api/opening-balance?pendingOnly=true&limit=50',
      { branchId: f.branch.id }));

  // ⚠ REPAIR OWNER-ONLY: direktorda `finance.opening_balance` BOR
  // (yuqorida yozdi), lekin `repair` ROLGA bog'langan → 403.
  await mirror('POST /repair (direktor → 403)', (base, f) =>
    call(base, 'POST', '/api/opening-balance/repair', {
      as: 'dir', branchId: f.branch.id }));
  const rep = await mirror('POST /repair (owner → 200)', (base) =>
    call(base, 'POST', '/api/opening-balance/repair'));
  expectStatus(rep, 200, 'POST /repair (owner)');

  // ─────────────────────────────────────────────────────────────────
  section('7) BAZA DRIFTI');
  // ─────────────────────────────────────────────────────────────────

  await cleanup();
  const leftover = {
    branches: await prisma.branch.count({ where: { name: { startsWith: TAG } } }),
    users: await prisma.user.count({ where: { lastName: { startsWith: TAG } } }),
    openings: await prisma.openingBalance.count({ where: { note: { startsWith: TAG } } }),
  };
  const total = Object.values(leftover).reduce((a, b) => a + b, 0);
  total === 0
    ? ok("test o'zidan keyin hech narsa qoldirmadi")
    : bad('baza drifti', JSON.stringify(leftover));

  const code = finish();
  await prisma.$disconnect();
  process.exit(code);
};

run().catch(async (e) => {
  console.error(e);
  try { await cleanup(); } catch { /* tozalash ham yiqildi */ }
  await prisma.$disconnect();
  process.exit(1);
});
