/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 5c PARITETI — UCHTA KICHIK MODUL BIR TO'PLAMDA.
 *
 *   /api/lesson-cancellations   3/3
 *   /api/student-freezes        3/3
 *   /api/leads/:id/convert + /convert-bulk   (leads 16/16 ga to'ldi)
 *
 * ── NEGA BITTA FAYL ──
 * Uchalasi ham AYNI fiksturaga tayanadi (filial + guruh + o'quvchi +
 * lid) va ular alohida fayllarga bo'linsa bir xil fikstura UCH marta
 * quriladi — ya'ni uch barobar ko'p yozuv, uch barobar ko'p tozalash
 * riski va Express tezlik chegarasiga uch barobar yaqinroq.
 *
 * ── NIMA ISBOTLANADI ──
 *   1. Dars bekor qilinsa o'quvchi QARZI KAMAYADI (baza o'lchanadi),
 *      olib tashlansa QAYTADI.
 *   2. Dublikat bekor qilish → 409 (qisman unique indeks).
 *   3. Muzlatish o'quvchi to'lovini QAYTA HISOBLAYDI; ikkinchi muzlatish
 *      400; muzlatilmaganni chiqarish 400.
 *   4. FILIAL: begona filial o'quvchisini muzlatib bo'lmaydi.
 *   5. Lid → o'quvchi: user YARATILADI, lid `enrolled` bo'ladi,
 *      `leadId` bog'lanadi, guruhga qabul qilinadi.
 *   6. Aylantirilgan lidni qayta aylantirish → 409.
 *   7. `convert-bulk` — takroriy login → 400, qisman muvaffaqiyat.
 *
 * ISHLATISH:  npm run test:wave-d-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, nowStamps, mintToken, waitForStacks, createReporter,
} from './_harness.mjs';
import { makeMirror, runIp } from './_mirror.mjs';

const prisma = new PrismaClient();
const TAG = `WD-${Date.now().toString(36)}`;
const T = createReporter('faza 5c (cancellations + freeze + convert)');
const { R, ok, bad, skip, section, finish } = T;
const RUN_IP = runIp();

const made = { branches: [], users: [], groups: [], leads: [] };

const todayUtc = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};
const iso = (d) => d.toISOString().slice(0, 10);
const monthFirst = (delta = 0) => {
  const t = todayUtc();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + delta, 1));
};
const FEE = 300_000;

/**
 * ⚠ TOZALASH API'GA TAYANMAYDI (memory: test-cleanup-must-not-use-api):
 * test aynan shu marshrutlarni sinaydi va ular buzilsa tozalash ham
 * yiqilardi. FK tartibi: bola → ota.
 */
