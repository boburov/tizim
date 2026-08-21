/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DARS BERISH DAVRLARI (guruh yozish yo'llari) — PARITET
 *
 * Express `/api/groups/:id/teacher-periods*` + `/api/groups/teacher-handover/:teacherId`
 * (4 marshrut) ↔ NestJS.
 *
 * ── NIMA O'LCHANADI ──
 *
 * Davr yozuvi UCHTA narsani harakatga keltiradi:
 *   1. `TeacherGroupPeriod` — MANBA HAQIQAT (kim qachon dars bergan);
 *   2. `Group.teachers`     — undan HOSILA kesh (qo'riqchilar shuni o'qiydi);
 *   3. `TeacherSalary`      — davr qamragan oylar uchun maosh plani.
 * Uchalasi ham har yozuvdan keyin tekshiriladi.
 *
 * ── ISBOTLANADIGAN INVARIANTLAR ──
 *   1. Javob paritetı 4/4 marshrutda (201 / 200 / 202 / xatolar).
 *   2. TASDIQ GATE'i: `salary_terms=approval` filialda direktor 202
 *      oladi va DAVR YOZUVI YARATILMAYDI (tasdiqlanmagan stavka maosh
 *      hisobiga kirmasin). Owner esa (`approvals.decide_config`) 201.
 *   3. O'ZIGA O'ZI STAVKA TAQIQI (`assertNotSelfSalary`).
 *   4. DAVR INVARIANTLARI: kesishuv, guruh oynasi, ishga olingan sana,
 *      jadval to'qnashuvi.
 *   5. `Group.teachers` KESHI davrlardan hosil bo'ladi.
 *   6. TO'LOV QO'RIQLOVCHISI: maosh to'lovi bo'lgan davrni o'chirib
 *      bo'lmaydi.
 *   7. TOPSHIRISH: guruh o'qituvchisiz qolmasligi.
 *
 * ⚠ SANALAR ATAYLAB JORIY OY ICHIDA. `monthsSpanned()` ochiq davr uchun
 * boshlanish oyidan JORIY oygacha yuradi — uzoq o'tmishdagi sana
 * o'nlab `TeacherSalary` qatorini yaratardi.
 *
 * ISHLATISH:  npm run test:teacher-periods-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, normalize, nowStamps, mintToken,
  waitForStacks, createReporter,
} from './_harness.mjs';

const prisma = new PrismaClient();
const TAG = `TP-${Date.now().toString(36)}`;
const { R, ok, bad, skip, section, finish } = createReporter('teacher-periods');

const made = { branches: [], users: [], groups: [] };
let cleanupError = null;

const rateLimited = (r) =>
  r?.status === 429 ||
  /so'rovlar soni juda ko'p/i.test(String(r?.body?.message || ''));

/**
 * ⚠ TOZALASH TARTIBI: maosh qatorlari va tranzaksiyalar → tasdiqlar →
 * davrlar → jadval → guruh → foydalanuvchi → filial. Har biri
 * oldingisiga FK bilan bog'langan.
 */
const cleanup = async () => {
  try {
    if (made.users.length) {
      await prisma.salaryTransaction.deleteMany({
        where: { teacherId: { in: made.users } } });
      await prisma.teacherSalary.deleteMany({
        where: { teacherId: { in: made.users } } });
      await prisma.approval.deleteMany({
        where: { requestedById: { in: made.users } } });
    }
    if (made.groups.length) {
      await prisma.salaryTransaction.deleteMany({
        where: { groupId: { in: made.groups } } });
      await prisma.teacherSalary.deleteMany({
        where: { groupId: { in: made.groups } } });
      await prisma.teacherGroupPeriod.deleteMany({
        where: { groupId: { in: made.groups } } });
      await prisma.groupScheduleItem.deleteMany({
        where: { groupId: { in: made.groups } } });
      await prisma.groupMembership.deleteMany({
        where: { groupId: { in: made.groups } } });
      await prisma.group.deleteMany({ where: { id: { in: made.groups } } });
    }
    if (made.branches.length) {
      await prisma.approval.deleteMany({
        where: { branchId: { in: made.branches } } });
    }
    if (made.users.length) {
      await prisma.userBranchAssignment.deleteMany({
        where: { userId: { in: made.users } } });
      await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    }
    if (made.branches.length) {
      await prisma.branch.deleteMany({ where: { id: { in: made.branches } } });
    }
  } catch (e) {
    console.error('  ⚠ tozalash xatosi:', e.message);
    cleanupError = e.message;
  }
};

