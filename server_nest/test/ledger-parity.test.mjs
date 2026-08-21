/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SHAXSIY MOLIYAVIY TARIX (LEDGER) — PARITET (FAZA 7.9)
 *
 * Express `/api/ledger` (2 marshrut) ↔ NestJS ekvivalenti.
 *
 * ── NIMA ISBOTLANADI ──
 *   1. UCH ROL uchun uch xil quruvchi bir xil qatorlarni beradi
 *      (o'quvchi / o'qituvchi / xodim).
 *   2. ⚠ IKKI BARAVAR HISOBLASH YO'Q — ledgerning eng nozik xossasi:
 *      · depozitdan qoplangan to'lov (`source: "deposit"`) SANALMAYDI;
 *      · boshlang'ich qoldiqning MATERIALIZATSIYASI (`isOpening`)
 *        sanalmaydi — qoldiq LANGAR hujjatdan olinadi.
 *      Aks holda bir marta bergan pul balansda IKKI MARTA ko'rinardi.
 *   3. ISHORA QOIDASI: +X = markaz qarzdor, −X = shaxs qarzdor.
 *   4. `balanceAfter` TO'LIQ tarixdan hisoblanadi, sana filtri esa
 *      faqat KO'RSATISHNI cheklaydi (balans noldan boshlanmaydi).
 *   5. `/me` ruxsatsiz ishlaydi va FILIAL KO'LAMINI chetlab o'tadi.
 *   6. `/:userId` begona filial odamida 404 (403 EMAS — mavjudligini
 *      ham oshkor qilmaymiz).
 *
 * ⚠ LEDGER HECH NARSA YOZMAYDI — bu SOF O'QISH modeli. Shuning uchun
 * fikstura oldindan quriladi va test faqat O'QIYDI.
 *
 * ISHLATISH:  npm run test:ledger-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, normalize, nowStamps, mintToken,
  waitForStacks, createReporter,
} from './_harness.mjs';

const prisma = new PrismaClient();
const TAG = `LG-${Date.now().toString(36)}`;
const { R, ok, bad, skip, section, finish } = createReporter('ledger');

const made = { branches: [], users: [], groups: [] };
const RUN_IP = `198.51.100.${(Number(process.hrtime.bigint() % 250n) + 2)}`;

const rateLimited = (r) =>
  r?.status === 429 ||
  /so'rovlar soni juda ko'p/i.test(String(r?.body?.message || ''));

