/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILIAL TAHLILI — PARITET (`/api/branch-analytics`, 11/11 marshrut).
 *
 * ── NEGA O'QISH MARSHRUTLARIDA KO'ZGU FIKSTURA KERAK EMAS ──
 *
 * O'nta marshrut FAQAT O'QIYDI va ikkala stek AYNI bazani ko'radi —
 * ya'ni bir xil so'rovni ikkalasiga yuborish yetarli. Mutatsiya
 * (`POST /students/:id/transfer`) esa qaytarib bo'lmaydigan amal,
 * shuning uchun UNGA har stekka alohida fikstura beriladi.
 *
 * ── NIMA ISBOTLANADI ──
 *   1. O'nta o'qish marshruti bir xil tana qaytaradi.
 *   2. RUXSAT CHEGARASI: `/teachers` `salary.read` ostida —
 *      `branches.read` li xodim MAOSH FONDINI ko'ra olmaydi.
 *   3. `/elimination` owner-only (`system.admin_access`).
 *   4. KO'CHIRISH: depozit JURNALDA ko'chadi (debet=kredit, isInternal),
 *      guruh a'zoligi yopiladi, `homeBranchId` yangilanadi.
 *   5. KO'CHIRISHDA IKKI RUXSAT SHART (AND) — faqat `students.update`
 *      bo'lgan xodim 403 oladi.
 *   6. KO'CHIRISH IKKALA FILIAL ham ko'lamda bo'lishini talab qiladi.
 *
 * ISHLATISH:  npm run test:branch-analytics-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, nowStamps, mintToken, waitForStacks, createReporter,
} from './_harness.mjs';
import { makeMirror, runIp } from './_mirror.mjs';

const prisma = new PrismaClient();
const TAG = `BA-${Date.now().toString(36)}`;
const T = createReporter('branch-analytics');
const { R, ok, bad, skip, section, finish } = T;
const RUN_IP = runIp();

const made = { branches: [], users: [], groups: [] };
/**
 * ⚠ ROL QIYMATI HAR YURISHDA BETAKROR: ruxsat keshi JARAYONGA XOS va
 * ROL QIYMATI bo'yicha kalitlanadi. Qat'iy nom bilan ikkinchi yurish
 * BIRINCHISINING ruxsat to'plamini olardi.
 */
const ROLE_SCOPED = `__parity_ba${process.hrtime.bigint() % 1000000n}`;

const cleanup = async () => {
  try {
    const g = made.groups;
    const u = made.users;
    const b = made.branches;
    if (g.length) {
      await prisma.groupMembership.deleteMany({ where: { groupId: { in: g } } });
      await prisma.groupScheduleItem.deleteMany({ where: { groupId: { in: g } } });
    }
    if (u.length) {
      await prisma.depositTransaction.deleteMany({ where: { studentId: { in: u } } });
      await prisma.studentDeposit.deleteMany({ where: { studentId: { in: u } } });
      await prisma.groupMembership.deleteMany({ where: { studentId: { in: u } } });
    }
    if (g.length) await prisma.group.deleteMany({ where: { id: { in: g } } });
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
    if (u.length) {
      await prisma.userBranchAssignment.deleteMany({ where: { userId: { in: u } } });
      await prisma.user.deleteMany({ where: { id: { in: u } } });
    }
    if (b.length) await prisma.branch.deleteMany({ where: { id: { in: b } } });
    await prisma.role.deleteMany({ where: { value: ROLE_SCOPED } });
  } catch (err) {
    console.log(`  ⚠️  tozalashda xato: ${err.message}`);
  }
};

const assertNoResidue = async () => {
  const left = {
    branches: await prisma.branch.count({ where: { code: { startsWith: TAG } } }),
    users: await prisma.user.count({ where: { lastName: { contains: TAG } } }),
    groups: await prisma.group.count({ where: { name: { contains: TAG } } }),
    roles: await prisma.role.count({ where: { value: ROLE_SCOPED } }),
  };
  const total = Object.values(left).reduce((a, x) => a + x, 0);
  if (total === 0) ok("tozalash — QOLDIQ YO'Q (o'lchandi)");
  else bad('tozalash — QOLDIQ QOLDI', JSON.stringify(left));
};