/**
 * ⚠ TOZALASH O'LCHANADI, TAXMIN QILINMAYDI.
 *
 * `cleanup()` xatoni YUTADI (aks holda u haqiqiy natijani bosib
 * ketardi). Yutilgan FK xatosi esa testni YASHIL qoldirib, bazada
 * fikstura to'plardi — bu allaqachon sodir bo'lgan. Shuning uchun
 * qoldiq OCHIQ sanaladi va topilsa test YIQILADI.
 */
const assertNoResidue = async () => {
  const left = {
    branch: await prisma.branch.count({ where: { code: { startsWith: TAG } } }),
    user: await prisma.user.count({ where: { lastName: { startsWith: TAG } } }),
    group: await prisma.group.count({ where: { name: { startsWith: TAG } } }),
  };
  const total = left.branch + left.user + left.group;
  if (total === 0 && !cleanupError) {
    console.log('  ✅ tozalash: qoldiq yo\'q');
    return;
  }
  R.fail += 1;
  console.log(
    `  ❌ TOZALASH QOLDIG'I: filial=${left.branch}, foydalanuvchi=${left.user}, ` +
    `guruh=${left.group}${cleanupError ? ` (xato: ${cleanupError})` : ''}`,
  );
};

const NO_SUCH_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
// 2026-08-03 / -10 / -17 — DUSHANBA kunlari (jadval "mon" ga qo'yiladi).
const D1 = '2026-08-03';
const D2 = '2026-08-10';
const D3 = '2026-08-17';
const GROUP_START = new Date(Date.UTC(2026, 7, 1));
const GROUP_END = new Date(Date.UTC(2026, 11, 31));
const HIRED = new Date(Date.UTC(2026, 0, 1));

