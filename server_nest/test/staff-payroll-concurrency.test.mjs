/**
 * ═══════════════════════════════════════════════════════════════════════════
 * XODIMLAR MAOSHI — RAQOBAT (CONCURRENCY) VA MOLIYAVIY INVARIANTLAR
 *
 * ── NEGA ALOHIDA TEST ──
 *
 * Paritet testi "ikki stek bir xilmi" degan savolga javob beradi.
 * Bu test BOSHQA savolga: "yigirmata barmoq bir vaqtda 'To'lash'
 * tugmasini bossa, kassadan qancha pul chiqadi?".
 *
 * Ikkala stek ham ALOHIDA o'lchanadi (paritet emas, XULQ) — chunki
 * poyga natijasi tabiatan nodeterministik va `deepEqual` bu yerda
 * noto'g'ri asbob bo'lardi. Har stek uchun bir xil INVARIANT talab
 * qilinadi.
 *
 * ── ISBOTLANADIGAN INVARIANTLAR ──
 *   1. 20 ta parallel TO'LIQ to'lovdan FAQAT BITTASI o'tadi
 *      (`capToRemaining` — xom `UPDATE` dagi shart).
 *   2. `paidAmount` HECH QACHON `finalAmount` dan oshmaydi va MANFIY
 *      bo'lmaydi.
 *   3. Muvaffaqiyatli to'lovlar soni = yozilgan `StaffSalaryTransaction`
 *      qatorlari soni = JURNAL yozuvlari soni.
 *   4. Har bir jurnal yozuvida DEBET = KREDIT.
 *   5. 20 ta parallel QISMAN to'lov: yig'indi qoldiqdan OSHMAYDI.
 *   6. Parallel qayta hisoblash QO'SHALOQ KPI qatori yaratmaydi
 *      (`@@unique(employeeId, ruleId, eventKey)`).
 *   7. Tasdiqlangan to'lov IDEMPOTENT: bitta tasdiq → bitta to'lov,
 *      ikki marta tasdiqlansa ham.
 *   8. Bekor qilish balansni AYNAN qaytaradi (klamp: manfiy emas).
 *
 * ISHLATISH:  npm run test:staff-payroll-concurrency
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, mintToken, waitForStacks, createReporter,
} from './_harness.mjs';

const prisma = new PrismaClient();
const TAG = `SC-${Date.now().toString(36)}`;
const { R, ok, bad, skip, section, finish } = createReporter('staff-payroll-concurrency');

const made = { branches: [], users: [] };
let cleanupError = null;

const NOW = new Date();
const YEAR = NOW.getUTCFullYear();
const MONTH = NOW.getUTCMonth() + 1;
const ISO = (y, m, d) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const BASE_AMOUNT = 3_000_000;
const ATTEMPTS = 20;

const cleanup = async () => {
  try {
    const b = made.branches;
    const u = made.users;
    if (u.length) {
      await prisma.payrollAuditLog.deleteMany({ where: { employeeId: { in: u } } });
      await prisma.payrollAuditLog.deleteMany({ where: { actorId: { in: u } } });
      await prisma.staffSalaryTransaction.deleteMany({ where: { employeeId: { in: u } } });
      await prisma.staffPayrollItem.deleteMany({ where: { employeeId: { in: u } } });
      await prisma.staffPayrollAdjustment.deleteMany({ where: { employeeId: { in: u } } });
      await prisma.staffPayroll.deleteMany({ where: { employeeId: { in: u } } });
      await prisma.staffCompensation.deleteMany({ where: { employeeId: { in: u } } });
      await prisma.staffKpiAssignment.deleteMany({ where: { employeeId: { in: u } } });
    }
    if (b.length) {
      await prisma.staffSalaryTransaction.deleteMany({ where: { branchId: { in: b } } });
      await prisma.approval.deleteMany({ where: { branchId: { in: b } } });
      // ⚠ LIDLAR: KPI triggeri uchun to'g'ridan-to'g'ri yaratiladi va
      // filialga FK bilan bog'langan. Ularsiz `branch.deleteMany`
      // `leads_branchId_fkey` da yiqilardi — qoldiq tekshiruvi aynan
      // shuni tutdi.
      await prisma.lead.deleteMany({ where: { branchId: { in: b } } });
      await prisma.kpiRule.deleteMany({ where: { branchId: { in: b } } });
      const es = await prisma.journalEntry.findMany({
        where: { branchId: { in: b } }, select: { id: true } });
      const eids = es.map((e) => e.id);
      if (eids.length) {
        await prisma.journalLine.deleteMany({ where: { entryId: { in: eids } } });
        await prisma.journalEntry.deleteMany({ where: { id: { in: eids } } });
      }
      await prisma.journalLine.deleteMany({
        where: { account: { branchId: { in: b } } } });
      await prisma.financialAuditLog.deleteMany({ where: { branchId: { in: b } } });
      await prisma.account.deleteMany({ where: { branchId: { in: b } } });
    }
    if (u.length) {
      await prisma.user.deleteMany({ where: { id: { in: u } } });
    }
    if (b.length) await prisma.branch.deleteMany({ where: { id: { in: b } } });
  } catch (e) {
    console.error('  ⚠ tozalash xatosi:', e.message);
    cleanupError = e.message;
  }
};

const assertNoResidue = async () => {
  const left = {
    branch: await prisma.branch.count({ where: { code: { startsWith: TAG } } }),
    user: await prisma.user.count({ where: { lastName: { startsWith: TAG } } }),
    payroll: await prisma.staffPayroll.count({
      where: { employee: { lastName: { startsWith: TAG } } } }),
    tx: await prisma.staffSalaryTransaction.count({
      where: { employee: { lastName: { startsWith: TAG } } } }),
    lead: await prisma.lead.count({ where: { firstName: { startsWith: TAG } } }),
    rule: await prisma.kpiRule.count({ where: { name: { startsWith: TAG } } }),
  };
  const total = Object.values(left).reduce((a, b) => a + b, 0);
  if (total === 0 && !cleanupError) {
    console.log("  ✅ tozalash: qoldiq yo'q");
    return;
  }
  R.fail += 1;
  console.log(
    `  ❌ TOZALASH QOLDIG'I: ${JSON.stringify(left)}` +
    `${cleanupError ? ` (xato: ${cleanupError})` : ''}`,
  );
};

const num = (v) => (v === null || v === undefined ? v : Number(v));

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ULANISH SIG'IMI — POYGA TESTINI ISHGA TUSHIRISHDAN OLDIN.
 *
 * ⚠ NEGA KERAK: bu test 20 ta parallel so'rov yuboradi va har biri
 * tranzaksiya ochadi. Postgres `max_connections` (odatda 100) bir
 * nechta agent, Express, ikkita NestJS nusxasi va pg-boss bilan
 * BO'LINADI. Sig'im tugaganda Prisma "too many clients already" beradi
 * va marshrut 500 qaytaradi.
 *
 * O'LCHANDI: shu sabab bilan bitta yurishda 14 ta so'rov 500 bo'ldi —
 * kod O'ZGARMAGAN holda (o'sha test oldin 88/88 yashil edi).
 *
 * Bunday 500 PARITET NATIJASI EMAS, u INFRATUZILMA holati. Uni "yiqildi"
 * deb yozish yolg'on xulosa bo'lardi, "o'tdi" deb yozish esa undan ham
 * yomon. Shuning uchun test BOSHLANISHIDA sig'im o'lchanadi va yetarli
 * bo'lmasa yurish "O'LCHANMADI" deb belgilanadi (natija baribir QIZIL,
 * lekin SABABI to'g'ri).
 * ═══════════════════════════════════════════════════════════════════════
 */
