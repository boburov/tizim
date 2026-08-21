/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GURUHLAR — YOZISH YO'LLARI PARITETI (FAZA 5b, 11/11 marshrut).
 *
 * Express `groups.routes.js` ning YOZISH qismi ↔ NestJS `GroupsController`.
 *
 * ── NIMA ISBOTLANADI ──
 *   1. `POST /groups` — guruh + jadval + TARIF + o'qituvchi DAVRI + maosh
 *      yozuvi bir amalda yaratiladi (baza holati solishtiriladi).
 *   2. `PATCH /groups/:id` — jadval VERSIYALASH: eski qatorlar TARIX
 *      uchun saqlanadi, yangisi `effectiveFrom` bilan ustiga qo'shiladi.
 *   3. ORQAGA SANA QO'RIQCHISI: o'tgan oyga qo'shish QARZ yaratadi;
 *      limitdan oshsa 202 (a'zolik YARATILMAYDI), aks holda 201 + qarz.
 *   4. `POST /:id/students/bulk` — dars TO'QNASHUVI topilsa HECH KIM
 *      qo'shilmaydi (200 + `requiresConfirmation`).
 *   5. `DELETE /:id/students/:studentId` — qarz bo'lsa 409
 *      (`OUTSTANDING_DEBT`), `writeOff:true` bilan yomon qarz yoziladi.
 *   6. `DELETE /:id/memberships/:id` — TO'LANGAN davr o'chirilmaydi.
 *   7. `DELETE /:id/permanent` — moliyaviy tarixi bor guruh 409
 *      (`GROUP_HAS_FINANCIAL_HISTORY`); toza guruh esa nomi tasdiqlansa
 *      o'chadi va HECH QANDAY yetim qator qolmaydi.
 *   8. FILIAL IZOLYATSIYASI har bir yozuv marshrutida.
 *
 * ⚠ HAR STEKKA O'Z FIKSTURASI (ko'zgu): mutatsiyani bir xil so'rovni
 * ikki marta yuborib sinab bo'lmaydi — ikkinchi chaqiruv birinchisining
 * natijasini ko'radi.
 *
 * ⚠ "Muvaffaqiyatli HTTP javob" YETARLI EMAS — har bir amaldan keyin
 * BAZA holati ham solishtiriladi.
 *
 * ISHLATISH:  npm run test:groups-write-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, normalize, nowStamps, mintToken,
  waitForStacks, createReporter,
} from './_harness.mjs';

const prisma = new PrismaClient();
const TAG = `GW-${Date.now().toString(36)}`;
const { R, ok, bad, skip, section, finish } = createReporter('groups-write');

const made = { branches: [], users: [], groups: [], rooms: [] };

const RUN_IP = `198.51.100.${(Number(process.hrtime.bigint() % 200n) + 20)}`;

const DAY = 24 * 60 * 60 * 1000;
const todayUtc = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};
const iso = (d) => d.toISOString().slice(0, 10);
/** `n` oy oldingi oyning 1-kuni. */
const monthsAgoFirst = (n) => {
  const t = todayUtc();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - n, 1));
};

const FEE = 300_000;

