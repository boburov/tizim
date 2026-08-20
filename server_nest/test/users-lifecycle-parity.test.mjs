/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 2.5b — FOYDALANUVCHI HAYOT SIKLI PARITETI (Express 5000 ↔ NestJS 5001)
 *
 * Qamrov:
 *   POST   /api/users/staff          (xodim yaratish)
 *   DELETE /api/users/:id            (arxivlash)
 *   POST   /api/users/:id/restore    (qaytarish)
 *   DELETE /api/users/:id/permanent  (butunlay o'chirish, owner-only)
 *
 * ── ⚠ NEGA BU TEST O'Z FIXTURE'INI YARATADI ──
 *
 * `users-parity.test.mjs` mavjud `qa_*` odamlaridan foydalanadi va har
 * qadamdan keyin holatni TIKLAYDI. Bu yerda esa amallardan biri
 * QAYTARIB BO'LMAYDI (hard delete) — tiklash mumkin emas. Shuning uchun
 * nishonlar shu testning O'ZI tomonidan yaratiladi (`qa_lc_` prefiksi) va
 * oxirida to'liq o'chiriladi.
 *
 * ── ⚠ MUSBAT NAZORAT: "RAD ETILDI" YETARLI EMAS ──
 *
 * Har bir TO'SIQ testi ikki qismdan iborat:
 *   1) to'siq shartini ISBOTLAYDI (o'qituvchida haqiqatan maosh yozuvi
 *      bor, o'quvchi haqiqatan guruhda);
 *   2) so'ngra rad etilishini tekshiradi.
 * Shartsiz "400 keldi" degan xulosa yolg'on bo'lardi: nishon aslida
 * himoyalanmagan bo'lsa ham 400 boshqa sababdan (mas. validatsiya)
 * kelishi mumkin. Bundan tashqari — agar to'siq ISHLAMASA, biz haqiqiy
 * ma'lumotni o'chirib yuborgan bo'lardik.
 *
 * ── HARD DELETE PARITETI QANDAY O'LCHANADI ──
 *
 * Bir yozuvni ikki marta o'chirib bo'lmaydi. Shuning uchun har bir holat
 * uchun IKKI EGIZAK yaratiladi: birini Express o'chiradi, ikkinchisini
 * NestJS. Javoblar va QOLDIQ MA'LUMOT (refresh token, activity log,
 * archive log, bot ulanishi) ikkalasida ham bir xil tozalanganini
 * tekshiramiz.
 *
 * ISHLATISH:
 *   node test/users-lifecycle-parity.test.mjs
 *   EXPRESS_URL=... NEST_URL=... node test/users-lifecycle-parity.test.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const EXPRESS = process.env.EXPRESS_URL || 'http://127.0.0.1:5000';
const NEST = process.env.NEST_URL || 'http://127.0.0.1:5001';

const OWNER = { login: 'owner', password: 'owner123' };
const PW = 'qa123456';
const PREFIX = 'qa_lc_';

// ⚠ XOM klient (kengaytmasiz): fixture `passwordHash` YOZADI, kengaytirilgan
// klientda esa u global `omit` ostida. Bu faqat TEST fixture'i uchun —
// ilova kodi hech qachon xom klientdan foydalanmaydi.
const prisma = new PrismaClient();

const R = { pass: 0, fail: 0, unmeasured: 0 };
const ok = (n) => { R.pass += 1; console.log(`  ✅ ${n}`); };
const bad = (n, m) => { R.fail += 1; console.log(`  ❌ ${n}\n      ${m}`); };
const skip = (n, m) => { R.unmeasured += 1; console.log(`  ⚠️  ${n} — O'LCHANMADI: ${m}`); };


/**
 * ⚠ SHU YURISHGA XOS MIJOZ MANZILI — TEZLIK CHEGARASI UCHUN.
 *
 * `authLimiter` (20/5daq) va `generalLimiter` (200/daq) IP bo'yicha
 * sanaydi. Repoda parallel ishlaydigan to'plamlar bitta haqiqiy IP'ni
 * (127.0.0.1) baham ko'radi va byudjet doimiy to'la bo'ladi — natijada
 * to'plam 429 sababli UMUMAN O'LCHANMAYDI (yiqilmaydi ham, o'tmaydi
 * ham; eng yomon natija).
 *
 * Ikkala stek ham `trust proxy: 1` bilan ishlaydi (Express `app.js`,
 * NestJS `main.ts`), ya'ni chegara shu manzil bo'yicha sanaladi va
 * to'plam o'z chelagida yuradi.
 *
 * ⚠ CHEGARA ZAIFLASHMAYDI: u baribir qo'llanadi — to'plam faqat BOSHQA
 * MASHINADAN kelayotgandek ko'rinadi. Chegaraning O'ZI alohida
 * o'lchanadi: `test/rate-limit-parity.test.mjs`.
 *
 * ⚠ BETAKROR bo'lishi SHART: chelak 5 daqiqa yashaydi, qat'iy manzil
 * bilan ketma-ket ikki yurish bir chelakni baham ko'rardi.
 */
const RUN_IP = `198.51.100.${(Number(process.hrtime.bigint() % 250n) + 2)}`;

const req = async (base, method, path, { token, body } = {}) => {
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': RUN_IP };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
};

/** Har chaqiruvda o'zgaradigan maydonlar — `users-parity` bilan bir xil. */
const VOLATILE = new Set([
  'createdAt', 'updatedAt', 'lastLoginAt', 'stack', 'activeSessions',
  'frozenAt', 'lastSeenAt', 'archivedAt', 'terminatedAt',
]);

const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (VOLATILE.has(k)) continue;
      out[k] = strip(val);
    }
    return out;
  }
  return v;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ⚠ 429 DA QAYTA URINADI.
 *
 * `/api/auth/login` `authLimiter` ostida: IP bo'yicha 5 daqiqada 20 ta
 * urinish (`server/src/middleware/rateLimiter.js`). Bu test bir nechta
 * hisob bilan kiradi va Express nusxasi boshqa testlar bilan BAHAM
 * ko'riladi — ya'ni limit haqiqiy sharoitda urib turadi.
 *
 * Kutish OYNANI QOPLASHI kerak (8 × 45s ≈ 6 daq), aks holda test
 * "yiqilgan" bo'lib ko'rinardi, aslida esa hech narsa o'lchanmagan
 * bo'lardi — eng yomon natija: yashil ham emas, ma'noli ham emas.
 */
