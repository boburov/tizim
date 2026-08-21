/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BAHOLAR VA REYTING — PARITET
 *
 * Express `/api/grades` (8 marshrut) ↔ NestJS.
 *
 * ── NIMA O'LCHANADI ──
 *
 * Javob (status + tana) YETARLI EMAS. Baho yozuvi `history` audit
 * massivini o'stiradi, `recordedById` ni to'ldiradi va qisman unique
 * indeks ostida yangilanadi — shuning uchun har bir yozuvdan keyin
 * BAZA HOLATI ham tekshiriladi.
 *
 * ── ISBOTLANADIGAN INVARIANTLAR ──
 *   1. Javob paritetı (status, tana, xabar) 8/8 marshrutda.
 *   2. `history` AUDIT: qiymat o'zgarsa yozuv qo'shiladi, o'zgarmasa
 *      QO'SHILMAYDI (`from`/`to` aniq).
 *   3. SESSIYA (`slot`): ko'p darsli kunda ikkita ALOHIDA baho qatori.
 *   4. A-1 CROSS-GROUP DISCLOSURE: o'qituvchi o'quvchining BOSHQA
 *      guruhdagi bahosini KO'RMAYDI (`scopeGroupIds`).
 *   5. FILIAL AJRATMASI: direktor faqat O'Z filiali reytingini ko'radi.
 *   6. GURUH AJRATMASI: begona guruhga 403 (musbat nazorat bilan).
 *   7. RBAC: `rating.manage` bo'lgan direktor ham sozlamani
 *      O'ZGARTIRA OLMAYDI (`requireRole(OWNER)`).
 *   8. Validatsiya paritetı + noto'g'ri so'rovdan keyin BAZA TOZA.
 *
 * ⚠ `rating_settings` — GLOBAL YAGONA QATOR (ishlab chiqarish
 * ma'lumoti). Test uni o'zgartiradi, lekin BOSHIDA SURATGA OLADI va
 * oxirida AYNAN tiklaydi.
 *
 * ISHLATISH:  npm run test:grades-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, normalize, nowStamps, mintToken,
  waitForStacks, createReporter,
} from './_harness.mjs';

const prisma = new PrismaClient();
const TAG = `GR-${Date.now().toString(36)}`;
const { R, ok, bad, skip, section, finish } = createReporter('grades');

const made = { branches: [], users: [], groups: [] };
let settingsSnapshot = null;

const rateLimited = (r) =>
  r?.status === 429 ||
  /so'rovlar soni juda ko'p/i.test(String(r?.body?.message || ''));

/**
 * ⚠ TOZALASH TARTIBI MUHIM: `Grade` guruh va o'quvchiga FK bilan
 * bog'langan. Avval bahoolar, keyin a'zoliklar/jadval, keyin guruh,
 * eng oxirida foydalanuvchi va filial.
 */
const cleanup = async () => {
  try {
    if (made.groups.length) {
      await prisma.grade.deleteMany({ where: { groupId: { in: made.groups } } });
      await prisma.attendance.deleteMany({ where: { groupId: { in: made.groups } } });
      await prisma.groupMembership.deleteMany({
        where: { groupId: { in: made.groups } } });
      await prisma.groupScheduleItem.deleteMany({
        where: { groupId: { in: made.groups } } });
      await prisma.teacherGroupPeriod.deleteMany({
        where: { groupId: { in: made.groups } } });
      await prisma.group.deleteMany({ where: { id: { in: made.groups } } });
    }
    if (made.users.length) {
      await prisma.grade.deleteMany({ where: { studentId: { in: made.users } } });
      await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    }
    if (made.branches.length) {
      await prisma.branch.deleteMany({ where: { id: { in: made.branches } } });
    }
    // ⚠ GLOBAL SOZLAMA TIKLANADI — test ishlab chiqarish qiymatini
    // o'zgartirgan holda qolmasin.
    if (settingsSnapshot) {
      await prisma.ratingSettings.update({
        where: { id: 'default' },
        data: {
          gradeWeight: settingsSnapshot.gradeWeight,
          attendanceWeight: settingsSnapshot.attendanceWeight,
        },
      });
    }
  } catch (e) {
    console.error('  ⚠ tozalash xatosi:', e.message);
  }
};

/**
 * Sinov sanasi — O'TMISHDA va DUSHANBA.
 * Jadval "mon" ga qo'yiladi; "dars kuni emas" mantig'i seshanbada
 * o'lchanadi.
 */
const MONDAY = '2025-03-03';
const TUESDAY = '2025-03-04';
const JOINED = new Date(Date.UTC(2024, 0, 1));
const EFFECTIVE = new Date(Date.UTC(2020, 0, 1));
const NO_SUCH_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