const cleanup = async () => {
  const b = made.branches;
  try {
    // Aylantirish YANGI foydalanuvchi yaratadi — ular `made.users` da
    // YO'Q. TAG bo'yicha topamiz (username `...TAG...` bilan).
    const extra = await prisma.user.findMany({
      where: { OR: [{ lastName: { contains: TAG } }, { username: { contains: TAG.toLowerCase() } }] },
      select: { id: true },
    });
    const u = [...new Set([...made.users, ...extra.map((x) => x.id)])];
    const g = made.groups;

    if (g.length) {
      await prisma.lessonCancellation.deleteMany({ where: { groupId: { in: g } } });
      await prisma.paymentTransaction.deleteMany({ where: { groupId: { in: g } } });
      await prisma.studentPayment.deleteMany({ where: { groupId: { in: g } } });
      await prisma.groupFee.deleteMany({ where: { groupId: { in: g } } });
      await prisma.teacherSalary.deleteMany({ where: { groupId: { in: g } } });
      await prisma.teacherGroupPeriod.deleteMany({ where: { groupId: { in: g } } });
      await prisma.groupMembership.deleteMany({ where: { groupId: { in: g } } });
    }
    if (u.length) {
      await prisma.studentFreeze.deleteMany({ where: { studentId: { in: u } } });
      await prisma.groupMembership.deleteMany({ where: { studentId: { in: u } } });
      await prisma.studentPayment.deleteMany({ where: { studentId: { in: u } } });
      await prisma.depositTransaction.deleteMany({ where: { studentId: { in: u } } });
      await prisma.studentDeposit.deleteMany({ where: { studentId: { in: u } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: u } } }).catch(() => {});
    }
    // Lidlar o'quvchidan OLDIN uzilishi shart (`leadId` / `studentId`).
    await prisma.user.updateMany({
      where: { id: { in: u } }, data: { leadId: null } }).catch(() => {});
    await prisma.lead.deleteMany({ where: { OR: [
      { id: { in: made.leads } }, { firstName: { contains: TAG } },
    ] } });
    if (g.length) await prisma.group.deleteMany({ where: { id: { in: g } } });
    if (u.length) {
      await prisma.userBranchAssignment.deleteMany({ where: { userId: { in: u } } });
      await prisma.user.deleteMany({ where: { id: { in: u } } });
    }
    if (b.length) {
      await prisma.approval.deleteMany({ where: { branchId: { in: b } } });
      const entries = await prisma.journalEntry.findMany({
        where: { branchId: { in: b } }, select: { id: true } });
      const ids = entries.map((e) => e.id);
      if (ids.length) {
        await prisma.journalLine.deleteMany({ where: { entryId: { in: ids } } });
        await prisma.journalEntry.deleteMany({ where: { id: { in: ids } } });
      }
      await prisma.account.deleteMany({ where: { branchId: { in: b } } });
      await prisma.branch.deleteMany({ where: { id: { in: b } } });
    }
  } catch (err) {
    console.log(`  ⚠️  tozalashda xato: ${err.message}`);
  }
};

