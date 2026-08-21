/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QITUVCHI DAVOMATI — PARITET (FAZA 6)
 *
 * Express `/api/teacher-attendance` (2 marshrut) ↔ NestJS.
 *
 * ── ARXITEKTURA (nima o'lchanadi) ──
 *
 * Ikki jadval, rollari HAR XIL:
 *   TeacherAttendance → MANBA-HAQIQAT (kunlik yozuv, owner belgilaydi)
 *   TeacherAbsence    → PROYEKSIYA (guruh darajasi, maoshga ta'sir qiladi)
 *
 * Shuning uchun test FAQAT javobni emas, IKKALA jadvalning holatini ham
 * tekshiradi: "absent" belgilanganda o'qituvchining DARS KUNI bo'lgan
 * guruhlariga belgi tushishi, dars kuni BO'LMAGAN guruhga TUSHMASLIGI
 * shart.
 *
 * ── NIMA ISBOTLANADI ──
 *   1. Javob (status + tana) va IKKALA jadval ta'siri bir xil.
 *   2. Jadval VERSIYALASH: `effectiveFrom` dan oldingi sanada eski
 *      versiya amal qiladi.
 *   3. "present" → yozuv O'CHIRILADI va guruh belgilari OLIB TASHLANADI.
 *   4. Kelajak kun RAD ETILADI (mahalliy vaqt bo'yicha).
 *   5. Noto'g'ri o'qituvchi ID si (o'quvchi) RAD ETILADI.
 *   6. RBAC: `attendance.manage` SHART — teacher'da u YO'Q.
 *
 * ISHLATISH:  npm run test:teacher-attendance-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, normalize, nowStamps, mintToken,
  waitForStacks, createReporter,
} from './_harness.mjs';

const prisma = new PrismaClient();
const TAG = `TA-${Date.now().toString(36)}`;
const { R, ok, bad, skip, section, finish } = createReporter('teacher-attendance');

const made = { branches: [], users: [], groups: [] };

const rateLimited = (r) =>
  r?.status === 429 ||
  /so'rovlar soni juda ko'p/i.test(String(r?.body?.message || ''));

const cleanup = async () => {
  try {
    if (made.users.length) {
      await prisma.teacherAttendance.deleteMany({
        where: { teacherId: { in: made.users } } });
    }
    if (made.groups.length) {
      await prisma.teacherAbsence.deleteMany({
        where: { groupId: { in: made.groups } } });
      await prisma.groupScheduleItem.deleteMany({
        where: { groupId: { in: made.groups } } });
      await prisma.teacherGroupPeriod.deleteMany({
        where: { groupId: { in: made.groups } } });
      await prisma.group.deleteMany({ where: { id: { in: made.groups } } });
    }
    if (made.users.length) {
      await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    }
    if (made.branches.length) {
      await prisma.branch.deleteMany({ where: { id: { in: made.branches } } });
    }
  } catch (e) {
    console.error('  ⚠ tozalash xatosi:', e.message);
  }
};

/**
 * Sinov sanasi — O'TMISHDA va DUSHANBA.
 *
 * ⚠ Kelajak kun rad etiladi, shuning uchun sana o'tmishda bo'lishi
 * SHART. Hafta kuni esa aniq bo'lishi kerak — jadval "mon" ga
 * qo'yiladi va "dars kuni" mantig'i aynan shunda o'lchanadi.
 */
const MONDAY = '2025-03-03';   // dushanba
const TUESDAY = '2025-03-04';  // seshanba — dars kuni EMAS

const makeFixture = async (label) => {
  const branch = await prisma.branch.create({
    data: { name: `${TAG} ${label}`, code: `${TAG}${label}` } });
  made.branches.push(branch.id);

  const mk = async (n, role) => {
    const u = await prisma.user.create({
      data: {
        firstName: `${n}${label}`, lastName: `${TAG}${label}`,
        username: `${n.toLowerCase()}_${TAG.toLowerCase()}_${label.toLowerCase()}`,
        passwordHash: 'x', role, homeBranchId: branch.id, isActive: true,
      } });
    made.users.push(u.id);
    return u;
  };
  const teacher = await mk('Ustoz', 'teacher');
  const student = await mk('Talaba', 'student');

  const mkGroup = async (n, day) => {
    const g = await prisma.group.create({
      data: { branchId: branch.id, name: `${TAG}${label} ${n}`, isActive: true } });
    made.groups.push(g.id);
    await prisma.groupScheduleItem.create({
      data: {
        groupId: g.id, day, startTime: '09:00', endTime: '10:30',
        effectiveFrom: new Date(Date.UTC(2020, 0, 1)),
      } });
    await prisma.group.update({
      where: { id: g.id }, data: { teachers: { connect: { id: teacher.id } } } });
    return g;
  };
  // `monGroup` — dushanba darsi; `tueGroup` — seshanba darsi.
  // Dushanbadagi "kelmadi" FAQAT `monGroup` ga tushishi kerak.
  const monGroup = await mkGroup('mon', 'mon');
  const tueGroup = await mkGroup('tue', 'tue');

  return { branch, teacher, student, monGroup, tueGroup };
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mO'QITUVCHI DAVOMATI — PARITET\x1b[0m  (${TAG})`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false }, select: { id: true, role: true } });
  if (!owner) throw new Error('owner topilmadi');
  const ownerToken = mintToken(owner);

  const fx = { [EXPRESS]: await makeFixture('E'), [NEST]: await makeFixture('N') };
  const tok = {};
  for (const base of [EXPRESS, NEST]) {
    tok[base] = { teacher: mintToken(fx[base].teacher) };
  }

  const call = (base, method, path, { body, branchId, as } = {}) =>
    request(base, method, path, {
      token: as ? tok[base][as] : ownerToken,
      body,
      headers: branchId ? { 'x-branch-id': branchId } : {},
    });

  /**
   * ⚠ IKKALA FIKSTURA HAM NORMALLASHTIRILADI — faqat o'ziniki emas.
   *
   * `GET /teacher-attendance` GLOBAL: u BARCHA faol o'qituvchilarni
   * qaytaradi, filial ko'lami YO'Q. Ya'ni Express javobida NestJS
   * fiksturasining o'qituvchisi ham bor va aksincha.
   *
   * Birinchi urinishda har stek faqat O'Z ID/nomlarini almashtirardi
   * va solishtiruv begona qatorlarda yiqilardi — implementatsiya
   * to'g'ri bo'lsa ham. Endi ikkala to'plam ham ALOHIDA belgilar bilan
   * almashtiriladi: haqiqiy farq (masalan noto'g'ri o'qituvchiga
   * yozilgan holat) baribir ko'rinadi, chunki belgilar har xil.
   */
  const subs = () => {
    const E = fx[EXPRESS]; const N = fx[NEST];
    return [
      [E.branch.id, '<BR_E>'], [N.branch.id, '<BR_N>'],
      [E.teacher.id, '<TEACHER_E>'], [N.teacher.id, '<TEACHER_N>'],
      [E.student.id, '<STUDENT_E>'], [N.student.id, '<STUDENT_N>'],
      [E.monGroup.id, '<GMON_E>'], [N.monGroup.id, '<GMON_N>'],
      [E.tueGroup.id, '<GTUE_E>'], [N.tueGroup.id, '<GTUE_N>'],
      [owner.id, '<OWNER>'],
      ['UstozE', '<USTOZ_E>'], ['UstozN', '<USTOZ_N>'],
      ['TalabaE', '<TALABA_E>'], ['TalabaN', '<TALABA_N>'],
      [`${TAG.toLowerCase()}_e`, '<tag_e>'], [`${TAG.toLowerCase()}_n`, '<tag_n>'],
      [`${TAG}E`, '<TAG_E>'], [`${TAG}N`, '<TAG_N>'],
      [`${TAG} E`, '<TAG_E>'], [`${TAG} N`, '<TAG_N>'],
      [TAG, '<TAG>'],
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

  // ─────────────────────────────────────────────────────────────────
  section("1) RO'YXAT");
  // ─────────────────────────────────────────────────────────────────

  const l0 = await mirror(`GET /?date=${MONDAY}`, (base) =>
    call(base, 'GET', `/api/teacher-attendance?date=${MONDAY}`, {}));
  if (l0.e?.body?.data) {
    // MUSBAT NAZORAT: bizning o'qituvchimiz ro'yxatda BOR va default
    // holati "present" — aks holda keyingi tekshiruvlar o'lchamasdi.
    for (const [base, res] of [[EXPRESS, l0.e], [NEST, l0.n]]) {
      const f = fx[base]; const label = base === EXPRESS ? 'express' : 'nest';
      const row = (res.body.data.rows || []).find(
        (r) => String(r.teacher?._id) === String(f.teacher.id));
      eq(`o'qituvchi ro'yxatda bor (${label})`, Boolean(row), true);
      eq(`standart holat "present" (${label})`, row?.status, 'present');
      // ⚠ Javobda `teacher._id` — klient jadvali shunga tayangan.
      eq(`javobda \`_id\` maydoni (${label})`, '_id' in (row?.teacher || {}), true);
    }
  }

  await mirror('GET / (sanasiz → 400)', (base) =>
    call(base, 'GET', '/api/teacher-attendance', {}));
  await mirror("GET /?date=xato (400)", (base) =>
    call(base, 'GET', '/api/teacher-attendance?date=xato', {}));

  // ─────────────────────────────────────────────────────────────────
  section('2) KELMADI — proyeksiya FAQAT dars kuniga tushadi');
  // ─────────────────────────────────────────────────────────────────

  await mirror('POST /bulk (absent, dushanba)', (base, f) =>
    call(base, 'POST', '/api/teacher-attendance/bulk', {
      body: {
        date: MONDAY,
        items: [{ teacherId: f.teacher.id, status: 'absent',
          reason: `${TAG} kasal` }],
      },
    }));

  for (const base of [EXPRESS, NEST]) {
    const f = fx[base]; const label = base === EXPRESS ? 'express' : 'nest';
    // MANBA-HAQIQAT yozildi.
    const rec = await prisma.teacherAttendance.findFirst({
      where: { teacherId: f.teacher.id, dateKey: MONDAY } });
    eq(`manba-haqiqat yozildi (${label})`, rec?.status, 'absent');
    eq(`sabab saqlandi (${label})`, rec?.reason, `${TAG} kasal`);
    eq(`recordedById to'ldirildi (${label})`, rec?.recordedById, owner.id);

    // ⚠ PROYEKSIYA: FAQAT dushanba guruhiga.
    eq(`dushanba guruhiga belgi TUSHDI (${label})`,
      await prisma.teacherAbsence.count({
        where: { groupId: f.monGroup.id, isDeleted: false } }), 1);
    eq(`seshanba guruhiga belgi TUSHMADI (${label})`,
      await prisma.teacherAbsence.count({
        where: { groupId: f.tueGroup.id, isDeleted: false } }), 0);
  }

  // Ro'yxat endi "absent" ko'rsatadi.
  await mirror(`GET /?date=${MONDAY} (absent'dan keyin)`, (base) =>
    call(base, 'GET', `/api/teacher-attendance?date=${MONDAY}`, {}));

  // ─────────────────────────────────────────────────────────────────
  section('3) KELDI — yozuv o\'chadi, belgilar olib tashlanadi');
  // ─────────────────────────────────────────────────────────────────

  await mirror('POST /bulk (present, dushanba)', (base, f) =>
    call(base, 'POST', '/api/teacher-attendance/bulk', {
      body: { date: MONDAY,
        items: [{ teacherId: f.teacher.id, status: 'present' }] },
    }));

  for (const base of [EXPRESS, NEST]) {
    const f = fx[base]; const label = base === EXPRESS ? 'express' : 'nest';
    // "present" → MANBA yozuvi butunlay O'CHIRILADI (default holatga qaytadi).
    eq(`manba yozuvi o'chirildi (${label})`,
      await prisma.teacherAttendance.count({
        where: { teacherId: f.teacher.id, dateKey: MONDAY } }), 0);
    // Proyeksiya belgisi ham olib tashlanadi.
    eq(`guruh belgisi olib tashlandi (${label})`,
      await prisma.teacherAbsence.count({
        where: { groupId: f.monGroup.id, isDeleted: false } }), 0);
  }

  // ─────────────────────────────────────────────────────────────────
  section('4) VALIDATSIYA VA CHEGARALAR');
  // ─────────────────────────────────────────────────────────────────

  // ⚠ KELAJAK KUN — mahalliy (Asia/Tashkent) kun bo'yicha.
  const future = new Date(Date.now() + 3 * 24 * 3600 * 1000)
    .toISOString().slice(0, 10);
  await mirror('POST /bulk (kelajak kun → 400)', (base, f) =>
    call(base, 'POST', '/api/teacher-attendance/bulk', {
      body: { date: future,
        items: [{ teacherId: f.teacher.id, status: 'absent' }] },
    }));

  // MANFIY: o'quvchi ID si berilgan — o'qituvchi emas.
  await mirror("POST /bulk (o'quvchi ID si → 400)", (base, f) =>
    call(base, 'POST', '/api/teacher-attendance/bulk', {
      body: { date: MONDAY,
        items: [{ teacherId: f.student.id, status: 'absent' }] },
    }));
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base]; const label = base === EXPRESS ? 'express' : 'nest';
    eq(`o'quvchiga davomat yozilmadi (${label})`,
      await prisma.teacherAttendance.count({
        where: { teacherId: f.student.id } }), 0);
  }

  await mirror("POST /bulk (bo'sh ro'yxat → 400)", (base) =>
    call(base, 'POST', '/api/teacher-attendance/bulk', {
      body: { date: MONDAY, items: [] } }));
  await mirror("POST /bulk (noma'lum status → 400)", (base, f) =>
    call(base, 'POST', '/api/teacher-attendance/bulk', {
      body: { date: MONDAY,
        items: [{ teacherId: f.teacher.id, status: 'xyz' }] } }));
  await mirror("POST /bulk (ID formati xato → 400)", (base) =>
    call(base, 'POST', '/api/teacher-attendance/bulk', {
      body: { date: MONDAY, items: [{ teacherId: 'abc', status: 'absent' }] } }));
  // ⚠ YOZISHDA sana FAQAT "YYYY-MM-DD" — ISO instant +5 soat siljib
  // absence'ni noto'g'ri kunga yozardi (A-2 parity).
  await mirror('POST /bulk (ISO instant sana → 400)', (base, f) =>
    call(base, 'POST', '/api/teacher-attendance/bulk', {
      body: { date: '2025-03-03T00:00:00.000Z',
        items: [{ teacherId: f.teacher.id, status: 'absent' }] } }));

  // ─────────────────────────────────────────────────────────────────
  section('5) RBAC');
  // ─────────────────────────────────────────────────────────────────
  //
  // ⚠ `attendance.manage` SHART. `teacher` rolida `attendance.record`
  // BOR, lekin `manage` YO'Q — ya'ni o'qituvchi BOSHQA o'qituvchini
  // belgilay olmaydi (bu maoshga ta'sir qiladi).
  await mirror("o'qituvchi ro'yxatni ko'ra olmaydi → 403", (base, f) =>
    call(base, 'GET', `/api/teacher-attendance?date=${MONDAY}`, {
      as: 'teacher', branchId: f.branch.id }));
  await mirror("o'qituvchi belgilay olmaydi → 403", (base, f) =>
    call(base, 'POST', '/api/teacher-attendance/bulk', {
      as: 'teacher', branchId: f.branch.id,
      body: { date: MONDAY,
        items: [{ teacherId: f.teacher.id, status: 'absent' }] } }));
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base]; const label = base === EXPRESS ? 'express' : 'nest';
    eq(`o'qituvchi urinishi yozuv qoldirmadi (${label})`,
      await prisma.teacherAttendance.count({
        where: { teacherId: f.teacher.id, dateKey: MONDAY } }), 0);
  }

  for (const [m, p, body] of [
    ['GET', `/api/teacher-attendance?date=${MONDAY}`, undefined],
    ['POST', '/api/teacher-attendance/bulk', {}],
  ]) {
    await mirror(`${m} ${p.split('?')[0]} — autentifikatsiyasiz → 401`,
      (base) => request(base, m, p, { body }));
  }

  // ─────────────────────────────────────────────────────────────────
  section('6) SESHANBA — teskari nazorat');
  // ─────────────────────────────────────────────────────────────────
  //
  // MUSBAT NAZORAT: seshanbadagi "kelmadi" FAQAT seshanba guruhiga
  // tushadi. Usiz 2-bo'limdagi "seshanbaga tushmadi" tekshiruvi
  // "hech qachon hech narsa tushmaydi" bilan ham yashil bo'lardi.
  await mirror('POST /bulk (absent, seshanba)', (base, f) =>
    call(base, 'POST', '/api/teacher-attendance/bulk', {
      body: { date: TUESDAY,
        items: [{ teacherId: f.teacher.id, status: 'excused',
          reason: `${TAG} sababli` }] } }));

  for (const base of [EXPRESS, NEST]) {
    const f = fx[base]; const label = base === EXPRESS ? 'express' : 'nest';
    eq(`seshanba guruhiga belgi TUSHDI (${label})`,
      await prisma.teacherAbsence.count({
        where: { groupId: f.tueGroup.id, isDeleted: false } }), 1);
    eq(`dushanba guruhiga TUSHMADI (${label})`,
      await prisma.teacherAbsence.count({
        where: { groupId: f.monGroup.id, isDeleted: false } }), 0);
    eq(`"excused" holati saqlandi (${label})`,
      (await prisma.teacherAttendance.findFirst({
        where: { teacherId: f.teacher.id, dateKey: TUESDAY } }))?.status, 'excused');
  }
};

run()
  .catch((err) => { console.error('\x1b[31mTEST YIQILDI:\x1b[0m', err); R.fail += 1; })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect().catch(() => {});
    process.exit(finish());
  });
