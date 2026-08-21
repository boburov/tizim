/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DAVOMATDAN OZOD DAVRLARI — PARITET (FAZA 6)
 *
 * Express `/api/attendance-exemptions` (4 marshrut) ↔ NestJS.
 *
 * ── NIMA ISBOTLANADI ──
 *   1. Javob (status + tana) VA BAZA ta'siri bir xil.
 *   2. RBAC: rol darvozasi (owner|teacher) va ruxsat darvozasi
 *      (`attendance.record`) — IKKALASI ham, XATO KODI bilan birga.
 *   3. O'QITUVCHI EGALIGI: teacher faqat O'Z guruhidagi o'quvchi
 *      uchun ozod davri qo'ya/tahrirlay/o'chira oladi.
 *   4. Validatsiya: sana oralig'i, bo'sh tana, noma'lum kun.
 *   5. Yumshoq o'chirish — hujjat qoladi, ro'yxatdan chiqadi.
 *
 * ── ⚠ QO'RIQCHI TARTIBI ──
 * Express: `requireRole` → `requirePermission`. Rol ham, ruxsat ham
 * yo'q foydalanuvchi ROL xatosini oladi. NestJS'da `@UseGuards` e'lon
 * tartibida ishlaydi, shuning uchun tartib almashsa `message` boshqacha
 * bo'lardi — test buni ALOHIDA tekshiradi.
 *
 * ISHLATISH:  npm run test:attendance-exemptions-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, normalize, nowStamps, mintToken,
  waitForStacks, createReporter,
} from './_harness.mjs';

const prisma = new PrismaClient();
const TAG = `AE-${Date.now().toString(36)}`;
const { R, ok, bad, skip, section, finish } = createReporter('attendance-exemptions');

const made = { branches: [], users: [], groups: [] };

const rateLimited = (r) =>
  r?.status === 429 ||
  /so'rovlar soni juda ko'p/i.test(String(r?.body?.message || ''));