/**
 * ⚠ QIYMAT QAYERDAN: Prisma standart havzasi `2 × CPU + 1` (bu mashinada
 * 21). Test 20 ta parallel so'rovni BITTA serverga yuboradi, ya'ni eng
 * yomon holatda o'sha serverning havzasi to'liq cheklovigacha o'sishi
 * kerak. Shundan kattaroq zaxira talab qilish testni bekorga
 * to'xtatardi, kichikrog'i esa "too many clients" 500 larini
 * o'tkazib yuborardi.
 */
const REQUIRED_HEADROOM = 21;

const connectionHeadroom = async () => {
  try {
    const [{ setting }] = await prisma.$queryRawUnsafe(
      "select setting from pg_settings where name='max_connections'");
    const [{ n }] = await prisma.$queryRawUnsafe(
      'select count(*)::int as n from pg_stat_activity');
    return { max: Number(setting), used: Number(n), free: Number(setting) - Number(n) };
  } catch {
    // ⚠ O'LCHOVNING O'ZI ham ulanish talab qiladi. Sig'im butunlay
    // tugaganda u ham yiqiladi — bu "0 bo'sh" degani, xato emas.
    return { max: 0, used: 0, free: 0 };
  }
};

/** Sig'im bo'shashini kutadi (eng ko'pi ~2 daqiqa). */
/**
 * ⚠ SABR OYNASI ~8 DAQIQA. Bir nechta agent bir vaqtda ishlaganda
 * sig'im to'lqin-to'lqin bo'shaydi; qisqa oyna testni bekorga
 * to'xtatardi.
 */
