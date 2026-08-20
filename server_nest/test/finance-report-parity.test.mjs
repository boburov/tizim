/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOLIYA HISOBOTI — PARITET (FAZA 7.2)
 *
 * Express `/api/finance-report` (5 marshrut) ↔ NestJS ekvivalenti.
 *
 * ── NEGA BU JURNAL TESTIDAN SODDAROQ ──
 *
 * Bu modul FAQAT O'QIYDI — birorta yozuv yo'li yo'q. Ya'ni bir xil
 * so'rovni ikkala stekka yuborib javobni solishtirish YETARLI: ikkinchi
 * chaqiruv birinchisining natijasini ko'rmaydi.
 *
 * ── LEKIN BO'SH JAVOB YOLG'ON YASHIL BERADI ──
 *
 * Ma'lumotsiz bazada har besh endpoint ham nol/bo'sh qaytaradi va
 * `deepEqual` MUVAFFAQIYATLI bo'ladi — hech narsa o'lchanmagan holda.
 * Shuning uchun test O'Z MOLIYAVIY FIKSTURASINI quradi:
 *
 *   • 2 filial (A — asosiy, C — begona, izolyatsiya uchun)
 *   • guruh + o'quvchi + o'qituvchi + xodim
 *   • to'lov rejasi (billed/paid), to'lov tranzaksiyasi (kassa kirimi)
 *   • o'qituvchi maoshi + maosh tranzaksiyasi
 *   • xodim maosh tranzaksiyasi
 *   • umumiy chiqim (cash + accrual, kapital ham)
 *   • hisobdan chiqarilgan qarz (write-off) + oylik taqsimoti
 *
 * Har tekshiruvda javob NOL EMASLIGI ham ochiq tasdiqlanadi — aks holda
 * "bir xil" degan natija ma'nosiz bo'lardi.
 *
 * ── FILIAL IZOLYATSIYASI ──
 * `getLedger` va `getWriteOffs` da ko'lam AYNAN KO'CHIRISHDA yopilgan
 * teshik edi (Express izohiga qarang). Shuning uchun ular ko'lamli
 * direktor bilan alohida sinaladi: A direktori O'Z ma'lumotini ko'radi
 * (musbat nazorat), C direktori esa A niki KO'RMAYDI (manfiy nazorat).
 *
 * ISHLATISH:  node test/finance-report-parity.test.mjs
 *             NEST_URL=http://127.0.0.1:5002 node test/finance-report-parity.test.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS,
  NEST,
  request,
  mintToken,
  waitForStacks,
  createReporter,
} from './_harness.mjs';

const prisma = new PrismaClient();
const TAG = `FR-${Date.now().toString(36)}`;
const { R, ok, bad, section, both, finish } = createReporter('finance-report');

const made = { branches: [], users: [], groups: [] };

// Hisobot oyi — o'tmishda, ATAYLAB: joriy oyda boshqa testlar va demo
// ma'lumot bo'lishi mumkin, o'tmishdagi tanlangan oy esa faqat bizniki.
const Y = 2031;
const M = 7;
const AT = new Date(Date.UTC(Y, M - 1, 15, 12, 0, 0));