const makeFixture = async (label) => {
  const mkBranch = async (n, delegation) => {
    const b = await prisma.branch.create({
      data: {
        name: `${TAG} ${label}${n}`,
        code: `${TAG}${label}${n}`,
        ...(delegation ? { delegation } : {}),
      } });
    made.branches.push(b.id);
    return b;
  };
  const branchAuto = await mkBranch('A', null);
  // ⚠ `salary_terms: approval` — tasdiq gate'ini O'LCHASH uchun. Qoida
  // kiritilmagan filialda standart rejim `auto` va direktor tasdiqsiz
  // yozardi (`DEFAULT_DELEGATION_MODE`).
  const branchAppr = await mkBranch('P', { salary_terms: { mode: 'approval' } });

  const mk = async (n, role, branch, extra = {}) => {
    const u = await prisma.user.create({
      data: {
        firstName: `${n}${label}`, lastName: `${TAG}${label}`,
        username: `${n.toLowerCase()}_${TAG.toLowerCase()}_${label.toLowerCase()}`,
        passwordHash: 'x', role, homeBranchId: branch.id, isActive: true,
        ...extra,
      } });
    made.users.push(u.id);
    return u;
  };

  const t1 = await mk('Ubir', 'teacher', branchAuto, { hiredAt: HIRED });
  const t2 = await mk('Uikki', 'teacher', branchAuto, { hiredAt: HIRED });
  const t3 = await mk('Uuch', 'teacher', branchAuto, { hiredAt: HIRED });
  // Arxivlangan o'qituvchi — topshirish nishoni sifatida rad etilishi kerak.
  const tArchived = await mk('Uarxiv', 'teacher', branchAuto,
    { hiredAt: HIRED, isActive: false });
  // Kech ishga olingan — "ishga olingan sanadan oldin" tekshiruvi uchun.
  const tLate = await mk('Ukech', 'teacher', branchAuto,
    { hiredAt: new Date(Date.UTC(2026, 7, 12)) });
  const director = await mk('Direktora', 'director', branchAuto);
  const directorP = await mk('Direktorp', 'director', branchAppr);

  /**
   * ⚠ O'ZIGA O'ZI STAVKA aktyori: foydalanuvchi ROLI `teacher`
   * (`assertTeacher` shuni talab qiladi), lekin filial birikmasida roli
   * `director` — ya'ni AMALDAGI ruxsatlari direktorniki. Faqat
   * `user.role` ni o'zgartirish yetmasdi: ruxsatlar birikmadagi roldan
   * hisoblanadi.
   */
  const tSelf = await mk('Uozim', 'teacher', branchAuto, { hiredAt: HIRED });
  await prisma.userBranchAssignment.create({
    data: { userId: tSelf.id, branchId: branchAuto.id, role: 'director' } });

  const mkGroup = async (n, branch, start, end) => {
    const g = await prisma.group.create({
      data: {
        branchId: branch.id, name: `${TAG}${label} ${n}`, isActive: true,
        startDate: GROUP_START, endDate: GROUP_END,
      } });
    made.groups.push(g.id);
    await prisma.groupScheduleItem.create({
      data: {
        groupId: g.id, day: 'mon', startTime: start, endTime: end,
        effectiveFrom: new Date(Date.UTC(2020, 0, 1)),
      } });
    return g;
  };

  const gA = await mkGroup('A', branchAuto, '09:00', '10:30');
  // ⚠ gB jadvali gA BILAN AYNAN BIR XIL — to'qnashuv tekshiruvi shuni
  // o'lchaydi.
  const gB = await mkGroup('B', branchAuto, '09:00', '10:30');
  const gC = await mkGroup('C', branchAuto, '14:00', '15:30');
  const gP = await mkGroup('P', branchAppr, '11:00', '12:30');

  return {
    branchAuto, branchAppr, t1, t2, t3, tArchived, tLate, tSelf,
    director, directorP, gA, gB, gC, gP,
  };
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mDARS BERISH DAVRLARI — PARITET\x1b[0m  (${TAG})`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

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
      directorP: mintToken(f.directorP),
      tSelf: mintToken(f.tSelf),
      t1: mintToken(f.t1),
    };
  }

  const call = (base, method, path, { body, as, noAuth, branchId } = {}) =>
    request(base, method, path, {
      token: noAuth ? undefined : as ? tok[base][as] : ownerToken,
      body,
      headers: branchId ? { 'x-branch-id': branchId } : {},
    });

  /** OYNA FIKSTURA — mos obyektlar bir xil belgiga tushadi. */
  const subs = () => {
    const E = fx[EXPRESS]; const N = fx[NEST];
    const pair = (k, m) => [[E[k].id, `<${m}>`], [N[k].id, `<${m}>`]];
    const name = (n, m) => [[`${n}E`, `<${m}>`], [`${n}N`, `<${m}>`]];
    return [
      ...pair('branchAuto', 'BRA'), ...pair('branchAppr', 'BRP'),
      ...pair('t1', 'T1'), ...pair('t2', 'T2'), ...pair('t3', 'T3'),
      ...pair('tArchived', 'TARX'), ...pair('tLate', 'TLATE'),
      ...pair('tSelf', 'TSELF'),
      ...pair('director', 'DIR'), ...pair('directorP', 'DIRP'),
      ...pair('gA', 'GA'), ...pair('gB', 'GB'),
      ...pair('gC', 'GC'), ...pair('gP', 'GP'),
      [owner.id, '<OWNER>'],
      ...name('Ubir', 'T1N'), ...name('Uikki', 'T2N'), ...name('Uuch', 'T3N'),
      ...name('Uarxiv', 'TARXN'), ...name('Ukech', 'TLATEN'),
      ...name('Uozim', 'TSELFN'),
      ...name('Direktora', 'DIRN'), ...name('Direktorp', 'DIRPN'),
      [`${TAG}E`, '<TAG>'], [`${TAG}N`, '<TAG>'],
      [`${TAG} E`, '<TAG>'], [`${TAG} N`, '<TAG>'],
      [TAG, '<TAG>'],
      nowStamps(),
      (v) => v.replace(/\b[0-9a-f]{24}\b/g, '<ID>'),
    ];
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
      bad(name, `express: ${JSON.stringify(en).slice(0, 700)}\n      ` +
                `nest   : ${JSON.stringify(nn).slice(0, 700)}`);
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

  const periodsOf = (groupId) =>
    prisma.teacherGroupPeriod.findMany({
      where: { groupId, isDeleted: false }, orderBy: { startDate: 'asc' } });

  const teachersCacheOf = async (groupId) => {
    const g = await prisma.group.findUnique({
      where: { id: groupId }, select: { teachers: { select: { id: true } } } });
    return (g?.teachers || []).map((t) => t.id).sort();
  };

  // ─────────────────────────────────────────────────────────────────
  section('1) DAVR YARATISH');
  // ─────────────────────────────────────────────────────────────────

  const c1 = await mirror('POST /:id/teacher-periods (owner)', (base, f) =>
    call(base, 'POST', `/api/groups/${f.gA.id}/teacher-periods`, {
      body: {
        teacher: f.t1.id, startDate: D1, endDate: D2,
        salaryType: 'fixed', fixedAmount: 1500000,
      },
    }));
  if (c1.e?.status === 201) {
    for (const [res, l] of [[c1.e, 'express'], [c1.n, 'nest']]) {
      eq(`xabar (${l})`, res.body.message, "Dars berish davri qo'shildi");
      eq(`javobda \`_id\` (${l})`, '_id' in (res.body.data || {}), true);
    }
    await perStack(async (f, l) => {
      const rows = await periodsOf(f.gA.id);
      eq(`davr yozildi (${l})`, rows.length, 1);
      eq(`stavka turi (${l})`, rows[0]?.salaryType, 'fixed');
      eq(`stavka summasi (${l})`, Number(rows[0]?.fixedAmount), 1500000);
      // "percent" bo'lmagani uchun `percentRate` NOLLANADI.
      eq(`percentRate nol (${l})`, Number(rows[0]?.percentRate), 0);
      eq(`yaratuvchi (${l})`, String(rows[0]?.createdById), owner.id);
      // ⚠ MAOSH PLANI: davr qamragan oy uchun qator paydo bo'ladi.
      const sal = await prisma.teacherSalary.findFirst({
        where: { teacherId: f.t1.id, groupId: f.gA.id, year: 2026, month: 8 } });
      eq(`maosh plani yaratildi (${l})`, Boolean(sal), true);
      // ⚠ Davr YOPIQ va bugundan oldin tugagan → kesh BO'SH.
      eq(`yopiq davr keshga tushmadi (${l})`,
        (await teachersCacheOf(f.gA.id)).length, 0);
    });
  }

  // OCHIQ davr — kesh to'ladi.
  const c2 = await mirror('POST /:id/teacher-periods (ochiq davr)', (base, f) =>
    call(base, 'POST', `/api/groups/${f.gC.id}/teacher-periods`, {
      body: { teacher: f.t1.id, startDate: D1, salaryType: 'percent', percentRate: 40 },
    }));
  if (c2.e?.status === 201) {
    await perStack(async (f, l) => {
      eq(`ochiq davr keshga tushdi (${l})`,
        (await teachersCacheOf(f.gC.id)).join(','), f.t1.id);
      const rows = await periodsOf(f.gC.id);
      // "percent" da `fixedAmount` NOLLANADI.
      eq(`fixedAmount nol (${l})`, Number(rows[0]?.fixedAmount), 0);
      eq(`percentRate saqlandi (${l})`, Number(rows[0]?.percentRate), 40);
    });
  }

  // ── INVARIANTLAR ──
  await mirror('kesishuvchi davr → 400', (base, f) =>
    call(base, 'POST', `/api/groups/${f.gA.id}/teacher-periods`, {
      body: { teacher: f.t1.id, startDate: D1, endDate: D3 },
    }));
  await mirror('guruh boshlanishidan oldin → 400', (base, f) =>
    call(base, 'POST', `/api/groups/${f.gA.id}/teacher-periods`, {
      body: { teacher: f.t2.id, startDate: '2026-07-06', endDate: '2026-07-13' },
    }));
  await mirror('guruh tugashidan keyin → 400', (base, f) =>
    call(base, 'POST', `/api/groups/${f.gA.id}/teacher-periods`, {
      body: { teacher: f.t2.id, startDate: '2027-01-04' },
    }));
  await mirror("ishga olingan sanadan oldin → 400", (base, f) =>
    call(base, 'POST', `/api/groups/${f.gA.id}/teacher-periods`, {
      body: { teacher: f.tLate.id, startDate: D1, endDate: D2 },
    }));
  // ⚠ gB jadvali gA bilan bir xil, t1 esa gC'da OCHIQ davrga ega —
  // lekin gC vaqti boshqa. To'qnashuvni o'lchash uchun t1 ga gB da
  // OCHIQ davr beramiz: u gC bilan emas, gA bilan to'qnashmaydi
  // (gA davri yopiq). Shuning uchun avval gB ga ochiq davr, keyin
  // yana bir guruhga o'sha vaqtda urinib ko'ramiz.
  await mirror('POST gB (ochiq, 09:00 slot)', (base, f) =>
    call(base, 'POST', `/api/groups/${f.gB.id}/teacher-periods`, {
      body: { teacher: f.t2.id, startDate: D1 },
    }));
  await mirror('jadval to\'qnashuvi (bir vaqtda ikki guruh) → 400', (base, f) =>
    call(base, 'POST', `/api/groups/${f.gA.id}/teacher-periods`, {
      body: { teacher: f.t2.id, startDate: D3 },
    }));
  await mirror("noma'lum o'qituvchi → 400", (base, f) =>
    call(base, 'POST', `/api/groups/${f.gA.id}/teacher-periods`, {
      body: { teacher: NO_SUCH_ID, startDate: D1 },
    }));
  await mirror("noma'lum guruh → 404", (base, f) =>
    call(base, 'POST', `/api/groups/${NO_SUCH_ID}/teacher-periods`, {
      body: { teacher: f.t1.id, startDate: D1 },
    }));
  await mirror("sana formati xato → 400", (base, f) =>
    call(base, 'POST', `/api/groups/${f.gA.id}/teacher-periods`, {
      body: { teacher: f.t1.id, startDate: '03.08.2026' },
    }));
  await mirror("foiz 100 dan katta → 400", (base, f) =>
    call(base, 'POST', `/api/groups/${f.gA.id}/teacher-periods`, {
      body: { teacher: f.t3.id, startDate: D3, salaryType: 'percent', percentRate: 150 },
    }));

  // ── RBAC ──
  await mirror("o'qituvchi davr qo'sha olmaydi → 403", (base, f) =>
    call(base, 'POST', `/api/groups/${f.gA.id}/teacher-periods`, {
      as: 't1', body: { teacher: f.t3.id, startDate: D3 },
    }));
  await mirror('autentifikatsiyasiz → 401', (base, f) =>
    call(base, 'POST', `/api/groups/${f.gA.id}/teacher-periods`, {
      noAuth: true, body: { teacher: f.t3.id, startDate: D3 },
    }));

  // ─────────────────────────────────────────────────────────────────
  section("2) O'ZIGA O'ZI STAVKA TAQIQI");
  // ─────────────────────────────────────────────────────────────────

  // ⚠ MUSBAT NAZORAT AVVAL: shu aktyor BOSHQA o'qituvchiga stavka
  // qo'ya oladimi? Yo'q bo'lsa keyingi 403 "ruxsat yo'q" dan kelgan
  // bo'lardi va taqiq umuman o'lchanmasdi.
  const selfOk = await mirror(
    "musbat nazorat: shu aktyor BOSHQAGA stavka qo'ya oladi",
    (base, f) => call(base, 'POST', `/api/groups/${f.gC.id}/teacher-periods`, {
      as: 'tSelf', branchId: f.branchAuto.id,
      body: { teacher: f.t3.id, startDate: D3, salaryType: 'fixed', fixedAmount: 100000 },
    }));
  eq('musbat nazorat 201 (express)', selfOk.e?.status, 201);
  eq('musbat nazorat 201 (nest)', selfOk.n?.status, 201);

  const selfBad = await mirror("O'ZIGA stavka → 403", (base, f) =>
    call(base, 'POST', `/api/groups/${f.gB.id}/teacher-periods`, {
      as: 'tSelf', branchId: f.branchAuto.id,
      body: { teacher: f.tSelf.id, startDate: D3, salaryType: 'fixed', fixedAmount: 9000000 },
    }));
  eq("o'ziga stavka rad etildi (express)", selfBad.e?.status, 403);
  eq("o'ziga stavka rad etildi (nest)", selfBad.n?.status, 403);
  await perStack(async (f, l) => {
    const rows = await prisma.teacherGroupPeriod.findMany({
      where: { teacherId: f.tSelf.id, isDeleted: false } });
    eq(`o'ziga davr YOZILMADI (${l})`, rows.length, 0);
  });

  // ─────────────────────────────────────────────────────────────────
  section('3) TASDIQ GATE (salary_terms = approval)');
  // ─────────────────────────────────────────────────────────────────

  const appr = await mirror('direktor → 202 (tasdiqqa yuborildi)', (base, f) =>
    call(base, 'POST', `/api/groups/${f.gP.id}/teacher-periods`, {
      as: 'directorP', branchId: f.branchAppr.id,
      body: {
        teacher: f.t2.id, startDate: D1,
        salaryType: 'fixed', fixedAmount: 2000000,
        requestNote: `${TAG} iltimos tasdiqlang`,
      },
    }));
  if (appr.e) {
    eq('tasdiq kodi 202 (express)', appr.e.status, 202);
    eq('tasdiq kodi 202 (nest)', appr.n.status, 202);
    await perStack(async (f, l) => {
      // ⚠ ENG MUHIM: DAVR YOZUVI YARATILMAGAN.
      eq(`tasdiqsiz davr YOZILMADI (${l})`, (await periodsOf(f.gP.id)).length, 0);
      const a = await prisma.approval.findFirst({
        where: { branchId: f.branchAppr.id, kind: 'salary_terms' } });
      eq(`tasdiq so'rovi yaratildi (${l})`, Boolean(a), true);
      eq(`so'rov holati (${l})`, a?.status, 'pending');
      eq(`so'rovchi (${l})`, String(a?.requestedById), f.directorP.id);
      eq(`izoh saqlandi (${l})`, a?.requestNote, `${TAG} iltimos tasdiqlang`);
      // Subyekt kaliti — bitta o'qituvchi+guruh uchun bitta ochiq so'rov.
      eq(`subyekt kaliti (${l})`,
        a?.subjectKey, `salary_terms:${f.gP.id}:${f.t2.id}`);
    });
  }

  // ⚠ OWNER'da `approvals.decide_config` BOR — u matritsadan TASHQARIDA
  // va darhol 201 oladi (Express'da ham).
  const apprOwner = await mirror('owner → 201 (gate chetlab o\'tiladi)', (base, f) =>
    call(base, 'POST', `/api/groups/${f.gP.id}/teacher-periods`, {
      branchId: f.branchAppr.id,
      body: { teacher: f.t3.id, startDate: D1, salaryType: 'fixed', fixedAmount: 500000 },
    }));
  eq('owner 201 (express)', apprOwner.e?.status, 201);
  eq('owner 201 (nest)', apprOwner.n?.status, 201);

  // ─────────────────────────────────────────────────────────────────
  section('4) DAVRNI TAHRIRLASH');
  // ─────────────────────────────────────────────────────────────────

  const periodIdOf = async (base, groupId, teacherId) => {
    const r = await prisma.teacherGroupPeriod.findFirst({
      where: { groupId, teacherId, isDeleted: false }, select: { id: true } });
    return r?.id;
  };
  const pA = {
    [EXPRESS]: await periodIdOf(EXPRESS, fx[EXPRESS].gA.id, fx[EXPRESS].t1.id),
    [NEST]: await periodIdOf(NEST, fx[NEST].gA.id, fx[NEST].t1.id),
  };

  await mirror('PATCH (sanani surish)', (base, f) =>
    call(base, 'PATCH', `/api/groups/${f.gA.id}/teacher-periods/${pA[base]}`, {
      body: { endDate: D3 },
    }));
  await perStack(async (f, l, base) => {
    const row = await prisma.teacherGroupPeriod.findUnique({ where: { id: pA[base] } });
    eq(`tugash sanasi yangilandi (${l})`,
      row?.endDate?.toISOString().slice(0, 10), D3);
    eq(`yangilovchi (${l})`, String(row?.updatedById), owner.id);
  });

  await mirror('PATCH (stavkani o\'zgartirish)', (base, f) =>
    call(base, 'PATCH', `/api/groups/${f.gA.id}/teacher-periods/${pA[base]}`, {
      body: { salaryType: 'percent', percentRate: 55 },
    }));
  await perStack(async (f, l, base) => {
    const row = await prisma.teacherGroupPeriod.findUnique({ where: { id: pA[base] } });
    eq(`stavka turi almashdi (${l})`, row?.salaryType, 'percent');
    eq(`eski summa nollandi (${l})`, Number(row?.fixedAmount), 0);
  });

  await mirror("PATCH (noma'lum davr → 404)", (base, f) =>
    call(base, 'PATCH', `/api/groups/${f.gA.id}/teacher-periods/${NO_SUCH_ID}`, {
      body: { endDate: D3 },
    }));
  await mirror('PATCH (guruh oynasidan chiqadi → 400)', (base, f) =>
    call(base, 'PATCH', `/api/groups/${f.gA.id}/teacher-periods/${pA[base]}`, {
      body: { startDate: '2026-07-06' },
    }));
  await mirror("PATCH (o'quvchi emas, o'zi → 403)", (base, f) =>
    call(base, 'PATCH', `/api/groups/${f.gA.id}/teacher-periods/${pA[base]}`, {
      as: 'tSelf', branchId: f.branchAuto.id,
      body: { salaryType: 'fixed', fixedAmount: 1 },
    }));
  await mirror("PATCH (o'qituvchi → 403)", (base, f) =>
    call(base, 'PATCH', `/api/groups/${f.gA.id}/teacher-periods/${pA[base]}`, {
      as: 't1', body: { endDate: D3 },
    }));

  // ─────────────────────────────────────────────────────────────────
  section("5) O'CHIRISH VA TO'LOV QO'RIQLOVCHISI");
  // ─────────────────────────────────────────────────────────────────

  // ⚠ To'lov qatorini FIKSTURA sifatida yozamiz — bu yagona yo'l:
  // qo'riqlovchi aynan mavjud maosh to'loviga qaraydi.
  await perStack(async (f, l) => {
    // ⚠ `SalaryTransaction.salaryId` MAJBURIY — davr yaratilganda
    // paydo bo'lgan MAOSH PLANIGA ulanadi. Uni topolmasak fikstura
    // yozilmasdi va qo'riqlovchi umuman o'lchanmasdi.
    const sal = await prisma.teacherSalary.findFirst({
      where: { teacherId: f.t1.id, groupId: f.gA.id, year: 2026, month: 8 },
      select: { id: true },
    });
    eq(`maosh plani topildi (${l})`, Boolean(sal), true);
    if (!sal) return;
    await prisma.salaryTransaction.create({
      data: {
        salaryId: sal.id,
        teacherId: f.t1.id, groupId: f.gA.id, branchId: f.branchAuto.id,
        year: 2026, month: 8, amount: 100000, method: 'cash',
        paidAt: new Date(), createdById: owner.id,
      },
    });
  });
  await mirror("to'lovi bor davrni o'chirib bo'lmaydi → 400", (base, f) =>
    call(base, 'DELETE', `/api/groups/${f.gA.id}/teacher-periods/${pA[base]}`));
  await perStack(async (f, l, base) => {
    const row = await prisma.teacherGroupPeriod.findUnique({ where: { id: pA[base] } });
    eq(`davr o'chirilmadi (${l})`, row?.isDeleted, false);
  });
  await perStack(async (f) => {
    await prisma.salaryTransaction.deleteMany({
      where: { teacherId: f.t1.id, groupId: f.gA.id } });
  });

  await mirror("DELETE (to'lov olib tashlangach)", (base, f) =>
    call(base, 'DELETE', `/api/groups/${f.gA.id}/teacher-periods/${pA[base]}`));
  await perStack(async (f, l, base) => {
    const row = await prisma.teacherGroupPeriod.findUnique({ where: { id: pA[base] } });
    eq(`davr arxivlandi (${l})`, row?.isDeleted, true);
    eq(`keshda qolmadi (${l})`,
      (await teachersCacheOf(f.gA.id)).includes(f.t1.id), false);
  });
  await mirror('DELETE (ikkinchi marta → 404)', (base, f) =>
    call(base, 'DELETE', `/api/groups/${f.gA.id}/teacher-periods/${pA[base]}`));
  await mirror("DELETE (o'qituvchi → 403)", (base, f) =>
    call(base, 'DELETE', `/api/groups/${f.gC.id}/teacher-periods/${NO_SUCH_ID}`, {
      as: 't1' }));

  // ─────────────────────────────────────────────────────────────────
  section('6) OMMAVIY TOPSHIRISH');
  // ─────────────────────────────────────────────────────────────────

  await mirror("topshirish: o'ziga → 400", (base, f) =>
    call(base, 'POST', `/api/groups/teacher-handover/${f.t1.id}`, {
      body: {
        handoverDate: D3,
        assignments: [{ toTeacher: f.t1.id, groups: [f.gC.id] }],
      },
    }));
  await mirror("topshirish: begona guruh → 400", (base, f) =>
    call(base, 'POST', `/api/groups/teacher-handover/${f.t1.id}`, {
      body: {
        handoverDate: D3,
        assignments: [{ toTeacher: f.t2.id, groups: [f.gB.id] }],
      },
    }));
  await mirror('topshirish: arxivlangan qabul qiluvchi → 400', (base, f) =>
    call(base, 'POST', `/api/groups/teacher-handover/${f.t1.id}`, {
      body: {
        handoverDate: D3,
        assignments: [{ toTeacher: f.tArchived.id, groups: [f.gC.id] }],
      },
    }));
  await mirror("topshirish: guruh o'qituvchisiz qolmaydi → 400", (base, f) =>
    call(base, 'POST', `/api/groups/teacher-handover/${f.t2.id}`, {
      body: {
        handoverDate: D3,
        assignments: [{ toTeacher: f.t3.id, groups: [] }],
      },
    }));

  const ho = await mirror('topshirish: muvaffaqiyatli', (base, f) =>
    call(base, 'POST', `/api/groups/teacher-handover/${f.t1.id}`, {
      body: {
        handoverDate: D3,
        assignments: [{ toTeacher: f.t2.id, groups: [f.gC.id] }],
      },
    }));
  if (ho.e?.status === 200) {
    for (const [res, l] of [[ho.e, 'express'], [ho.n, 'nest']]) {
      eq(`yopilgan davr soni (${l})`, res.body.data?.closed, 1);
      eq(`ochilgan davr soni (${l})`, res.body.data?.opened, 1);
      eq(`xabar (${l})`, res.body.message, '1 ta guruh topshirildi');
    }
    await perStack(async (f, l) => {
      const rows = await periodsOf(f.gC.id);
      const old = rows.find((r) => r.teacherId === f.t1.id);
      const fresh = rows.find((r) => r.teacherId === f.t2.id);
      eq(`eski davr yopildi (${l})`,
        old?.endDate?.toISOString().slice(0, 10), D3);
      eq(`yangi davr ochildi (${l})`,
        fresh?.startDate?.toISOString().slice(0, 10), D3);
      eq(`yangi davr OCHIQ (${l})`, fresh?.endDate, null);
      // ⚠ STAVKA MEROS QILINADI: yangi o'qituvchi O'Z shartnomasi
      // bo'yicha oladi — davrga summa YOZILMAYDI.
      eq(`yangi davrda stavka yo'q (${l})`, fresh?.salaryType, null);
      // Kesh yangi o'qituvchiga o'tdi (bugun D3 dan keyin).
      const cache = await teachersCacheOf(f.gC.id);
      eq(`kesh yangi o'qituvchida (${l})`, cache.includes(f.t2.id), true);
      eq(`kesh eskisida emas (${l})`, cache.includes(f.t1.id), false);
    });
  }

  await mirror("topshirish: endi topshiradigan narsa yo'q → 400", (base, f) =>
    call(base, 'POST', `/api/groups/teacher-handover/${f.t1.id}`, {
      body: {
        handoverDate: D3,
        assignments: [{ toTeacher: f.t2.id, groups: [f.gC.id] }],
      },
    }));
  await mirror("topshirish: taqsimotsiz → 400 (validator)", (base, f) =>
    call(base, 'POST', `/api/groups/teacher-handover/${f.t2.id}`, {
      body: { handoverDate: D3, assignments: [] },
    }));
  await mirror("topshirish: o'qituvchi → 403", (base, f) =>
    call(base, 'POST', `/api/groups/teacher-handover/${f.t2.id}`, {
      as: 't1',
      body: { handoverDate: D3, assignments: [{ toTeacher: f.t3.id, groups: [f.gC.id] }] },
    }));
};

run()
  .catch((err) => { console.error('\x1b[31mTEST YIQILDI:\x1b[0m', err); R.fail += 1; })
  .finally(async () => {
    // ⚠ `process.exit()` FAQAT `finally` DA — aks holda tozalash
    // o'tkazib yuborilib, fikstura bazada qolardi.
    await cleanup();
    await assertNoResidue().catch((e) => {
      R.fail += 1;
      console.log(`  ❌ qoldiqni sanab bo'lmadi: ${e.message}`);
    });
    await prisma.$disconnect().catch(() => {});
    process.exit(finish());
  });