const makeFixture = async (label) => {
  const mkBranch = async (n) => {
    const b = await prisma.branch.create({
      data: { name: `${TAG} ${label}${n}`, code: `${TAG}${label}${n}` } });
    made.branches.push(b.id);
    return b;
  };
  const A = await mkBranch('A');
  const B = await mkBranch('B');

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

  const student = await mk('Talaba', 'student', A);
  const dirA = await mk('Dira', 'director', A);

  const group = await prisma.group.create({
    data: {
      branchId: A.id, name: `${TAG}${label} guruh`, isActive: true,
      startDate: new Date(Date.UTC(2026, 0, 1)),
    } });
  made.groups.push(group.id);
  await prisma.groupMembership.create({
    data: { groupId: group.id, studentId: student.id,
      joinedAt: new Date(Date.UTC(2026, 0, 1)) } });

  // ⚠ DEPOZIT BALANSI — ko'chirishda JURNAL yozuvi shundan tug'iladi.
  // 0 bo'lsa yozuv umuman yaratilmasdi va test "jurnal yozildi" ni
  // o'lchay olmasdi.
  await prisma.studentDeposit.create({
    data: { studentId: student.id, balance: 500_000 } });

  return { A, B, student, dirA, group };
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mFILIAL TAHLILI — PARITET\x1b[0m  (${TAG})`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false }, select: { id: true, role: true } });
  if (!owner) throw new Error('owner topilmadi');
  const ownerToken = mintToken(owner);

  const fx = { [EXPRESS]: await makeFixture('E'), [NEST]: await makeFixture('N') };

  /**
   * KO'LAMLANGAN, LEKIN RUXSATLI aktyor — ruxsat chegarasini o'lchash
   * uchun. `students.update` BOR, `finance.manage` YO'Q: ko'chirishning
   * AND semantikasi aynan shu bilan sinaladi.
   */
  const wanted = ['branches.read', 'students.update'];
  const perms = await prisma.permission.findMany({
    where: { key: { in: wanted } }, select: { id: true, key: true } });
  let scopedToken = null;
  if (perms.length === wanted.length) {
    await prisma.role.deleteMany({ where: { value: ROLE_SCOPED } });
    await prisma.role.create({
      data: {
        value: ROLE_SCOPED, label: ROLE_SCOPED,
        permissions: { connect: perms.map((p) => ({ id: p.id })) },
      } });
    // Rolni fikstura direktoriga beramiz (filialga biriktirilgan).
    await prisma.user.update({
      where: { id: fx[EXPRESS].dirA.id }, data: { role: ROLE_SCOPED } });
    await prisma.user.update({
      where: { id: fx[NEST].dirA.id }, data: { role: ROLE_SCOPED } });
    scopedToken = {
      [EXPRESS]: mintToken({ id: fx[EXPRESS].dirA.id, role: ROLE_SCOPED }),
      [NEST]: mintToken({ id: fx[NEST].dirA.id, role: ROLE_SCOPED }),
    };
  } else {
    skip("ko'lamlangan aktyor", `ruxsat topilmadi: ${wanted}`);
  }

  const call = (base, method, path, { body, branchId, token } = {}) =>
    request(base, method, path, {
      token: token || ownerToken,
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
      [`Talaba${L}`, '<N-S>'], [`Dira${L}`, '<N-D>'],
      [f.A.id, '<A>'], [f.B.id, '<B>'],
      [f.student.id, '<STU>'], [f.dirA.id, '<DIR>'], [f.group.id, '<GRP>'],
      [owner.id, '<OWNER>'],
      [`${TAG.toLowerCase()}_${L.toLowerCase()}`, '<TAG>'],
      [`${TAG} ${L}`, '<TAG>'], [`${TAG}${L}`, '<TAG>'], [TAG, '<TAG>'],
      nowStamps(),
      // ⚠ ENG OXIRIDA: yuqoridagi ANIQ almashtirishlar allaqachon
      // bajarilgan, qolgan har qanday 24-belgili ID stekka xos
      // (masalan `membershipId`) va uni solishtirib bo'lmaydi.
      (v) => v.replace(/\b[0-9a-f]{24}\b/g, '<ID>'),
    ];
  };

  const { mirror, expectStatus, bothDb } = makeMirror(T, fx, subs);

  // ═══════════════════════════════════════════════════════════════════
  section("O'QISH MARSHRUTLARI (10 ta)");
  //
  // ⚠ BU YERDA HAR STEKKA O'Z FIKSTURASI KERAK EMAS — marshrutlar
  // faqat o'qiydi. Lekin so'rov `x-branch-id` bilan FIKSTURA FILIALIGA
  // ko'lamlanadi: aks holda javob butun bazani qamrab, ikki stek
  // fiksturasi bir-birining natijasiga aralashardi.
  // ═══════════════════════════════════════════════════════════════════

  const RANGE = '?from=2026-01-01&to=2026-12-31';
  for (const [name, path] of [
    ['GET /pnl', `/api/branch-analytics/pnl${RANGE}`],
    ['GET /pnl (consolidated)', `/api/branch-analytics/pnl${RANGE}&consolidated=true`],
    ['GET /utilization', '/api/branch-analytics/utilization'],
    ['GET /churn', `/api/branch-analytics/churn${RANGE}`],
    ['GET /normalized', `/api/branch-analytics/normalized${RANGE}`],
    ['GET /sales', `/api/branch-analytics/sales${RANGE}`],
    ['GET /teachers', `/api/branch-analytics/teachers${RANGE}`],
    ['GET /rooms', '/api/branch-analytics/rooms'],
  ]) {
    await mirror(name, (base, f) => call(base, 'GET', path, { branchId: f.A.id }));
  }

  // `/elimination` va `/alerts` — TARMOQ darajasida (ko'lamsiz).
  // ⚠ `x-branch-id` BERILMAYDI: `/elimination` butun tarmoq bo'yicha
  // va ko'lamlangan so'rov uni ma'nosiz qilardi.
  await mirror('GET /elimination', (base) =>
    call(base, 'GET', `/api/branch-analytics/elimination${RANGE}`));
  await mirror('GET /alerts', (base) =>
    call(base, 'GET', '/api/branch-analytics/alerts'));

  // ═══════════════════════════════════════════════════════════════════
  section('RUXSAT CHEGARALARI');
  // ═══════════════════════════════════════════════════════════════════

  if (scopedToken) {
    // ⚠ MUSBAT NAZORAT BIRINCHI: aktyor umuman ishlayotganini
    // isbotlamasdan, quyidagi 403 "ruxsat ishlayapti" dan emas,
    // "token buzuq" dan ham kelishi mumkin edi.
    const okRes = await mirror('MUSBAT NAZORAT: /churn — `branches.read` bilan 200',
      (base, f) => call(base, 'GET', `/api/branch-analytics/churn${RANGE}`,
        { branchId: f.A.id, token: scopedToken[base] }));
    expectStatus(okRes, 200, 'ko\'lamlangan aktyor /churn');

    const teachersRes = await mirror(
      'GET /teachers — `salary.read` yo\'q → 403',
      (base, f) => call(base, 'GET', `/api/branch-analytics/teachers${RANGE}`,
        { branchId: f.A.id, token: scopedToken[base] }));
    expectStatus(teachersRes, 403, 'maosh fondi yopiq');

    const elimRes = await mirror(
      'GET /elimination — `system.admin_access` yo\'q → 403',
      (base) => call(base, 'GET', `/api/branch-analytics/elimination${RANGE}`,
        { token: scopedToken[base] }));
    expectStatus(elimRes, 403, 'elimination owner-only');
  }

  // ═══════════════════════════════════════════════════════════════════
  section("O'QUVCHINI FILIALLARARO KO'CHIRISH");
  // ═══════════════════════════════════════════════════════════════════

  await mirror('GET /students/:id/transfer-preview', (base, f) =>
    call(base, 'GET',
      `/api/branch-analytics/students/${f.student.id}/transfer-preview?toBranchId=${f.B.id}`));

  await mirror("GET .../transfer-preview — AYNI filial → 400", (base, f) =>
    call(base, 'GET',
      `/api/branch-analytics/students/${f.student.id}/transfer-preview?toBranchId=${f.A.id}`));

  if (scopedToken) {
    const noFinance = await mirror(
      "POST .../transfer — `finance.manage` yo'q → 403 (AND semantikasi)",
      (base, f) => call(base, 'POST',
        `/api/branch-analytics/students/${f.student.id}/transfer`,
        { body: { toBranchId: f.B.id }, token: scopedToken[base] }));
    expectStatus(noFinance, 403, 'ikki ruxsat SHART');

    await bothDb("403 dan keyin o'quvchi FILIALI o'zgarmadi", async (f) => {
      const u = await prisma.user.findUnique({
        where: { id: f.student.id }, select: { homeBranchId: true } });
      return String(u.homeBranchId) === String(f.A.id) ? 'A' : 'BOSHQA';
    });
  }

  const moved = await mirror('POST /students/:id/transfer', (base, f) =>
    call(base, 'POST',
      `/api/branch-analytics/students/${f.student.id}/transfer`,
      { body: { toBranchId: f.B.id, note: `${TAG} sinov` } }));
  if (expectStatus(moved, 200, "o'quvchini ko'chirish")) {
    await bothDb("ko'chirishdan keyin BAZA holati", async (f) => {
      const u = await prisma.user.findUnique({
        where: { id: f.student.id }, select: { homeBranchId: true } });
      const openMems = await prisma.groupMembership.count({
        where: { studentId: f.student.id, leftAt: null, isDeleted: false } });
      const entries = await prisma.journalEntry.findMany({
        where: { branchId: { in: [f.A.id, f.B.id] } },
        select: {
          branchId: true, isInternal: true,
          lines: { select: { debit: true, credit: true, accountKind: true } },
        },
      });
      let unbalanced = 0;
      for (const e of entries) {
        const d = e.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
        const c = e.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
        if (Math.abs(d - c) > 0.005) unbalanced += 1;
      }
      return {
        movedToB: String(u.homeBranchId) === String(f.B.id),
        openMemberships: openMems,
        journalEntries: entries.length,
        allInternal: entries.every((e) => e.isInternal === true),
        unbalanced,
      };
    });
  }

  const again = await mirror("POST .../transfer — AYNI filialga takror → 400",
    (base, f) => call(base, 'POST',
      `/api/branch-analytics/students/${f.student.id}/transfer`,
      { body: { toBranchId: f.B.id } }));
  expectStatus(again, 400, 'takroriy ko\'chirish');

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