const cleanup = async () => {
  const bids = made.branches;
  if (!bids.length) return;
  try {
    const gids = made.groups;
    await prisma.debtWriteOffBreakdown.deleteMany({
      where: { writeOff: { groupId: { in: gids } } },
    }).catch(() => {});
    await prisma.debtWriteOff.deleteMany({ where: { groupId: { in: gids } } });
    await prisma.paymentTransaction.deleteMany({ where: { branchId: { in: bids } } });
    await prisma.salaryTransaction.deleteMany({ where: { branchId: { in: bids } } });
    await prisma.staffSalaryTransaction.deleteMany({ where: { branchId: { in: bids } } });
    await prisma.staffPayrollItem.deleteMany({
      where: { payroll: { branchId: { in: bids } } },
    }).catch(() => {});
    await prisma.staffPayroll.deleteMany({ where: { branchId: { in: bids } } });
    await prisma.studentPayment.deleteMany({ where: { branchId: { in: bids } } });
    await prisma.teacherSalary.deleteMany({ where: { branchId: { in: bids } } });
    await prisma.expense.deleteMany({ where: { branchId: { in: bids } } });
    const es = await prisma.journalEntry.findMany({
      where: { branchId: { in: bids } }, select: { id: true },
    });
    await prisma.journalLine.deleteMany({ where: { entryId: { in: es.map((e) => e.id) } } });
    await prisma.journalLine.deleteMany({ where: { account: { branchId: { in: bids } } } });
    await prisma.journalEntry.deleteMany({ where: { id: { in: es.map((e) => e.id) } } });
    await prisma.financialAuditLog.deleteMany({ where: { branchId: { in: bids } } });
    await prisma.account.deleteMany({ where: { branchId: { in: bids } } });
    await prisma.groupMembership.deleteMany({ where: { groupId: { in: gids } } });
    await prisma.group.deleteMany({ where: { id: { in: gids } } });
    if (made.users.length) {
      await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    }
    await prisma.branch.deleteMany({ where: { id: { in: bids } } });
  } catch (e) {
    console.error('  ⚠ tozalash xatosi:', e.message);
  }
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mMOLIYA HISOBOTI — PARITET\x1b[0m  (${TAG})`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false },
    select: { id: true, role: true },
  });
  if (!owner) throw new Error('owner topilmadi');
  const token = mintToken(owner);

  // ── FIKSTURA ──
  const brA = await prisma.branch.create({ data: { name: `${TAG} A`, code: `${TAG}A` } });
  const brC = await prisma.branch.create({ data: { name: `${TAG} C`, code: `${TAG}C` } });
  made.branches.push(brA.id, brC.id);

  const mkUser = async (n, role, home) => {
    const u = await prisma.user.create({
      data: {
        firstName: n, lastName: TAG,
        username: `${n.toLowerCase()}_${TAG.toLowerCase()}`,
        passwordHash: 'x', role, homeBranchId: home,
      },
    });
    made.users.push(u.id);
    return u;
  };
  const student = await mkUser('Talaba', 'student', brA.id);
  // ⚠ IKKINCHI O'QUVCHI SHART. `student_payments` da qisman unique
  // indeks bor: (studentId, groupId, year, month, isOpening) — bitta
  // o'quvchiga bir oyda IKKITA reja yozib bo'lmaydi. Bu PUL XAVFSIZLIGI
  // indeksi (qarang: migrations/..._partial_unique_indexes), shuning
  // uchun hisobdan chiqarilgan reja BOSHQA o'quvchiga yoziladi.
  const student2 = await mkUser('Talaba2', 'student', brA.id);
  const teacher = await mkUser('Ustoz', 'teacher', brA.id);
  const staff = await mkUser('Xodim', 'reception', brA.id);
  const dirA = await mkUser('DirA', 'director', brA.id);
  const dirC = await mkUser('DirC', 'director', brC.id);
  const dirTokenA = mintToken(dirA);
  const dirTokenC = mintToken(dirC);

  const group = await prisma.group.create({
    data: { branchId: brA.id, name: `${TAG} guruh` },
  });
  made.groups.push(group.id);

  // To'lov rejasi: hisoblangan 1 000 000, to'langan 700 000.
  //
  // ⚠ TRANZAKSIYALAR REJAGA BOG'LANADI. `PaymentTransaction.paymentId`,
  // `SalaryTransaction.salaryId` va `StaffSalaryTransaction.payrollId`
  // MAJBURIY (nullable emas) — ya'ni "rejasiz to'lov" degan holat
  // sxema darajasida MUMKIN EMAS. Fikstura shu bog'lanishni hurmat
  // qiladi, aks holda test haqiqiy ma'lumot shaklini sinamagan bo'lardi.
  const plan = await prisma.studentPayment.create({
    data: {
      branchId: brA.id, studentId: student.id, groupId: group.id,
      year: Y, month: M, expectedAmount: 1_000_000, paidAmount: 700_000,
      baseFee: 1_000_000, status: 'partial',
    },
  });
  // Hisobdan chiqarilgan (yomon qarz) reja — billed'dan CHIQARILADI,
  // `badDebt` ga qo'shiladi.
  await prisma.studentPayment.create({
    data: {
      branchId: brA.id, studentId: student2.id, groupId: group.id,
      year: Y, month: M, expectedAmount: 300_000, paidAmount: 0,
      baseFee: 300_000, status: 'unpaid',
      writtenOff: true, writeOffAmount: 300_000,
    },
  });
  // Kassa kirimi.
  await prisma.paymentTransaction.create({
    data: {
      branchId: brA.id, paymentId: plan.id,
      studentId: student.id, groupId: group.id,
      year: Y, month: M, amount: 700_000, method: 'cash', paidAt: AT,
    },
  });

  // O'qituvchi maoshi: hisoblangan 400 000, to'langan 400 000.
  const salary = await prisma.teacherSalary.create({
    data: {
      branchId: brA.id, teacherId: teacher.id, groupId: group.id,
      year: Y, month: M, kind: 'group', expectedAmount: 400_000,
      paidAmount: 400_000, status: 'paid',
    },
  });
  await prisma.salaryTransaction.create({
    data: {
      branchId: brA.id, salaryId: salary.id,
      teacherId: teacher.id, groupId: group.id,
      year: Y, month: M, amount: 400_000, method: 'cash', paidAt: AT,
    },
  });
  // Xodim maoshi — UCHINCHI chiqim manbasi.
  const payroll = await prisma.staffPayroll.create({
    data: {
      branchId: brA.id, employeeId: staff.id, year: Y, month: M,
      salaryType: 'fixed', baseAmount: 150_000, fixedAmount: 150_000,
      finalAmount: 150_000, paidAmount: 150_000, status: 'paid',
    },
  });
  await prisma.staffSalaryTransaction.create({
    data: {
      branchId: brA.id, payrollId: payroll.id, employeeId: staff.id,
      year: Y, month: M, amount: 150_000, method: 'cash', paidAt: AT,
    },
  });

  // Umumiy chiqim: operatsion (ijara) + KAPITAL (jihoz).
  // Kapital ATAYLAB qo'shiladi — u kassadan chiqadi, lekin accrual
  // foydadan AYRILMAYDI. Formuladagi shu farq o'lchansin.
  const cat = await prisma.expenseCategory.findFirst({ where: { kind: 'operating' } });
  const mkExpense = (amount, kind) =>
    prisma.expense.create({
      data: {
        branchId: brA.id, amount, categoryKind: kind,
        ...(cat ? { categoryId: cat.id } : {}),
        title: `${TAG} ${kind}`, spentAt: AT,
        accrualYear: Y, accrualMonth: M, method: 'cash',
      },
    });
  await mkExpense(200_000, 'operating');
  await mkExpense(500_000, 'capital');

  // Hisobdan chiqarilgan qarz + oylik taqsimoti.
  await prisma.debtWriteOff.create({
    data: {
      groupId: group.id, studentId: student2.id,
      studentName: `Talaba2 ${TAG}`, groupName: `${TAG} guruh`,
      amount: 300_000, reasonTitle: 'Sinov',
      breakdown: { create: [{ year: Y, month: M, amount: 300_000 }] },
    },
  });

  const q = (p) => `/api/finance-report${p}`;
  const asOwner = (path) => (base) => request(base, 'GET', q(path), { token });
  const asDir = (path, t, branchId) => (base) =>
    request(base, 'GET', q(path), { token: t, headers: { 'x-branch-id': branchId } });

  /** Javob "bo'sh emas" ligini tasdiqlaydi — aks holda paritet ma'nosiz. */
  const nonEmpty = (name, res, pick) => {
    const v = pick(res?.body?.data);
    if (v) ok(`${name} — o'lchandi (${JSON.stringify(v).slice(0, 60)})`);
    else bad(`${name} — o'lchanmadi`,
      `javob bo'sh/nol: ${JSON.stringify(res?.body?.data).slice(0, 200)}`);
  };

  // ─────────────────────────────────────────────────────────────────
  section('1) SUMMARY — KPI');
  // ─────────────────────────────────────────────────────────────────
  const s1 = await both(`GET /summary?year=${Y}&month=${M}`, asOwner(`/summary?year=${Y}&month=${M}`));
  nonEmpty('summary daromadi', s1.e, (d) => d?.income?.collected);

  if (s1.e?.body?.data) {
    const d = s1.e.body.data;
    // Formulalar — Express javobidan O'QIB tekshiriladi (NestJS bilan
    // paritet yuqorida allaqachon tasdiqlangan).
    const eq = (n, a, b) => (a === b ? ok(`${n} — ${a}`) : bad(n, `kutilgan ${b}, keldi ${a}`));
    eq('billed write-off SIZ (1 000 000)', d.income.billed, 1_000_000);
    eq('badDebt alohida (300 000)', d.income.badDebt, 300_000);
    eq('kassa kirimi (700 000)', d.income.collected, 700_000);
    // Jami chiqim = o'qituvchi 400k + xodim 150k + umumiy (200k + 500k).
    eq('jami kassa chiqimi (1 250 000)', d.expense.paid, 1_250_000);
    eq('kassa foydasi (700k − 1 250k)', d.netProfit, -550_000);
    // ⚠ KAPITAL accrual chiqimdan CHIQARILADI: 400k (maosh) + 200k
    // (operatsion) = 600k. 500k jihoz — pul sarfi, xarajat EMAS.
    eq('accrual chiqim kapitalsiz (600 000)', d.accrual.expense, 600_000);
    eq('accrual foyda (1 000k − 600k)', d.accrual.profit, 400_000);
    eq('kapital alohida ko\'rsatiladi', d.expense.capital, 500_000);
  }

  await both('GET /summary (davrsiz — joriy oy)', asOwner('/summary'));
  await both('GET /summary?year=2000&month=1 (bo\'sh davr)', asOwner('/summary?year=2000&month=1'));
  await both('GET /summary?month=13 (400)', asOwner('/summary?month=13'));
  await both('GET /summary?year=1999 (400)', asOwner('/summary?year=1999'));

  // ─────────────────────────────────────────────────────────────────
  section('2) TREND');
  // ─────────────────────────────────────────────────────────────────
  await both('GET /trend', asOwner('/trend'));
  await both('GET /trend?months=3', asOwner('/trend?months=3'));
  await both('GET /trend?months=24', asOwner('/trend?months=24'));
  await both('GET /trend?months=0 (400)', asOwner('/trend?months=0'));
  await both('GET /trend?months=25 (400)', asOwner('/trend?months=25'));

  // ─────────────────────────────────────────────────────────────────
  section('3) GROUP BREAKDOWN');
  // ─────────────────────────────────────────────────────────────────
  const g1 = await both(`GET /group-breakdown?year=${Y}&month=${M}`,
    asOwner(`/group-breakdown?year=${Y}&month=${M}`));
  nonEmpty('guruh kesimi', g1.e, (d) => (Array.isArray(d) && d.length ? d.length : null));
  await both('GET /group-breakdown?limit=1', asOwner(`/group-breakdown?year=${Y}&month=${M}&limit=1`));
  await both('GET /group-breakdown?limit=51 (400)', asOwner('/group-breakdown?limit=51'));

  // ─────────────────────────────────────────────────────────────────
  section('4) LEDGER');
  // ─────────────────────────────────────────────────────────────────
  const l1 = await both(`GET /ledger?year=${Y}&month=${M}`, asOwner(`/ledger?year=${Y}&month=${M}`));
  nonEmpty('ledger qatorlari', l1.e, (d) => (Array.isArray(d) && d.length ? d.length : null));
  if (Array.isArray(l1.e?.body?.data)) {
    const kinds = new Set(l1.e.body.data.map((r) => r.category));
    // Uchala manba ham ko'rinishi SHART — xodim maoshi qo'shilmasa
    // "pul qayerga ketdi?" savoli javobsiz qolardi.
    for (const k of ["O'quvchi to'lovi", "O'qituvchi maoshi", 'Xodim maoshi']) {
      kinds.has(k) ? ok(`ledger'da «${k}» bor`) : bad(`ledger'da «${k}» bor`, 'topilmadi');
    }
  }
  await both(`GET /ledger?limit=1`, asOwner(`/ledger?year=${Y}&month=${M}&limit=1`));

  // ─────────────────────────────────────────────────────────────────
  section('5) WRITE-OFFS');
  // ─────────────────────────────────────────────────────────────────
  const w1 = await both(`GET /write-offs?year=${Y}&month=${M}`,
    asOwner(`/write-offs?year=${Y}&month=${M}`));
  nonEmpty('write-off jami', w1.e, (d) => d?.total);
  await both(`GET /write-offs?year=${Y}`, asOwner(`/write-offs?year=${Y}`));
  await both(`GET /write-offs?groupId=<yo'q>`, asOwner(`/write-offs?groupId=${'a'.repeat(24)}`));
  await both('GET /write-offs?limit=201 (400)', asOwner('/write-offs?limit=201'));

  // ─────────────────────────────────────────────────────────────────
  section('6) FILIAL KO\'LAMI — ko\'chirishda yopilgan teshik');
  // ─────────────────────────────────────────────────────────────────
  //
  // `getLedger` va `getWriteOffs` da ko'lam ILGARI UMUMAN YO'Q edi.
  // Modul 501 qaytarib turgani uchun teshik ko'rinmasdi. Bu yerda
  // ikkala tomon ham o'lchanadi.

  // MUSBAT: A direktori O'Z ma'lumotini ko'radi.
  const la = await both('A direktori: ledger (musbat nazorat)',
    asDir(`/ledger?year=${Y}&month=${M}`, dirTokenA, brA.id));
  nonEmpty('A direktori ledger ko\'radi', la.e,
    (d) => (Array.isArray(d) && d.length ? d.length : null));

  const wa = await both('A direktori: write-offs (musbat nazorat)',
    asDir(`/write-offs?year=${Y}&month=${M}`, dirTokenA, brA.id));
  nonEmpty('A direktori write-off ko\'radi', wa.e, (d) => d?.total);

  // MANFIY: C direktori A ning ma'lumotini KO'RMAYDI.
  const lc = await both('C direktori: ledger begona filialni ko\'rmaydi',
    asDir(`/ledger?year=${Y}&month=${M}`, dirTokenC, brC.id));
  for (const [label, res] of [['express', lc.e], ['nest', lc.n]]) {
    const rows = res?.body?.data || [];
    rows.length === 0
      ? ok(`C direktori ledger'da hech narsa ko'rmaydi (${label})`)
      : bad(`C direktori ledger'da hech narsa ko'rmaydi (${label})`,
        `${rows.length} qator sizdi: ${JSON.stringify(rows[0]).slice(0, 150)}`);
  }

  const wc = await both('C direktori: write-offs begona filialni ko\'rmaydi',
    asDir(`/write-offs?year=${Y}&month=${M}`, dirTokenC, brC.id));
  for (const [label, res] of [['express', wc.e], ['nest', wc.n]]) {
    const items = res?.body?.data?.items || [];
    items.length === 0
      ? ok(`C direktori write-off ko'rmaydi (${label})`)
      : bad(`C direktori write-off ko'rmaydi (${label})`,
        `${items.length} qator sizdi: ${JSON.stringify(items[0]).slice(0, 150)}`);
  }

  // C ning xulosasi ham A nikidan boshqa bo'lishi SHART.
  const sc = await both('C direktori: summary begona daromadni ko\'rmaydi',
    asDir(`/summary?year=${Y}&month=${M}`, dirTokenC, brC.id));
  for (const [label, res] of [['express', sc.e], ['nest', sc.n]]) {
    const d = res?.body?.data;
    d?.income?.collected === 0 && d?.income?.billed === 0
      ? ok(`C direktori xulosasi bo'sh (${label})`)
      : bad(`C direktori xulosasi bo'sh (${label})`,
        `sizdi: collected=${d?.income?.collected}, billed=${d?.income?.billed}`);
  }

  // ─────────────────────────────────────────────────────────────────
  section('7) RUXSAT');
  // ─────────────────────────────────────────────────────────────────
  for (const p of ['/summary', '/trend', '/group-breakdown', '/ledger', '/write-offs']) {
    await both(`${p} — autentifikatsiyasiz → 401`, (base) =>
      request(base, 'GET', q(p)));
  }
};

run()
  .catch((err) => {
    console.error('\x1b[31mTEST YIQILDI:\x1b[0m', err);
    R.fail += 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect().catch(() => {});
    process.exit(finish());
  });