const makeFixture = async (label) => {
  const mkBranch = async (n) => {
    const b = await prisma.branch.create({
      data: { name: `${TAG} ${label}${n}`, code: `${TAG}${label}${n}` } });
    made.branches.push(b.id);
    return b;
  };
  const branchA = await mkBranch('A');
  const branchB = await mkBranch('B');

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

  const teacher1 = await mk('UstozBir', 'teacher', branchA);
  const teacher2 = await mk('UstozIkki', 'teacher', branchA);
  const director = await mk('Direktor', 'director', branchA);
  const reception = await mk('Qabul', 'reception', branchA);
  const s1 = await mk('Talabbir', 'student', branchA);
  const s2 = await mk('Talabikki', 'student', branchA);
  const s3 = await mk('Talabuch', 'student', branchA);
  const s4 = await mk('Talabtort', 'student', branchB);

  const mkGroup = async (n, branch, slots, teacher) => {
    const g = await prisma.group.create({
      data: { branchId: branch.id, name: `${TAG}${label} ${n}`, isActive: true } });
    made.groups.push(g.id);
    for (const [start, end] of slots) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.groupScheduleItem.create({
        data: {
          groupId: g.id, day: 'mon', startTime: start, endTime: end,
          effectiveFrom: EFFECTIVE,
        } });
    }
    // ⚠ `Group.teachers` (ko'p-ko'pga) — QO'RIQCHILAR AYNAN SHUNI
    // o'qiydi, `TeacherGroupPeriod` ni EMAS. Faqat davrni yaratish
    // o'qituvchini O'Z guruhiga ham begona qilib qo'yardi.
    await prisma.group.update({
      where: { id: g.id }, data: { teachers: { connect: { id: teacher.id } } } });
    return g;
  };

  const groupA = await mkGroup('A', branchA, [['09:00', '10:30']], teacher1);
  const groupA2 = await mkGroup('A2', branchA, [['11:00', '12:30']], teacher2);
  const multi = await mkGroup(
    'M', branchA, [['09:00', '10:30'], ['14:00', '15:30']], teacher1);
  const groupB = await mkGroup('B', branchB, [['09:00', '10:30']], teacher1);

  const join = async (group, student) => {
    await prisma.groupMembership.create({
      data: { groupId: group.id, studentId: student.id, joinedAt: JOINED } });
  };
  await join(groupA, s1); await join(groupA, s2); await join(groupA, s3);
  await join(groupA2, s1);
  await join(multi, s1);
  await join(groupB, s4);

  return {
    branchA, branchB, teacher1, teacher2, director, reception,
    s1, s2, s3, s4, groupA, groupA2, multi, groupB,
  };
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mBAHOLAR VA REYTING — PARITET\x1b[0m  (${TAG})`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

  settingsSnapshot = await prisma.ratingSettings.upsert({
    where: { id: 'default' }, create: { id: 'default' }, update: {} });

  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false }, select: { id: true, role: true } });
  if (!owner) throw new Error('owner topilmadi');
  const ownerToken = mintToken(owner);

  const fx = { [EXPRESS]: await makeFixture('E'), [NEST]: await makeFixture('N') };
  const tok = {};
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    tok[base] = {
      teacher1: mintToken(f.teacher1),
      teacher2: mintToken(f.teacher2),
      director: mintToken(f.director),
      reception: mintToken(f.reception),
      s1: mintToken(f.s1),
      s2: mintToken(f.s2),
    };
  }

  const call = (base, method, path, { body, as, noAuth } = {}) =>
    request(base, method, path, {
      token: noAuth ? undefined : as ? tok[base][as] : ownerToken,
      body,
    });

  /**
   * ⚠ IKKALA FIKSTURA HAM NORMALLASHTIRILADI. Reyting va baho
   * javoblarida faqat o'z fiksturamiz ko'rinadi, lekin `<ID>`
   * umumiy qoidasi begona ID'ni ham yutib yuborardi — shuning uchun
   * BIZNI QIZIQTIRGAN har bir ID ALOHIDA belgi oladi. Noto'g'ri
   * o'quvchiga yozilgan baho shu sabab ko'rinadi.
   */
  /**
   * ── OYNA FIKSTURA ──
   *
   * Har stek O'Z fiksturasiga so'rov yuboradi, shuning uchun mos
   * obyektlar BIR XIL belgiga tushadi (`<S1>`, `<GA>`, ...) — aks
   * holda ikkita to'g'ri javob shunchaki har xil ID tufayli farq
   * qilib ko'rinardi.
   *
   * ⚠ SHU SABAB "begona fikstura oqib chiqdi" holatini `deepEqual`
   * TUTA OLMAYDI (u ham bir xil belgiga tushardi). O'sha holat
   * ALOHIDA o'lchanadi: reyting bo'limida `ids.has(otherF.s1.id)`
   * va har bo'limdagi bevosita BAZA tekshiruvlari bilan.
   */
  const subs = () => {
    const E = fx[EXPRESS]; const N = fx[NEST];
    const pair = (k, m) => [[E[k].id, `<${m}>`], [N[k].id, `<${m}>`]];
    const name = (n, m) => [[`${n}E`, `<${m}>`], [`${n}N`, `<${m}>`]];
    return [
      ...pair('branchA', 'BRA'), ...pair('branchB', 'BRB'),
      ...pair('teacher1', 'T1'), ...pair('teacher2', 'T2'),
      ...pair('director', 'DIR'), ...pair('reception', 'REC'),
      ...pair('s1', 'S1'), ...pair('s2', 'S2'),
      ...pair('s3', 'S3'), ...pair('s4', 'S4'),
      ...pair('groupA', 'GA'), ...pair('groupA2', 'GA2'),
      ...pair('multi', 'GM'), ...pair('groupB', 'GB'),
      [owner.id, '<OWNER>'],
      ...name('Talabbir', 'S1N'), ...name('Talabikki', 'S2N'),
      ...name('Talabuch', 'S3N'), ...name('Talabtort', 'S4N'),
      ...name('UstozBir', 'T1N'), ...name('UstozIkki', 'T2N'),
      ...name('Direktor', 'DIRN'), ...name('Qabul', 'RECN'),
      [`${TAG.toLowerCase()}_e`, '<tag>'], [`${TAG.toLowerCase()}_n`, '<tag>'],
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
      skip(name, "429 — Express tezlik chegarasi (200/daq)"); return {};
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

  /** Har ikki fikstura uchun bir xil DB tekshiruvi. */
  const perStack = async (fn) => {
    for (const [base, tagl] of [[EXPRESS, 'express'], [NEST, 'nest']]) {
      // eslint-disable-next-line no-await-in-loop
      await fn(fx[base], tagl);
    }
  };

  const gradeRow = (f, group, student, slot = '') =>
    prisma.grade.findFirst({
      where: {
        groupId: group.id, studentId: student.id, dateKey: MONDAY, slot,
        isDeleted: false,
      },
    });

  // ─────────────────────────────────────────────────────────────────
  section("1) GURUH + SANA RO'YXATI");
  // ─────────────────────────────────────────────────────────────────

  const l0 = await mirror(`GET /groups/:id?date=${MONDAY}`, (base, f) =>
    call(base, 'GET', `/api/grades/groups/${f.groupA.id}?date=${MONDAY}`));
  if (l0.e?.body?.data) {
    for (const [base, res] of [[EXPRESS, l0.e], [NEST, l0.n]]) {
      const label = base === EXPRESS ? 'express' : 'nest';
      const d = res.body.data;
      // MUSBAT NAZORAT: uchala o'quvchi ham ro'yxatda — aks holda
      // keyingi "baho yozildi" tekshiruvlari hech narsa o'lchamasdi.
      eq(`ro'yxatda 3 o'quvchi (${label})`, d.rows?.length, 3);
      eq(`dars kuni (${label})`, d.isClassDay, true);
      eq(`bitta sessiya (${label})`, d.sessions?.length, 1);
      eq(`yagona sessiyada slot="" (${label})`, d.slot, '');
      eq(`baho hali yo'q (${label})`, d.rows?.every((r) => r.grade === null), true);
      eq(`o'quvchida \`_id\` bor (${label})`,
        '_id' in (d.rows?.[0]?.student || {}), true);
    }
  }

  const tue = await mirror(`GET /groups/:id?date=${TUESDAY} (dars kuni emas)`,
    (base, f) => call(base, 'GET', `/api/grades/groups/${f.groupA.id}?date=${TUESDAY}`));
  if (tue.e?.body?.data) {
    eq('seshanba: isClassDay=false (express)', tue.e.body.data.isClassDay, false);
    eq('seshanba: sessiya yo\'q (express)', tue.e.body.data.sessions?.length, 0);
    eq('seshanba: isClassDay=false (nest)', tue.n.body.data.isClassDay, false);
    eq('seshanba: sessiya yo\'q (nest)', tue.n.body.data.sessions?.length, 0);
  }

  await mirror('GET /groups/:id (sanasiz → 400)', (base, f) =>
    call(base, 'GET', `/api/grades/groups/${f.groupA.id}`));
  await mirror('GET /groups/:id?date=xato (400)', (base, f) =>
    call(base, 'GET', `/api/grades/groups/${f.groupA.id}?date=03-2025`));
  await mirror('GET /groups/<yo\'q>?date (404)', (base) =>
    call(base, 'GET', `/api/grades/groups/${NO_SUCH_ID}?date=${MONDAY}`));

  // ── GURUH AJRATMASI ──
  await mirror("o'qituvchi O'Z guruhini ko'radi (musbat nazorat)", (base, f) =>
    call(base, 'GET', `/api/grades/groups/${f.groupA.id}?date=${MONDAY}`,
      { as: 'teacher1' }));
  await mirror("begona guruh o'qituvchisiga → 403", (base, f) =>
    call(base, 'GET', `/api/grades/groups/${f.groupA.id}?date=${MONDAY}`,
      { as: 'teacher2' }));
  await mirror("o'quvchiga guruh ro'yxati → 403", (base, f) =>
    call(base, 'GET', `/api/grades/groups/${f.groupA.id}?date=${MONDAY}`,
      { as: 's1' }));
  await mirror('ruxsatsiz xodim (qabul) → 403', (base, f) =>
    call(base, 'GET', `/api/grades/groups/${f.groupA.id}?date=${MONDAY}`,
      { as: 'reception' }));
  await mirror('autentifikatsiyasiz → 401', (base, f) =>
    call(base, 'GET', `/api/grades/groups/${f.groupA.id}?date=${MONDAY}`,
      { noAuth: true }));

  // ── FILIAL AJRATMASI ──
  await mirror("direktor O'Z filiali guruhini ko'radi (musbat)", (base, f) =>
    call(base, 'GET', `/api/grades/groups/${f.groupA.id}?date=${MONDAY}`,
      { as: 'director' }));
  await mirror('direktor BEGONA filial guruhiga → 403', (base, f) =>
    call(base, 'GET', `/api/grades/groups/${f.groupB.id}?date=${MONDAY}`,
      { as: 'director' }));

  // ─────────────────────────────────────────────────────────────────
  section('2) BALLARNI SAQLASH');
  // ─────────────────────────────────────────────────────────────────

  const b1 = await mirror("POST /groups/:id/bulk (o'qituvchi)", (base, f) =>
    call(base, 'POST', `/api/grades/groups/${f.groupA.id}/bulk`, {
      as: 'teacher1',
      body: {
        date: MONDAY,
        items: [
          { studentId: f.s1.id, value: 5, comment: `${TAG} alo` },
          { studentId: f.s2.id, value: 4 },
          { studentId: f.s3.id, value: 3 },
        ],
      },
    }));
  if (b1.e?.status === 201) {
    eq('count=3 (express)', b1.e.body.data?.count, 3);
    eq('slot="" (express)', b1.e.body.data?.slot, '');
    eq('xabar (express)', b1.e.body.message, 'Baholar saqlandi');
    eq('count=3 (nest)', b1.n.body.data?.count, 3);
    eq('slot="" (nest)', b1.n.body.data?.slot, '');
    eq('xabar (nest)', b1.n.body.message, 'Baholar saqlandi');
  }

  await perStack(async (f, l) => {
    const g1 = await gradeRow(f, f.groupA, f.s1);
    eq(`baho yozildi (${l})`, g1?.value, 5);
    eq(`izoh saqlandi (${l})`, g1?.comment, `${TAG} alo`);
    eq(`recordedById = o'qituvchi (${l})`, String(g1?.recordedById), f.teacher1.id);
    eq(`source="teacher" (${l})`, g1?.source, 'teacher');
    eq(`dateKey (${l})`, g1?.dateKey, MONDAY);
    // AUDIT: birinchi yozuvda tarix uzunligi 1, `from` = null.
    eq(`tarix uzunligi 1 (${l})`, Array.isArray(g1?.history) ? g1.history.length : -1, 1);
    eq(`tarix from=null (${l})`, g1?.history?.[0]?.from, null);
    eq(`tarix to=5 (${l})`, g1?.history?.[0]?.to, 5);
    eq(`tarix by = o'qituvchi (${l})`, String(g1?.history?.[0]?.by), f.teacher1.id);
    const cnt = await prisma.grade.count({
      where: { groupId: f.groupA.id, dateKey: MONDAY, isDeleted: false } });
    eq(`guruhda 3 ta baho (${l})`, cnt, 3);
  });

  // ── QAYTA YOZISH: qiymat O'ZGARDI ──
  await mirror('POST /bulk (qayta — qiymat 5→2)', (base, f) =>
    call(base, 'POST', `/api/grades/groups/${f.groupA.id}/bulk`, {
      as: 'teacher1',
      body: { date: MONDAY, items: [{ studentId: f.s1.id, value: 2 }] },
    }));
  await perStack(async (f, l) => {
    const g1 = await gradeRow(f, f.groupA, f.s1);
    eq(`qiymat yangilandi (${l})`, g1?.value, 2);
    eq(`tarix o'sdi → 2 (${l})`, g1?.history?.length, 2);
    eq(`tarix from=5 (${l})`, g1?.history?.[1]?.from, 5);
    eq(`tarix to=2 (${l})`, g1?.history?.[1]?.to, 2);
    // Yangi QATOR yaratilmagan — qisman unique indeks ostida YANGILANGAN.
    const cnt = await prisma.grade.count({
      where: {
        groupId: f.groupA.id, studentId: f.s1.id, dateKey: MONDAY, slot: '',
        isDeleted: false,
      } });
    eq(`dublikat qator yo'q (${l})`, cnt, 1);
    // Izoh yuborilmadi → bo'sh satrga tushadi (Express bilan bir xil).
    eq(`izoh tozalandi (${l})`, g1?.comment, '');
  });

  // ── QAYTA YOZISH: qiymat O'ZGARMADI → tarix O'SMAYDI ──
  await mirror("POST /bulk (qayta — o'sha qiymat 2)", (base, f) =>
    call(base, 'POST', `/api/grades/groups/${f.groupA.id}/bulk`, {
      as: 'teacher1',
      body: { date: MONDAY, items: [{ studentId: f.s1.id, value: 2 }] },
    }));
  await perStack(async (f, l) => {
    const g1 = await gradeRow(f, f.groupA, f.s1);
    eq(`o'zgarmagan qiymatda tarix o'smadi (${l})`, g1?.history?.length, 2);
  });

  // ── VALIDATSIYA ──
  const invalid = [
    ['ball 6 → 400', (f) => ({ date: MONDAY, items: [{ studentId: f.s1.id, value: 6 }] })],
    ['ball 0 → 400', (f) => ({ date: MONDAY, items: [{ studentId: f.s1.id, value: 0 }] })],
    ["ball kasr (3.5) → 400", (f) => ({ date: MONDAY, items: [{ studentId: f.s1.id, value: 3.5 }] })],
    ["bo'sh ro'yxat → 400", () => ({ date: MONDAY, items: [] })],
    ['sanasiz → 400', (f) => ({ items: [{ studentId: f.s1.id, value: 4 }] })],
    ['ISO instant sana → 400', (f) => ({
      date: '2025-03-03T00:00:00.000Z', items: [{ studentId: f.s1.id, value: 4 }] })],
    ['dars kuni emas → 400', (f) => ({
      date: TUESDAY, items: [{ studentId: f.s1.id, value: 4 }] })],
    ["a'zo bo'lmagan o'quvchi → 400", (f) => ({
      date: MONDAY, items: [{ studentId: f.s4.id, value: 4 }] })],
  ];
  for (const [name, mk] of invalid) {
    // eslint-disable-next-line no-await-in-loop
    await mirror(`POST /bulk (${name})`, (base, f) =>
      call(base, 'POST', `/api/grades/groups/${f.groupA.id}/bulk`,
        { as: 'teacher1', body: mk(f) }));
  }
  // DREYF: noto'g'ri so'rovlar HECH NARSA yozmagan.
  await perStack(async (f, l) => {
    const cnt = await prisma.grade.count({
      where: { groupId: f.groupA.id, isDeleted: false } });
    eq(`noto'g'ri so'rovlardan keyin baho soni 3 (${l})`, cnt, 3);
    const other = await prisma.grade.count({ where: { studentId: f.s4.id } });
    eq(`begona o'quvchiga baho yozilmadi (${l})`, other, 0);
  });

  // ── RBAC ──
  await mirror("begona guruhga o'qituvchi yoza olmaydi → 403", (base, f) =>
    call(base, 'POST', `/api/grades/groups/${f.groupA.id}/bulk`, {
      as: 'teacher2',
      body: { date: MONDAY, items: [{ studentId: f.s1.id, value: 1 }] },
    }));
  await mirror("o'quvchi baho yoza olmaydi → 403", (base, f) =>
    call(base, 'POST', `/api/grades/groups/${f.groupA.id}/bulk`, {
      as: 's1',
      body: { date: MONDAY, items: [{ studentId: f.s1.id, value: 1 }] },
    }));
  await mirror('qabul xodimi baho yoza olmaydi → 403', (base, f) =>
    call(base, 'POST', `/api/grades/groups/${f.groupA.id}/bulk`, {
      as: 'reception',
      body: { date: MONDAY, items: [{ studentId: f.s1.id, value: 1 }] },
    }));
  await mirror('POST /bulk autentifikatsiyasiz → 401', (base, f) =>
    call(base, 'POST', `/api/grades/groups/${f.groupA.id}/bulk`, {
      noAuth: true,
      body: { date: MONDAY, items: [{ studentId: f.s1.id, value: 1 }] },
    }));
  await perStack(async (f, l) => {
    const g1 = await gradeRow(f, f.groupA, f.s1);
    eq(`403/401 urinishlari qiymatni o'zgartirmadi (${l})`, g1?.value, 2);
  });

  // ─────────────────────────────────────────────────────────────────
  section("3) SESSIYA (ko'p darsli kun)");
  // ─────────────────────────────────────────────────────────────────

  const m0 = await mirror('GET /groups/<multi> (2 sessiya)', (base, f) =>
    call(base, 'GET', `/api/grades/groups/${f.multi.id}?date=${MONDAY}`));
  if (m0.e?.body?.data) {
    eq('2 sessiya (express)', m0.e.body.data.sessions?.length, 2);
    eq('standart slot=09:00 (express)', m0.e.body.data.slot, '09:00');
    eq('2 sessiya (nest)', m0.n.body.data.sessions?.length, 2);
    eq('standart slot=09:00 (nest)', m0.n.body.data.slot, '09:00');
  }

  await mirror('POST /bulk <multi> (slotsiz → 09:00)', (base, f) =>
    call(base, 'POST', `/api/grades/groups/${f.multi.id}/bulk`, {
      as: 'teacher1',
      body: { date: MONDAY, items: [{ studentId: f.s1.id, value: 5 }] },
    }));
  await mirror('POST /bulk <multi> (slot=14:00)', (base, f) =>
    call(base, 'POST', `/api/grades/groups/${f.multi.id}/bulk`, {
      as: 'teacher1',
      body: { date: MONDAY, slot: '14:00', items: [{ studentId: f.s1.id, value: 3 }] },
    }));
  await perStack(async (f, l) => {
    const a = await gradeRow(f, f.multi, f.s1, '09:00');
    const b = await gradeRow(f, f.multi, f.s1, '14:00');
    eq(`09:00 sessiyasi bahosi (${l})`, a?.value, 5);
    eq(`14:00 sessiyasi bahosi (${l})`, b?.value, 3);
    // IKKI ALOHIDA QATOR — sessiya kaliti indeksda qatnashadi.
    eq(`sessiyalar alohida qator (${l})`, a?.id !== b?.id, true);
    const cnt = await prisma.grade.count({
      where: { groupId: f.multi.id, dateKey: MONDAY, isDeleted: false } });
    eq(`multi guruhda 2 baho (${l})`, cnt, 2);
  });
  await mirror("POST /bulk <multi> (mavjud bo'lmagan slot → 400)", (base, f) =>
    call(base, 'POST', `/api/grades/groups/${f.multi.id}/bulk`, {
      as: 'teacher1',
      body: { date: MONDAY, slot: '20:00', items: [{ studentId: f.s1.id, value: 3 }] },
    }));
  await mirror('POST /bulk <multi> (slot formati xato → 400)', (base, f) =>
    call(base, 'POST', `/api/grades/groups/${f.multi.id}/bulk`, {
      as: 'teacher1',
      body: { date: MONDAY, slot: '14:0', items: [{ studentId: f.s1.id, value: 3 }] },
    }));
  await mirror('GET /groups/<multi>?slot=14:00', (base, f) =>
    call(base, 'GET', `/api/grades/groups/${f.multi.id}?date=${MONDAY}&slot=14:00`));

  // ─────────────────────────────────────────────────────────────────
  section('4) GURUH HISOBOTI');
  // ─────────────────────────────────────────────────────────────────

  const gs = await mirror('GET /groups/:id/summary', (base, f) =>
    call(base, 'GET',
      `/api/grades/groups/${f.groupA.id}/summary?fromDate=2025-03-01&toDate=2025-03-31`));
  if (gs.e?.body?.data) {
    // s1=2, s2=4, s3=3 → o'rtacha 3, tarqalish 2/3/4 da bittadan.
    eq('jami 3 baho (express)', gs.e.body.data.total, 3);
    eq("o'rtacha 3 (express)", gs.e.body.data.average, 3);
    eq('tarqalish[2]=1 (express)', gs.e.body.data.distribution?.['2'], 1);
    eq('tarqalish[5]=0 (express)', gs.e.body.data.distribution?.['5'], 0);
    eq("perStudent kamayish tartibida (express)",
      gs.e.body.data.perStudent?.map((p) => p.average).join(','), '4,3,2');
    eq('jami 3 baho (nest)', gs.n.body.data.total, 3);
    eq("o'rtacha 3 (nest)", gs.n.body.data.average, 3);
    eq("perStudent kamayish tartibida (nest)",
      gs.n.body.data.perStudent?.map((p) => p.average).join(','), '4,3,2');
  }
  await mirror('GET /groups/:id/summary (sanasiz → 400)', (base, f) =>
    call(base, 'GET', `/api/grades/groups/${f.groupA.id}/summary`));
  await mirror('GET /groups/:id/summary (begona guruh → 403)', (base, f) =>
    call(base, 'GET',
      `/api/grades/groups/${f.groupA.id}/summary?fromDate=2025-03-01&toDate=2025-03-31`,
      { as: 'teacher2' }));

  // ─────────────────────────────────────────────────────────────────
  section("5) O'QUVCHI HISOBOTI — CROSS-GROUP DISCLOSURE");
  // ─────────────────────────────────────────────────────────────────

  // Ikkinchi guruhda ham baho: `groupA2` ni `teacher2` o'qitadi.
  await mirror('POST /bulk <groupA2> (boshqa guruh bahosi)', (base, f) =>
    call(base, 'POST', `/api/grades/groups/${f.groupA2.id}/bulk`, {
      as: 'teacher2',
      body: { date: MONDAY, items: [{ studentId: f.s1.id, value: 1 }] },
    }));

  const suOwner = await mirror("GET /students/:id/summary (owner — HAMMASI)",
    (base, f) => call(base, 'GET', `/api/grades/students/${f.s1.id}/summary`));
  if (suOwner.e?.body?.data) {
    // groupA=2, groupA2=1, multi=5 va 3 → jami 4 ta baho.
    eq('owner 4 ta bahoni ko\'radi (express)', suOwner.e.body.data.count, 4);
    eq('owner 4 ta bahoni ko\'radi (nest)', suOwner.n.body.data.count, 4);
  }

  const suT1 = await mirror("GET /students/:id/summary (o'qituvchi1 — CHEKLANGAN)",
    (base, f) => call(base, 'GET', `/api/grades/students/${f.s1.id}/summary`,
      { as: 'teacher1' }));
  if (suT1.e?.body?.data) {
    for (const [res, l] of [[suT1.e, 'express'], [suT1.n, 'nest']]) {
      const d = res.body.data;
      // ⚠ A-1: `teacher1` FAQAT `groupA` (2) va `multi` (5, 3) ni
      // ko'radi — `groupA2` dagi 1 KO'RINMASLIGI SHART.
      eq(`o'qituvchi1 3 ta baho ko'radi (${l})`, d.count, 3);
      const groups = new Set((d.recent || []).map((r) => r.group?.name));
      eq(`begona guruh bahosi ko'rinmadi (${l})`,
        [...groups].some((n) => /A2$/.test(String(n))), false);
    }
  }

  const suT2 = await mirror("GET /students/:id/summary (o'qituvchi2 — faqat A2)",
    (base, f) => call(base, 'GET', `/api/grades/students/${f.s1.id}/summary`,
      { as: 'teacher2' }));
  if (suT2.e?.body?.data) {
    eq("o'qituvchi2 1 ta baho ko'radi (express)", suT2.e.body.data.count, 1);
    eq("o'qituvchi2 1 ta baho ko'radi (nest)", suT2.n.body.data.count, 1);
  }

  await mirror("o'quvchi O'Z hisobotini ko'radi (musbat)", (base, f) =>
    call(base, 'GET', `/api/grades/students/${f.s1.id}/summary`, { as: 's1' }));
  await mirror("o'quvchi BEGONA hisobotga → 403", (base, f) =>
    call(base, 'GET', `/api/grades/students/${f.s1.id}/summary`, { as: 's2' }));
  await mirror('direktor (o\'z filiali) → 200', (base, f) =>
    call(base, 'GET', `/api/grades/students/${f.s1.id}/summary`, { as: 'director' }));
  await mirror('direktor BEGONA filial o\'quvchisiga → 403', (base, f) =>
    call(base, 'GET', `/api/grades/students/${f.s4.id}/summary`, { as: 'director' }));
  await mirror('GET /students/:id/summary autentifikatsiyasiz → 401', (base, f) =>
    call(base, 'GET', `/api/grades/students/${f.s1.id}/summary`, { noAuth: true }));
  await mirror('GET /students/:id/summary (sana oralig\'i bilan)', (base, f) =>
    call(base, 'GET',
      `/api/grades/students/${f.s1.id}/summary?fromDate=2025-03-01&toDate=2025-03-02`));

  // ─────────────────────────────────────────────────────────────────
  section('6) REYTING');
  // ─────────────────────────────────────────────────────────────────

  const lb = await mirror('GET /rating/leaderboard?scope=<groupA>', (base, f) =>
    call(base, 'GET', `/api/grades/rating/leaderboard?scope=${f.groupA.id}`));
  if (lb.e?.body?.data) {
    for (const [res, l] of [[lb.e, 'express'], [lb.n, 'nest']]) {
      const items = res.body.data.items || [];
      eq(`reytingda 3 o'quvchi (${l})`, items.length, 3);
      eq(`o'rinlar 1,2,3 (${l})`, items.map((i) => i.rank).join(','), '1,2,3');
      eq(`ball kamayish tartibida (${l})`,
        items.every((it, i) => i === 0 || items[i - 1].point >= it.point), true);
      eq(`o'rtacha ballar 4,3,2 (${l})`,
        items.map((i) => i.averageGrade).join(','), '4,3,2');
      eq(`sozlamalar qaytdi (${l})`,
        typeof res.body.data.settings?.gradeWeight, 'number');
    }
  }

  // ── FILIAL AJRATMASI (reyting) ──
  const lbDir = await mirror('GET /rating/leaderboard?scope=all (direktor)',
    (base, f) => call(base, 'GET',
      '/api/grades/rating/leaderboard?scope=all&limit=1000', { as: 'director' }));
  if (lbDir.e?.body?.data) {
    await perStack(async (f, l) => {
      const res = l === 'express' ? lbDir.e : lbDir.n;
      const ids = new Set((res.body.data.items || []).map((i) => String(i.student._id)));
      // MUSBAT: o'z filiali o'quvchisi BOR.
      eq(`o'z filiali o'quvchisi reytingda (${l})`, ids.has(f.s1.id), true);
      // MANFIY: boshqa filial o'quvchisi YO'Q.
      eq(`begona filial o'quvchisi reytingda YO'Q (${l})`, ids.has(f.s4.id), false);
      // MANFIY: qarama-qarshi stek fiksturasi ham YO'Q (boshqa filial).
      const otherF = l === 'express' ? fx[NEST] : fx[EXPRESS];
      eq(`qarshi fikstura o'quvchisi YO'Q (${l})`, ids.has(otherF.s1.id), false);
    });
  }

  await mirror('GET /rating/leaderboard (qabul xodimi → 403)', (base) =>
    call(base, 'GET', '/api/grades/rating/leaderboard', { as: 'reception' }));
  await mirror('GET /rating/leaderboard (autentifikatsiyasiz → 401)', (base) =>
    call(base, 'GET', '/api/grades/rating/leaderboard', { noAuth: true }));
  await mirror('GET /rating/leaderboard?limit=xato (400)', (base) =>
    call(base, 'GET', '/api/grades/rating/leaderboard?limit=abc'));

  await mirror('GET /rating/students/:id (direktor)', (base, f) =>
    call(base, 'GET', `/api/grades/rating/students/${f.s1.id}`, { as: 'director' }));
  await mirror("GET /rating/students/:id (o'quvchi O'ZI)", (base, f) =>
    call(base, 'GET', `/api/grades/rating/students/${f.s1.id}`, { as: 's1' }));
  /**
   * ⚠⚠ MAVJUD KAMCHILIK — O'LCHANDI, TUZATILMADI ⚠⚠
   *
   * `/rating/students/:id` da FAQAT `requirePermissionOrSelf(RATING_READ)`
   * bor, `requireStudentAccess` YO'Q. Seed esa `student` roliga
   * `rating.read` ni BERADI — ya'ni `hasPermission` shoxi ishlaydi va
   * "faqat o'zi" sharti UMUMAN tekshirilmaydi.
   *
   * Natija: o'quvchi BOSHQA o'quvchining reytingdagi o'rnini,
   * o'rtacha bahosini va davomat foizini o'qiy oladi. Bu Express'da
   * ALLAQACHON shunday — shuning uchun NestJS ham AYNAN shunday
   * qiladi va bu yerda 200 QOTIRILADI.
   *
   * Tuzatish (`requireStudentAccess` qo'shish) xatti-harakatni
   * o'zgartiradi va o'quvchi panelini sindirishi mumkin — shuning
   * uchun ALOHIDA qaror sifatida hisobotga chiqarilgan.
   */
  const rs2 = await mirror(
    "GET /rating/students/:id (begona o'quvchi — Express 200 QOLDIRILGAN)",
    (base, f) => call(base, 'GET', `/api/grades/rating/students/${f.s1.id}`,
      { as: 's2' }));
  eq('kamchilik qotirildi: begona reyting 200 (express)', rs2.e?.status, 200);
  eq('kamchilik qotirildi: begona reyting 200 (nest)', rs2.n?.status, 200);

  // ── SOZLAMALAR ──
  await mirror('GET /rating/settings', (base) =>
    call(base, 'GET', '/api/grades/rating/settings'));
  await mirror('PATCH /rating/settings (owner)', (base) =>
    call(base, 'PATCH', '/api/grades/rating/settings',
      { body: { gradeWeight: 0.6, attendanceWeight: 0.4 } }));
  {
    const row = await prisma.ratingSettings.findUnique({ where: { id: 'default' } });
    eq('sozlama bazada yangilandi', row?.gradeWeight, 0.6);
  }
  // ⚠ DIREKTORDA `rating.manage` BOR, lekin u OWNER EMAS —
  // `requireRole(OWNER)` uni to'xtatishi SHART.
  await mirror('PATCH /rating/settings (direktor → 403)', (base) =>
    call(base, 'PATCH', '/api/grades/rating/settings',
      { as: 'director', body: { gradeWeight: 0.1 } }));
  await mirror("PATCH /rating/settings (o'qituvchi → 403)", (base) =>
    call(base, 'PATCH', '/api/grades/rating/settings',
      { as: 'teacher1', body: { gradeWeight: 0.1 } }));
  await mirror("PATCH /rating/settings (o'quvchi → 403)", (base) =>
    call(base, 'PATCH', '/api/grades/rating/settings',
      { as: 's1', body: { gradeWeight: 0.1 } }));
  await mirror('PATCH /rating/settings (vazn > 1 → 400)', (base) =>
    call(base, 'PATCH', '/api/grades/rating/settings', { body: { gradeWeight: 2 } }));
  await mirror('PATCH /rating/settings (autentifikatsiyasiz → 401)', (base) =>
    call(base, 'PATCH', '/api/grades/rating/settings',
      { noAuth: true, body: { gradeWeight: 0.1 } }));
  {
    const row = await prisma.ratingSettings.findUnique({ where: { id: 'default' } });
    eq('403/401 urinishlari sozlamani o\'zgartirmadi', row?.gradeWeight, 0.6);
  }

};

run()
  .catch((err) => { console.error('\x1b[31mTEST YIQILDI:\x1b[0m', err); R.fail += 1; })
  .finally(async () => {
    // ⚠ `process.exit()` FAQAT `finally` DA — `run()` ichida chaqirilsa
    // tozalash o'tkazib yuborilib, fikstura bazada qolardi.
    await cleanup();
    await prisma.$disconnect().catch(() => {});
    process.exit(finish());
  });