const cleanup = async () => {
  const b = made.branches;
  const u = made.users;
  const g = made.groups;
  try {
    if (g.length) {
      await prisma.paymentTransaction.deleteMany({ where: { groupId: { in: g } } });
      await prisma.debtWriteOffBreakdown.deleteMany({
        where: { payment: { groupId: { in: g } } } });
      await prisma.debtWriteOff.deleteMany({ where: { groupId: { in: g } } });
      await prisma.studentPayment.deleteMany({ where: { groupId: { in: g } } });
      await prisma.groupFee.deleteMany({ where: { groupId: { in: g } } });
      await prisma.discount.deleteMany({ where: { groupId: { in: g } } });
      await prisma.salaryTransaction.deleteMany({ where: { groupId: { in: g } } });
      await prisma.teacherSalary.deleteMany({ where: { groupId: { in: g } } });
      await prisma.teacherGroupPeriod.deleteMany({ where: { groupId: { in: g } } });
      await prisma.groupMembership.deleteMany({ where: { groupId: { in: g } } });
      await prisma.attendance.deleteMany({ where: { groupId: { in: g } } });
      await prisma.grade.deleteMany({ where: { groupId: { in: g } } });
      await prisma.teacherAbsence.deleteMany({ where: { groupId: { in: g } } });
      await prisma.feedback.deleteMany({ where: { groupId: { in: g } } });
      await prisma.lessonCancellation.deleteMany({ where: { groupId: { in: g } } });
    }
    if (u.length) {
      await prisma.depositTransaction.deleteMany({ where: { studentId: { in: u } } });
      await prisma.studentDeposit.deleteMany({ where: { studentId: { in: u } } });
      await prisma.teacherCompensation.deleteMany({ where: { teacherId: { in: u } } });
    }
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
      await prisma.systemNotification.deleteMany({
        where: { message: { contains: TAG } } }).catch(() => {});
      await prisma.account.deleteMany({ where: { branchId: { in: b } } });
    }
    // Guruhlar test davomida HTTP orqali ham yaratiladi — TAG bo'yicha.
    await prisma.groupScheduleItem.deleteMany({
      where: { group: { name: { contains: TAG } } } }).catch(() => {});
    const allGroups = await prisma.group.findMany({
      where: { name: { contains: TAG } }, select: { id: true } });
    for (const gr of allGroups) {
      await prisma.group.update({
        where: { id: gr.id }, data: { teachers: { set: [] } } }).catch(() => {});
    }
    const gids = allGroups.map((x) => x.id);
    if (gids.length) {
      await prisma.paymentTransaction.deleteMany({ where: { groupId: { in: gids } } });
      await prisma.debtWriteOffBreakdown.deleteMany({
        where: { payment: { groupId: { in: gids } } } });
      await prisma.debtWriteOff.deleteMany({ where: { groupId: { in: gids } } });
      await prisma.studentPayment.deleteMany({ where: { groupId: { in: gids } } });
      await prisma.groupFee.deleteMany({ where: { groupId: { in: gids } } });
      await prisma.teacherSalary.deleteMany({ where: { groupId: { in: gids } } });
      await prisma.teacherGroupPeriod.deleteMany({ where: { groupId: { in: gids } } });
      await prisma.groupMembership.deleteMany({ where: { groupId: { in: gids } } });
      await prisma.group.deleteMany({ where: { id: { in: gids } } });
    }
    if (made.rooms.length) {
      await prisma.room.deleteMany({ where: { id: { in: made.rooms } } });
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

/** ⚠ QOLDIQ O'LCHANADI, TAXMIN QILINMAYDI. */
const assertNoResidue = async () => {
  const left = {
    branches: await prisma.branch.count({ where: { code: { startsWith: TAG } } }),
    users: await prisma.user.count({ where: { lastName: { contains: TAG } } }),
    groups: await prisma.group.count({ where: { name: { contains: TAG } } }),
  };
  const total = left.branches + left.users + left.groups;
  if (total === 0) ok("tozalash — QOLDIQ YO'Q (o'lchandi)");
  else bad('tozalash — QOLDIQ QOLDI', JSON.stringify(left));
};

const makeFixture = async (label) => {
  const mkBranch = async (n, threshold) => {
    const b = await prisma.branch.create({
      data: {
        name: `${TAG} ${label}${n}`, code: `${TAG}${label}${n}`,
        expenseApprovalThreshold: threshold,
      } });
    made.branches.push(b.id);
    return b;
  };
  // A: chegara JUDA baland → orqaga sana tasdiqsiz o'tadi.
  const A = await mkBranch('A', 100_000_000);
  const B = await mkBranch('B', 100_000_000);
  // P: chegara 1 → HAR QANDAY orqaga sana tasdiqqa tushadi.
  const P = await mkBranch('P', 1);

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

  const HIRED = new Date(Date.UTC(todayUtc().getUTCFullYear() - 2, 0, 1));
  const ENROLLED = new Date(Date.UTC(todayUtc().getUTCFullYear() - 2, 0, 1));

  const teacher = await mk('Ustoz', 'teacher', A, { hiredAt: HIRED });
  const teacherP = await mk('Ustozp', 'teacher', P, { hiredAt: HIRED });
  const s1 = await mk('Talabbir', 'student', A, { enrolledAt: ENROLLED });
  const s2 = await mk('Talabikki', 'student', A, { enrolledAt: ENROLLED });
  const s3 = await mk('Talabuch', 'student', A, { enrolledAt: ENROLLED });
  const sP = await mk('Talabp', 'student', P, { enrolledAt: ENROLLED });
  const dirA = await mk('Dira', 'director', A);
  const dirB = await mk('Dirb', 'director', B);
  const dirP = await mk('Dirp', 'director', P);

  const room = await prisma.room.create({
    data: { branchId: A.id, name: `${TAG}${label} xona`, capacity: 20 } });
  made.rooms.push(room.id);
  const roomB = await prisma.room.create({
    data: { branchId: B.id, name: `${TAG}${label} xonaB`, capacity: 20 } });
  made.rooms.push(roomB.id);

  /**
   * ⚠ TO'QNASHUV NISHONI: `s3` boshqa AKTIV guruhda AYNI vaqtda dars
   * oladi — `bulk` qo'shishda `requiresConfirmation` shu orqali
   * o'lchanadi.
   */
  const clash = await prisma.group.create({
    data: {
      branchId: A.id, name: `${TAG}${label} toqnash`, isActive: true,
      startDate: monthsAgoFirst(6),
    } });
  made.groups.push(clash.id);
  // ⚠ VAQT `GMAIN` NING JADVAL VERSIYALASHDAN KEYINGI AMALDAGI
  // versiyasiga (`tue 14:00-16:00`) mos bo'lishi SHART — aks holda
  // to'qnashuv umuman bo'lmaydi va test "tasdiq so'ralmadi" deb
  // YOLG'ON qizil berardi.
  await prisma.groupScheduleItem.create({
    data: {
      groupId: clash.id, day: 'tue', startTime: '14:00', endTime: '16:00',
      effectiveFrom: new Date(Date.UTC(2020, 0, 1)),
    } });
  await prisma.groupMembership.create({
    data: { groupId: clash.id, studentId: s3.id, joinedAt: monthsAgoFirst(6) } });

  /** SOFT-DELETE qilingan guruh — `POST /:id/undelete` nishoni. */
  const deleted = await prisma.group.create({
    data: {
      branchId: A.id, name: `${TAG}${label} ochirilgan`, isActive: true,
      startDate: monthsAgoFirst(3), isDeleted: true, deletedAt: new Date(),
    } });
  made.groups.push(deleted.id);

  return {
    A, B, P, teacher, teacherP, s1, s2, s3, sP,
    dirA, dirB, dirP, room, roomB, clash, deleted,
  };
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mGURUHLAR — YOZISH PARITETI\x1b[0m  (${TAG})`);
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

  /** HTTP orqali yaratilgan guruhlarning stekka xos ID'lari. */
  const created = { [EXPRESS]: {}, [NEST]: {} };

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
    const c = created[base];
    const L = base === EXPRESS ? 'E' : 'N';
    return [
      // ⚠ ISMLARDAGI STEK HARFI — UZUNROG'I OLDIN.
      [`Talabbir${L}`, '<N-S1>'], [`Talabikki${L}`, '<N-S2>'],
      [`Talabuch${L}`, '<N-S3>'], [`Talabp${L}`, '<N-SP>'],
      [`Ustozp${L}`, '<N-TP>'], [`Ustoz${L}`, '<N-T>'],
      [`Dira${L}`, '<N-DA>'], [`Dirb${L}`, '<N-DB>'], [`Dirp${L}`, '<N-DP>'],
      ...Object.entries(c).map(([k, v]) => [String(v), `<${k}>`]),
      [f.A.id, '<A>'], [f.B.id, '<B>'], [f.P.id, '<P>'],
      [f.teacher.id, '<T>'], [f.teacherP.id, '<TP>'],
      [f.s1.id, '<S1>'], [f.s2.id, '<S2>'], [f.s3.id, '<S3>'], [f.sP.id, '<SP>'],
      [f.dirA.id, '<DA>'], [f.dirB.id, '<DB>'], [f.dirP.id, '<DP>'],
      [f.room.id, '<ROOM>'], [f.roomB.id, '<ROOMB>'],
      [f.clash.id, '<CLASH>'], [f.deleted.id, '<DEL>'],
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

  const mirror = async (name, fn, onEach = null) => {
    let e, n;
    try {
      e = await fn(EXPRESS, fx[EXPRESS]);
      if (onEach) onEach(EXPRESS, e);
      n = await fn(NEST, fx[NEST]);
      if (onEach) onEach(NEST, n);
    } catch (err) { skip(name, err.message); return {}; }
    if (rateLimited(e) || rateLimited(n)) {
      skip(name, '429 — Express tezlik chegarasi (200/daq)'); return {};
    }
    if (e.status >= 500 || n.status >= 500) {
      skip(name,
        `server xatosi — express=${e.status} ${JSON.stringify(e.body).slice(0, 250)}, ` +
        `nest=${n.status} ${JSON.stringify(n.body).slice(0, 250)}`);
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
    let e, n;
    try { e = await fn(fx[EXPRESS], created[EXPRESS]); n = await fn(fx[NEST], created[NEST]); }
    catch (err) { skip(name, err.message); return null; }
    if (JSON.stringify(e) === JSON.stringify(n)) { ok(`${name} — ${JSON.stringify(e)}`); return e; }
    bad(name, `express: ${JSON.stringify(e)}\n      nest   : ${JSON.stringify(n)}`);
    return null;
  };

  const GROUP_START = monthsAgoFirst(2);
  const GROUP_END = new Date(Date.UTC(todayUtc().getUTCFullYear() + 1, 5, 1));

  const createBody = (f, name, extra = {}) => ({
    branchId: f.A.id,
    name: `${TAG}${name}`,
    roomId: f.room.id,
    schedule: [{ day: 'mon', startTime: '10:00', endTime: '12:00' }],
    teachers: [f.teacher.id],
    startDate: iso(GROUP_START),
    endDate: iso(GROUP_END),
    monthlyPrice: FEE,
    ...extra,
  });

  // ═══════════════════════════════════════════════════════════════════
  section('POST /groups');
  // ═══════════════════════════════════════════════════════════════════

  const mkGroup = await mirror(
    'POST /groups',
    (base, f) => call(base, 'POST', '/api/groups', {
      branchId: f.A.id, body: createBody(f, ' asosiy'),
    }),
    (base, r) => { if (r?.body?.data?.id) created[base].GMAIN = r.body.data.id; },
  );
  const createOk = expectStatus(mkGroup, 201, 'POST /groups');

  if (createOk) {
    await bothDb('yaratilgandan keyin BAZA holati', async (f, c) => {
      const g = await prisma.group.findUnique({
        where: { id: c.GMAIN },
        include: { schedule: true, teachers: { select: { id: true } } },
      });
      const fee = await prisma.groupFee.count({ where: { groupId: c.GMAIN } });
      const period = await prisma.teacherGroupPeriod.count({
        where: { groupId: c.GMAIN, isDeleted: false } });
      const salary = await prisma.teacherSalary.count({ where: { groupId: c.GMAIN } });
      return {
        active: g.isActive, slots: g.schedule.length, teachers: g.teachers.length,
        fee, period, salary,
      };
    });
  }

  await mirror('POST /groups — begona filial rad etiladi', (base, f) =>
    call(base, 'POST', '/api/groups', {
      branchId: f.B.id, as: 'dirB',
      body: { ...createBody(f, ' begona'), branchId: f.A.id },
    }));

  await mirror("POST /groups — xona BOSHQA filialda → 400", (base, f) =>
    call(base, 'POST', '/api/groups', {
      branchId: f.A.id,
      body: { ...createBody(f, ' xonaxato'), roomId: f.roomB.id },
    }));

  // ═══════════════════════════════════════════════════════════════════
  section('PATCH /groups/:id');
  // ═══════════════════════════════════════════════════════════════════

  const patched = await mirror('PATCH /groups/:id (nom)', (base, f) => {
    const id = created[base].GMAIN;
    if (!id) throw new Error('guruh yaratilmagan');
    return call(base, 'PATCH', `/api/groups/${id}`, {
      branchId: f.A.id, body: { name: `${TAG} yangi nom` },
    });
  });
  expectStatus(patched, 200, 'PATCH /groups/:id');

  const patchedSch = await mirror('PATCH /groups/:id (jadval versiyalash)', (base, f) => {
    const id = created[base].GMAIN;
    if (!id) throw new Error('guruh yaratilmagan');
    return call(base, 'PATCH', `/api/groups/${id}`, {
      branchId: f.A.id,
      body: {
        schedule: [{ day: 'tue', startTime: '14:00', endTime: '16:00' }],
        scheduleEffectiveFrom: iso(todayUtc()),
      },
    });
  });
  if (expectStatus(patchedSch, 200, 'PATCH jadval')) {
    await bothDb('ESKI jadval TARIX uchun saqlandi', async (f, c) => {
      const rows = await prisma.groupScheduleItem.findMany({
        where: { groupId: c.GMAIN },
        select: { day: true, startTime: true },
        orderBy: [{ day: 'asc' }, { startTime: 'asc' }],
      });
      return rows;
    });
  }

  await mirror('PATCH /groups/:id — begona filial rad etiladi', (base, f) => {
    const id = created[base].GMAIN;
    if (!id) throw new Error('guruh yaratilmagan');
    return call(base, 'PATCH', `/api/groups/${id}`, {
      branchId: f.B.id, as: 'dirB', body: { name: 'x' },
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  section("O'QUVCHI QO'SHISH (orqaga sana)");
  // ═══════════════════════════════════════════════════════════════════

  await mirror('GET /:id/students/backdate-preview', (base, f) => {
    const id = created[base].GMAIN;
    if (!id) throw new Error('guruh yaratilmagan');
    return call(base, 'GET',
      `/api/groups/${id}/students/backdate-preview?joinedAt=${iso(GROUP_START)}`,
      { branchId: f.A.id });
  });

  const added = await mirror('POST /:id/students (orqaga sana, limitdan past)',
    (base, f) => {
      const id = created[base].GMAIN;
      if (!id) throw new Error('guruh yaratilmagan');
      return call(base, 'POST', `/api/groups/${id}/students`, {
        branchId: f.A.id,
        body: { studentId: f.s1.id, joinedAt: iso(GROUP_START) },
      });
    });
  const addOk = expectStatus(added, 201, "POST /:id/students");

  if (addOk) {
    await bothDb("qo'shilgandan keyin QARZ yozildi", async (f, c) => {
      const rows = await prisma.studentPayment.findMany({
        where: { studentId: f.s1.id, groupId: c.GMAIN },
        select: { year: true, month: true, expectedAmount: true, paidAmount: true },
        orderBy: [{ year: 'asc' }, { month: 'asc' }],
      });
      return rows.map((r) => ({
        y: r.year, m: r.month,
        exp: Number(r.expectedAmount), paid: Number(r.paidAmount),
      }));
    });
  }

  await mirror("POST /:id/students — DUBLIKAT → 409", (base, f) => {
    const id = created[base].GMAIN;
    if (!id) throw new Error('guruh yaratilmagan');
    return call(base, 'POST', `/api/groups/${id}/students`, {
      branchId: f.A.id,
      body: { studentId: f.s1.id, joinedAt: iso(GROUP_START) },
    });
  });

  await mirror("POST /:id/students — guruh boshlanishidan OLDIN → 400", (base, f) => {
    const id = created[base].GMAIN;
    if (!id) throw new Error('guruh yaratilmagan');
    return call(base, 'POST', `/api/groups/${id}/students`, {
      branchId: f.A.id,
      body: {
        studentId: f.s2.id,
        joinedAt: iso(new Date(GROUP_START.getTime() - 40 * DAY)),
      },
    });
  });

  // ── TASDIQ GATE'i: P filialida chegara 1 → har qanday qarz tasdiqqa ──
  const gatedGroup = await mirror(
    'POST /groups (P filial, tasdiq gate uchun)',
    (base, f) => call(base, 'POST', '/api/groups', {
      branchId: f.P.id, body: {
        branchId: f.P.id,
        name: `${TAG} p guruh`,
        schedule: [{ day: 'wed', startTime: '09:00', endTime: '11:00' }],
        teachers: [f.teacherP.id],
        startDate: iso(GROUP_START),
        monthlyPrice: FEE,
      },
    }),
    (base, r) => { if (r?.body?.data?.id) created[base].GP = r.body.data.id; },
  );
  expectStatus(gatedGroup, 201, 'POST /groups (P)');

  const gatedAdd = await mirror('POST /:id/students — limitdan oshdi → 202', (base, f) => {
    const id = created[base].GP;
    if (!id) throw new Error('P guruh yaratilmagan');
    return call(base, 'POST', `/api/groups/${id}/students`, {
      branchId: f.P.id, as: 'dirP',
      body: { studentId: f.sP.id, joinedAt: iso(GROUP_START), requestNote: 'parity' },
    });
  });
  if (expectStatus(gatedAdd, 202, 'orqaga sana tasdiqqa')) {
    await bothDb("202 dan keyin A'ZOLIK YARATILMADI", async (f, c) =>
      prisma.groupMembership.count({
        where: { groupId: c.GP, studentId: f.sP.id, isDeleted: false } }));
    await bothDb('202 dan keyin TASDIQ SO\'ROVI bor', async (f) =>
      prisma.approval.count({
        where: { branchId: f.P.id, kind: 'membership_backdate' } }));
  }

  // ═══════════════════════════════════════════════════════════════════
  section("OMMAVIY QO'SHISH (to'qnashuv)");
  // ═══════════════════════════════════════════════════════════════════

  const bulkClash = await mirror(
    "POST /:id/students/bulk — dars to'qnashuvi → 200 + tasdiq",
    (base, f) => {
      const id = created[base].GMAIN;
      if (!id) throw new Error('guruh yaratilmagan');
      return call(base, 'POST', `/api/groups/${id}/students/bulk`, {
        branchId: f.A.id,
        body: { studentIds: [f.s3.id], joinedAt: iso(todayUtc()) },
      });
    });
  if (expectStatus(bulkClash, 200, "bulk to'qnashuv")) {
    await bothDb("to'qnashuvda HECH KIM qo'shilmadi", async (f, c) =>
      prisma.groupMembership.count({
        where: { groupId: c.GMAIN, studentId: f.s3.id, isDeleted: false } }));
  }

  const bulkForce = await mirror('POST /:id/students/bulk — force → 201', (base, f) => {
    const id = created[base].GMAIN;
    if (!id) throw new Error('guruh yaratilmagan');
    return call(base, 'POST', `/api/groups/${id}/students/bulk`, {
      branchId: f.A.id,
      body: { studentIds: [f.s2.id, f.s3.id], joinedAt: iso(todayUtc()), force: true },
    });
  });
  expectStatus(bulkForce, 201, 'bulk force');

  // ═══════════════════════════════════════════════════════════════════
  section("A'ZOLIK SANALARI");
  // ═══════════════════════════════════════════════════════════════════

  await mirror("GET /:id/students/:sid/memberships", (base, f) => {
    const id = created[base].GMAIN;
    if (!id) throw new Error('guruh yaratilmagan');
    return call(base, 'GET', `/api/groups/${id}/students/${f.s2.id}/memberships`,
      { branchId: f.A.id });
  });

  const memPatch = await mirror('PATCH /:id/students/:sid (sanalar)', (base, f) => {
    const id = created[base].GMAIN;
    if (!id) throw new Error('guruh yaratilmagan');
    return call(base, 'PATCH', `/api/groups/${id}/students/${f.s2.id}`, {
      branchId: f.A.id,
      body: { joinedAt: iso(new Date(todayUtc().getTime() - 3 * DAY)) },
    });
  });
  expectStatus(memPatch, 200, "PATCH a'zolik sanalari");

  const memById = async (f, c, studentId) => {
    const m = await prisma.groupMembership.findFirst({
      where: { groupId: c.GMAIN, studentId, isDeleted: false },
      select: { id: true },
    });
    return m?.id || null;
  };

  const memIdPatch = await mirror('PATCH /:id/memberships/:mid', async (base, f) => {
    const c = created[base];
    const mid = await memById(f, c, f.s3.id);
    if (!mid) throw new Error("a'zolik yo'q");
    return call(base, 'PATCH', `/api/groups/${c.GMAIN}/memberships/${mid}`, {
      branchId: f.A.id,
      body: { joinedAt: iso(new Date(todayUtc().getTime() - 2 * DAY)) },
    });
  });
  expectStatus(memIdPatch, 200, 'PATCH membership by id');

  const memIdDel = await mirror('DELETE /:id/memberships/:mid', async (base, f) => {
    const c = created[base];
    const mid = await memById(f, c, f.s3.id);
    if (!mid) throw new Error("a'zolik yo'q");
    return call(base, 'DELETE', `/api/groups/${c.GMAIN}/memberships/${mid}`,
      { branchId: f.A.id });
  });
  if (ranOk(memIdDel)) {
    await bothDb("o'chirilgandan keyin a'zolik holati", async (f, c) =>
      prisma.groupMembership.count({
        where: { groupId: c.GMAIN, studentId: f.s3.id, isDeleted: false } }));
  }

  // ═══════════════════════════════════════════════════════════════════
  section("GURUHDAN CHIQARISH (qarz + write-off)");
  // ═══════════════════════════════════════════════════════════════════

  const rmDebt = await mirror('DELETE /:id/students/:sid — qarz bor → 409', (base, f) => {
    const id = created[base].GMAIN;
    if (!id) throw new Error('guruh yaratilmagan');
    return call(base, 'DELETE', `/api/groups/${id}/students/${f.s1.id}`,
      { branchId: f.A.id, body: {} });
  });
  expectStatus(rmDebt, 409, 'qarzli chiqarish');

  const rmWriteOff = await mirror(
    "DELETE /:id/students/:sid — writeOff:true → 200", (base, f) => {
      const id = created[base].GMAIN;
      if (!id) throw new Error('guruh yaratilmagan');
      return call(base, 'DELETE', `/api/groups/${id}/students/${f.s1.id}`, {
        branchId: f.A.id, body: { writeOff: true },
      });
    });
  if (expectStatus(rmWriteOff, 200, 'write-off bilan chiqarish')) {
    await bothDb('write-off BAZA holati', async (f, c) => {
      const wo = await prisma.debtWriteOff.count({
        where: { groupId: c.GMAIN, studentId: f.s1.id } });
      const plans = await prisma.studentPayment.count({
        where: { groupId: c.GMAIN, studentId: f.s1.id, writtenOff: true } });
      const m = await prisma.groupMembership.count({
        where: { groupId: c.GMAIN, studentId: f.s1.id, leftAt: { not: null } } });
      return { writeOffs: wo, writtenOffPlans: plans, closedMemberships: m };
    });

    await bothDb('JURNAL: debet = kredit', async (f) => {
      const entries = await prisma.journalEntry.findMany({
        where: { branchId: f.A.id },
        select: { id: true, lines: { select: { debit: true, credit: true } } },
      });
      let unbalanced = 0;
      for (const e of entries) {
        const d = e.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
        const cr = e.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
        if (Math.abs(d - cr) > 0.005) unbalanced += 1;
      }
      return { entries: entries.length, unbalanced };
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  section('QAYTARISH VA BUTUNLAY O\'CHIRISH');
  // ═══════════════════════════════════════════════════════════════════

  const undel = await mirror('POST /:id/undelete', (base, f) =>
    call(base, 'POST', `/api/groups/${f.deleted.id}/undelete`, { branchId: f.A.id }));
  if (expectStatus(undel, 200, 'POST /:id/undelete')) {
    await bothDb('qaytarilgandan keyin isDeleted', async (f) => {
      const g = await prisma.group.findUnique({
        where: { id: f.deleted.id }, select: { isDeleted: true } });
      return g?.isDeleted;
    });
  }

  await mirror("DELETE /:id/permanent — nom noto'g'ri → 400", (base, f) =>
    call(base, 'DELETE', `/api/groups/${f.deleted.id}/permanent`, {
      branchId: f.A.id, body: { confirmName: 'xato nom' },
    }));

  const permOk = await mirror('DELETE /:id/permanent — toza guruh → 200', (base, f) =>
    call(base, 'DELETE', `/api/groups/${f.deleted.id}/permanent`, {
      branchId: f.A.id, body: { confirmName: `${TAG}${base === EXPRESS ? 'E' : 'N'} ochirilgan` },
    }));
  if (expectStatus(permOk, 200, "DELETE /:id/permanent (toza)")) {
    await bothDb("o'chirilgandan keyin guruh YO'Q", async (f) =>
      prisma.group.count({ where: { id: f.deleted.id } }));
  }

  // ═══════════════════════════════════════════════════════════════════
  section("MOLIYAVIY TARIXI BOR GURUH O'CHIRILMAYDI");
  //
  // ⚠ 409 SHOXIGA YETIB BORISH UCHUN GURUHDA HAQIQIY JURNAL YOZUVI
  // BO'LISHI SHART. Write-off jurnalga yozmaydi (o'lchandi: 0 yozuv),
  // shuning uchun `s2` ning joriy oy rejasi HAQIQIY to'lov bilan
  // yopiladi — o'shanda kirim jurnal yozuvi paydo bo'ladi.
  // ═══════════════════════════════════════════════════════════════════

  const planOfS2 = async (f, c) => {
    const t = todayUtc();
    const p = await prisma.studentPayment.findFirst({
      where: {
        groupId: c.GMAIN, studentId: f.s2.id,
        year: t.getUTCFullYear(), month: t.getUTCMonth() + 1,
      },
      select: { id: true, expectedAmount: true },
    });
    return p;
  };

  const payS2 = await mirror('POST /finance/transactions (s2 joriy oy)',
    async (base, f) => {
      const p = await planOfS2(f, created[base]);
      if (!p) throw new Error("s2 uchun joriy oy rejasi yo'q");
      const amount = Number(p.expectedAmount);
      if (amount <= 0) throw new Error(`s2 rejasi 0 (${amount})`);
      return call(base, 'POST', '/api/finance/transactions', {
        branchId: f.A.id,
        body: { paymentId: p.id, amount, method: 'cash' },
      });
    });
  const paidOk = expectStatus(payS2, 201, "s2 to'lovi");

  if (paidOk) {
    await bothDb("JURNAL: yozuv BOR va debet = kredit", async (f, c) => {
      const entries = await prisma.journalEntry.findMany({
        where: { groupId: c.GMAIN },
        select: { id: true, lines: { select: { debit: true, credit: true } } },
      });
      let unbalanced = 0;
      for (const e of entries) {
        const d = e.lines.reduce((s2, l) => s2 + Number(l.debit || 0), 0);
        const cr = e.lines.reduce((s2, l) => s2 + Number(l.credit || 0), 0);
        if (Math.abs(d - cr) > 0.005) unbalanced += 1;
      }
      return { entries: entries.length, unbalanced };
    });
  }

  // Guruhda AKTIV o'quvchi qolmasin — aks holda 409 shoxiga
  // yetib bormasdan 400 ("o'quvchilar bor") qaytardi.
  const rmS2 = await mirror("DELETE /:id/students/:sid (s2, qarzsiz)", (base, f) => {
    const id = created[base].GMAIN;
    if (!id) throw new Error('guruh yaratilmagan');
    return call(base, 'DELETE', `/api/groups/${id}/students/${f.s2.id}`,
      { branchId: f.A.id, body: {} });
  });
  expectStatus(rmS2, 200, 's2 chiqarish');

  // ⚠ `s3` HAM chiqarilishi shart: uning `o'qish davri` o'chirilmagan
  // edi (unda QARZ bor va qo'riqchi 400 bergan). Aks holda guruhda
  // aktiv o'quvchi qolib, 409 shoxiga yetib bormasdik.
  const rmS3 = await mirror("DELETE /:id/students/:sid (s3, write-off)", (base, f) => {
    const id = created[base].GMAIN;
    if (!id) throw new Error('guruh yaratilmagan');
    return call(base, 'DELETE', `/api/groups/${id}/students/${f.s3.id}`,
      { branchId: f.A.id, body: { writeOff: true } });
  });
  expectStatus(rmS3, 200, 's3 chiqarish');

  await bothDb("guruhda AKTIV o'quvchi qolmadi", async (f, c) =>
    prisma.groupMembership.count({
      where: { groupId: c.GMAIN, leftAt: null, isDeleted: false } }));

  const permBlocked = await mirror(
    'DELETE /:id/permanent — moliyaviy tarix → 409', (base, f) => {
      const id = created[base].GMAIN;
      if (!id) throw new Error('guruh yaratilmagan');
      return call(base, 'DELETE', `/api/groups/${id}/permanent`, {
        branchId: f.A.id, body: { confirmName: `${TAG} yangi nom` },
      });
    });
  expectStatus(permBlocked, 409, 'moliyaviy tarixli guruh');

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