const waitForHeadroom = async () => {
  for (let i = 0; i < 96; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const h = await connectionHeadroom();
    if (h.free >= REQUIRED_HEADROOM) return h;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 5000));
  }
  return connectionHeadroom();
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mXODIMLAR MAOSHI — RAQOBAT VA INVARIANTLAR\x1b[0m  (${TAG})`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}`);
  console.log(`  Davr: ${YEAR}-${MONTH}, parallel urinishlar: ${ATTEMPTS}\n`);

  const head = await waitForHeadroom();
  console.log(`  Baza ulanishlari: ${head.used}/${head.max} band, ` +
    `${head.free} bo'sh (kerak: ${REQUIRED_HEADROOM})\n`);
  if (head.free < REQUIRED_HEADROOM) {
    skip('POYGA TESTI',
      `baza ulanishlari yetarli emas (${head.free} bo'sh < ${REQUIRED_HEADROOM}) — ` +
      "500 xatolari kod emas, infratuzilma sababli bo'lardi");
    return;
  }

  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false }, select: { id: true, role: true } });
  if (!owner) throw new Error('owner topilmadi');
  const ownerToken = mintToken(owner);

  /** Har stek uchun ALOHIDA fikstura — ular bir-birining balansiga tegmaydi. */
  const makeFixture = async (label, extraBranch = {}) => {
    const branch = await prisma.branch.create({
      data: {
        name: `${TAG} ${label}`, code: `${TAG}${label}`, ...extraBranch,
      } });
    made.branches.push(branch.id);
    const employee = await prisma.user.create({
      data: {
        firstName: `Xodim${label}`, lastName: `${TAG}${label}`,
        username: `xod_${TAG.toLowerCase()}_${label.toLowerCase()}`,
        passwordHash: 'x', role: 'reception',
        homeBranchId: branch.id, isActive: true,
      } });
    made.users.push(employee.id);
    const director = await prisma.user.create({
      data: {
        firstName: `Dir${label}`, lastName: `${TAG}${label}`,
        username: `dir_${TAG.toLowerCase()}_${label.toLowerCase()}`,
        passwordHash: 'x', role: 'director',
        homeBranchId: branch.id, isActive: true,
      } });
    made.users.push(director.id);
    return { branch, employee, director };
  };

  const fx = {
    [EXPRESS]: await makeFixture('E'),
    [NEST]: await makeFixture('N'),
  };
  const tok = {
    [EXPRESS]: { director: mintToken(fx[EXPRESS].director) },
    [NEST]: { director: mintToken(fx[NEST].director) },
  };

  const call = (base, method, path, { body, as } = {}) =>
    request(base, method, path, {
      token: as ? tok[base][as] : ownerToken, body });

  const stacks = [[EXPRESS, 'express'], [NEST, 'nest']];
  const eq = (n, a, b) => (a === b ? ok(`${n} — ${a}`) : bad(n, `kutilgan ${b}, keldi ${a}`));

  const payrollOf = (employeeId) =>
    prisma.staffPayroll.findUnique({
      where: { employeeId_year_month: { employeeId, year: YEAR, month: MONTH } } });

  // ── SHARTNOMA + MAOSH QATORI ──
  const payrollId = {};
  for (const [base, l] of stacks) {
    const f = fx[base];
    // eslint-disable-next-line no-await-in-loop
    const r = await call(base, 'POST', '/api/staff-payroll/compensations', {
      body: {
        employee: f.employee.id,
        salaryType: 'fixed',
        baseAmount: BASE_AMOUNT,
        effectiveFrom: ISO(YEAR, MONTH, 1),
      },
    });
    if (r.status !== 201) {
      skip(`shartnoma yaratilmadi (${l})`, `status=${r.status}`);
      return;
    }
    R.successes += 1;
    // eslint-disable-next-line no-await-in-loop
    const p = await payrollOf(f.employee.id);
    payrollId[base] = p.id;
    eq(`maosh qatori tayyor (${l})`, num(p.finalAmount), BASE_AMOUNT);
    eq(`boshlang'ich balans nol (${l})`, num(p.paidAmount), 0);
  }

  // ─────────────────────────────────────────────────────────────────
  section(`1) ${ATTEMPTS} TA PARALLEL TO'LIQ TO'LOV`);
  // ─────────────────────────────────────────────────────────────────

  for (const [base, l] of stacks) {
    const f = fx[base];
    // ⚠ HAMMASI BIR VAQTDA: `Promise.all` so'rovlarni navbatga
    // qo'ymaydi, ular serverga deyarli bir zumda yetadi.
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(
      Array.from({ length: ATTEMPTS }, (_, i) =>
        call(base, 'POST', '/api/staff-payroll/transactions', {
          body: {
            payrollId: payrollId[base],
            amount: BASE_AMOUNT,
            method: 'cash',
            note: `${TAG} parallel ${i}`,
          },
        }).catch((e) => ({ status: 0, body: { message: e.message } })),
      ),
    );

    const created = results.filter((r) => r.status === 201).length;
    const rejected = results.filter((r) => r.status === 400).length;
    const other = results.filter((r) => ![201, 400].includes(r.status));

    // ⚠ ENG MUHIM INVARIANT: qoldiq bitta, demak to'lov ham BITTA.
    eq(`faqat bitta to'lov o'tdi (${l})`, created, 1);
    eq(`qolganlari rad etildi (${l})`, rejected + created, ATTEMPTS);
    if (other.length) {
      bad(`kutilmagan status (${l})`,
        JSON.stringify(other.map((r) => r.status)));
    } else {
      ok(`kutilmagan status yo'q (${l}) — 0`);
    }

    // eslint-disable-next-line no-await-in-loop
    const p = await payrollOf(f.employee.id);
    eq(`balans AYNAN yakuniy summa (${l})`, num(p.paidAmount), BASE_AMOUNT);
    eq(`oshib ketmadi (${l})`, num(p.paidAmount) <= num(p.finalAmount), true);
    eq(`manfiy emas (${l})`, num(p.paidAmount) >= 0, true);
    eq(`holat "paid" (${l})`, p.status, 'paid');

    // eslint-disable-next-line no-await-in-loop
    const rows = await prisma.staffSalaryTransaction.findMany({
      where: { payrollId: payrollId[base], isDeleted: false } });
    eq(`bitta to'lov qatori (${l})`, rows.length, 1);

    // ── MOLIYAVIY INVARIANT: JURNAL ──
    // eslint-disable-next-line no-await-in-loop
    const entries = await prisma.journalEntry.findMany({
      where: { branchId: f.branch.id },
      include: { lines: true },
    });
    eq(`bitta jurnal yozuvi (${l})`, entries.length, 1);
    const balanced = entries.every((e) => {
      const dr = e.lines.reduce((a, x) => a + num(x.debit), 0);
      const cr = e.lines.reduce((a, x) => a + num(x.credit), 0);
      return dr === cr && dr === num(e.totalDebit) && cr === num(e.totalCredit);
    });
    eq(`debet = kredit (${l})`, balanced, true);
    eq(`jurnal summasi = to'lov (${l})`,
      entries.reduce((a, e) => a + num(e.totalDebit), 0), BASE_AMOUNT);

    // ── AUDIT: har o'tgan to'lov uchun bitta iz ──
    // eslint-disable-next-line no-await-in-loop
    const paidAudit = await prisma.payrollAuditLog.count({
      where: { employeeId: f.employee.id, action: 'payroll.paid' } });
    eq(`audit izlari soni = to'lovlar soni (${l})`, paidAudit, 1);
  }

  // ─────────────────────────────────────────────────────────────────
  section('2) BEKOR QILISH VA QAYTA PARALLEL QISMAN TO\'LOV');
  // ─────────────────────────────────────────────────────────────────

  for (const [base, l] of stacks) {
    const f = fx[base];
    // eslint-disable-next-line no-await-in-loop
    const rows = await prisma.staffSalaryTransaction.findMany({
      where: { payrollId: payrollId[base], isDeleted: false } });
    // eslint-disable-next-line no-await-in-loop
    const r = await call(base, 'DELETE',
      `/api/staff-payroll/transactions/${rows[0].id}`);
    eq(`to'lov bekor qilindi (${l})`, r.status, 200);
    if (r.status === 200) R.successes += 1;
    // eslint-disable-next-line no-await-in-loop
    const p = await payrollOf(f.employee.id);
    eq(`balans nolga qaytdi (${l})`, num(p.paidAmount), 0);
    eq(`manfiy emas (${l})`, num(p.paidAmount) >= 0, true);
    eq(`holat "unpaid" (${l})`, p.status, 'unpaid');
  }

  // ⚠ QISMAN TO'LOVLAR: har biri qoldiqning ¼ qismi. 20 ta urinishdan
  // eng ko'pi 4 tasi o'tishi mumkin — yig'indi qoldiqdan OSHMAYDI.
  const PART = BASE_AMOUNT / 4;
  for (const [base, l] of stacks) {
    const f = fx[base];
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(
      Array.from({ length: ATTEMPTS }, (_, i) =>
        call(base, 'POST', '/api/staff-payroll/transactions', {
          body: {
            payrollId: payrollId[base], amount: PART, method: 'cash',
            note: `${TAG} qisman ${i}`,
          },
        }).catch((e) => ({ status: 0, body: { message: e.message } })),
      ),
    );
    const created = results.filter((r) => r.status === 201).length;
    eq(`eng ko'pi 4 ta qismiy to'lov (${l})`, created <= 4, true);
    eq(`kamida bittasi o'tdi (${l})`, created >= 1, true);

    // eslint-disable-next-line no-await-in-loop
    const p = await payrollOf(f.employee.id);
    eq(`yig'indi = o'tgan to'lovlar (${l})`, num(p.paidAmount), created * PART);
    // ⚠ ENG MUHIM: qoldiqdan OSHMAYDI.
    eq(`qoldiqdan oshmadi (${l})`, num(p.paidAmount) <= num(p.finalAmount), true);

    // eslint-disable-next-line no-await-in-loop
    const rows = await prisma.staffSalaryTransaction.findMany({
      where: { payrollId: payrollId[base], isDeleted: false } });
    eq(`qatorlar soni = o'tganlar (${l})`, rows.length, created);
    const sum = rows.reduce((a, x) => a + num(x.amount), 0);
    eq(`qatorlar yig'indisi = balans (${l})`, sum, num(p.paidAmount));

    // eslint-disable-next-line no-await-in-loop
    const entries = await prisma.journalEntry.findMany({
      where: { branchId: f.branch.id, refModel: 'StaffSalaryTransaction' },
      include: { lines: true },
    });
    // Birinchi bo'limdagi bekor qilingan to'lovning yozuvi ham QOLADI —
    // jurnal o'zgarmas. Shuning uchun `created + 1`.
    eq(`jurnal yozuvlari (${l})`, entries.length, created + 1);
    const balanced = entries.every((e) => {
      const dr = e.lines.reduce((a, x) => a + num(x.debit), 0);
      const cr = e.lines.reduce((a, x) => a + num(x.credit), 0);
      return dr === cr;
    });
    eq(`har yozuvda debet = kredit (${l})`, balanced, true);
  }

  // ─────────────────────────────────────────────────────────────────
  section('3) PARALLEL QAYTA HISOBLASH — QO\'SHALOQ KPI QATORI YO\'Q');
  // ─────────────────────────────────────────────────────────────────

  // KPI qoidasi + lidlar (har stekka O'Z filiali bo'yicha bog'langan).
  const ruleId = {};
  for (const [base, l] of stacks) {
    const f = fx[base];
    // eslint-disable-next-line no-await-in-loop
    const r = await call(base, 'POST', '/api/staff-payroll/kpi/rules', {
      body: {
        name: `${TAG} ${l} lid`,
        trigger: 'lead_created',
        rewardType: 'fixed',
        rewardValue: 10_000,
        applicableRoles: ['reception'],
        branchId: f.branch.id,
      },
    });
    if (r.status !== 201) { skip(`qoida yaratilmadi (${l})`, `status=${r.status}`); continue; }
    ruleId[base] = r.body.data._id;
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.lead.create({
        data: {
          branchId: f.branch.id,
          firstName: `${TAG}${l}${i}`,
          phone: `+99891${String(Date.now()).slice(-6)}${i}${l === 'express' ? 1 : 2}`,
          createdById: f.employee.id,
        },
      });
    }
    // Shartnomani KPI qabul qiladigan turga o'tkazamiz.
    // eslint-disable-next-line no-await-in-loop
    const comps = await prisma.staffCompensation.findMany({
      where: { employeeId: f.employee.id, isDeleted: false } });
    // eslint-disable-next-line no-await-in-loop
    await call(base, 'PATCH', `/api/staff-payroll/compensations/${comps[0].id}`, {
      body: { salaryType: 'fixed_plus_kpi' },
    });
  }

  for (const [base, l] of stacks) {
    const f = fx[base];
    // ⚠ Oy TO'LANGAN bo'lsa qayta hisob to'silardi — avval to'lovlarni
    // bekor qilamiz, aks holda bu bo'lim hech narsa o'lchamasdi.
    // eslint-disable-next-line no-await-in-loop
    const live = await prisma.staffSalaryTransaction.findMany({
      where: { payrollId: payrollId[base], isDeleted: false } });
    for (const row of live) {
      // eslint-disable-next-line no-await-in-loop
      await call(base, 'DELETE', `/api/staff-payroll/transactions/${row.id}`);
    }
    // eslint-disable-next-line no-await-in-loop
    const zero = await payrollOf(f.employee.id);
    eq(`qayta hisobdan oldin balans nol (${l})`, num(zero.paidAmount), 0);

    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        call(base, 'POST', `/api/staff-payroll/${payrollId[base]}/recompute`)
          .catch((e) => ({ status: 0, body: { message: e.message } })),
      ),
    );
    const okCount = results.filter((r) => r.status === 200).length;
    eq(`parallel qayta hisoblar o'tdi (${l})`, okCount >= 1, true);

    // eslint-disable-next-line no-await-in-loop
    const items = await prisma.staffPayrollItem.findMany({
      where: { payrollId: payrollId[base] } });
    // ⚠ UNIQUE INDEKS `(employeeId, ruleId, eventKey)` — 3 ta lid → 3 ta
    // qator, necha marta parallel hisoblansa ham.
    eq(`3 ta KPI qatori (${l})`, items.length, 3);
    const keys = new Set(items.map((i) => `${i.employeeId}:${i.ruleId}:${i.eventKey}`));
    eq(`kalitlar noyob (${l})`, keys.size, items.length);

    // eslint-disable-next-line no-await-in-loop
    const p = await payrollOf(f.employee.id);
    eq(`KPI summasi 3 × 10 000 (${l})`, num(p.autoKpiTotal), 30_000);
    eq(`yakuniy = fiksa + KPI (${l})`, num(p.finalAmount), BASE_AMOUNT + 30_000);
  }

  // ─────────────────────────────────────────────────────────────────
  section('4) TASDIQLANGAN TO\'LOV IDEMPOTENT');
  // ─────────────────────────────────────────────────────────────────

  // Filialga limit qo'yamiz — direktor to'lovi tasdiqqa tushsin.
  for (const [base] of stacks) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.branch.update({
      where: { id: fx[base].branch.id },
      data: { expenseApprovalThreshold: 1000 },
    });
  }

  for (const [base, l] of stacks) {
    const f = fx[base];
    const AMOUNT = 500_000;
    // eslint-disable-next-line no-await-in-loop
    const req = await call(base, 'POST', '/api/staff-payroll/transactions', {
      as: 'director',
      body: { payrollId: payrollId[base], amount: AMOUNT, method: 'cash' },
    });
    eq(`tasdiqqa tushdi (${l})`, req.status, 202);
    if (req.status !== 202) continue;
    R.successes += 1;
    const approvalId = req.body.data?._id || req.body.data?.id;

    // eslint-disable-next-line no-await-in-loop
    const before = await payrollOf(f.employee.id);
    eq(`tasdiqsiz balans o'zgarmadi (${l})`, num(before.paidAmount), 0);

    // ⚠ IKKI MARTA TASDIQLASH — ikkinchisi HECH NARSA yozmasligi kerak.
    // eslint-disable-next-line no-await-in-loop
    const a1 = await call(base, 'POST',
      `/api/expense-approvals/${approvalId}/approve`, { body: {} });
    // eslint-disable-next-line no-await-in-loop
    const a2 = await call(base, 'POST',
      `/api/expense-approvals/${approvalId}/approve`, { body: {} });
    ok(`tasdiq javoblari (${l}) — ${a1.status}/${a2.status}`);

    // eslint-disable-next-line no-await-in-loop
    const rows = await prisma.staffSalaryTransaction.findMany({
      where: { expenseApprovalId: approvalId, isDeleted: false } });
    // ⚠ UCH QATLAMLI IDEMPOTENTLIK: mavjud qatorni qaytarish + qisman
    // unique indeks + `capToRemaining`.
    eq(`bitta to'lov qatori (${l})`, rows.length, 1);

    // eslint-disable-next-line no-await-in-loop
    const p = await payrollOf(f.employee.id);
    eq(`balans BIR MARTA oshdi (${l})`, num(p.paidAmount), AMOUNT);

    // eslint-disable-next-line no-await-in-loop
    const entries = await prisma.journalEntry.findMany({
      where: { refModel: 'StaffSalaryTransaction', refId: rows[0]?.id },
      include: { lines: true },
    });
    eq(`bitta jurnal yozuvi (${l})`, entries.length, 1);
    const dr = (entries[0]?.lines || []).reduce((a, x) => a + num(x.debit), 0);
    const cr = (entries[0]?.lines || []).reduce((a, x) => a + num(x.credit), 0);
    eq(`debet = kredit (${l})`, dr === cr && dr === AMOUNT, true);
  }

  // ─────────────────────────────────────────────────────────────────
  section('5) YAKUNIY MOLIYAVIY INVARIANT');
  // ─────────────────────────────────────────────────────────────────

  for (const [base, l] of stacks) {
    const f = fx[base];
    // eslint-disable-next-line no-await-in-loop
    const p = await payrollOf(f.employee.id);
    // eslint-disable-next-line no-await-in-loop
    const rows = await prisma.staffSalaryTransaction.findMany({
      where: { payrollId: payrollId[base], isDeleted: false } });
    const sum = rows.reduce((a, x) => a + num(x.amount), 0);

    eq(`balans = tirik to'lovlar yig'indisi (${l})`, num(p.paidAmount), sum);
    eq(`balans ≤ yakuniy summa (${l})`, num(p.paidAmount) <= num(p.finalAmount), true);
    eq(`balans ≥ 0 (${l})`, num(p.paidAmount) >= 0, true);

    const expectedStatus =
      sum <= 0 ? 'unpaid' : sum >= num(p.finalAmount) ? 'paid' : 'partial';
    eq(`holat balansdan kelib chiqadi (${l})`, p.status, expectedStatus);

    // eslint-disable-next-line no-await-in-loop
    const entries = await prisma.journalEntry.findMany({
      where: { branchId: f.branch.id }, include: { lines: true } });
    const unbalanced = entries.filter((e) => {
      const dr = e.lines.reduce((a, x) => a + num(x.debit), 0);
      const cr = e.lines.reduce((a, x) => a + num(x.credit), 0);
      return dr !== cr;
    });
    eq(`nomutanosib jurnal yozuvi yo'q (${l})`, unbalanced.length, 0);
  }
};

run()
  .catch((err) => { console.error('\x1b[31mTEST YIQILDI:\x1b[0m', err); R.fail += 1; })
  .finally(async () => {
    await cleanup();
    await assertNoResidue().catch((e) => {
      R.fail += 1;
      console.log(`  ❌ qoldiqni sanab bo'lmadi: ${e.message}`);
    });
    await prisma.$disconnect().catch(() => {});
    process.exit(finish());
  });