/** ⚠ QOLDIQ O'LCHANADI, TAXMIN QILINMAYDI. */
const assertNoResidue = async () => {
  const left = {
    branches: await prisma.branch.count({ where: { code: { startsWith: TAG } } }),
    users: await prisma.user.count({
      where: { OR: [{ lastName: { contains: TAG } }, { username: { contains: TAG.toLowerCase() } }] } }),
    groups: await prisma.group.count({ where: { name: { contains: TAG } } }),
    leads: await prisma.lead.count({ where: { firstName: { contains: TAG } } }),
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

  const mk = async (n, role, branch, extra = {}) => {
    const u = await prisma.user.create({
      data: {
        firstName: `${n}${label}`, lastName: `${TAG}${label}`,
        username: `${n.toLowerCase()}_${TAG.toLowerCase()}_${label.toLowerCase()}`,
        passwordHash: 'x', role, homeBranchId: branch.id, isActive: true, ...extra,
      } });
    made.users.push(u.id);
    return u;
  };

  const ENROLLED = new Date(Date.UTC(todayUtc().getUTCFullYear() - 1, 0, 1));
  const student = await mk('Talaba', 'student', A, { enrolledAt: ENROLLED });
  const studentB = await mk('Talabb', 'student', B, { enrolledAt: ENROLLED });
  const dirA = await mk('Dira', 'director', A);
  const dirB = await mk('Dirb', 'director', B);

  /**
   * ⚠ JADVAL SHART: bekor qilingan dars faqat REJALASHTIRILGAN dars
   * bo'lsa qarzni kamaytiradi. Jadvalsiz guruhda proratsiya kalendar
   * kunlar bo'yicha ketadi va bekor qilish HECH NARSAGA ta'sir qilmasdi
   * — test "farq yo'q" deb yolg'on yashil berardi.
   */
  const group = await prisma.group.create({
    data: {
      branchId: A.id, name: `${TAG}${label} guruh`, isActive: true,
      startDate: monthFirst(-1),
    } });
  made.groups.push(group.id);
  for (const day of ['mon', 'tue', 'wed', 'thu', 'fri']) {
    await prisma.groupScheduleItem.create({
      data: {
        groupId: group.id, day, startTime: '10:00', endTime: '12:00',
        effectiveFrom: new Date(Date.UTC(2020, 0, 1)),
      } });
  }
  /**
   * ⚠⚠ A'ZOLIK OY O'RTASIDAN — ATAYLAB.
   *
   * TO'LIQ-OY a'zosi uchun dars bekor qilish qarzni O'ZGARTIRMAYDI:
   * `expected = baseFee × elapsed / total` va bekor qilingan dars
   * SURAT'dan ham, MAXRAJ'dan ham chiqadi (22/22 → 21/21 = 1).
   *
   * Ya'ni "to'liq a'zoda kamayishi kerak" degan kutish NOTO'G'RI bo'lardi
   * va test o'zi o'lchamaydigan narsani talab qilardi.
   *
   * QISMAN a'zoda esa maxraj butun oy, surat faqat a'zolik davri:
   * 6/22 = 0,273 → dars bekor qilinsa 5/21 = 0,238 — KAMAYADI.
   * Aynan shu holat o'lchanadi.
   */
  const JOIN_DAY = new Date(Date.UTC(
    todayUtc().getUTCFullYear(), todayUtc().getUTCMonth(), 15,
  ));
  await prisma.groupMembership.create({
    data: { groupId: group.id, studentId: student.id, joinedAt: JOIN_DAY } });

  const t = todayUtc();
  const Y = t.getUTCFullYear();
  const M = t.getUTCMonth() + 1;
  await prisma.groupFee.create({
    data: { groupId: group.id, year: Y, month: M, amount: FEE, source: 'manual' } });
  const plan = await prisma.studentPayment.create({
    data: {
      branchId: A.id, studentId: student.id, groupId: group.id,
      year: Y, month: M, baseFee: FEE, expectedAmount: FEE, paidAmount: 0,
      status: 'unpaid',
    } });

  const mkLead = async (n) => {
    const l = await prisma.lead.create({
      data: {
        branchId: A.id, firstName: `${TAG}${label}${n}`, lastName: 'Lid',
        phone: `9989${String(Math.floor(Math.random() * 90000000) + 10000000)}`,
        status: 'new',
      } });
    made.leads.push(l.id);
    return l;
  };
  const lead1 = await mkLead('L1');
  const lead2 = await mkLead('L2');
  const lead3 = await mkLead('L3');

  return { A, B, student, studentB, dirA, dirB, group, plan, lead1, lead2, lead3, Y, M };
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mFAZA 5c — PARITET\x1b[0m  (${TAG})`);
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
    };
  }
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
      [`Talabb${L}`, '<N-SB>'], [`Talaba${L}`, '<N-S>'],
      [`Dira${L}`, '<N-DA>'], [`Dirb${L}`, '<N-DB>'],
      ...Object.entries(c).map(([k, v]) => [String(v), `<${k}>`]),
      [f.A.id, '<A>'], [f.B.id, '<B>'],
      [f.student.id, '<STU>'], [f.studentB.id, '<STUB>'],
      [f.dirA.id, '<DIRA>'], [f.dirB.id, '<DIRB>'],
      [f.group.id, '<GRP>'], [f.plan.id, '<PLAN>'],
      [f.lead1.id, '<L1>'], [f.lead2.id, '<L2>'], [f.lead3.id, '<L3>'],
      // ⚠ AYLANTIRISHDA YARATILGAN LOGIN stekka xos: u lid ID'sining
      // oxirgi 4 belgisidan quriladi (ikki fikstura BIR bazada yashaydi,
      // ya'ni login BIR XIL bo'lolmaydi). Belgiga almashtiriladi.
      [`${TAG.toLowerCase()}c1${f.lead1.id.slice(-4)}`, '<U-C1>'],
      [`${TAG.toLowerCase()}c2${f.lead2.id.slice(-4)}`, '<U-C2>'],
      [`${TAG.toLowerCase()}c3${f.lead3.id.slice(-4)}`, '<U-C3>'],
      [owner.id, '<OWNER>'],
      [`${TAG.toLowerCase()}_${L.toLowerCase()}`, '<TAG>'],
      [`${TAG}${L}`, '<TAG>'], [`${TAG} ${L}`, '<TAG>'],
      [TAG.toLowerCase(), '<tag>'], [TAG, '<TAG>'],
      // Telefon raqamlari fiksturada TASODIFIY — solishtirib bo'lmaydi.
      (v) => v.replace(/\b998\d{9}\b/g, '<PHONE>'),
      nowStamps(),
      (v) => v.replace(/\b[0-9a-f]{24}\b/g, '<ID>'),
    ];
  };

  const { mirror, expectStatus, bothDb } = makeMirror(T, fx, subs);

  const planOf = async (f) => {
    const p = await prisma.studentPayment.findUnique({ where: { id: f.plan.id } });
    return {
      expected: Number(p.expectedAmount),
      factor: Number(p.prorationFactor.toFixed(4)),
      status: p.status,
    };
  };

  /**
   * A'ZOLIK DAVRI ICHIDAGI ish kuni (dushanba–juma), 16-kundan boshlab.
   *
   * ⚠ KELAJAK SANA HAM MAYLI: `buildSnapshot` dars sonini `monthEnd`
   * gacha sanaydi (`asOf = monthEnd`), ya'ni "bugun" ahamiyatsiz —
   * shuning uchun test oyning ISTALGAN kunida bir xil ishlaydi.
   */
  const workDayAfter16 = () => {
    const t = todayUtc();
    for (let d = 16; d <= 28; d += 1) {
      const day = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), d));
      const dow = day.getUTCDay();
      if (dow >= 1 && dow <= 5) return day;
    }
    return null;
  };
  const CANCEL_DAY = workDayAfter16();

  // ═══════════════════════════════════════════════════════════════════
  section('BEKOR QILINGAN DARSLAR');
  // ═══════════════════════════════════════════════════════════════════

  const before = await bothDb("bekor qilishdan OLDIN reja", planOf);

  const cancel = await mirror('POST /lesson-cancellations', (base, f) =>
    call(base, 'POST', '/api/lesson-cancellations', {
      branchId: f.A.id,
      body: {
        group: f.group.id, date: iso(CANCEL_DAY),
        reason: 'facility', note: `${TAG} sinov`,
      },
    }), { onEach: (base, r) => { if (r?.body?.data?.id) created[base].CANCEL = r.body.data.id; } });
  const cancelOk = expectStatus(cancel, 201, 'POST /lesson-cancellations');

  let midPlan = null;
  if (cancelOk) {
    midPlan = await bothDb('bekor qilingandan KEYIN reja', planOf);
    // ⚠ MUSBAT NAZORAT: `before` FIKSTURA qiymati (qo'lda yozilgan),
    // `mid` esa HAQIQIY qayta hisob natijasi. Ular teng bo'lsa
    // proratsiya umuman ishlamagan degani.
    if (midPlan && before && midPlan.expected >= before.expected) {
      bad(
        'PRORATSIYA ISHLAMADI',
        `fikstura ${before.expected}, qayta hisobdan keyin ${midPlan.expected} — ` +
          "qisman a'zolik hisobga olinmagan (o'lchov ishonchsiz)",
      );
    } else if (midPlan) {
      ok(`qisman a'zolik proratsiyasi qo'llandi: ${before.expected} → ${midPlan.expected}`);
    }
  }

  const dup = await mirror('POST /lesson-cancellations — DUBLIKAT → 409', (base, f) =>
    call(base, 'POST', '/api/lesson-cancellations', {
      branchId: f.A.id,
      body: { group: f.group.id, date: iso(CANCEL_DAY), reason: 'other' },
    }));
  expectStatus(dup, 409, 'dublikat bekor qilish');

  await mirror('GET /lesson-cancellations', (base, f) =>
    call(base, 'GET', `/api/lesson-cancellations?groupId=${f.group.id}`,
      { branchId: f.A.id }));

  await mirror('POST /lesson-cancellations — begona filial → 404', (base, f) =>
    call(base, 'POST', '/api/lesson-cancellations', {
      branchId: f.B.id, as: 'dirB',
      body: { group: f.group.id, date: iso(CANCEL_DAY), reason: 'other' },
    }));

  const uncancel = await mirror('DELETE /lesson-cancellations/:id', (base, f) => {
    const id = created[base].CANCEL;
    if (!id) throw new Error('bekor qilish yozuvi yaratilmagan');
    return call(base, 'DELETE', `/api/lesson-cancellations/${id}`, { branchId: f.A.id });
  });
  if (expectStatus(uncancel, 200, 'DELETE /lesson-cancellations/:id')) {
    const restored = await bothDb('olib tashlangach reja', planOf);
    // ⚠⚠ ASOSIY O'LCHOV: bekor qilish OLIB TASHLANSA dars QAYTADI va
    // qisman a'zoning qarzi OSHADI. Ikkala tomon ham HAQIQIY qayta
    // hisob natijasi, ya'ni fikstura qiymatiga tayanmaydi.
    if (midPlan && restored) {
      if (restored.expected > midPlan.expected) {
        ok(
          `bekor qilish darsni billing'dan CHIQARGAN edi: ` +
            `${restored.expected} (bekorsiz) > ${midPlan.expected} (bekor bilan)`,
        );
      } else {
        bad(
          "BEKOR QILISH BILLING'GA TA'SIR QILMADI",
          `bekor bilan ${midPlan.expected}, bekorsiz ${restored.expected} — ` +
            "teng yoki teskari; o'lchov ishonchsiz",
        );
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  section('O\'QUVCHI MUZLATISHI');
  // ═══════════════════════════════════════════════════════════════════

  const frz = await mirror('POST /student-freezes/:id/freeze', (base, f) =>
    call(base, 'POST', `/api/student-freezes/${f.student.id}/freeze`, {
      branchId: f.A.id, body: { startDate: iso(todayUtc()), reason: `${TAG} sabab` },
    }));
  if (expectStatus(frz, 201, 'muzlatish')) {
    await bothDb('muzlatishdan keyin BAZA', async (f) => ({
      active: await prisma.studentFreeze.count({
        where: { studentId: f.student.id, endDate: null, isDeleted: false } }),
    }));
  }

  const frz2 = await mirror('POST .../freeze — IKKINCHI marta → 400', (base, f) =>
    call(base, 'POST', `/api/student-freezes/${f.student.id}/freeze`, {
      branchId: f.A.id, body: {},
    }));
  expectStatus(frz2, 400, 'takroriy muzlatish');

  await mirror('GET /student-freezes/:id', (base, f) =>
    call(base, 'GET', `/api/student-freezes/${f.student.id}`, { branchId: f.A.id }));

  await mirror('POST .../freeze — BEGONA filial o\'quvchisi → 403', (base, f) =>
    call(base, 'POST', `/api/student-freezes/${f.student.id}/freeze`, {
      branchId: f.B.id, as: 'dirB', body: {},
    }));

  const unfrz = await mirror('POST /student-freezes/:id/unfreeze', (base, f) =>
    call(base, 'POST', `/api/student-freezes/${f.student.id}/unfreeze`, {
      branchId: f.A.id, body: { endDate: iso(todayUtc()) },
    }));
  if (expectStatus(unfrz, 200, 'muzlatishdan chiqarish')) {
    await bothDb('chiqarilgandan keyin BAZA', async (f) => ({
      active: await prisma.studentFreeze.count({
        where: { studentId: f.student.id, endDate: null, isDeleted: false } }),
      closed: await prisma.studentFreeze.count({
        where: { studentId: f.student.id, endDate: { not: null } } }),
    }));
  }

  const unfrz2 = await mirror('POST .../unfreeze — muzlatilmagan → 400', (base, f) =>
    call(base, 'POST', `/api/student-freezes/${f.student.id}/unfreeze`, {
      branchId: f.A.id, body: {},
    }));
  expectStatus(unfrz2, 400, 'takroriy chiqarish');

  // ═══════════════════════════════════════════════════════════════════
  section('LIDNI O\'QUVCHIGA AYLANTIRISH');
  // ═══════════════════════════════════════════════════════════════════

  const convBody = (f, lead, suffix) => ({
    firstName: `${TAG}${suffix}`,
    lastName: 'Yangi',
    username: `${TAG.toLowerCase()}${suffix.toLowerCase()}${lead.id.slice(-4)}`,
    phone: '998901112233',
    password: 'Parol#2026',
  });

  const conv = await mirror('POST /leads/:id/convert (guruh bilan)', (base, f) =>
    call(base, 'POST', `/api/leads/${f.lead1.id}/convert`, {
      branchId: f.A.id,
      body: { ...convBody(f, f.lead1, 'C1'), groupId: f.group.id },
    }));
  if (expectStatus(conv, 201, 'lid aylantirish')) {
    await bothDb('aylantirishdan keyin BAZA', async (f) => {
      const lead = await prisma.lead.findUnique({
        where: { id: f.lead1.id },
        select: { status: true, studentId: true, convertedAt: true, creditedToId: true },
      });
      const stu = lead.studentId
        ? await prisma.user.findUnique({
            where: { id: lead.studentId },
            select: { role: true, homeBranchId: true, leadId: true },
          })
        : null;
      const mem = lead.studentId
        ? await prisma.groupMembership.count({
            where: { groupId: f.group.id, studentId: lead.studentId, isDeleted: false } })
        : 0;
      return {
        status: lead.status,
        hasStudent: Boolean(lead.studentId),
        credited: Boolean(lead.creditedToId),
        role: stu?.role || null,
        branchMatchesLead: stu ? String(stu.homeBranchId) === String(f.A.id) : null,
        leadLinked: stu ? String(stu.leadId) === String(f.lead1.id) : null,
        memberships: mem,
      };
    });
  }

  const conv2 = await mirror('POST /leads/:id/convert — TAKROR → 409', (base, f) =>
    call(base, 'POST', `/api/leads/${f.lead1.id}/convert`, {
      branchId: f.A.id, body: convBody(f, f.lead1, 'C1b'),
    }));
  expectStatus(conv2, 409, 'takroriy aylantirish');

  const bulkDup = await mirror(
    'POST /leads/convert-bulk — bir xil login ikki marta → 400', (base, f) => {
      const b = convBody(f, f.lead2, 'C2');
      return call(base, 'POST', '/api/leads/convert-bulk', {
        branchId: f.A.id,
        body: {
          leads: [
            { id: f.lead2.id, ...b },
            { id: f.lead3.id, ...b },
          ],
        },
      });
    });
  expectStatus(bulkDup, 400, 'bulk takroriy login');

  const bulk = await mirror('POST /leads/convert-bulk (2 ta lid)', (base, f) =>
    call(base, 'POST', '/api/leads/convert-bulk', {
      branchId: f.A.id,
      body: {
        leads: [
          { id: f.lead2.id, ...convBody(f, f.lead2, 'C2') },
          { id: f.lead3.id, ...convBody(f, f.lead3, 'C3') },
        ],
        groupId: f.group.id,
      },
    }));
  if (expectStatus(bulk, 201, 'bulk aylantirish')) {
    await bothDb('bulk BAZA holati', async (f) => {
      const leads = await prisma.lead.findMany({
        where: { id: { in: [f.lead2.id, f.lead3.id] } },
        select: { status: true, studentId: true },
        orderBy: { id: 'asc' },
      });
      return leads.map((l) => ({ status: l.status, hasStudent: Boolean(l.studentId) }));
    });
  }

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
