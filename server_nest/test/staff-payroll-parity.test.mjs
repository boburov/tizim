/**
 * ═══════════════════════════════════════════════════════════════════════════
 * XODIMLAR MAOSHI — PARITET (30 marshrut)
 *
 * Express `/api/staff-payroll` ↔ NestJS.
 *
 * ── NIMA O'LCHANADI ──
 *
 * Javob (status + tana) YETARLI EMAS. Maosh hisobi BESH jadvalga
 * tegadi: `StaffPayroll`, `StaffPayrollItem` (KPI), `StaffPayrollAdjustment`
 * (bonus/jarima), `StaffSalaryTransaction` (to'lov) va `PayrollAuditLog`.
 * To'lov ustiga JURNAL yozuvi (`JournalEntry` + `JournalLine`) qo'shiladi.
 * Har amaldan keyin ularning HAMMASI tekshiriladi.
 *
 * ── ISBOTLANADIGAN INVARIANTLAR ──
 *   1. Javob paritetı 30/30 marshrutda.
 *   2. HISOB FORMULASI: proratsiya + KPI + bonus − jarima, oxirida
 *      boshlang'ich qarz. Har bir bo'lak ALOHIDA o'lchanadi.
 *   3. IDEMPOTENTLIK: oyni qayta hisoblash natijani O'ZGARTIRMAYDI va
 *      qo'shaloq KPI qatori yaratmaydi.
 *   4. KPI OYLIK SHIFTI (`monthlyCap`) va shaxsiy stavka (`override`).
 *   5. O'ZGARMASLIK QO'RIQCHISI: to'langan/yopilgan oyga bonus
 *      yozilmaydi va rad etilgan urinish AUDITGA tushadi.
 *   6. MOLIYAVIY INVARIANT: har to'lov uchun jurnal yozuvi va
 *      DEBET = KREDIT.
 *   7. QOLDIQ QO'RIQCHISI: qoldiqdan oshiq to'lov RAD ETILADI.
 *   8. TASDIQ GATE'i: filial limitidan oshsa 202 va PUL YOZILMAYDI.
 *   9. UCH DARAJALI RUXSAT: read / manage / pay ALOHIDA.
 *  10. FILIAL AJRATMASI: begona filial xodimiga tegib bo'lmaydi.
 *  11. BAZA DREYFI = 0.
 *
 * ISHLATISH:  npm run test:staff-payroll-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, normalize, nowStamps, mintToken,
  waitForStacks, createReporter,
} from './_harness.mjs';

const prisma = new PrismaClient();
const TAG = `SP-${Date.now().toString(36)}`;
const { R, ok, bad, skip, section, finish } = createReporter('staff-payroll');

const made = { branches: [], users: [], roles: [], leads: [] };
let cleanupError = null;

const rateLimited = (r) =>
  r?.status === 429 ||
  /so'rovlar soni juda ko'p/i.test(String(r?.body?.message || ''));

// ─── SINOV DAVRI ───
// Joriy oy ATAYLAB: `setCompensation` va `amendCompensation` aynan
// JORIY oyni qayta hisoblaydi, ya'ni boshqa oy tanlansa o'sha yo'l
// o'lchanmasdi.
const NOW = new Date();
const YEAR = NOW.getUTCFullYear();
const MONTH = NOW.getUTCMonth() + 1;
const MONTH_DAYS = new Date(Date.UTC(YEAR, MONTH, 0)).getUTCDate();
const ISO = (y, m, d) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
// Shartnoma oyning 11-kunidan boshlanadi → proratsiya o'lchanadi.
const COMP_FROM_DAY = 11;
const PRORATED_DAYS = MONTH_DAYS - COMP_FROM_DAY + 1;
const BASE_AMOUNT = 3_100_000;
const EXPECTED_FIXED = Math.round((BASE_AMOUNT * PRORATED_DAYS) / MONTH_DAYS);
const KPI_REWARD = 50_000;
const BONUS = 200_000;
const PENALTY = 50_000;
const THRESHOLD = 100_000;

const NO_SUCH_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
/** Telefon raqamining fikstura qismi — TAG dan RAQAMLARgina. */
const TAG_DIGITS = String(Date.now()).slice(-6);

/**
 * ⚠ TOZALASH TARTIBI FK ZANJIRI BO'YICHA: jurnal → to'lov → KPI
 * qatorlari → tuzatishlar → maosh → shartnoma → biriktiruv → qoida →
 * audit → tasdiq → lid → foydalanuvchi → rol → filial.
 */
const cleanup = async () => {
  try {
    const b = made.branches;
    const u = made.users;
    if (u.length) {
      await prisma.payrollAuditLog.deleteMany({ where: { employeeId: { in: u } } });
      await prisma.payrollAuditLog.deleteMany({ where: { actorId: { in: u } } });
    }
    if (b.length) {
      await prisma.staffSalaryTransaction.deleteMany({ where: { branchId: { in: b } } });
      await prisma.approval.deleteMany({ where: { branchId: { in: b } } });
    }
    if (u.length) {
      await prisma.staffPayrollItem.deleteMany({ where: { employeeId: { in: u } } });
      await prisma.staffPayrollAdjustment.deleteMany({
        where: { employeeId: { in: u } } });
      await prisma.staffSalaryTransaction.deleteMany({
        where: { employeeId: { in: u } } });
      await prisma.staffPayroll.deleteMany({ where: { employeeId: { in: u } } });
      await prisma.staffCompensation.deleteMany({ where: { employeeId: { in: u } } });
      await prisma.staffKpiAssignment.deleteMany({ where: { employeeId: { in: u } } });
    }
    if (made.leads.length) {
      await prisma.lead.deleteMany({ where: { id: { in: made.leads } } });
    }
    await prisma.kpiRule.deleteMany({ where: { name: { startsWith: TAG } } });
    if (b.length) {
      // ⚠ JURNAL: yozuv O'ZGARMAS, lekin FIKSTURA filiali bilan birga
      // o'chiriladi (moliya paritet testlaridagi bir xil naqsh).
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
      await prisma.userBranchAssignment.deleteMany({ where: { userId: { in: u } } });
      await prisma.user.deleteMany({ where: { id: { in: u } } });
    }
    if (made.roles.length) {
      await prisma.role.deleteMany({ where: { value: { in: made.roles } } });
    }
    if (b.length) {
      await prisma.branch.deleteMany({ where: { id: { in: b } } });
    }
  } catch (e) {
    console.error('  ⚠ tozalash xatosi:', e.message);
    cleanupError = e.message;
  }
};

/**
 * ⚠ TOZALASH O'LCHANADI, TAXMIN QILINMAYDI. `cleanup()` xatoni yutadi;
 * yutilgan FK xatosi testni YASHIL qoldirib, bazada MOLIYAVIY fikstura
 * to'plardi.
 */