const cleanup = async () => {
  try {
    if (made.users.length) {
      await prisma.attendanceExemption.deleteMany({
        where: { studentId: { in: made.users } } });
      await prisma.attendanceExemption.deleteMany({
        where: { createdById: { in: made.users } } });
    }
    if (made.groups.length) {
      await prisma.groupMembership.deleteMany({
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
 * Har stek uchun ko'zgu fikstura.
 *
 * IKKI GURUH: `own` (o'qituvchimizniki) va `foreign` (begona). Egalik
 * tekshiruvi faqat shu ikkisi bir vaqtda bo'lganda MA'NOGA ega —
 * bitta guruh bilan "hammasi rad etiladi" ham yashil berardi.
 */
const makeFixture = async (label) => {
  const branch = await prisma.branch.create({
    data: { name: `${TAG} ${label}`, code: `${TAG}${label}` } });
  made.branches.push(branch.id);

  const mk = async (n, role) => {
    const u = await prisma.user.create({
      data: {
        firstName: n, lastName: `${TAG}${label}`,
        username: `${n.toLowerCase()}_${TAG.toLowerCase()}_${label.toLowerCase()}`,
        passwordHash: 'x', role, homeBranchId: branch.id,
      } });
    made.users.push(u.id);
    return u;
  };
  const teacher = await mk('Ustoz', 'teacher');
  const student = await mk('Talaba', 'student');
  const foreign = await mk('Begona', 'student');
  const admin = await mk('Admin', 'director');

  const mkGroup = async (n) => {
    const g = await prisma.group.create({
      data: { branchId: branch.id, name: `${TAG}${label} ${n}`, isActive: true } });
    made.groups.push(g.id);
    return g;
  };
  const ownGroup = await mkGroup('own');
  const foreignGroup = await mkGroup('foreign');

  // ═══════════════════════════════════════════════════════════════════
  // O'QITUVCHI FAQAT `ownGroup` DA — IKKI JOYDA BOG'LANADI
  //
  // ⚠ `ensureTeacherOwnsStudent()` `Group.teachers` (ko'p-ko'pga KESH)
  // bo'yicha qidiradi, `TeacherGroupPeriod` bo'yicha EMAS. Ishlab
  // chiqarishda keshni `syncGroupTeachersCache()` to'ldiradi.
  //
  // Birinchi urinishda fikstura FAQAT davr yaratgan edi va o'qituvchi
  // O'Z o'quvchisiga ham 403 olardi — ya'ni "musbat nazorat" aslida
  // manfiy edi va egalik tekshiruvi UMUMAN o'lchanmagan bo'lardi.
  await prisma.teacherGroupPeriod.create({
    data: {
      groupId: ownGroup.id, teacherId: teacher.id,
      startDate: new Date(Date.UTC(2020, 0, 1)), endDate: null,
    } });
  await prisma.group.update({
    where: { id: ownGroup.id },
    data: { teachers: { connect: { id: teacher.id } } },
  });

  // A'zoliklar: `student` → ownGroup, `foreign` → foreignGroup.
  await prisma.groupMembership.create({
    data: {
      groupId: ownGroup.id, studentId: student.id,
      joinedAt: new Date(Date.UTC(2020, 0, 1)), leftAt: null,
    } });
  await prisma.groupMembership.create({
    data: {
      groupId: foreignGroup.id, studentId: foreign.id,
      joinedAt: new Date(Date.UTC(2020, 0, 1)), leftAt: null,
    } });

  return { branch, teacher, student, foreign, admin, ownGroup, foreignGroup };
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mOZOD DAVRLARI — PARITET\x1b[0m  (${TAG})`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false }, select: { id: true, role: true } });
  if (!owner) throw new Error('owner topilmadi');
  const ownerToken = mintToken(owner);

  const fx = { [EXPRESS]: await makeFixture('E'), [NEST]: await makeFixture('N') };
  const tok = {};
  for (const base of [EXPRESS, NEST]) {
    tok[base] = {
      teacher: mintToken(fx[base].teacher),
      student: mintToken(fx[base].student),
      admin: mintToken(fx[base].admin),
    };
  }

  const call = (base, method, path, { body, branchId, as } = {}) =>
    request(base, method, path, {
      token: as ? tok[base][as] : ownerToken,
      body,
      headers: branchId ? { 'x-branch-id': branchId } : {},
    });

  const subs = (base) => {
    const f = fx[base];
    const L = base === EXPRESS ? 'E' : 'N';
    return [
      [f.branch.id, '<BR>'], [f.teacher.id, '<TEACHER>'],
      [f.student.id, '<STUDENT>'], [f.foreign.id, '<FOREIGN>'],
      [f.admin.id, '<ADMIN>'],
      [f.ownGroup.id, '<GOWN>'], [f.foreignGroup.id, '<GFOREIGN>'],
      [owner.id, '<OWNER>'],
      [`${TAG.toLowerCase()}_${L.toLowerCase()}`, '<tag>'],
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
  const ranOk = (m) => Boolean(m && m.e && m.n);

  // ─────────────────────────────────────────────────────────────────
  section('1) YARATISH — owner');
  // ─────────────────────────────────────────────────────────────────

  const created = await mirror('POST / (owner)', (base, f) =>
    call(base, 'POST', '/api/attendance-exemptions', {
      branchId: f.branch.id,
      body: {
        student: f.student.id,
        startDate: '2035-03-01',
        endDate: '2035-03-31',
        daysOfWeek: ['mon', 'wed'],
        reason: `${TAG} sabab`,
      },
    }));

  const exId = {
    [EXPRESS]: created.e?.body?.data?.id, [NEST]: created.n?.body?.data?.id };

  for (const base of [EXPRESS, NEST]) {
    const f = fx[base]; const label = base === EXPRESS ? 'express' : 'nest';
    const rows = await prisma.attendanceExemption.findMany({
      where: { studentId: f.student.id } });
    eq(`bazada bitta yozuv (${label})`, rows.length, 1);
    eq(`kunlar saqlandi (${label})`, JSON.stringify(rows[0]?.daysOfWeek),
      JSON.stringify(['mon', 'wed']));
    // `createdById` — aktyor ID si. Express `_id`, NestJS `id` beradi;
    // ikkalasi ham TO'LGAN bo'lishi shart (aks holda jimgina null).
    eq(`createdById to'ldirildi (${label})`, rows[0]?.createdById, owner.id);
  }

  // MANFIY: tugash sanasi boshlanishidan oldin.
  await mirror('POST / (endDate < startDate → 400)', (base, f) =>
    call(base, 'POST', '/api/attendance-exemptions', {
      branchId: f.branch.id,
      body: { student: f.student.id, startDate: '2035-04-10', endDate: '2035-04-01' },
    }));

  // MANFIY: o'quvchi emas (o'qituvchi ID si berilgan).
  await mirror("POST / (o'quvchi emas → 400)", (base, f) =>
    call(base, 'POST', '/api/attendance-exemptions', {
      branchId: f.branch.id,
      body: { student: f.teacher.id, startDate: '2035-04-01' },
    }));

  // MANFIY: noma'lum hafta kuni (validator).
  await mirror("POST / (noma'lum kun → 400)", (base, f) =>
    call(base, 'POST', '/api/attendance-exemptions', {
      branchId: f.branch.id,
      body: { student: f.student.id, startDate: '2035-04-01', daysOfWeek: ['xyz'] },
    }));

  // MANFIY: `student` yo'q (validator).
  await mirror("POST / (student yo'q → 400)", (base, f) =>
    call(base, 'POST', '/api/attendance-exemptions', {
      branchId: f.branch.id, body: { startDate: '2035-04-01' } }));

  // ─────────────────────────────────────────────────────────────────
  section("2) O'QITUVCHI EGALIGI — musbat va manfiy nazorat");
  // ─────────────────────────────────────────────────────────────────

  // MUSBAT: o'qituvchi O'Z guruhidagi o'quvchi uchun ozod davri qo'yadi.
  const byTeacher = await mirror("o'qituvchi O'Z o'quvchisiga qo'yadi (musbat)",
    (base, f) => call(base, 'POST', '/api/attendance-exemptions', {
      as: 'teacher', branchId: f.branch.id,
      body: { student: f.student.id, startDate: '2035-05-01',
        reason: `${TAG} ustoz` },
    }));
  const teacherExId = {
    [EXPRESS]: byTeacher.e?.body?.data?.id, [NEST]: byTeacher.n?.body?.data?.id };

  // MANFIY: BEGONA guruhdagi o'quvchi uchun — rad etiladi.
  await mirror("o'qituvchi BEGONA o'quvchiga qo'ya olmaydi", (base, f) =>
    call(base, 'POST', '/api/attendance-exemptions', {
      as: 'teacher', branchId: f.branch.id,
      body: { student: f.foreign.id, startDate: '2035-05-01' },
    }));
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base]; const label = base === EXPRESS ? 'express' : 'nest';
    eq(`begona o'quvchiga yozuv YOZILMADI (${label})`,
      await prisma.attendanceExemption.count({
        where: { studentId: f.foreign.id } }), 0);
  }

  // MANFIY: o'qituvchi `studentId` siz ro'yxat so'ray olmaydi.
  await mirror("o'qituvchi studentId'siz ro'yxat → 400", (base, f) =>
    call(base, 'GET', '/api/attendance-exemptions', {
      as: 'teacher', branchId: f.branch.id }));

  // MUSBAT: o'z o'quvchisi bo'yicha ro'yxat OCHILADI.
  const tList = await mirror("o'qituvchi O'Z o'quvchisi ro'yxatini ko'radi (musbat)",
    (base, f) => call(base, 'GET',
      `/api/attendance-exemptions?studentId=${f.student.id}`, {
        as: 'teacher', branchId: f.branch.id }));
  if (ranOk(tList)) {
    eq("ro'yxat bo'sh emas (o'lchandi)",
      (tList.e?.body?.data || []).length > 0, true);
  }

  // MANFIY: BEGONA o'quvchi ro'yxatini so'rasa — rad.
  await mirror("o'qituvchi BEGONA o'quvchi ro'yxatini ko'ra olmaydi",
    (base, f) => call(base, 'GET',
      `/api/attendance-exemptions?studentId=${f.foreign.id}`, {
        as: 'teacher', branchId: f.branch.id }));

  // MANFIY: o'qituvchi BEGONA yozuvni tahrirlay olmaydi.
  //
  // ⚠ Nishon `foreign` o'quvchiga tegishli yozuv bo'lishi kerak —
  // uni owner yaratadi (o'qituvchi yarata olmaydi).
  const foreignEx = {};
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    const row = await prisma.attendanceExemption.create({
      data: { studentId: f.foreign.id, startDate: new Date(Date.UTC(2035, 5, 1)),
        reason: `${TAG} begona` } });
    foreignEx[base] = row.id;
  }
  await mirror("o'qituvchi BEGONA yozuvni tahrirlay olmaydi", (base) =>
    call(base, 'PATCH', `/api/attendance-exemptions/${foreignEx[base]}`, {
      as: 'teacher', body: { reason: 'urinish' } }));
  await mirror("o'qituvchi BEGONA yozuvni o'chira olmaydi", (base) =>
    call(base, 'DELETE', `/api/attendance-exemptions/${foreignEx[base]}`, {
      as: 'teacher' }));
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const row = await prisma.attendanceExemption.findUnique({
      where: { id: foreignEx[base] } });
    eq(`begona yozuv o'zgarmadi (${label})`, row?.reason, `${TAG} begona`);
    eq(`begona yozuv o'chmadi (${label})`, row?.isDeleted, false);
  }

  // MUSBAT NAZORAT: o'qituvchi O'Z yozuvini tahrirlay OLADI.
  await mirror("o'qituvchi O'Z yozuvini tahrirlaydi (musbat)", (base) =>
    call(base, 'PATCH', `/api/attendance-exemptions/${teacherExId[base]}`, {
      as: 'teacher', body: { reason: `${TAG} tahrir` } }));

  // ─────────────────────────────────────────────────────────────────
  section('3) RBAC — rol va ruxsat darvozalari');
  // ─────────────────────────────────────────────────────────────────

  // ⚠ QO'RIQCHI TARTIBI: `director` da `attendance.record` BOR, lekin
  // rol ro'yxatida (owner|teacher) YO'Q → ROL xatosi kutiladi.
  // Tartib almashsa RUXSAT xatosi chiqardi va `message` boshqacha
  // bo'lardi.
  await mirror('direktor yarata olmaydi (rol darvozasi)', (base, f) =>
    call(base, 'POST', '/api/attendance-exemptions', {
      as: 'admin', branchId: f.branch.id,
      body: { student: f.student.id, startDate: '2035-06-01' },
    }));

  // O'QUVCHI — na rol, na ruxsat.
  await mirror("o'quvchi yarata olmaydi", (base, f) =>
    call(base, 'POST', '/api/attendance-exemptions', {
      as: 'student', branchId: f.branch.id,
      body: { student: f.student.id, startDate: '2035-06-01' },
    }));
  await mirror("o'quvchi ro'yxatni ko'ra olmaydi", (base, f) =>
    call(base, 'GET', '/api/attendance-exemptions', {
      as: 'student', branchId: f.branch.id }));

  for (const [m, p, body] of [
    ['GET', '/api/attendance-exemptions', undefined],
    ['POST', '/api/attendance-exemptions', {}],
    ['PATCH', '/api/attendance-exemptions/' + 'a'.repeat(24), {}],
    ['DELETE', '/api/attendance-exemptions/' + 'a'.repeat(24), undefined],
  ]) {
    await mirror(`${m} ${p.replace(/a{24}/, ':id')} — autentifikatsiyasiz → 401`,
      (base) => request(base, m, p, { body }));
  }

  // ─────────────────────────────────────────────────────────────────
  section("4) RO'YXAT · TAHRIR · YUMSHOQ O'CHIRISH");
  // ─────────────────────────────────────────────────────────────────

  await mirror('GET / (owner, studentId bilan)', (base, f) =>
    call(base, 'GET', `/api/attendance-exemptions?studentId=${f.student.id}`, {
      branchId: f.branch.id }));
  await mirror('GET /?isActive=true', (base, f) =>
    call(base, 'GET',
      `/api/attendance-exemptions?studentId=${f.student.id}&isActive=true`, {
        branchId: f.branch.id }));
  await mirror('GET /?isActive=false', (base, f) =>
    call(base, 'GET',
      `/api/attendance-exemptions?studentId=${f.student.id}&isActive=false`, {
        branchId: f.branch.id }));
  await mirror('GET /?limit=501 (400)', (base, f) =>
    call(base, 'GET', '/api/attendance-exemptions?limit=501', {
      branchId: f.branch.id }));

  await mirror('PATCH /:id', (base) =>
    call(base, 'PATCH', `/api/attendance-exemptions/${exId[base]}`, {
      body: { reason: `${TAG} yangi sabab`, isActive: false } }));
  await mirror('PATCH /:id (bo\'sh tana → 400)', (base) =>
    call(base, 'PATCH', `/api/attendance-exemptions/${exId[base]}`, { body: {} }));
  await mirror('PATCH /:id (404)', (base) =>
    call(base, 'PATCH', `/api/attendance-exemptions/${'a'.repeat(24)}`, {
      body: { reason: 'x' } }));

  // ⚠ FAQAT `endDate` o'zgartirilganda ESKI `startDate` bilan
  // solishtirilishi SHART — Prisma faqat berilgan maydonni yangilaydi.
  await mirror("PATCH /:id (faqat endDate, eski startDate bilan zid → 400)",
    (base) => call(base, 'PATCH', `/api/attendance-exemptions/${exId[base]}`, {
      body: { endDate: '2035-02-01' } }));

  await mirror('DELETE /:id', (base) =>
    call(base, 'DELETE', `/api/attendance-exemptions/${exId[base]}`, {}));
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const row = await prisma.attendanceExemption.findUnique({
      where: { id: exId[base] } });
    // YUMSHOQ o'chirish — hujjat qoladi.
    eq(`hujjat saqlanib qoldi (${label})`, Boolean(row), true);
    eq(`isDeleted bayrog'i (${label})`, row?.isDeleted, true);
    eq(`deletedBy to'ldirildi (${label})`, row?.deletedBy, owner.id);
  }
  await mirror('DELETE /:id (qayta → 404)', (base) =>
    call(base, 'DELETE', `/api/attendance-exemptions/${exId[base]}`, {}));

  // O'chirilgan yozuv RO'YXATDAN CHIQADI.
  const after = await mirror("o'chirilgandan keyin ro'yxat", (base, f) =>
    call(base, 'GET', `/api/attendance-exemptions?studentId=${f.student.id}`, {
      branchId: f.branch.id }));
  if (ranOk(after)) {
    const ids = (after.e?.body?.data || []).map((r) => String(r.id));
    eq("o'chirilgan yozuv ro'yxatda yo'q", ids.includes(String(exId[EXPRESS])), false);
  }
};

run()
  .catch((err) => { console.error('\x1b[31mTEST YIQILDI:\x1b[0m', err); R.fail += 1; })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect().catch(() => {});
    process.exit(finish());
  });