const login = async (base, creds, attempts = 8) => {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    const r = await req(base, 'POST', '/api/auth/login', { body: creds });
    if (r.status === 200) return r.body.data.accessToken;
    last = r;
    if (r.status !== 429) break;
    await sleep(45_000);
  }
  throw new Error(`login ${creds.login}: ${last.status} ${JSON.stringify(last.body)}`);
};

// ═══════════════════════════════════════════════════════════════════════
// FIXTURE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Barcha `qa_lc_` izlarini o'chiradi.
 *
 * ⚠ TARTIB FK BO'YICHA: bola → ota. `deleteMany` ni noto'g'ri tartibda
 * chaqirish `RESTRICT` xatosi beradi va tozalash YARIM qoladi — keyingi
 * yurishda fixture "allaqachon bor" bo'lib, test jimgina boshqa
 * ma'lumotda ishlab ketardi.
 */
const cleanup = async () => {
  const users = await prisma.user.findMany({
    where: { username: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.activityLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.archiveLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.archiveLog.deleteMany({ where: { performedById: { in: ids } } });
    await prisma.botUser.updateMany({ where: { userId: { in: ids } }, data: { userId: null } });
    await prisma.groupMembership.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.teacherSalary.deleteMany({ where: { teacherId: { in: ids } } });

    // ── ⚠ XODIM MAOSHI ZANJIRI ──
    //
    // `POST /users/staff` HAQIQIY xodim yaratadi va tizim unga maosh
    // qatorlarini ochadi (`staff_payrolls`, `payroll_audit_logs`).
    // Ularning FK'si `RESTRICT`, ya'ni tozalamasdan foydalanuvchini
    // o'chirib BO'LMAYDI — birinchi yurishda `cleanup()` aynan
    // `staff_payrolls_employeeId_fkey` da yiqildi.
    //
    // TARTIB FK BO'YICHA: bola → ota.
    await prisma.staffPayrollItem.deleteMany({
      where: { payroll: { employeeId: { in: ids } } },
    });
    await prisma.staffSalaryTransaction.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.staffPayrollAdjustment.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.staffPayroll.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.staffKpiAssignment.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.staffCompensation.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.payrollAuditLog.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.openingBalance.deleteMany({ where: { userId: { in: ids } } });

    await prisma.userBranchAssignment.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.archiveLog.deleteMany({ where: { reason: { title: { startsWith: 'QA_LC ' } } } });
  await prisma.archiveReason.deleteMany({ where: { title: { startsWith: 'QA_LC ' } } });

  // ⚠ TIZIM BILDIRISHNOMALARI — foydalanuvchi O'CHGACH ham QOLADI.
  //
  // `SystemNotification` da `userId` YO'Q: xabar shunchaki matn
  // ("QALC teacher_twin ... butunlay o'chirildi"). Ya'ni yuqoridagi
  // `user.deleteMany` ularni OLIB KETMAYDI va ular har yurishda
  // to'planib borardi. Birinchi tekshiruvda aynan shu 12 ta yetim
  // qator topildi.
  //
  // Fixture'dagi HAR BIR ko'rinadigan ism "QALC" bilan boshlanadi,
  // shuning uchun bu filtr ANIQ va TO'LIQ.
  await prisma.systemNotification.deleteMany({ where: { message: { contains: 'QALC' } } });
  return ids.length;
};

/**
 * ⚠ `lastName` USERNAME'DAN AJRATILGAN.
 *
 * `DELETE /:id/permanent` tasdiq sifatida TO'LIQ ISMNI so'raydi. Egizaklar
 * (Express uchun bittasi, NestJS uchun ikkinchisi) bir xil `confirmName`
 * bilan sinalishi SHART — aks holda ikki stekka ikki xil kirish berilgan
 * bo'lardi va solishtiruv hech nimani isbotlamasdi. Shuning uchun
 * ko'rinadigan ism egizaklarda AYNAN bir xil, faqat `username` farq
 * qiladi (u unique).
 */
const mkUser = async (suffix, role, branchId, extra = {}) => {
  const { displayLast, ...rest } = extra;
  const username = PREFIX + suffix;
  const u = await prisma.user.create({
    data: {
      username,
      firstName: 'QALC',
      lastName: displayLast ?? suffix,
      role,
      homeBranchId: branchId,
      passwordHash: PW,
      isActive: true,
      ...rest,
    },
  });
  await prisma.userBranchAssignment.create({
    data: { userId: u.id, branchId, role },
  });
  return u;
};

// ═══════════════════════════════════════════════════════════════════════

const main = async () => {
  console.log('\n\x1b[1mFAZA 2.5b — FOYDALANUVCHI HAYOT SIKLI PARITETI\x1b[0m\n');

  // Oldingi yurishning qoldig'i bo'lsa — tozalab boshlaymiz.
  const stale = await cleanup();
  if (stale) console.log(`  (oldingi yurishdan ${stale} ta qoldiq tozalandi)`);

  const branches = await prisma.branch.findMany({
    where: { isDeleted: false, isActive: true },
    select: { id: true, name: true, isMain: true },
    orderBy: { createdAt: 'asc' },
  });
  if (branches.length < 2) {
    console.log('\n  ❌ IKKI FILIAL KERAK. Avval: npm run seed:multi-branch\n');
    process.exit(1);
  }
  const A = branches.find((b) => b.isMain) || branches[0];
  const B = branches.find((b) => b.id !== A.id);
  console.log(`  filiallar: A=${A.name} · B=${B.name}\n`);

  const group = await prisma.group.findFirst({ select: { id: true, name: true } });

  // ── FIXTURE ──
  const reason = await prisma.archiveReason.create({
    data: { title: 'QA_LC sabab' },
  });

  const staff = await mkUser('staff', 'qa_staff', A.id);
  // ⚠ ALOHIDA, HECH QACHON O'ZGARTIRILMAYDIGAN aktyor. `staff` ni
  // ishlatib bo'lmaydi: arxivlash bloki `bothMutating` bilan tugaydi va
  // u nishonni ARXIVLANGAN holatda qoldiradi — arxivlangan hisob esa
  // login qila olmaydi (401). Birinchi yurishda test aynan shu sababli
  // "O'LCHANMADI" bergan edi.
  const weak = await mkUser('weak', 'qa_staff', A.id);
  // EGIZAKLAR: ko'rinadigan ism bir xil ("QALC teacher_twin"), username farq.
  const teacherE = await mkUser('teacher_e', 'teacher', A.id, { displayLast: 'teacher_twin' });
  const teacherN = await mkUser('teacher_n', 'teacher', A.id, { displayLast: 'teacher_twin' });
  const teacherHist = await mkUser('teacher_hist', 'teacher', A.id);
  const studentE = await mkUser('student_e', 'student', A.id, { displayLast: 'student_twin' });
  const studentN = await mkUser('student_n', 'student', A.id, { displayLast: 'student_twin' });
  const studentGrp = group ? await mkUser('student_grp', 'student', A.id) : null;
  const dirB = await mkUser('dir_b', 'director', B.id);

  // ⚠ TO'SIQ SHARTI — TAXMIN EMAS, YARATILGAN VA O'LCHANGAN.
  await prisma.teacherSalary.create({
    data: {
      branchId: A.id,
      teacherId: teacherHist.id,
      kind: 'base',
      year: 2025,
      month: 1,
      expectedAmount: 1_500_000,
    },
  });
  if (studentGrp) {
    await prisma.groupMembership.create({
      data: { groupId: group.id, studentId: studentGrp.id, joinedAt: new Date('2025-01-01') },
    });
  }

  // QOLDIQ MA'LUMOT — hard delete uni ham tozalashi kerak.
  for (const u of [teacherE, teacherN, studentE, studentN]) {
    await prisma.refreshToken.create({
      data: {
        userId: u.id,
        tokenHash: `qa_lc_${u.id}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await prisma.activityLog.create({
      data: { userId: u.id, method: 'GET', path: '/api/qa-lc', status: 200 },
    });
    await prisma.archiveLog.create({ data: { userId: u.id, action: 'archive' } });
  }

  const ownerToken = await login(EXPRESS, OWNER);
  const dirToken = await login(EXPRESS, { login: dirB.username, password: PW });

  // Direktorda `users.archive` BOR (musbat nazorat pastda) — ya'ni
  // filiallararo 403 ROL yetishmasligidan emas, FILIAL chegarasidan keladi.
  const staffCanArchive = (await prisma.role.findUnique({
    where: { value: 'director' },
    select: { permissions: { select: { key: true } } },
  }))?.permissions.map((p) => p.key) || [];

  // ═══════════════════ YORDAMCHILAR ═══════════════════

  /** Bir xil (o'zgarmaydigan) so'rovni ikkala stekda bajaradi. */
  const both = async (name, fn) => {
    let e, n;
    try { e = await fn(EXPRESS); n = await fn(NEST); }
    catch (err) { skip(name, err.message); return {}; }
    const en = { status: e.status, body: strip(e.body) };
    const nn = { status: n.status, body: strip(n.body) };
    try {
      assert.deepEqual(nn, en);
      ok(`${name} — ${e.status}`);
    } catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 700)}\n      nest   : ${JSON.stringify(nn).slice(0, 700)}`);
    }
    return { e, n };
  };

  /** MUTATSIYA: har stek BIR XIL boshlang'ich holatdan boshlaydi. */
  const bothMutating = async (name, fn, restore) => {
    let e, n;
    try {
      e = await fn(EXPRESS);
      await restore();
      n = await fn(NEST);
      await restore();
    } catch (err) {
      try { await restore(); } catch { /* tiklash ham yiqildi */ }
      skip(name, err.message);
      return {};
    }
    const en = { status: e.status, body: strip(e.body) };
    const nn = { status: n.status, body: strip(n.body) };
    try {
      assert.deepEqual(nn, en);
      ok(`${name} — ${e.status}`);
    } catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 700)}\n      nest   : ${JSON.stringify(nn).slice(0, 700)}`);
    }
    return { e, n };
  };

  /**
   * ATAYLAB kutilayotgan farq. Farq YO'QOLSA HAM yiqiladi — ya'ni
   * cheklov bartaraf etilgani darhol ko'rinadi va bu test eskirib
   * "yolg'on yashil" bo'lib qolmaydi.
   */
  const expectDivergence = async (name, fn, expect) => {
    let e, n;
    try { e = await fn(EXPRESS); n = await fn(NEST); }
    catch (err) { skip(name, err.message); return; }
    try {
      assert.equal(e.status, expect.expressStatus, 'express status');
      assert.equal(n.status, expect.nestStatus, 'nest status');
      if (expect.nestCode) assert.equal(n.body?.code, expect.nestCode, 'nest code');
      ok(`${name} — express ${e.status}, nest ${n.status} (kutilgan farq)`);
    } catch (err) {
      bad(name, `${err.message}\n      express: ${e.status} · nest: ${n.status} ${JSON.stringify(n.body).slice(0, 200)}`);
    }
  };

  /** Bazadagi holatni to'g'ridan-to'g'ri tiklaydi (API'siz — u sinalayotgan yuza). */
  const resetUser = (id, data) => prisma.user.update({ where: { id }, data });

  // ═══════════════════ 1. ARXIVLASH ═══════════════════
  console.log('\x1b[2m  ── arxivlash (DELETE /users/:id) ──\x1b[0m');

  const restoreStaff = () =>
    resetUser(staff.id, {
      isActive: true, archivedAt: null, terminatedAt: null, terminationReason: '',
    });

  await bothMutating(
    'DELETE /users/:id (xodim, sababsiz)',
    (b) => req(b, 'DELETE', `/api/users/${staff.id}`, { token: ownerToken }),
    restoreStaff,
  );

  await bothMutating(
    'DELETE /users/:id (xodim, reasonId bilan)',
    (b) => req(b, 'DELETE', `/api/users/${staff.id}`, {
      token: ownerToken, body: { reasonId: reason.id },
    }),
    restoreStaff,
  );

  await bothMutating(
    'DELETE /users/:id (archiveDate berilgan)',
    (b) => req(b, 'DELETE', `/api/users/${staff.id}`, {
      token: ownerToken, body: { archiveDate: '2025-06-01' },
    }),
    restoreStaff,
  );

  await both('DELETE /users/:id (kelajak sanasi → 400)', (b) =>
    req(b, 'DELETE', `/api/users/${staff.id}`, {
      token: ownerToken, body: { archiveDate: '2099-01-01' },
    }));

  await both('DELETE /users/:id (404)', (b) =>
    req(b, 'DELETE', `/api/users/${'a'.repeat(24)}`, { token: ownerToken }));

  await both("DELETE /users/:id (token yo'q → 401)", (b) =>
    req(b, 'DELETE', `/api/users/${staff.id}`));

  // ── O'QITUVCHI: `terminatedAt` va `terminationReason` YOZILADI ──
  const restoreTeacherE = () =>
    resetUser(teacherE.id, {
      isActive: true, archivedAt: null, terminatedAt: null, terminationReason: '',
    });

  await bothMutating(
    "DELETE /users/:id (O'QITUVCHI, ishdan bo'shash)",
    (b) => req(b, 'DELETE', `/api/users/${teacherE.id}`, {
      token: ownerToken, body: { reasonId: reason.id, archiveDate: '2025-06-01' },
    }),
    restoreTeacherE,
  );

  // ⚠ YON TA'SIR PARITETI: javob bir xil bo'lishi YETARLI EMAS —
  // `terminatedAt` / `terminationReason` / yopilgan stavka ikkala stekda
  // ham bir xil yozilishi kerak. Ularni ALOHIDA o'lchaymiz.
  {
    const snap = async (base) => {
      await restoreTeacherE();
      await req(base, 'DELETE', `/api/users/${teacherE.id}`, {
        token: ownerToken, body: { reasonId: reason.id, archiveDate: '2025-06-01' },
      });
      const u = await prisma.user.findUnique({
        where: { id: teacherE.id },
        select: { isActive: true, archivedAt: true, terminatedAt: true, terminationReason: true },
      });
      return {
        isActive: u.isActive,
        archivedAt: u.archivedAt?.toISOString() ?? null,
        terminatedAt: u.terminatedAt?.toISOString() ?? null,
        terminationReason: u.terminationReason,
      };
    };
    try {
      const e = await snap(EXPRESS);
      const n = await snap(NEST);
      await restoreTeacherE();
      assert.deepEqual(n, e);
      assert.equal(e.terminationReason, reason.title, 'sabab sarlavhasi yozilmadi');
      assert.equal(e.terminatedAt, '2025-06-01T00:00:00.000Z', 'terminatedAt sanasi');
      ok(`o'qituvchi bo'shashida BAZA HOLATI bir xil (${JSON.stringify(e)})`);
    } catch (err) {
      await restoreTeacherE().catch(() => {});
      bad("o'qituvchi bo'shashida baza holati", err.message);
    }
  }

  // ═══════════════════ 2. XAVFSIZLIK TO'SIQLARI ═══════════════════
  console.log('\x1b[2m  ── arxivlash: to\'siqlar ──\x1b[0m');

  // (a) OWNER nishoni — 403.
  const ownerRow = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false },
    select: { id: true },
  });
  if (ownerRow) {
    await both('DELETE /users/:ownerId (403)', (b) =>
      req(b, 'DELETE', `/api/users/${ownerRow.id}`, { token: ownerToken }));
  } else {
    skip('owner nishoni 403', 'owner foydalanuvchi topilmadi');
  }

  // (b) O'QUVCHI nishoni — 400. Bu to'siq Express'dagi "o'quvchi shoxi"ni
  //     ERISHIB BO'LMAYDIGAN qiladi; NestJS o'sha shoxni ATAYLAB
  //     ko'chirmadi. To'siq olib tashlansa — bu test yiqiladi va
  //     ko'chirilmagan shox darhol esga tushadi.
  await both("DELETE /users/:id (O'QUVCHI → 400, o'lik shox qorovuli)", (b) =>
    req(b, 'DELETE', `/api/users/${studentE.id}`, { token: ownerToken }));

  // (c) FILIALLARARO — B filial direktori A filial xodimini arxivlay olmaydi.
  //     MUSBAT NAZORAT: o'sha direktor O'Z filialidagi odamni arxivlay
  //     OLADI — ya'ni 403 rolning yetishmasligidan EMAS.
  if (staffCanArchive.includes('users.archive')) {
    await both('filiallararo arxivlash rad etiladi (403)', (b) =>
      req(b, 'DELETE', `/api/users/${staff.id}`, { token: dirToken }));

    const ownBranchTarget = await mkUser('staff_b', 'qa_staff', B.id);
    try {
      const e = await req(EXPRESS, 'DELETE', `/api/users/${ownBranchTarget.id}`, { token: dirToken });
      await resetUser(ownBranchTarget.id, { isActive: true, archivedAt: null });
      const n = await req(NEST, 'DELETE', `/api/users/${ownBranchTarget.id}`, { token: dirToken });
      await resetUser(ownBranchTarget.id, { isActive: true, archivedAt: null });
      assert.equal(e.status, 200, `express: ${JSON.stringify(e.body)}`);
      assert.equal(n.status, 200, `nest: ${JSON.stringify(n.body)}`);
      ok('MUSBAT NAZORAT: o\'sha direktor O\'Z filialida arxivlay OLADI — 200');
    } catch (err) {
      bad('musbat nazorat (direktor o\'z filialida)', err.message);
    }
  } else {
    skip('filiallararo arxivlash', "`director` rolida `users.archive` yo'q");
  }

  // (d) RUXSAT YETISHMASLIGI — `users.archive` yo'q xodim.
  {
    let staffToken = null;
    try { staffToken = await login(EXPRESS, { login: staff.username, password: PW }); }
    catch (err) { skip('ruxsatsiz arxivlash', err.message); }
    if (staffToken) {
      await both("`users.archive` yo'q xodim arxivlay olmaydi (403)", (b) =>
        req(b, 'DELETE', `/api/users/${teacherE.id}`, { token: staffToken }));
    }
  }

  // ═══════════════════ 3. QAYTARISH ═══════════════════
  console.log('\x1b[2m  ── qaytarish (POST /users/:id/restore) ──\x1b[0m');

  const archiveStaff = () =>
    resetUser(staff.id, { isActive: false, archivedAt: new Date('2025-06-01') });

  await bothMutating(
    'POST /users/:id/restore (arxivlangan xodim)',
    (b) => req(b, 'POST', `/api/users/${staff.id}/restore`, { token: ownerToken }),
    archiveStaff,
  );

  const archiveTeacher = () =>
    resetUser(teacherE.id, {
      isActive: false,
      archivedAt: new Date('2025-06-01'),
      terminatedAt: new Date('2025-06-01'),
      terminationReason: 'QA_LC sabab',
    });

  await bothMutating(
    "POST /users/:id/restore (ishdan bo'shatilgan o'qituvchi)",
    (b) => req(b, 'POST', `/api/users/${teacherE.id}/restore`, { token: ownerToken }),
    archiveTeacher,
  );

  // ⚠ YON TA'SIR: qaytarilgan, stavkasi YO'Q o'qituvchi uchun owner'ga
  // tizim bildirishnomasi yoziladi. Ikkala stek ham AYNAN bitta yozadi.
  //
  // ⚠⚠ SON FARQI BILAN O'LCHAB BO'LMAYDI. `systemNotifications.create`
  // 100 talik cheklovni saqlaydi: jadval to'lgan bo'lsa u yangisini
  // yozib, eng eskisini O'CHIRADI — ya'ni `count()` FARQI NOL bo'ladi va
  // "yozilmadi" degan YOLG'ON xulosa chiqardi (birinchi yurishda aynan
  // shunday bo'ldi). Shuning uchun YOZUVNING O'ZI qidiriladi.
  {
    const findMine = () =>
      prisma.systemNotification.findMany({
        where: { message: { contains: teacherE.lastName } },
        select: { message: true, link: true },
        orderBy: { createdAt: 'desc' },
      });

    const snap = async (base) => {
      await prisma.systemNotification.deleteMany({
        where: { message: { contains: teacherE.lastName } },
      });
      await archiveTeacher();
      await req(base, 'POST', `/api/users/${teacherE.id}/restore`, { token: ownerToken });
      return findMine();
    };
    try {
      const e = await snap(EXPRESS);
      const n = await snap(NEST);
      assert.equal(e.length, 1, 'Express bildirishnoma yozmadi — musbat nazorat yiqildi');
      assert.ok(/maosh stavkasi yopiq/.test(e[0].message), `kutilmagan matn: ${e[0].message}`);
      assert.equal(e[0].link, `/users/${teacherE.id}`, 'havola profilga ishora qilmadi');
      assert.deepEqual(n, e);
      ok(`qaytarishda bildirishnoma pariteti — "${e[0].message.slice(0, 55)}…"`);
    } catch (err) {
      bad('qaytarishda bildirishnoma pariteti', err.message);
    } finally {
      // ⚠ `finally`: assert yiqilsa ham qoldiq TOZALANADI — aks holda u
      // keyingi bosqichning boshlang'ich holatini surib yuborardi.
      await prisma.systemNotification.deleteMany({
        where: { message: { contains: teacherE.lastName } },
      });
    }
  }

  // O'QUVCHI qaytarilishi — `archive_logs` ga yozadi (retention hisoboti).
  {
    const snap = async (base) => {
      await resetUser(studentE.id, { isActive: false, archivedAt: new Date('2025-06-01') });
      await prisma.archiveLog.deleteMany({ where: { userId: studentE.id, action: 'restore' } });
      const r = await req(base, 'POST', `/api/users/${studentE.id}/restore`, {
        token: ownerToken, body: { reasonId: reason.id },
      });
      const logs = await prisma.archiveLog.findMany({
        where: { userId: studentE.id, action: 'restore' },
        select: { action: true, reasonId: true, reasonTitle: true },
      });
      return { status: r.status, logs };
    };
    try {
      const e = await snap(EXPRESS);
      const n = await snap(NEST);
      assert.equal(e.logs.length, 1, 'Express arxiv jurnaliga yozmadi — musbat nazorat yiqildi');
      assert.deepEqual(n, e);
      ok(`o'quvchi qaytarilishida arxiv jurnali pariteti (reasonTitle="${e.logs[0].reasonTitle}")`);
    } catch (err) {
      bad('arxiv jurnali pariteti', err.message);
    } finally {
      // ⚠ `finally`: birinchi yurishda assert shu yerda yiqilgan va
      // tozalash BAJARILMAGAN edi — natijada `studentE` da ortiqcha
      // `archive_log` qolib, egizaklar solishtiruvi ham yiqilgan
      // ("archiveLogs: 2 vs 1"). Ya'ni bitta xato ikkinchisini
      // NIQOBLAGAN. Endi tozalash har qanday holatda ketadi.
      await prisma.archiveLog.deleteMany({ where: { userId: studentE.id, action: 'restore' } });
      await resetUser(studentE.id, { isActive: true, archivedAt: null });
    }
  }

  await both('POST /users/:id/restore (404)', (b) =>
    req(b, 'POST', `/api/users/${'a'.repeat(24)}/restore`, { token: ownerToken }));
  await both("POST /users/:id/restore (token yo'q → 401)", (b) =>
    req(b, 'POST', `/api/users/${staff.id}/restore`));
  if (staffCanArchive.includes('users.archive')) {
    await both('filiallararo qaytarish rad etiladi (403)', (b) =>
      req(b, 'POST', `/api/users/${staff.id}/restore`, { token: dirToken }));
  }

  // ═══════════════════ 4. BUTUNLAY O'CHIRISH ═══════════════════
  console.log('\x1b[2m  ── butunlay o\'chirish (DELETE /users/:id/permanent) ──\x1b[0m');

  // (a) ROL QOROVULI: direktorda `users.archive` BOR, lekin
  //     `system.admin_access` YO'Q → 403. MUSBAT NAZORAT yuqorida
  //     o'lchandi (u arxivlay OLADI), ya'ni bu 403 aynan ROL to'sig'i.
  await both("DELETE /:id/permanent (owner emas → 403)", (b) =>
    req(b, 'DELETE', `/api/users/${teacherE.id}/permanent`, {
      token: dirToken, body: { confirmName: 'QALC teacher_twin' },
    }));

  await both("DELETE /:id/permanent (token yo'q → 401)", (b) =>
    req(b, 'DELETE', `/api/users/${teacherE.id}/permanent`));
  await both('DELETE /:id/permanent (404)', (b) =>
    req(b, 'DELETE', `/api/users/${'a'.repeat(24)}/permanent`, { token: ownerToken }));

  // (b) TASDIQ ISMI noto'g'ri → 400.
  await both("DELETE /:id/permanent (confirmName noto'g'ri → 400)", (b) =>
    req(b, 'DELETE', `/api/users/${teacherE.id}/permanent`, {
      token: ownerToken, body: { confirmName: 'boshqa ism' },
    }));
  await both('DELETE /:id/permanent (confirmName yo\'q → 400)', (b) =>
    req(b, 'DELETE', `/api/users/${teacherE.id}/permanent`, { token: ownerToken }));

  // (c) MOLIYAVIY IZ TO'SIG'I — SHART OLDIN O'LCHANADI.
  {
    const rows = await prisma.teacherSalary.count({
      where: { teacherId: teacherHist.id, expectedAmount: { not: 0 } },
    });
    if (rows > 0) {
      ok(`to'siq sharti o'lchandi: ${teacherHist.username} da ${rows} ta maosh yozuvi bor`);
      await both("DELETE /:id/permanent (moliyaviy izli o'qituvchi → 400)", (b) =>
        req(b, 'DELETE', `/api/users/${teacherHist.id}/permanent`, {
          token: ownerToken, body: { confirmName: 'QALC teacher_hist' },
        }));
      const stillThere = await prisma.user.findUnique({ where: { id: teacherHist.id } });
      if (stillThere) ok("to'silgan o'qituvchi BAZADA QOLDI (ikkala stekda ham)");
      else bad("to'silgan o'qituvchi", 'YOZUV O\'CHIB KETDI — to\'siq ishlamadi');
    } else {
      bad("moliyaviy iz to'sig'i", 'fixture maosh yozuvini yaratmadi — test ma\'nosiz');
    }
  }

  // (d) GURUHDAGI O'QUVCHI TO'SIG'I — shart oldin o'lchanadi.
  if (studentGrp) {
    const mems = await prisma.groupMembership.count({
      where: { studentId: studentGrp.id, leftAt: null, isDeleted: false },
    });
    if (mems > 0) {
      ok(`to'siq sharti o'lchandi: ${studentGrp.username} ${mems} ta faol guruhda`);
      await both("DELETE /:id/permanent (guruhdagi o'quvchi → 400)", (b) =>
        req(b, 'DELETE', `/api/users/${studentGrp.id}/permanent`, {
          token: ownerToken, body: { confirmName: 'QALC student_grp' },
        }));
      const stillThere = await prisma.user.findUnique({ where: { id: studentGrp.id } });
      if (stillThere) ok("to'silgan o'quvchi BAZADA QOLDI (ikkala stekda ham)");
      else bad("to'silgan o'quvchi", 'YOZUV O\'CHIB KETDI — to\'siq ishlamadi');
    } else {
      bad("guruh to'sig'i", 'fixture a\'zolik yaratmadi — test ma\'nosiz');
    }
  } else {
    skip("guruhdagi o'quvchi to'sig'i", 'bazada guruh topilmadi');
  }

  // (e) HAQIQIY O'CHIRISH — EGIZAKLAR.
  const residual = async (id) => ({
    user: await prisma.user.count({ where: { id } }),
    refreshTokens: await prisma.refreshToken.count({ where: { userId: id } }),
    activityLogs: await prisma.activityLog.count({ where: { userId: id } }),
    archiveLogs: await prisma.archiveLog.count({ where: { userId: id } }),
    branchAssignments: await prisma.userBranchAssignment.count({ where: { userId: id } }),
  });

  const twin = async (label, expressUser, nestUser, confirmName) => {
    try {
      // MUSBAT NAZORAT: egizaklar o'chirishdan OLDIN haqiqatan MAVJUD va
      // qoldiq ma'lumotga EGA. Aks holda "hammasi tozalandi" degan xulosa
      // bo'sh jadvaldan kelib chiqqan bo'lardi.
      const beforeE = await residual(expressUser.id);
      const beforeN = await residual(nestUser.id);
      assert.deepEqual(beforeN, beforeE, 'egizaklar boshlang\'ich holati farq qildi');
      assert.equal(beforeE.user, 1, 'egizak mavjud emas');
      assert.ok(beforeE.refreshTokens > 0, 'qoldiq token yo\'q — tozalash o\'lchanmaydi');

      const e = await req(EXPRESS, 'DELETE', `/api/users/${expressUser.id}/permanent`, {
        token: ownerToken, body: { confirmName },
      });
      const n = await req(NEST, 'DELETE', `/api/users/${nestUser.id}/permanent`, {
        token: ownerToken, body: { confirmName },
      });

      assert.deepEqual(
        { status: n.status, body: strip(n.body) },
        { status: e.status, body: strip(e.body) },
        `javob: express ${JSON.stringify(e.body)} · nest ${JSON.stringify(n.body)}`,
      );
      assert.equal(e.status, 200, `Express o'chira olmadi: ${JSON.stringify(e.body)}`);

      const afterE = await residual(expressUser.id);
      const afterN = await residual(nestUser.id);
      const zero = { user: 0, refreshTokens: 0, activityLogs: 0, archiveLogs: 0, branchAssignments: 0 };
      assert.deepEqual(afterE, zero, `Express qoldiq qoldirdi: ${JSON.stringify(afterE)}`);
      assert.deepEqual(afterN, zero, `NestJS qoldiq qoldirdi: ${JSON.stringify(afterN)}`);

      // ⚠ YON TA'SIR: owner'ga tizim bildirishnomasi. Ikkala stek ham
      // AYNAN bittadan, AYNAN bir xil matn bilan yozishi kerak —
      // javob tanasi ({success, message}) buni umuman ko'rsatmaydi.
      const notes = await prisma.systemNotification.findMany({
        where: { message: { contains: confirmName } },
        select: { message: true },
      });
      assert.equal(
        notes.length, 2,
        `bildirishnoma soni 2 emas (${notes.length}) — ikki stek ikki xil yozdi`,
      );
      assert.equal(notes[0].message, notes[1].message, 'bildirishnoma matni farq qildi');

      ok(`${label} — javob ${e.status}, qoldiq TO'LIQ tozalandi, ` +
        `bildirishnoma bir xil ("${notes[0].message.slice(0, 45)}…")`);
    } catch (err) {
      bad(label, err.message);
    }
  };

  await twin(
    "DELETE /:id/permanent (toza O'QITUVCHI, egizak)",
    teacherE, teacherN, 'QALC teacher_twin',
  );

  await twin(
    "DELETE /:id/permanent (toza O'QUVCHI, egizak)",
    studentE, studentN, 'QALC student_twin',
  );

  // ═══════════════════ 5. XODIM YARATISH ═══════════════════
  console.log('\x1b[2m  ── xodim yaratish (POST /users/staff) ──\x1b[0m');

  const staffBody = (suffix, extra = {}) => ({
    firstName: 'QALC',
    lastName: `new_${suffix}`,
    username: `${PREFIX}new_${suffix}`,
    password: 'qa123456',
    role: 'qa_staff',
    homeBranchId: A.id,
    ...extra,
  });

  // ── VALIDATSIYA VA TO'SIQLAR (yozuv yaratmaydi) ──
  await both("POST /users/staff (bo'sh tana → 400)", (b) =>
    req(b, 'POST', '/api/users/staff', { token: ownerToken, body: {} }));
  await both("POST /users/staff (qisqa parol → 400)", (b) =>
    req(b, 'POST', '/api/users/staff', {
      token: ownerToken, body: staffBody('x', { password: 'qisqa' }),
    }));
  await both("POST /users/staff (band login → 409)", (b) =>
    req(b, 'POST', '/api/users/staff', {
      token: ownerToken, body: staffBody('x', { username: 'owner' }),
    }));
  await both("POST /users/staff (mavjud bo'lmagan rol → 400)", (b) =>
    req(b, 'POST', '/api/users/staff', {
      token: ownerToken, body: staffBody('x', { role: '__nope__' }),
    }));
  await both("POST /users/staff (mavjud bo'lmagan filial → 400)", (b) =>
    req(b, 'POST', '/api/users/staff', {
      token: ownerToken, body: staffBody('x', { homeBranchId: 'f'.repeat(24) }),
    }));
  await both("POST /users/staff (token yo'q → 401)", (b) =>
    req(b, 'POST', '/api/users/staff', { body: staffBody('x') }));

  // ⚠ IKKI RUXSAT AND: direktorda `roles.update` BOR, `teachers.create`
  // holatiga qarab farq qiladi — shuning uchun `qa_staff` bilan
  // (ikkalasi ham YO'Q) sinaymiz. MUSBAT NAZORAT: o'sha token bilan
  // owner 200/201 oladi (yuqoridagi testlar buni ko'rsatdi).
  {
    let weakToken = null;
    try { weakToken = await login(EXPRESS, { login: weak.username, password: PW }); }
    catch (err) { skip('ruxsatsiz xodim yaratish', err.message); }
    if (weakToken) {
      await both("`teachers.create` yo'q xodim staff yarata olmaydi (403)", (b) =>
        req(b, 'POST', '/api/users/staff', { token: weakToken, body: staffBody('x') }));
    }
  }

  // ═══ ⚠ IKKI ENG MUHIM XAVFSIZLIK XOSSASI ═══
  //
  // Bu ikkisi `POST /staff` ning butun ma'nosi. Ular bo'lmasa marshrut
  // "ishlaydi", lekin IMTIYOZ OSHIRISH yo'lini ochib qo'yadi.
  if (staffCanArchive.includes('users.archive')) {
    // ── (a) FILIALLARARO: direktor BOSHQA filialga xodim qo'sha olmaydi ──
    //
    // NEGA BU ENG MUHIMI: qo'sha olsa, u yaratgan xodimning OCHIQ
    // MATNDAGI parolini keyin `/users/:id/password` orqali o'qib olardi
    // — ya'ni begona filialga ishlaydigan hisob YARATIB, unga kirardi.
    // Bitta tekshiruv (`assertCanAssignBranch`) butun filial
    // izolyatsiyasini ushlab turadi.
    await both('direktor BOSHQA filialga xodim qo\'sha olmaydi (403)', (b) =>
      req(b, 'POST', '/api/users/staff', {
        token: dirToken,
        body: staffBody('xb', { homeBranchId: A.id }),
      }));

    // MUSBAT NAZORAT: O'SHA direktor O'Z filialiga qo'sha OLADI.
    // Busiz yuqoridagi 403 ruxsat yetishmasligidan ham kelishi mumkin
    // edi va tekshiruv filial chegarasi haqida HECH NIMA aytmasdi.
    {
      const e = await req(EXPRESS, 'POST', '/api/users/staff', {
        token: dirToken, body: staffBody('own_e', { homeBranchId: B.id }),
      });
      const n = await req(NEST, 'POST', '/api/users/staff', {
        token: dirToken, body: staffBody('own_n', { homeBranchId: B.id }),
      });
      if (e.status === 201 && n.status === 201) {
        ok("MUSBAT NAZORAT: o'sha direktor O'Z filialiga qo'sha OLADI — 201/201");
      } else {
        bad(
          'musbat nazorat (direktor o\'z filialiga)',
          `express ${e.status} ${JSON.stringify(e.body).slice(0, 160)} · ` +
            `nest ${n.status} ${JSON.stringify(n.body).slice(0, 160)}`,
        );
      }
    }

    // ── (b) IMTIYOZ OSHIRISH: direktor OWNER rolli xodim yarata olmaydi ──
    //
    // `assertCanGrantRole` — o'zida yo'q ruxsatli rolni bera olmaydi.
    // Bu bo'lmasa direktor o'ziga owner hisobi ochib, keyin uning
    // parolini o'qib, butun tizimni egallardi.
    await both("direktor OWNER rolli xodim yarata olmaydi (403)", (b) =>
      req(b, 'POST', '/api/users/staff', {
        token: dirToken,
        body: staffBody('esc', { homeBranchId: B.id, role: 'owner' }),
      }));
  } else {
    skip("`POST /staff` filial va imtiyoz to'siqlari", "`director` rolida `users.archive` yo'q");
  }

  // ── ⚠ KUTILGAN FARQ: moliyaviy yon ta'sirlar ko'chirilmagan ──
  //
  // `compensation` / `openingBalance` bilan Express 201 qaytaradi (va
  // xato bo'lsa `openingBalanceError` qo'shadi), NestJS esa OCHIQ 501.
  // Pul jimgina yo'qolmasligi uchun — `POST /auth/register-user` da
  // allaqachon qabul qilingan naqsh. Farq yo'qolsa test yiqiladi.
  //
  // ⚠⚠ HAR STEKKA BOSHQA LOGIN. Express shoxi HAQIQATAN xodim yaratadi
  // (u 201 qaytaradi), shuning uchun bir xil login bilan NestJS 409
  // olardi va "501 kelmadi" degan YOLG'ON yiqilish chiqardi — birinchi
  // yurishda aynan shunday bo'ldi.
  //
  // ⚠ AYNI PAYTDA bu 409 NestJS'ning 501 i TO'G'RI JOYDA turganini ham
  // isbotlaydi: u login tekshiruvidan KEYIN ishlaydi, ya'ni noto'g'ri
  // kirish Express bilan bir xil xato beradi.
  await expectDivergence(
    "POST /users/staff (openingBalance bilan — pul jimgina yo'qolmaydi)",
    (b) => req(b, 'POST', '/api/users/staff', {
      token: ownerToken,
      body: staffBody(b === EXPRESS ? 'ob_e' : 'ob_n', { openingBalance: 100000 }),
    }),
    { expressStatus: 201, nestStatus: 501, nestCode: 'REGISTER_SIDE_EFFECTS_NOT_MIGRATED' },
  );

  // MUSBAT NAZORAT: NestJS 501 i AYNAN `openingBalance` sababli — bir
  // xil tanadan uni OLIB TASHLASA 201 keladi. Aks holda 501 boshqa
  // sababdan (mas. ruxsat) kelayotgan bo'lishi mumkin edi.
  {
    const r = await req(NEST, 'POST', '/api/users/staff', {
      token: ownerToken, body: staffBody('ob_ctl'),
    });
    if (r.status === 201) ok("MUSBAT NAZORAT: `openingBalance` siz o'sha tana NestJS'da 201");
    else bad('501 sababi', `openingBalance siz ham ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
  }

  // ── HAQIQIY YARATISH — EGIZAK (username unique, shuning uchun ikkita) ──
  {
    try {
      const e = await req(EXPRESS, 'POST', '/api/users/staff', {
        token: ownerToken, body: staffBody('e'),
      });
      const n = await req(NEST, 'POST', '/api/users/staff', {
        token: ownerToken, body: staffBody('n'),
      });
      // `username`/`lastName`/`_id`/`id` egizaklarda ATAYLAB farq qiladi —
      // ular solishtiruvdan chiqariladi, qolgan BUTUN profil solishtiriladi.
      const shape = (r) => {
        const d = { ...(r.body?.data || {}) };
        delete d.id; delete d._id; delete d.username; delete d.lastName;
        return { status: r.status, message: r.body?.message, data: strip(d) };
      };
      assert.equal(e.status, 201, `Express yarata olmadi: ${JSON.stringify(e.body)}`);
      assert.deepEqual(shape(n), shape(e));
      ok(`POST /users/staff — ${e.status}, profil shakli bir xil`);

      // ⚠ MUSBAT NAZORAT: ikkala yozuv ham HAQIQATAN bazada, bir xil
      // rol/filial bilan. Javob tengligi yozuvning to'g'ri saqlanganini
      // isbotlamaydi.
      const rows = await prisma.user.findMany({
        where: { username: { in: [`${PREFIX}new_e`, `${PREFIX}new_n`] } },
        select: { username: true, role: true, homeBranchId: true, isActive: true, hiredAt: true },
        orderBy: { username: 'asc' },
      });
      assert.equal(rows.length, 2, 'ikkala xodim ham yaratilmadi');
      assert.equal(rows[0].role, rows[1].role, 'rol farq qildi');
      assert.equal(rows[0].homeBranchId, rows[1].homeBranchId, 'filial farq qildi');
      assert.equal(
        rows[0].hiredAt?.toISOString(), rows[1].hiredAt?.toISOString(),
        'hiredAt farq qildi (mahalliy kun hisobi)',
      );
      ok(`BAZA HOLATI bir xil (role=${rows[0].role}, hiredAt=${rows[0].hiredAt?.toISOString().slice(0, 10)})`);
    } catch (err) {
      bad('POST /users/staff', err.message);
    }
  }

  // ═══════════════════ 6. DRIFT ═══════════════════
  console.log('\x1b[2m  ── baza drifti ──\x1b[0m');

  const removed = await cleanup();
  // ⚠ HAR UCHALASI SANALADI. Ilgari faqat foydalanuvchi va sabab
  // tekshirilardi — bildirishnomalar esa `userId` ga bog'lanmagani uchun
  // yetim qolib, har yurishda to'planib borardi va "drift yo'q" degan
  // xulosa YOLG'ON edi.
  const left = {
    users: await prisma.user.count({ where: { username: { startsWith: PREFIX } } }),
    reasons: await prisma.archiveReason.count({ where: { title: { startsWith: 'QA_LC ' } } }),
    notifications: await prisma.systemNotification.count({
      where: { message: { contains: 'QALC' } },
    }),
  };
  const total = Object.values(left).reduce((a, b) => a + b, 0);
  if (total === 0) {
    ok(`test o'zidan keyin hech narsa qoldirmadi (${removed} ta fixture tozalandi)`);
  } else {
    bad('baza drifti', JSON.stringify(left));
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
  await prisma.$disconnect();
  process.exit(R.fail || R.unmeasured ? 1 : 0);
};

main().catch(async (e) => {
  console.error(e);
  try { await cleanup(); } catch { /* tozalash ham yiqildi */ }
  await prisma.$disconnect();
  process.exit(1);
});