const cleanup = async () => {
  const u = made.users; const b = made.branches;
  try {
    if (u.length) {
      await prisma.openingBalance.deleteMany({ where: { userId: { in: u } } });
      await prisma.staffPayrollItem.deleteMany({
        where: { payroll: { employeeId: { in: u } } } });
      await prisma.staffSalaryTransaction.deleteMany({ where: { employeeId: { in: u } } });
      await prisma.staffPayroll.deleteMany({ where: { employeeId: { in: u } } });
      await prisma.staffPayrollAdjustment.deleteMany({ where: { employeeId: { in: u } } });
      await prisma.payrollAuditLog.deleteMany({ where: { employeeId: { in: u } } });
      await prisma.salaryTransaction.deleteMany({ where: { teacherId: { in: u } } });
      await prisma.teacherSalary.deleteMany({ where: { teacherId: { in: u } } });
      await prisma.paymentTransaction.deleteMany({ where: { studentId: { in: u } } });
      await prisma.depositTransaction.deleteMany({ where: { studentId: { in: u } } });
      await prisma.studentDeposit.deleteMany({ where: { studentId: { in: u } } });
      await prisma.studentPayment.deleteMany({ where: { studentId: { in: u } } });
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

/**
 * ⚠ FIKSTURA OCHIQ SANA BILAN QURILADI.
 *
 * Ledger sanaga qarab SARALAYDI; teng sanalarda tartib `typeOrder` bilan
 * hal qilinadi. Sana `now()` ga qoldirilsa ikki stekda millisekund farq
 * qilib, tartib TASODIFIY bo'lardi va paritet o'z-o'zidan yiqilardi.
 */
const makeFixture = async (label) => {
  const branch = await prisma.branch.create({
    data: { name: `${TAG} ${label}`, code: `${TAG}${label}` } });
  const other = await prisma.branch.create({
    data: { name: `${TAG} ${label}B`, code: `${TAG}${label}B` } });
  made.branches.push(branch.id, other.id);

  const mk = async (n, role, home) => {
    const user = await prisma.user.create({
      data: {
        firstName: n, lastName: `${TAG}${label}`,
        username: `${n.toLowerCase()}_${TAG.toLowerCase()}_${label.toLowerCase()}`,
        passwordHash: 'x', role, homeBranchId: home,
      } });
    made.users.push(user.id);
    return user;
  };

  const group = await prisma.group.create({
    data: { branchId: branch.id, name: `${TAG}${label} guruh` } });
  made.groups.push(group.id);

  const student = await mk('Stu', 'student', branch.id);
  const teacher = await mk('Tea', 'teacher', branch.id);
  const staff = await mk('Sta', 'director', branch.id);
  const foreign = await mk('For', 'student', other.id);
  const dir = await mk('Dir', 'director', branch.id);

  // ── O'QUVCHI: oylik plan + to'g'ridan-to'g'ri to'lov + DEPOZIT ──
  const plan = await prisma.studentPayment.create({
    data: {
      branchId: branch.id, studentId: student.id, groupId: group.id,
      year: 2034, month: 3, baseFee: 500_000, expectedAmount: 500_000,
      paidAmount: 200_000, status: 'partial',
    } });
  // TO'G'RIDAN-TO'G'RI to'lov — SANALADI.
  await prisma.paymentTransaction.create({
    data: {
      branchId: branch.id, paymentId: plan.id, studentId: student.id,
      groupId: group.id, year: 2034, month: 3, amount: 200_000,
      method: 'cash', source: 'direct', paidAt: new Date(Date.UTC(2034, 2, 10)),
    } });

  const dep = await prisma.studentDeposit.create({
    data: { studentId: student.id, balance: 100_000 } });
  // DEPOZITGA TO'LDIRISH — SANALADI (+).
  await prisma.depositTransaction.create({
    data: {
      branchId: branch.id, studentId: student.id, depositId: dep.id,
      type: 'topup', amount: 100_000, method: 'cash', balanceAfter: 100_000,
      paidAt: new Date(Date.UTC(2034, 2, 12)), note: `${TAG} topup`,
    } });
  // ⚠ DEPOZITDAN QOPLANGAN to'lov — SANALMASLIGI SHART (ichki ko'chirish).
  await prisma.paymentTransaction.create({
    data: {
      branchId: branch.id, paymentId: plan.id, studentId: student.id,
      groupId: group.id, year: 2034, month: 3, amount: 50_000,
      method: 'cash', source: 'deposit', paidAt: new Date(Date.UTC(2034, 2, 13)),
    } });

  // ── O'QITUVCHI: hisoblangan maosh + USHLANMA (manfiy) + to'lov ──
  const groupSalary = await prisma.teacherSalary.create({
    data: {
      branchId: branch.id, teacherId: teacher.id, groupId: group.id,
      year: 2034, month: 3, kind: 'group', expectedAmount: 1_200_000,
      paidAmount: 0, status: 'unpaid',
    } });
  // ⚠ USHLANMA MANFIY saqlanadi — ledger uni ADJUSTMENT deb ko'rsatadi.
  await prisma.teacherSalary.create({
    data: {
      branchId: branch.id, teacherId: teacher.id, year: 2034, month: 3,
      kind: 'deduction', expectedAmount: -150_000, paidAmount: 0,
      status: 'unpaid', reason: `${TAG} ushlanma`,
    } });
  // ⚠ `salaryId` MAJBURIY (FK) — maosh to'lovi HAR DOIM aniq maosh
  // qatoriga bog'langan bo'ladi.
  await prisma.salaryTransaction.create({
    data: {
      branchId: branch.id, salaryId: groupSalary.id,
      teacherId: teacher.id, year: 2034, month: 3,
      amount: 400_000, method: 'cash', paidAt: new Date(Date.UTC(2034, 2, 25)),
    } });

  // ── XODIM: payroll + to'lov ──
  const payroll = await prisma.staffPayroll.create({
    data: {
      branchId: branch.id, employeeId: staff.id, year: 2034, month: 3,
      finalAmount: 900_000, openingCreditTotal: 0, openingDebtApplied: 0,
    } });
  // ⚠ `payrollId` MAJBURIY (FK).
  await prisma.staffSalaryTransaction.create({
    data: {
      branchId: branch.id, payrollId: payroll.id,
      employeeId: staff.id, year: 2034, month: 3,
      amount: 300_000, method: 'card', paidAt: new Date(Date.UTC(2034, 2, 28)),
    } });

  // ── BOSHLANG'ICH QOLDIQ (langar) + uning MATERIALIZATSIYASI ──
  // ⚠ Ikkalasi ham bor: ledger FAQAT langarni sanashi kerak.
  await prisma.openingBalance.create({
    data: {
      userId: student.id, role: 'student', amount: -80_000,
      branchId: branch.id, groupId: group.id, year: 2034, month: 2,
      kind: 'student_debt', signConvention: 'party',
      note: `${TAG} qoldiq`, materializedAt: new Date(Date.UTC(2034, 1, 28)),
    } });
  // MATERIALIZATSIYA — `isOpening: true`, ledger uni CHIQARIB TASHLASHI SHART.
  await prisma.studentPayment.create({
    data: {
      branchId: branch.id, studentId: student.id, groupId: group.id,
      year: 2034, month: 2, baseFee: 80_000, expectedAmount: 80_000,
      paidAmount: 0, status: 'unpaid', isOpening: true,
    } });

  return { branch, other, group, student, teacher, staff, foreign, dir };
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mLEDGER — PARITET\x1b[0m  (${TAG})`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false }, select: { id: true, role: true } });
  if (!owner) throw new Error('owner topilmadi');
  const ownerToken = mintToken(owner);

  const fx = { [EXPRESS]: await makeFixture('E'), [NEST]: await makeFixture('N') };
  const tok = {};
  for (const base of [EXPRESS, NEST]) {
    tok[base] = {
      dir: mintToken(fx[base].dir),
      student: mintToken(fx[base].student),
      teacher: mintToken(fx[base].teacher),
    };
  }

  const call = (base, path, { as, branchId } = {}) =>
    request(base, 'GET', path, {
      token: as ? tok[base][as] : ownerToken,
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
      [f.student.id, '<STU>'], [f.teacher.id, '<TEA>'], [f.staff.id, '<STA>'],
      [f.foreign.id, '<FOR>'], [f.dir.id, '<DIR>'], [owner.id, '<OWNER>'],
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
    if (rateLimited(e) || rateLimited(n)) { skip(name, '429'); return {}; }
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
      bad(`${name} — KUTILGAN STATUS`, `kutilgan ${code}, keldi ${m.e.status}`);
      return false;
    }
    ok(`${name} — kutilgan status ${code}`);
    return true;
  };

  // ─────────────────────────────────────────────────────────────────
  section("1) O'QUVCHI — IKKI BARAVAR HISOBLASH YO'Q");
  // ─────────────────────────────────────────────────────────────────

  const stu = await mirror("GET /ledger/:studentId", (base, f) =>
    call(base, `/api/ledger/${f.student.id}`, { branchId: f.branch.id }));
  expectStatus(stu, 200, 'GET /ledger/:studentId');

  /**
   * ⚠ ENG NOZIK TEKSHIRUV — QATOR TURLARINI SANAB CHIQAMIZ.
   *
   * Fikstura ATAYLAB shunday qurilgan:
   *   plan 500k, to'g'ridan-to'g'ri to'lov 200k, depozit topup 100k,
   *   DEPOZITDAN qoplangan 50k, boshlang'ich qoldiq −80k va uning
   *   MATERIALIZATSIYASI (isOpening plan 80k).
   *
   * TO'G'RI natija:  −500k (charge) + 200k (payment_in) + 100k
   *                  (deposit_in) − 80k (opening) = −280 000
   *
   * Agar `source:"deposit"` SANALSA → −230 000 (o'quvchi 50k ni ikki
   * marta to'lagandek). Agar `isOpening` plan sanalsa → −360 000
   * (qarz ikki marta). Ikkala xato ham AYNAN shu yerda ushlanadi.
   */
  /**
   * ⚠ IKKALA STEK ALOHIDA TEKSHIRILADI.
   *
   * Ilgari bu blok faqat `stu.e` (EXPRESS) tanasini o'qirdi. Sabotaj
   * tekshiruvi ko'rsatdiki, NestJS'da ikki baravar hisoblash ochilganda
   * bu invariant baribir YASHIL berardi — u tekshirmayotgan stekni
   * o'lchagan bo'lardi. Paritet solishtiruvi buni ushladi, lekin
   * INVARIANTNING O'ZI ko'r edi.
   */
  const checkNoDoubleCount = (label, body) => {
    const rows = body?.rows || [];
    const kinds = rows.reduce((m, r) => ({ ...m, [r.type]: (m[r.type] || 0) + 1 }), {});
    const expected = { charge: 1, payment_in: 1, deposit_in: 1, opening: 1 };
    // ⚠ KALIT TARTIBIDAN MUSTAQIL solishtiruv: `JSON.stringify` obyekt
    // kalitlari tartibiga sezgir va qatorlar KELISH tartibida yig'iladi
    // (saralashdan keyin `opening` birinchi). Tartibga bog'liq
    // solishtiruv to'g'ri natijani YOLG'ON QIZIL qilgan edi.
    const sortedJson = (o) =>
      JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
    const okKinds = sortedJson(kinds) === sortedJson(expected);
    const okBalance = body?.currentBalance === -280_000;
    if (okKinds && okBalance) {
      ok(`IKKI BARAVAR YO'Q (${label}): qatorlar ${JSON.stringify(kinds)}, ` +
         `balans ${body.currentBalance}`);
    } else {
      bad(`IKKI BARAVAR HISOBLASH (${label})`,
        `qatorlar ${JSON.stringify(kinds)} (kutilgan ${JSON.stringify(expected)}), ` +
        `balans ${body?.currentBalance} (kutilgan -280000)`);
    }
  };

  if (ranOk(stu)) {
    checkNoDoubleCount('express', stu.e.body?.data);
    checkNoDoubleCount('nest', stu.n.body?.data);
  } else {
    skip("ikki baravar tekshiruvi", "so'rov o'lchanmadi");
  }

  // ─────────────────────────────────────────────────────────────────
  section("2) O'QITUVCHI — USHLANMA ISHORASI");
  // ─────────────────────────────────────────────────────────────────

  const tea = await mirror('GET /ledger/:teacherId', (base, f) =>
    call(base, `/api/ledger/${f.teacher.id}`, { branchId: f.branch.id }));
  expectStatus(tea, 200, 'GET /ledger/:teacherId');

  /**
   * ⚠ USHLANMA MANFIY saqlanadi va ledger uni `adjustment` deb
   * ko'rsatadi — ISHORANI O'ZGARTIRMAY. `Math.abs` yoki `-amount`
   * qo'llanilsa markazning qarzi 150k ga NOTO'G'RI o'zgarardi.
   *
   * TO'G'RI: +1 200 000 (accrual) − 150 000 (adjustment)
   *          − 400 000 (payment_out) = +650 000
   */
  // ⚠ IKKALA STEK — yuqoridagi sabab bilan.
  const checkDeduction = (label, b) => {
    const adj = (b?.rows || []).find((r) => r.type === 'adjustment');
    const okAll = adj?.amount === -150_000 && b?.currentBalance === 650_000;
    okAll
      ? ok(`USHLANMA ISHORASI (${label}): adjustment ${adj.amount}, balans ${b.currentBalance}`)
      : bad(`ushlanma ishorasi (${label})`,
          `adjustment ${adj?.amount} (kutilgan -150000), ` +
          `balans ${b?.currentBalance} (kutilgan 650000)`);
  };
  if (ranOk(tea)) {
    checkDeduction('express', tea.e.body?.data);
    checkDeduction('nest', tea.n.body?.data);
  } else {
    skip('ushlanma ishorasi', "so'rov o'lchanmadi");
  }

  // ─────────────────────────────────────────────────────────────────
  section('3) XODIM');
  // ─────────────────────────────────────────────────────────────────

  const sta = await mirror('GET /ledger/:staffId', (base, f) =>
    call(base, `/api/ledger/${f.staff.id}`, { branchId: f.branch.id }));
  expectStatus(sta, 200, 'GET /ledger/:staffId');

  // 900k (accrual) − 300k (payment_out) = 600k
  if (ranOk(sta)) {
    for (const [label, b] of [['express', sta.e.body?.data], ['nest', sta.n.body?.data]]) {
      b?.currentBalance === 600_000
        ? ok(`xodim balansi (${label}) ${b.currentBalance}`)
        : bad(`xodim balansi (${label})`, `${b?.currentBalance} (kutilgan 600000)`);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  section('4) SANA FILTRI — BALANS TO\'LIQ TARIXDAN');
  // ─────────────────────────────────────────────────────────────────

  /**
   * ⚠ Filtr FAQAT ko'rsatishni cheklaydi. Mart oyini so'raymiz:
   * ro'yxatda fevraldagi boshlang'ich qoldiq KO'RINMAYDI, lekin
   * `currentBalance` va qolgan qatorlarning `balanceAfter` qiymatlari
   * uni HISOBGA OLGAN bo'lishi SHART.
   */
  const filtered = await mirror("GET /ledger/:id?from=mart", (base, f) =>
    call(base, `/api/ledger/${f.student.id}?from=2034-03-01&to=2034-03-31`,
      { branchId: f.branch.id }));

  if (ranOk(filtered)) {
    for (const [label, b] of [
      ['express', filtered.e.body?.data], ['nest', filtered.n.body?.data],
    ]) {
      const hasOpening = (b?.rows || []).some((r) => r.type === 'opening');
      const okAll = !hasOpening && b?.currentBalance === -280_000;
      okAll
        ? ok(`filtr (${label}): qoldiq yashirildi, balans TO'LIQ tarixdan (${b.currentBalance})`)
        : bad(`sana filtri (${label})`,
            `opening ko'rindi=${hasOpening}, balans ${b?.currentBalance} (kutilgan -280000)`);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  section('5) /me VA KO\'LAM');
  // ─────────────────────────────────────────────────────────────────

  // ⚠ `/me` RUXSATSIZ ishlaydi — o'quvchida hech qanday finance ruxsati yo'q.
  const me = await mirror('GET /ledger/me (o\'quvchi, ruxsatsiz)', (base) =>
    call(base, '/api/ledger/me', { as: 'student' }));
  expectStatus(me, 200, 'GET /ledger/me');

  const meTea = await mirror("GET /ledger/me (o'qituvchi)", (base) =>
    call(base, '/api/ledger/me', { as: 'teacher' }));
  expectStatus(meTea, 200, "GET /ledger/me (o'qituvchi)");

  await mirror("GET /ledger/me (token yo'q → 401)", (base) =>
    request(base, 'GET', '/api/ledger/me', { headers: { 'x-forwarded-for': RUN_IP } }));

  // ⚠ BEGONA FILIAL → 404 (403 EMAS: mavjudligini oshkor qilmaymiz).
  const cross = await mirror('begona filial odami → 404', (base, f) =>
    call(base, `/api/ledger/${f.foreign.id}`, { as: 'dir', branchId: f.branch.id }));
  expectStatus(cross, 404, 'begona filial odami');

  // MUSBAT NAZORAT: O'SHA direktor O'Z filiali odamini KO'RADI.
  const own = await mirror("MUSBAT NAZORAT: direktor o'z filialida ko'radi", (base, f) =>
    call(base, `/api/ledger/${f.student.id}`, { as: 'dir', branchId: f.branch.id }));
  expectStatus(own, 200, "direktor o'z filialida");

  await mirror('GET /ledger/:id (404)', (base) =>
    call(base, `/api/ledger/${'a'.repeat(24)}`));
  await mirror('GET /ledger/:id (noto\'g\'ri ID → 400)', (base) =>
    call(base, '/api/ledger/qisqa'));

  // ─────────────────────────────────────────────────────────────────
  section('6) BAZA DRIFTI');
  // ─────────────────────────────────────────────────────────────────

  await cleanup();
  const leftover = {
    branches: await prisma.branch.count({ where: { name: { startsWith: TAG } } }),
    users: await prisma.user.count({ where: { lastName: { startsWith: TAG } } }),
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