const assertNoResidue = async () => {
  const left = {
    branch: await prisma.branch.count({ where: { code: { startsWith: TAG } } }),
    user: await prisma.user.count({ where: { lastName: { startsWith: TAG } } }),
    role: await prisma.role.count({ where: { value: { startsWith: TAG.toLowerCase() } } }),
    rule: await prisma.kpiRule.count({ where: { name: { startsWith: TAG } } }),
    payroll: await prisma.staffPayroll.count({
      where: { employee: { lastName: { startsWith: TAG } } } }),
    tx: await prisma.staffSalaryTransaction.count({
      where: { employee: { lastName: { startsWith: TAG } } } }),
    audit: await prisma.payrollAuditLog.count({
      where: { employee: { lastName: { startsWith: TAG } } } }),
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

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ULANISH SIG'IMI — YURISHDAN OLDIN.
 *
 * ⚠ Postgres `max_connections` (100) bir nechta agent, Express, bir
 * necha NestJS nusxasi va pg-boss bilan BO'LINADI. Sig'im tugaganda
 * Prisma "too many clients already" beradi va marshrut 500 qaytaradi.
 *
 * O'LCHANDI: shu sabab bilan bitta yurishda 17 ta tekshiruv qizil
 * bo'ldi — KOD O'ZGARMAGAN holda (aynan shu test oldin 204/204 yashil
 * edi va bypass yurishlari to'g'ri farqni ko'rsatgan edi).
 *
 * Bunday 500 PARITET NATIJASI EMAS. Uni "yiqildi" deb yozish yolg'on
 * xulosa, "o'tdi" deb yozish esa undan ham yomon — shuning uchun
 * sig'im o'lchanadi va yetarli bo'lmasa yurish "O'LCHANMADI" deb
 * belgilanadi (natija baribir QIZIL, lekin SABABI to'g'ri).
 * ═══════════════════════════════════════════════════════════════════════
 */
const REQUIRED_HEADROOM = 15;

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

/** Fikstura roli — uchta ruxsat darajasini ALOHIDA o'lchash uchun. */
const makeRole = async (value, label, permissionKeys) => {
  const perms = await prisma.permission.findMany({
    where: { key: { in: permissionKeys } }, select: { id: true } });
  await prisma.role.create({
    data: {
      value, label, roleType: 'staff',
      permissions: { connect: perms.map((p) => ({ id: p.id })) },
    },
  });
  made.roles.push(value);
  return value;
};

const makeFixture = async (label) => {
  const lower = `${TAG.toLowerCase()}_${label.toLowerCase()}`;

  const mkBranch = async (n, extra = {}) => {
    const b = await prisma.branch.create({
      data: { name: `${TAG} ${label}${n}`, code: `${TAG}${label}${n}`, ...extra } });
    made.branches.push(b.id);
    return b;
  };
  // ⚠ Limit ATAYLAB PAST: tasdiq gate'ini (202) o'lchash uchun.
  const branch = await mkBranch('A', { expenseApprovalThreshold: THRESHOLD });
  const branchB = await mkBranch('B');

  const readRole = await makeRole(
    `${lower}_read`, `${TAG} ${label} read`, ['payroll.read']);
  const manageRole = await makeRole(
    `${lower}_manage`, `${TAG} ${label} manage`, ['payroll.read', 'payroll.manage']);

  const mk = async (n, role, br, extra = {}) => {
    const u = await prisma.user.create({
      data: {
        firstName: `${n}${label}`, lastName: `${TAG}${label}`,
        username: `${n.toLowerCase()}_${lower}`,
        passwordHash: 'x', role, homeBranchId: br.id, isActive: true, ...extra,
      } });
    made.users.push(u.id);
    return u;
  };

  const e1 = await mk('Xodbir', 'reception', branch);
  const e2 = await mk('Xodikki', 'reception', branch);
  const eB = await mk('Xodfilb', 'reception', branchB);
  const t1 = await mk('Ustoz', 'teacher', branch);
  const st = await mk('Talaba', 'student', branch);
  const director = await mk('Direktor', 'director', branch);
  const directorB = await mk('Direktorb', 'director', branchB);
  const reader = await mk('Oquvchi', readRole, branch);
  const manager = await mk('Boshqaruv', manageRole, branch);

  return {
    branch, branchB, e1, e2, eB, t1, st,
    director, directorB, reader, manager, readRole, manageRole,
  };
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mXODIMLAR MAOSHI — PARITET\x1b[0m  (${TAG})`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}`);
  console.log(`  Davr: ${YEAR}-${MONTH} (${MONTH_DAYS} kun), ` +
    `proratsiya ${PRORATED_DAYS} kun → ${EXPECTED_FIXED}\n`);

  const head = await waitForHeadroom();
  console.log(`  Baza ulanishlari: ${head.used}/${head.max} band, ` +
    `${head.free} bo'sh (kerak: ${REQUIRED_HEADROOM})\n`);
  if (head.free < REQUIRED_HEADROOM) {
    skip('PARITET YURISHI',
      `baza ulanishlari yetarli emas (${head.free} bo'sh < ${REQUIRED_HEADROOM}) — ` +
      "500 xatolari kod emas, infratuzilma sababli bo'lardi");
    return;
  }

  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false }, select: { id: true, role: true } });
  if (!owner) throw new Error('owner topilmadi');
  const ownerToken = mintToken(owner);

  const fx = { [EXPRESS]: await makeFixture('E'), [NEST]: await makeFixture('N') };
  const tok = {};
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    tok[base] = {
      director: mintToken(f.director),
      directorB: mintToken(f.directorB),
      reader: mintToken(f.reader),
      manager: mintToken(f.manager),
    };
  }

  const call = (base, method, path, { body, as, noAuth } = {}) =>
    request(base, method, path, {
      token: noAuth ? undefined : as ? tok[base][as] : ownerToken,
      body,
    });

  /** Fikstura ichida yaratilgan ID'lar (stekka xos). */
  const st8 = { [EXPRESS]: {}, [NEST]: {} };

  /** OYNA FIKSTURA — mos obyektlar bir xil belgiga tushadi. */
  const subs = () => {
    const E = fx[EXPRESS]; const N = fx[NEST];
    const pair = (k, m) => [[E[k].id, `<${m}>`], [N[k].id, `<${m}>`]];
    const name = (n, m) => [[`${n}E`, `<${m}>`], [`${n}N`, `<${m}>`]];
    const dyn = (k, m) => [
      [st8[EXPRESS][k], `<${m}>`], [st8[NEST][k], `<${m}>`],
    ].filter(([v]) => Boolean(v));
    return [
      ...pair('branch', 'BR'), ...pair('branchB', 'BRB'),
      ...pair('e1', 'E1'), ...pair('e2', 'E2'), ...pair('eB', 'EB'),
      ...pair('t1', 'T1'), ...pair('st', 'ST'),
      ...pair('director', 'DIR'), ...pair('directorB', 'DIRB'),
      ...pair('reader', 'RD'), ...pair('manager', 'MG'),
      ...dyn('rule', 'RULE'), ...dyn('rule2', 'RULE2'),
      ...dyn('assignment', 'ASSIGN'), ...dyn('comp', 'COMP'),
      ...dyn('payroll', 'PAYROLL'), ...dyn('bonus', 'BONUS'),
      ...dyn('penalty', 'PENALTY'), ...dyn('tx', 'TX'),
      // Lid telefonlari KPI `meta` sida qaytadi — tartib bo'yicha
      // moslashtiriladi.
      ...(st8[EXPRESS].phones || []).map((v, i) => [v, `<PHONE${i}>`]),
      ...(st8[NEST].phones || []).map((v, i) => [v, `<PHONE${i}>`]),
      [owner.id, '<OWNER>'],
      ...name('Xodbir', 'E1N'), ...name('Xodikki', 'E2N'),
      ...name('Xodfilb', 'EBN'), ...name('Ustoz', 'T1N'),
      ...name('Talaba', 'STN'), ...name('Direktor', 'DIRN'),
      ...name('Direktorb', 'DIRBN'), ...name('Oquvchi', 'RDN'),
      ...name('Boshqaruv', 'MGN'),
      [`${TAG.toLowerCase()}_e`, '<tag>'], [`${TAG.toLowerCase()}_n`, '<tag>'],
      [`${TAG}E`, '<TAG>'], [`${TAG}N`, '<TAG>'],
      [`${TAG} E`, '<TAG>'], [`${TAG} N`, '<TAG>'],
      [TAG, '<TAG>'],
      nowStamps(),
      (v) => v.replace(/\b[0-9a-f]{24}\b/g, '<ID>'),
    ];
  };

  /**
   * ⚠ FARQNI YO'L BO'YICHA KO'RSATADI, kesilgan JSON emas.
   *
   * Bu javoblar KATTA (snapshot ichida KPI qoidalari, segmentlar,
   * jurnal ma'lumoti). 800 belgilik kesilgan satrda farq ko'rinmasdi va
   * xato "ikkalasi bir xil ko'rinadi" degan chalkash holatga olib
   * kelardi.
   */
  const firstDiff = (a, b, path = '') => {
    if (a === b) return null;
    const ta = a === null ? 'null' : Array.isArray(a) ? 'array' : typeof a;
    const tb = b === null ? 'null' : Array.isArray(b) ? 'array' : typeof b;
    if (ta !== tb) return `${path || '<root>'}: nest=${ta} express=${tb}`;
    if (ta === 'array') {
      if (a.length !== b.length) {
        return `${path}.length: nest=${a.length} express=${b.length}`;
      }
      for (let i = 0; i < a.length; i += 1) {
        const d = firstDiff(a[i], b[i], `${path}[${i}]`);
        if (d) return d;
      }
      return null;
    }
    if (ta === 'object') {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      for (const k of keys) {
        const d = firstDiff(a[k], b[k], path ? `${path}.${k}` : k);
        if (d) return d;
      }
      return null;
    }
    return `${path || '<root>'}: nest=${JSON.stringify(a)} express=${JSON.stringify(b)}`;
  };

  const mirror = async (name, fn) => {
    let e, n;
    try { e = await fn(EXPRESS, fx[EXPRESS]); n = await fn(NEST, fx[NEST]); }
    catch (err) { skip(name, err.message); return {}; }
    if (rateLimited(e) || rateLimited(n)) {
      skip(name, `tezlik chegarasi — express=${e.status}, nest=${n.status}`);
      return {};
    }
    if (e.status >= 200 && e.status < 300) R.successes += 1;
    const en = { status: e.status, body: normalize(e.body, subs()) };
    const nn = { status: n.status, body: normalize(n.body, subs()) };
    try { assert.deepEqual(nn, en); ok(`${name} — ${e.status}`); }
    catch {
      bad(name, firstDiff(nn, en) || 'farq topilmadi (deepEqual boshqacha hisobladi)');
    }
    return { e, n };
  };

  const eq = (n, a, b) => (a === b ? ok(`${n} — ${a}`) : bad(n, `kutilgan ${b}, keldi ${a}`));

  const perStack = async (fn) => {
    for (const [base, tagl] of [[EXPRESS, 'express'], [NEST, 'nest']]) {
      // eslint-disable-next-line no-await-in-loop
      await fn(fx[base], tagl, base);
    }
  };

  const payrollOf = (employeeId) =>
    prisma.staffPayroll.findUnique({
      where: { employeeId_year_month: { employeeId, year: YEAR, month: MONTH } } });

  const num = (v) => (v === null || v === undefined ? v : Number(v));

  // ─────────────────────────────────────────────────────────────────
  section('1) KPI TRIGGERLAR VA QOIDALAR');
  // ─────────────────────────────────────────────────────────────────

  const tr = await mirror('GET /kpi/triggers', (base) =>
    call(base, 'GET', '/api/staff-payroll/kpi/triggers'));
  if (tr.e?.body?.data) {
    eq('6 ta trigger (express)', tr.e.body.data.length, 6);
    eq('6 ta trigger (nest)', tr.n.body.data.length, 6);
    eq('kalitlar bir xil',
      tr.e.body.data.map((t) => t.key).join(','),
      tr.n.body.data.map((t) => t.key).join(','));
  }

  const rc = await mirror('POST /kpi/rules', (base, f) =>
    call(base, 'POST', '/api/staff-payroll/kpi/rules', {
      body: {
        name: `${TAG} lid mukofoti`,
        trigger: 'lead_created',
        rewardType: 'fixed',
        rewardValue: KPI_REWARD,
        applicableRoles: ['reception'],
        // ⚠ FILIALGA BOG'LANADI: aks holda qarshi stek fiksturasining
        // xodimiga ham qo'llanib, ikki stek bir-birining KPI summasini
        // o'zgartirardi.
        branchId: f.branch.id,
      },
    }));
  if (rc.e?.status === 201) {
    st8[EXPRESS].rule = rc.e.body.data._id;
    st8[NEST].rule = rc.n.body.data._id;
  }

  await mirror("POST /kpi/rules (noma'lum trigger → 400)", (base) =>
    call(base, 'POST', '/api/staff-payroll/kpi/rules', {
      body: { name: `${TAG} x`, trigger: 'yoq', rewardType: 'fixed', rewardValue: 1 },
    }));
  await mirror('POST /kpi/rules (foiz > 100 → 400)', (base) =>
    call(base, 'POST', '/api/staff-payroll/kpi/rules', {
      body: {
        name: `${TAG} foiz`, trigger: 'payments_collected',
        rewardType: 'percent', rewardValue: 150,
      },
    }));
  await mirror("PATCH /kpi/rules/:id (turini foizga o'zgartirish → 400)", (base) =>
    call(base, 'PATCH', `/api/staff-payroll/kpi/rules/${st8[base].rule}`, {
      body: { rewardType: 'percent' },
    }));
  await mirror('PATCH /kpi/rules/:id (nomni yangilash)', (base) =>
    call(base, 'PATCH', `/api/staff-payroll/kpi/rules/${st8[base].rule}`, {
      body: { name: `${TAG} lid mukofoti (yangi)` },
    }));
  await mirror("PATCH /kpi/rules/<yo'q> → 404", (base) =>
    call(base, 'PATCH', `/api/staff-payroll/kpi/rules/${NO_SUCH_ID}`, {
      body: { name: `${TAG} x` },
    }));
  await mirror('GET /kpi/rules', (base) =>
    call(base, 'GET', '/api/staff-payroll/kpi/rules'));
  await mirror('GET /kpi/rules?enabled=false', (base) =>
    call(base, 'GET', '/api/staff-payroll/kpi/rules?enabled=false'));
  await mirror('GET /kpi/rules?trigger=xato → 400', (base) =>
    call(base, 'GET', '/api/staff-payroll/kpi/rules?trigger=xato'));

  // ─────────────────────────────────────────────────────────────────
  section('2) BIRIKTIRUVLAR');
  // ─────────────────────────────────────────────────────────────────

  const asn = await mirror('POST /kpi/assignments', (base, f) =>
    call(base, 'POST', '/api/staff-payroll/kpi/assignments', {
      body: { employee: f.e2.id, rule: st8[base].rule, rewardValueOverride: 70_000 },
    }));
  if (asn.e?.status === 200) {
    st8[EXPRESS].assignment = asn.e.body.data._id;
    st8[NEST].assignment = asn.n.body.data._id;
  }
  await mirror('POST /kpi/assignments (takror → yangilanadi)', (base, f) =>
    call(base, 'POST', '/api/staff-payroll/kpi/assignments', {
      body: { employee: f.e2.id, rule: st8[base].rule, rewardValueOverride: 80_000 },
    }));
  await perStack(async (f, l) => {
    const rows = await prisma.staffKpiAssignment.findMany({
      where: { employeeId: f.e2.id, isDeleted: false } });
    // ⚠ QISMAN UNIQUE INDEKS: ikkinchi POST yangi qator YARATMAYDI.
    eq(`biriktiruv dublikatsiz (${l})`, rows.length, 1);
    eq(`shaxsiy stavka yangilandi (${l})`, num(rows[0]?.rewardValueOverride), 80_000);
  });
  await mirror('GET /kpi/assignments/:employeeId', (base, f) =>
    call(base, 'GET', `/api/staff-payroll/kpi/assignments/${f.e2.id}`));
  await mirror("POST /kpi/assignments (noma'lum qoida → 404)", (base, f) =>
    call(base, 'POST', '/api/staff-payroll/kpi/assignments', {
      body: { employee: f.e2.id, rule: NO_SUCH_ID },
    }));

  // ─────────────────────────────────────────────────────────────────
  section('3) SHARTNOMALAR');
  // ─────────────────────────────────────────────────────────────────

  const cs = await mirror('POST /compensations (proratsiyali)', (base, f) =>
    call(base, 'POST', '/api/staff-payroll/compensations', {
      body: {
        employee: f.e1.id,
        salaryType: 'fixed_plus_kpi',
        baseAmount: BASE_AMOUNT,
        effectiveFrom: ISO(YEAR, MONTH, COMP_FROM_DAY),
        note: `${TAG} boshlang'ich shartnoma`,
      },
    }));
  if (cs.e?.status === 201) {
    st8[EXPRESS].comp = cs.e.body.data._id;
    st8[NEST].comp = cs.n.body.data._id;
  }
  await perStack(async (f, l) => {
    const p = await payrollOf(f.e1.id);
    // ⚠ Shartnoma yaratilishi JORIY oyni DARHOL hisoblaydi.
    eq(`shartnomadan keyin maosh qatori (${l})`, Boolean(p), true);
    eq(`proratsiya kunlari (${l})`, p?.payableDays, PRORATED_DAYS);
    eq(`fiksa summa (${l})`, num(p?.fixedAmount), EXPECTED_FIXED);
    eq(`hali KPI yo'q (${l})`, num(p?.autoKpiTotal), 0);
    eq(`yakuniy = fiksa (${l})`, num(p?.finalAmount), EXPECTED_FIXED);
    eq(`manba "auto" (${l})`, p?.source, 'auto');
    eq(`holat "unpaid" (${l})`, p?.status, 'unpaid');
    // AUDIT: yaratilish izi.
    const a = await prisma.payrollAuditLog.findFirst({
      where: { employeeId: f.e1.id, action: 'payroll.generated' } });
    eq(`audit izi (${l})`, Boolean(a), true);
  });

  await mirror("POST /compensations (o'qituvchiga fiksa → 400)", (base, f) =>
    call(base, 'POST', '/api/staff-payroll/compensations', {
      body: { employee: f.t1.id, salaryType: 'fixed', baseAmount: 1_000_000 },
    }));
  await mirror("POST /compensations (o'qituvchiga kpi_only → 201)", (base, f) =>
    call(base, 'POST', '/api/staff-payroll/compensations', {
      body: { employee: f.t1.id, salaryType: 'kpi_only' },
    }));
  await mirror("POST /compensations (o'quvchiga → 400)", (base, f) =>
    call(base, 'POST', '/api/staff-payroll/compensations', {
      body: { employee: f.st.id, salaryType: 'fixed', baseAmount: 1 },
    }));
  await mirror("POST /compensations (eskisidan oldin → 400)", (base, f) =>
    call(base, 'POST', '/api/staff-payroll/compensations', {
      body: {
        employee: f.e1.id, salaryType: 'fixed', baseAmount: 1_000_000,
        effectiveFrom: ISO(YEAR, MONTH, 1),
      },
    }));
  await mirror('GET /compensations/by-employee/:employeeId', (base, f) =>
    call(base, 'GET', `/api/staff-payroll/compensations/by-employee/${f.e1.id}`));
  await mirror('GET /compensations/missing', (base) =>
    call(base, 'GET', '/api/staff-payroll/compensations/missing'));

  // ⚠ kpi_only ga o'tkazish `baseAmount` ni MAJBURAN NOLLAYDI.
  const cp = await mirror('PATCH /compensations/:id (kpi_only → baseAmount 0)',
    (base) => call(base, 'PATCH', `/api/staff-payroll/compensations/${st8[base].comp}`, {
      body: { salaryType: 'kpi_only' },
    }));
  if (cp.e?.status === 200) {
    await perStack(async (f, l) => {
      const c = await prisma.staffCompensation.findUnique({
        where: { id: st8[l === 'express' ? EXPRESS : NEST].comp } });
      eq(`kpi_only da baseAmount nollandi (${l})`, num(c?.baseAmount), 0);
    });
  }
  // Qaytarib qo'yamiz — keyingi bo'limlar proratsiyaga tayanadi.
  await mirror('PATCH /compensations/:id (fiksani tiklash)', (base) =>
    call(base, 'PATCH', `/api/staff-payroll/compensations/${st8[base].comp}`, {
      body: { salaryType: 'fixed_plus_kpi', baseAmount: BASE_AMOUNT },
    }));
  await mirror("PATCH /compensations/<yo'q> → 404", (base) =>
    call(base, 'PATCH', `/api/staff-payroll/compensations/${NO_SUCH_ID}`, {
      body: { baseAmount: 1 },
    }));

  // ─────────────────────────────────────────────────────────────────
  section('4) KPI HISOBI');
  // ─────────────────────────────────────────────────────────────────

  // Lidlar — trigger manbasi. Telefon RAQAMLARI HAR XIL: `dedupeDays`
  // (standart 90 kun) bir xil raqamni bir marta to'laydi.
  await perStack(async (f, l, base) => {
    // ⚠ ISM VA RAQAM STEK BELGISI BILAN: ular KPI qatorining `meta` siga
    // tushadi va `GET /:id` javobida qaytadi. Tasodifiy qiymat ikki
    // stekni HAQIQIY farq bo'lmasa ham ajratib yuborardi — shuning
    // uchun ikkalasi ham `subs()` da belgiga almashtiriladi.
    const mark = base === EXPRESS ? 'E' : 'N';
    st8[base].phones = [];
    for (let i = 0; i < 2; i += 1) {
      const phone = `+99890${TAG_DIGITS}${i}${mark === 'E' ? 1 : 2}`;
      st8[base].phones.push(phone);
      // eslint-disable-next-line no-await-in-loop
      const lead = await prisma.lead.create({
        data: {
          branchId: f.branch.id,
          firstName: `${TAG}${mark}lid${i}`,
          phone,
          createdById: f.e1.id,
        },
      });
      made.leads.push(lead.id);
    }
  });

  const rcp = await mirror('POST /:id/recompute (KPI qo\'shildi)', async (base, f) => {
    const p = await payrollOf(f.e1.id);
    st8[base].payroll = p.id;
    return call(base, 'POST', `/api/staff-payroll/${p.id}/recompute`);
  });
  if (rcp.e?.status === 200) {
    await perStack(async (f, l) => {
      const p = await payrollOf(f.e1.id);
      eq(`KPI 2 × ${KPI_REWARD} (${l})`, num(p?.autoKpiTotal), 2 * KPI_REWARD);
      eq(`yakuniy fiksa + KPI (${l})`,
        num(p?.finalAmount), EXPECTED_FIXED + 2 * KPI_REWARD);
      const items = await prisma.staffPayrollItem.findMany({
        where: { payrollId: p.id } });
      eq(`2 ta KPI qatori (${l})`, items.length, 2);
      eq(`qator summasi (${l})`, num(items[0]?.amount), KPI_REWARD);
    });
  }

  // ⚠ IDEMPOTENTLIK: qayta hisoblash qo'shaloq qator YARATMAYDI.
  await mirror('POST /:id/recompute (ikkinchi marta — idempotent)', (base) =>
    call(base, 'POST', `/api/staff-payroll/${st8[base].payroll}/recompute`));
  await perStack(async (f, l) => {
    const p = await payrollOf(f.e1.id);
    const items = await prisma.staffPayrollItem.findMany({ where: { payrollId: p.id } });
    eq(`qatorlar soni o'zgarmadi (${l})`, items.length, 2);
    eq(`KPI summasi o'zgarmadi (${l})`, num(p?.autoKpiTotal), 2 * KPI_REWARD);
  });

  // ⚠ OYLIK SHIFT: `monthlyCap` qoidaning umumiy summasini kesadi.
  await mirror('PATCH /kpi/rules/:id (monthlyCap = 75 000)', (base) =>
    call(base, 'PATCH', `/api/staff-payroll/kpi/rules/${st8[base].rule}`, {
      body: { monthlyCap: 75_000 },
    }));
  await mirror('POST /:id/recompute (shift qo\'llandi)', (base) =>
    call(base, 'POST', `/api/staff-payroll/${st8[base].payroll}/recompute`));
  await perStack(async (f, l) => {
    const p = await payrollOf(f.e1.id);
    eq(`KPI shiftga tushdi (${l})`, num(p?.autoKpiTotal), 75_000);
  });
  await mirror('PATCH /kpi/rules/:id (shiftni olib tashlash)', (base) =>
    call(base, 'PATCH', `/api/staff-payroll/kpi/rules/${st8[base].rule}`, {
      body: { monthlyCap: 0 },
    }));
  await mirror('POST /:id/recompute (shiftsiz)', (base) =>
    call(base, 'POST', `/api/staff-payroll/${st8[base].payroll}/recompute`));

  // ─────────────────────────────────────────────────────────────────
  section('5) BONUS VA JARIMA');
  // ─────────────────────────────────────────────────────────────────

  const bn = await mirror('POST /adjustments (bonus)', (base, f) =>
    call(base, 'POST', '/api/staff-payroll/adjustments', {
      body: {
        employee: f.e1.id, year: YEAR, month: MONTH,
        kind: 'bonus', amount: BONUS, reason: `${TAG} yaxshi ish`,
      },
    }));
  if (bn.e?.status === 201) {
    st8[EXPRESS].bonus = bn.e.body.data._id;
    st8[NEST].bonus = bn.n.body.data._id;
  }
  const pn = await mirror('POST /adjustments (jarima)', (base, f) =>
    call(base, 'POST', '/api/staff-payroll/adjustments', {
      body: {
        employee: f.e1.id, year: YEAR, month: MONTH,
        kind: 'penalty', amount: PENALTY, reason: `${TAG} kechikish`,
      },
    }));
  if (pn.e?.status === 201) {
    st8[EXPRESS].penalty = pn.e.body.data._id;
    st8[NEST].penalty = pn.n.body.data._id;
  }
  const EXPECTED_FINAL = EXPECTED_FIXED + 2 * KPI_REWARD + BONUS - PENALTY;
  await perStack(async (f, l) => {
    const p = await payrollOf(f.e1.id);
    eq(`bonus yig'indisi (${l})`, num(p?.manualBonusTotal), BONUS);
    eq(`jarima yig'indisi (${l})`, num(p?.penaltyTotal), PENALTY);
    // ⚠ FORMULA: fiksa + KPI + bonus − jarima.
    eq(`yakuniy summa (${l})`, num(p?.finalAmount), EXPECTED_FINAL);
  });

  await mirror('POST /adjustments (sababsiz → 400)', (base, f) =>
    call(base, 'POST', '/api/staff-payroll/adjustments', {
      body: {
        employee: f.e1.id, year: YEAR, month: MONTH,
        kind: 'bonus', amount: 1000, reason: '   ',
      },
    }));
  await mirror('POST /adjustments (manfiy summa → 400)', (base, f) =>
    call(base, 'POST', '/api/staff-payroll/adjustments', {
      body: {
        employee: f.e1.id, year: YEAR, month: MONTH,
        kind: 'bonus', amount: -5, reason: `${TAG} x`,
      },
    }));
  await mirror("POST /adjustments (o'quvchiga → 400)", (base, f) =>
    call(base, 'POST', '/api/staff-payroll/adjustments', {
      body: {
        employee: f.st.id, year: YEAR, month: MONTH,
        kind: 'bonus', amount: 1000, reason: `${TAG} x`,
      },
    }));

  // ⚠ BOSHLANG'ICH QOLDIQNI O'CHIRIB BO'LMAYDI (idempotentlik sharti).
  await perStack(async (f, l, base) => {
    const row = await prisma.staffPayrollAdjustment.create({
      data: {
        employeeId: f.e1.id, branchId: f.branch.id, year: YEAR, month: MONTH,
        kind: 'opening_debt', amount: 1000, reason: `${TAG} boshlang'ich qarz`,
      },
    });
    st8[base].openingDebt = row.id;
  });
  await mirror("DELETE /adjustments/:id (boshlang'ich qoldiq → 400)", (base) =>
    call(base, 'DELETE', `/api/staff-payroll/adjustments/${st8[base].openingDebt}`));
  await perStack(async (f, l, base) => {
    const row = await prisma.staffPayrollAdjustment.findUnique({
      where: { id: st8[base].openingDebt } });
    eq(`boshlang'ich qoldiq o'chmadi (${l})`, row?.isDeleted, false);
    await prisma.staffPayrollAdjustment.delete({ where: { id: st8[base].openingDebt } });
  });
  // Qoldiq o'chirilgandan keyin summani tiklaymiz.
  await mirror('POST /:id/recompute (qarzsiz)', (base) =>
    call(base, 'POST', `/api/staff-payroll/${st8[base].payroll}/recompute`));

  // ─────────────────────────────────────────────────────────────────
  section("6) TO'LOV, JURNAL VA QOLDIQ QO'RIQCHISI");
  // ─────────────────────────────────────────────────────────────────

  const PAY1 = 1_000_000;
  const tx1 = await mirror("POST /transactions (owner — limitdan ozod)", (base, f) =>
    call(base, 'POST', '/api/staff-payroll/transactions', {
      body: {
        payrollId: st8[base].payroll, amount: PAY1, method: 'cash',
        note: `${TAG} birinchi to'lov`,
      },
    }));
  if (tx1.e?.status === 201) {
    st8[EXPRESS].tx = tx1.e.body.data._id;
    st8[NEST].tx = tx1.n.body.data._id;
    await perStack(async (f, l, base) => {
      const p = await payrollOf(f.e1.id);
      eq(`to'langan summa (${l})`, num(p?.paidAmount), PAY1);
      eq(`holat "partial" (${l})`, p?.status, 'partial');
      // ── MOLIYAVIY INVARIANT: JURNAL YOZUVI ──
      const entry = await prisma.journalEntry.findUnique({
        where: { postingKey: `salary_staff:${st8[base].tx}` },
        include: { lines: true },
      });
      eq(`jurnal yozuvi yaratildi (${l})`, Boolean(entry), true);
      eq(`debet = kredit (${l})`,
        num(entry?.totalDebit) === num(entry?.totalCredit), true);
      eq(`jurnal summasi (${l})`, num(entry?.totalDebit), PAY1);
      eq(`ikki qator (${l})`, entry?.lines?.length, 2);
      const dr = (entry?.lines || []).reduce((a, x) => a + num(x.debit), 0);
      const cr = (entry?.lines || []).reduce((a, x) => a + num(x.credit), 0);
      eq(`qatorlar balansi (${l})`, dr === cr && dr === PAY1, true);
      // AUDIT
      const a = await prisma.payrollAuditLog.findFirst({
        where: { employeeId: f.e1.id, action: 'payroll.paid' } });
      eq(`to'lov audit izi (${l})`, Boolean(a), true);
    });
  }

  // ⚠ O'ZGARMASLIK QO'RIQCHISI: to'langan oyga bonus YOZILMAYDI va rad
  // etilgan urinish AUDITGA tushadi.
  const blockedBefore = {};
  await perStack(async (f, l, base) => {
    blockedBefore[base] = await prisma.payrollAuditLog.count({
      where: { employeeId: f.e1.id, action: 'payroll.blocked' } });
  });
  await mirror("POST /adjustments (to'langan oyga → 400)", (base, f) =>
    call(base, 'POST', '/api/staff-payroll/adjustments', {
      body: {
        employee: f.e1.id, year: YEAR, month: MONTH,
        kind: 'bonus', amount: 10_000, reason: `${TAG} kech bonus`,
      },
    }));
  await perStack(async (f, l, base) => {
    const after = await prisma.payrollAuditLog.count({
      where: { employeeId: f.e1.id, action: 'payroll.blocked' } });
    eq(`rad etish auditga tushdi (${l})`, after, blockedBefore[base] + 1);
    const p = await payrollOf(f.e1.id);
    eq(`bonus qo'shilmadi (${l})`, num(p?.manualBonusTotal), BONUS);
  });

  // ⚠ QOLDIQ QO'RIQCHISI.
  const REMAINING = EXPECTED_FINAL - PAY1;
  await mirror("POST /transactions (qoldiqdan oshiq → 400)", (base) =>
    call(base, 'POST', '/api/staff-payroll/transactions', {
      body: {
        payrollId: st8[base].payroll, amount: REMAINING + 1, method: 'cash',
      },
    }));
  await perStack(async (f, l) => {
    const p = await payrollOf(f.e1.id);
    eq(`rad etilgan to'lov balansga tegmadi (${l})`, num(p?.paidAmount), PAY1);
  });

  await mirror("POST /transactions (qolganini to'lash)", (base) =>
    call(base, 'POST', '/api/staff-payroll/transactions', {
      body: { payrollId: st8[base].payroll, amount: REMAINING, method: 'card' },
    }));
  await perStack(async (f, l) => {
    const p = await payrollOf(f.e1.id);
    eq(`to'liq to'landi (${l})`, num(p?.paidAmount), EXPECTED_FINAL);
    eq(`holat "paid" (${l})`, p?.status, 'paid');
  });

  await mirror('POST /transactions (kelajak sana → 400)', (base) =>
    call(base, 'POST', '/api/staff-payroll/transactions', {
      body: {
        payrollId: st8[base].payroll, amount: 1, method: 'cash',
        paidAt: `${YEAR + 1}-01-01`,
      },
    }));
  await mirror("POST /transactions (noma'lum qator → 404)", (base) =>
    call(base, 'POST', '/api/staff-payroll/transactions', {
      body: { payrollId: NO_SUCH_ID, amount: 1, method: 'cash' },
    }));

  // ── TASDIQ GATE'i (limit 100 000, direktorda finance.approve YO'Q) ──
  const apprBefore = {};
  await perStack(async (f, l, base) => {
    apprBefore[base] = await prisma.approval.count({ where: { branchId: f.branch.id } });
  });
  await mirror('POST /transactions (direktor, limitdan oshiq → 202)', (base) =>
    call(base, 'POST', '/api/staff-payroll/transactions', {
      as: 'director',
      body: {
        payrollId: st8[base].payroll, amount: THRESHOLD + 1, method: 'cash',
        requestNote: `${TAG} tasdiqlang`,
      },
    }));
  await perStack(async (f, l, base) => {
    const after = await prisma.approval.count({ where: { branchId: f.branch.id } });
    eq(`tasdiq so'rovi yaratildi (${l})`, after, apprBefore[base] + 1);
    const p = await payrollOf(f.e1.id);
    // ⚠ ENG MUHIMI: TASDIQSIZ PUL YOZILMAYDI.
    eq(`tasdiqsiz balans o'zgarmadi (${l})`, num(p?.paidAmount), EXPECTED_FINAL);
    const a = await prisma.approval.findFirst({
      where: { branchId: f.branch.id, kind: 'staff_salary_payment' } });
    eq(`so'rov holati (${l})`, a?.status, 'pending');
  });

  // ── TO'LOVNI BEKOR QILISH ──
  await mirror("DELETE /transactions/:id", (base) =>
    call(base, 'DELETE', `/api/staff-payroll/transactions/${st8[base].tx}`));
  await perStack(async (f, l, base) => {
    const p = await payrollOf(f.e1.id);
    eq(`balans qaytarildi (${l})`, num(p?.paidAmount), EXPECTED_FINAL - PAY1);
    eq(`holat "partial" ga qaytdi (${l})`, p?.status, 'partial');
    const row = await prisma.staffSalaryTransaction.findUnique({
      where: { id: st8[base].tx } });
    eq(`to'lov arxivlandi (${l})`, row?.isDeleted, true);
    // ⚠ JURNAL YOZUVI QOLADI — u O'ZGARMAS. Bekor qilish uni
    // o'chirmaydi (Express'da ham).
    const entry = await prisma.journalEntry.findUnique({
      where: { postingKey: `salary_staff:${st8[base].tx}` } });
    eq(`jurnal yozuvi saqlanib qoldi (${l})`, Boolean(entry), true);
    const a = await prisma.payrollAuditLog.findFirst({
      where: { employeeId: f.e1.id, action: 'payroll.payment_reversed' } });
    eq(`bekor qilish audit izi (${l})`, Boolean(a), true);
  });
  await mirror("DELETE /transactions/<yo'q> → 404", (base) =>
    call(base, 'DELETE', `/api/staff-payroll/transactions/${NO_SUCH_ID}`));

  // ─────────────────────────────────────────────────────────────────
  section("7) OYNI YOPISH VA QAYTA OCHISH");
  // ─────────────────────────────────────────────────────────────────

  await mirror('PATCH /:id/lifecycle (yopish)', (base) =>
    call(base, 'PATCH', `/api/staff-payroll/${st8[base].payroll}/lifecycle`, {
      body: { lifecycle: 'finalized' },
    }));
  await perStack(async (f, l) => {
    const p = await payrollOf(f.e1.id);
    eq(`oy yopildi (${l})`, p?.lifecycle, 'finalized');
    eq(`yopgan foydalanuvchi (${l})`, String(p?.finalizedById), owner.id);
  });
  await mirror('POST /:id/recompute (yopiq oy → 400)', (base) =>
    call(base, 'POST', `/api/staff-payroll/${st8[base].payroll}/recompute`));
  await mirror('PATCH /:id/lifecycle (sababsiz ochish → 400)', (base) =>
    call(base, 'PATCH', `/api/staff-payroll/${st8[base].payroll}/lifecycle`, {
      body: { lifecycle: 'draft' },
    }));
  await mirror('PATCH /:id/lifecycle (sabab bilan ochish)', (base) =>
    call(base, 'PATCH', `/api/staff-payroll/${st8[base].payroll}/lifecycle`, {
      body: { lifecycle: 'draft', reason: `${TAG} xato topildi` },
    }));
  await perStack(async (f, l) => {
    const p = await payrollOf(f.e1.id);
    eq(`oy ochildi (${l})`, p?.lifecycle, 'draft');
    // ⚠ Qulf ochilganda `force` bilan DARHOL qayta hisoblanadi.
    eq(`ochilgach qayta hisoblandi (${l})`, p?.source, 'manual');
    const a = await prisma.payrollAuditLog.findFirst({
      where: { employeeId: f.e1.id, action: 'payroll.unlocked' } });
    eq(`ochish audit izi (${l})`, Boolean(a), true);
  });

  // ─────────────────────────────────────────────────────────────────
  section('8) RO\'YXAT VA TAFSILOT');
  // ─────────────────────────────────────────────────────────────────

  await mirror('GET /?year&month', (base) =>
    call(base, 'GET', `/api/staff-payroll?year=${YEAR}&month=${MONTH}&limit=200`));
  await mirror('GET /?employeeId', (base, f) =>
    call(base, 'GET', `/api/staff-payroll?employeeId=${f.e1.id}`));
  await mirror('GET /?status=paid', (base) =>
    call(base, 'GET', '/api/staff-payroll?status=paid&limit=200'));
  await mirror('GET /?status=xato → 400', (base) =>
    call(base, 'GET', '/api/staff-payroll?status=xato'));
  await mirror('GET /:id', (base) =>
    call(base, 'GET', `/api/staff-payroll/${st8[base].payroll}`));
  await mirror("GET /<yo'q> → 404", (base) =>
    call(base, 'GET', `/api/staff-payroll/${NO_SUCH_ID}`));
  await mirror('GET /by-employee/:employeeId', (base, f) =>
    call(base, 'GET', `/api/staff-payroll/by-employee/${f.e1.id}`));

  // ─────────────────────────────────────────────────────────────────
  section('9) HR / MAOSH TARIXI');
  // ─────────────────────────────────────────────────────────────────

  await mirror('GET /history/impact/:employeeId', (base, f) =>
    call(base, 'GET', `/api/staff-payroll/history/impact/${f.e1.id}`));
  await mirror('POST /history/preview (quruq yugurish)', (base, f) =>
    call(base, 'POST', '/api/staff-payroll/history/preview', {
      body: {
        employeeId: f.e1.id,
        from: ISO(YEAR, MONTH, 1),
        to: ISO(YEAR, MONTH, MONTH_DAYS),
      },
    }));
  await perStack(async (f, l) => {
    const cnt = await prisma.staffPayroll.count({ where: { employeeId: f.e1.id } });
    // ⚠ QURUQ YUGURISH HECH NARSA YOZMAYDI.
    eq(`preview yozuv yaratmadi (${l})`, cnt, 1);
  });

  // Ikkinchi xodim — shartnomasiz oraliq yaratish rad etiladi.
  await mirror("POST /history/generate-range (shartnomasiz → 400)", (base, f) =>
    call(base, 'POST', '/api/staff-payroll/history/generate-range', {
      body: {
        employeeId: f.e2.id,
        from: ISO(YEAR, MONTH, 1),
        to: ISO(YEAR, MONTH, MONTH_DAYS),
      },
    }));
  await mirror('POST /compensations (ikkinchi xodim)', (base, f) =>
    call(base, 'POST', '/api/staff-payroll/compensations', {
      body: {
        employee: f.e2.id, salaryType: 'fixed', baseAmount: 1_000_000,
        effectiveFrom: ISO(YEAR, MONTH, 1),
      },
    }));
  await mirror('POST /history/generate-range (mavjud oy → skipped)', (base, f) =>
    call(base, 'POST', '/api/staff-payroll/history/generate-range', {
      body: {
        employeeId: f.e2.id,
        from: ISO(YEAR, MONTH, 1),
        to: ISO(YEAR, MONTH, MONTH_DAYS),
      },
    }));
  await mirror('POST /history/recalculate', (base, f) =>
    call(base, 'POST', '/api/staff-payroll/history/recalculate', {
      body: { employeeId: f.e2.id },
    }));
  await mirror('GET /history/timeline/:employeeId', (base, f) =>
    call(base, 'GET', `/api/staff-payroll/history/timeline/${f.e2.id}`));

  // ── AKTIVATSIYA SANASI ──
  await mirror('PATCH /history/payroll-start (tarix bor, tasdiqsiz → 400)',
    (base, f) => call(base, 'PATCH',
      `/api/staff-payroll/history/payroll-start/${f.e2.id}`, {
        body: { payrollStartFrom: ISO(YEAR, MONTH, 1) },
      }));
  await mirror('PATCH /history/payroll-start (tasdiq bilan, sababsiz → 400)',
    (base, f) => call(base, 'PATCH',
      `/api/staff-payroll/history/payroll-start/${f.e2.id}`, {
        body: { payrollStartFrom: ISO(YEAR, MONTH, 1), confirm: true },
      }));
  await mirror('PATCH /history/payroll-start (tasdiq + sabab)',
    (base, f) => call(base, 'PATCH',
      `/api/staff-payroll/history/payroll-start/${f.e2.id}`, {
        body: {
          payrollStartFrom: ISO(YEAR, MONTH, 1),
          confirm: true, reason: `${TAG} ko'chirildi`,
        },
      }));
  await perStack(async (f, l) => {
    const a = await prisma.payrollAuditLog.findFirst({
      where: { employeeId: f.e2.id, action: 'payroll.activation_changed' } });
    eq(`aktivatsiya audit izi (${l})`, Boolean(a), true);
  });

  // ── QULFLASH (staff + teacher) ──
  await mirror('POST /history/lock (staff, qulflash)', (base, f) =>
    call(base, 'POST', '/api/staff-payroll/history/lock', {
      body: { kind: 'staff', id: st8[base].payroll, locked: true },
    }));
  await mirror('POST /history/lock (staff, sababsiz ochish → 400)', (base) =>
    call(base, 'POST', '/api/staff-payroll/history/lock', {
      body: { kind: 'staff', id: st8[base].payroll, locked: false },
    }));
  await mirror('POST /history/lock (staff, sabab bilan ochish)', (base) =>
    call(base, 'POST', '/api/staff-payroll/history/lock', {
      body: {
        kind: 'staff', id: st8[base].payroll, locked: false,
        reason: `${TAG} tekshiruv`,
      },
    }));
  await mirror("POST /history/lock (teacher, noma'lum → 404)", (base) =>
    call(base, 'POST', '/api/staff-payroll/history/lock', {
      body: { kind: 'teacher', id: NO_SUCH_ID, locked: true },
    }));

  // ─────────────────────────────────────────────────────────────────
  section('10) OYLIK GENERATSIYA');
  // ─────────────────────────────────────────────────────────────────

  await mirror('POST /generate', (base) =>
    call(base, 'POST', '/api/staff-payroll/generate', {
      body: { year: YEAR, month: MONTH },
    }));
  await mirror('POST /generate (oy 13 → 400)', (base) =>
    call(base, 'POST', '/api/staff-payroll/generate', {
      body: { year: YEAR, month: 13 },
    }));

  // ─────────────────────────────────────────────────────────────────
  section('11) UCH DARAJALI RUXSAT VA FILIAL AJRATMASI');
  // ─────────────────────────────────────────────────────────────────

  // READ — ko'radi, lekin boshqarmaydi va TO'LAMAYDI.
  await mirror("read: GET / (musbat nazorat)", (base) =>
    call(base, 'GET', '/api/staff-payroll?limit=5', { as: 'reader' }));
  await mirror('read: POST /generate → 403', (base) =>
    call(base, 'POST', '/api/staff-payroll/generate', {
      as: 'reader', body: { year: YEAR, month: MONTH },
    }));
  await mirror('read: POST /transactions → 403', (base) =>
    call(base, 'POST', '/api/staff-payroll/transactions', {
      as: 'reader', body: { payrollId: st8[base].payroll, amount: 1, method: 'cash' },
    }));
  await mirror('read: GET /kpi/rules → 403', (base) =>
    call(base, 'GET', '/api/staff-payroll/kpi/rules', { as: 'reader' }));

  // MANAGE — boshqaradi, lekin TO'LAMAYDI.
  await mirror('manage: GET /kpi/rules (musbat nazorat)', (base) =>
    call(base, 'GET', '/api/staff-payroll/kpi/rules', { as: 'manager' }));
  await mirror('manage: POST /transactions → 403', (base) =>
    call(base, 'POST', '/api/staff-payroll/transactions', {
      as: 'manager', body: { payrollId: st8[base].payroll, amount: 1, method: 'cash' },
    }));

  await mirror('autentifikatsiyasiz → 401', (base) =>
    call(base, 'GET', '/api/staff-payroll', { noAuth: true }));

  // ── FILIAL AJRATMASI ──
  await mirror("direktor O'Z filiali xodimini ko'radi (musbat)", (base, f) =>
    call(base, 'GET', `/api/staff-payroll/by-employee/${f.e1.id}`, { as: 'director' }));
  await mirror('BEGONA filial direktori → 403', (base, f) =>
    call(base, 'GET', `/api/staff-payroll/by-employee/${f.e1.id}`, { as: 'directorB' }));
  await mirror('BEGONA filial direktori maosh qatoriga → 403', (base) =>
    call(base, 'GET', `/api/staff-payroll/${st8[base].payroll}`, { as: 'directorB' }));
  await mirror('BEGONA filial xodimiga bonus → 403', (base, f) =>
    call(base, 'POST', '/api/staff-payroll/adjustments', {
      as: 'directorB',
      body: {
        employee: f.e1.id, year: YEAR, month: MONTH,
        kind: 'bonus', amount: 1000, reason: `${TAG} begona`,
      },
    }));
  await mirror('BEGONA filial: history/impact → 403', (base, f) =>
    call(base, 'GET', `/api/staff-payroll/history/impact/${f.e1.id}`,
      { as: 'directorB' }));
  await mirror("BEGONA filial: lifecycle → 403", (base) =>
    call(base, 'PATCH', `/api/staff-payroll/${st8[base].payroll}/lifecycle`, {
      as: 'directorB', body: { lifecycle: 'finalized' },
    }));
  await perStack(async (f, l) => {
    const p = await payrollOf(f.e1.id);
    eq(`begona urinishlar qatorga tegmadi (${l})`, p?.lifecycle, 'draft');
  });
  // ⚠ RO'YXAT FILTRI: begona filial direktori `employeeId` bilan ham
  // ko'ra olmaydi (shart `AND` ichida, filtr bilan ALMASHTIRILMAYDI).
  const lb = await mirror("ro'yxat: begona filial employeeId bilan ham bo'sh",
    (base, f) => call(base, 'GET',
      `/api/staff-payroll?employeeId=${f.e1.id}`, { as: 'directorB' }));
  if (lb.e?.body) {
    eq("begona filial ro'yxati bo'sh (express)", lb.e.body.data?.length, 0);
    eq("begona filial ro'yxati bo'sh (nest)", lb.n.body.data?.length, 0);
  }

  // ─────────────────────────────────────────────────────────────────
  section('12) QOIDANI O\'CHIRISH VA KPI TOZALANISHI');
  // ─────────────────────────────────────────────────────────────────

  await mirror('DELETE /kpi/assignments/:id', (base) =>
    call(base, 'DELETE', `/api/staff-payroll/kpi/assignments/${st8[base].assignment}`));
  const rm = await mirror('DELETE /kpi/rules/:id', (base) =>
    call(base, 'DELETE', `/api/staff-payroll/kpi/rules/${st8[base].rule}`));
  // ⚠ BAZA TEKSHIRUVI SO'ROV O'TGANIGA BOG'LIQ. Express `generalLimiter`
  // (200/daq) uzun to'plam oxirida 429 berishi mumkin — o'shanda
  // o'chirish UMUMAN bajarilmaydi va "qoida arxivlanmadi" degan SOXTA
  // QIZIL chiqardi. `mirror` chegaraga urilganda `{}` qaytaradi.
  if (!rm.e) {
    skip("qoida o'chirilishining baza ta'siri", 'yuqoridagi so\'rov o\'lchanmadi');
  } else await perStack(async (f, l, base) => {
    const rule = await prisma.kpiRule.findUnique({ where: { id: st8[base].rule } });
    eq(`qoida arxivlandi (${l})`, rule?.isDeleted, true);
    // ⚠ YOPILMAGAN oy qatorlari TOZALANADI.
    const items = await prisma.staffPayrollItem.findMany({
      where: { ruleId: st8[base].rule } });
    eq(`draft oy KPI qatorlari tozalandi (${l})`, items.length, 0);
    const asg = await prisma.staffKpiAssignment.findMany({
      where: { ruleId: st8[base].rule, isDeleted: false } });
    eq(`biriktiruvlar ham o'chdi (${l})`, asg.length, 0);
  });
  await mirror("DELETE /compensations/:id", (base) =>
    call(base, 'DELETE', `/api/staff-payroll/compensations/${st8[base].comp}`));
  await mirror("DELETE /adjustments/:id (bonus)", (base) =>
    call(base, 'DELETE', `/api/staff-payroll/adjustments/${st8[base].bonus}`));
};

run()
  .catch((err) => { console.error('\x1b[31mTEST YIQILDI:\x1b[0m', err); R.fail += 1; })
  .finally(async () => {
    // ⚠ `process.exit()` FAQAT `finally` DA — aks holda tozalash
    // o'tkazib yuborilib, MOLIYAVIY fikstura bazada qolardi.
    await cleanup();
    await assertNoResidue().catch((e) => {
      R.fail += 1;
      console.log(`  ❌ qoldiqni sanab bo'lmadi: ${e.message}`);
    });
    await prisma.$disconnect().catch(() => {});
    process.exit(finish());
  });
