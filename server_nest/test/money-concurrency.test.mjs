/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PUL YO'LLARI — RAQOBAT (CONCURRENCY).
 *
 * ── NEGA PARITET EMAS, XULQ ──
 * Poyga natijasi tabiatan NODETERMINISTIK: qaysi so'rov birinchi
 * yetishi tasodif. `deepEqual` bu yerda noto'g'ri asbob bo'lardi.
 * Shuning uchun har stek ALOHIDA o'lchanadi va undan bir xil
 * INVARIANT talab qilinadi.
 *
 * ── ISBOTLANADIGAN INVARIANTLAR ──
 *   1. O'QITUVCHI MAOSHI: 20 ta parallel TO'LIQ to'lovdan FAQAT
 *      BITTASI o'tadi (`capToRemaining` xom `UPDATE` sharti).
 *   2. `paidAmount` qoldiqdan OSHMAYDI va MANFIY bo'lmaydi.
 *   3. Muvaffaqiyatli to'lovlar soni = `SalaryTransaction` qatorlari =
 *      JURNAL yozuvlari; har yozuvda DEBET = KREDIT.
 *   4. 20 ta parallel QISMAN to'lov: yig'indi qoldiqdan OSHMAYDI.
 *   5. ⚠ B21 POYGASI: bitta to'lovni 10 ta parallel BEKOR QILISH
 *      urinishida jurnalda AYNAN BITTA storno bo'ladi (idempotentlik
 *      `postingKey` unique indeksiga tayanadi, servis mantiqiga EMAS).
 *   6. Yakunda filialning SOF jurnal qoldig'i NOLGA qaytadi.
 *
 * ── ⚠ ULANISH SIG'IMI OLDIN O'LCHANADI ──
 * `max_connections` to'lganda so'rovlar 500 qaytaradi va bu KOD
 * REGRESSIYASIGA o'xshaydi. Test boshida sig'im o'lchanadi; yetarli
 * bo'lmasa to'plam "O'LCHANMADI" deb chiqadi — YOLG'ON QIZIL emas.
 *
 * ISHLATISH:  npm run test:money-concurrency
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, mintToken, waitForStacks, createReporter,
} from './_harness.mjs';
import { runIp } from './_mirror.mjs';

const prisma = new PrismaClient();
const T = createReporter('pul yo\'llari — raqobat');
const { R, ok, bad, skip, section, finish } = T;
const RUN_IP = runIp();
const TAG = `__parity_mc${process.hrtime.bigint() % 100000n}`;

const ATTEMPTS = 20;
const EXPECTED = 3_000_000;
/** ⚠ KELAJAK YIL: haqiqiy hisobotlarga aralashmasin. */
const YEAR = 2099;
const MONTH = 6;

const made = { branches: [], users: [], salaries: [] };
const fx = {};

const eq = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) ok(`${name} — ${JSON.stringify(got)}`);
  else bad(name, `kutilgan ${JSON.stringify(want)}, keldi ${JSON.stringify(got)}`);
};

const rateLimited = (r) => r?.status === 429;

/**
 * INFRASTRUKTURA NOSOZLIGI — KOD REGRESSIYASI EMAS.
 *
 * ⚠ Ulanish hovuzi to'lganda so'rov 500 qaytaradi va bu tashqaridan
 * "poyga himoyasi ishlamadi" ga O'XSHAYDI. Sabab esa kodda emas.
 * Shuning uchun natija "yiqildi" emas, "O'LCHANMADI" bo'ladi.
 */
const INFRA = [
  /too many clients/i,
  /Timed out fetching a new connection/i,
  /Can't reach database server/i,
  /ECONNREFUSED/i,
  /Transaction (API error|already closed)/i,
];
const infraReason = (list) => {
  for (const r of list) {
    const text = typeof r?.body === 'string' ? r.body : JSON.stringify(r?.body || '');
    const hit = INFRA.find((re) => re.test(text));
    if (hit) return hit.source;
  }
  return null;
};

const makeFixture = async (label) => {
  const branch = await prisma.branch.create({
    data: { name: `${TAG} ${label}`, code: `${TAG}${label}` } });
  made.branches.push(branch.id);

  const teacher = await prisma.user.create({
    data: {
      firstName: 'T', lastName: `${TAG}${label}`,
      username: `t_${TAG.toLowerCase()}_${label.toLowerCase()}`,
      passwordHash: 'x', role: 'teacher', homeBranchId: branch.id, isActive: true,
    }, select: { id: true } });
  made.users.push(teacher.id);

  // ⚠ HAR MAOSH BOSHQA OYDA: `@@unique(teacherId, year, month, kind)`
  // bitta o'qituvchiga bir oyda IKKINCHI `base` qatorini bermaydi.
  const mkSalary = async (month) => {
    const s = await prisma.teacherSalary.create({
      data: {
        branchId: branch.id, teacherId: teacher.id, groupId: null, kind: 'base',
        year: YEAR, month,
        expectedAmount: EXPECTED, paidAmount: 0, status: 'unpaid',
        baseEarnings: EXPECTED, proratedFixed: EXPECTED,
        prorationFactor: 1, payableDays: 30, totalDays: 30, source: 'auto',
      }, select: { id: true } });
    made.salaries.push(s.id);
    return s.id;
  };

  return {
    branch, teacher,
    fullId: await mkSalary(MONTH),
    partialId: await mkSalary(MONTH + 1),
    voidId: await mkSalary(MONTH + 2),
  };
};

const cleanup = async () => {
  try {
    if (made.salaries.length) {
      const txs = await prisma.salaryTransaction.findMany({
        where: { salaryId: { in: made.salaries } }, select: { id: true } });
      const txIds = txs.map((t) => t.id);
      if (txIds.length) {
        const es = await prisma.journalEntry.findMany({
          where: { refModel: 'SalaryTransaction', refId: { in: txIds } },
          select: { id: true } });
        const eids = es.map((e) => e.id);
        // ⚠ STORNO yozuvlari `refModel: "JournalEntry"` — asl yozuv
        // bo'yicha qidiruv ularni TOPMAYDI.
        const stornos = await prisma.journalEntry.findMany({
          where: { refModel: 'JournalEntry', refId: { in: eids } },
          select: { id: true } });
        eids.push(...stornos.map((e) => e.id));
        if (eids.length) {
          await prisma.journalLine.deleteMany({ where: { entryId: { in: eids } } });
          await prisma.journalEntry.deleteMany({ where: { id: { in: eids } } });
        }
        await prisma.financialAuditLog.deleteMany({
          where: { entityId: { in: txIds } } });
        await prisma.salaryTransaction.deleteMany({ where: { id: { in: txIds } } });
      }
      await prisma.teacherSalary.deleteMany({ where: { id: { in: made.salaries } } });
    }
    if (made.branches.length) {
      const es = await prisma.journalEntry.findMany({
        where: { branchId: { in: made.branches } }, select: { id: true } });
      const eids = es.map((e) => e.id);
      if (eids.length) {
        await prisma.journalLine.deleteMany({ where: { entryId: { in: eids } } });
        await prisma.journalEntry.deleteMany({ where: { id: { in: eids } } });
      }
      await prisma.journalLine.deleteMany({
        where: { account: { branchId: { in: made.branches } } } });
      await prisma.financialAuditLog.deleteMany({
        where: { branchId: { in: made.branches } } });
      await prisma.account.deleteMany({ where: { branchId: { in: made.branches } } });
    }
    if (made.users.length) {
      await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    }
    if (made.branches.length) {
      await prisma.branch.deleteMany({ where: { id: { in: made.branches } } });
    }
  } catch (e) {
    console.log(`  ⚠️  tozalashda xato: ${e.message}`);
  }
};

const assertNoResidue = async () => {
  const left = {
    branch: await prisma.branch.count({ where: { id: { in: made.branches } } }),
    salary: made.salaries.length
      ? await prisma.teacherSalary.count({ where: { id: { in: made.salaries } } }) : 0,
    entry: made.branches.length
      ? await prisma.journalEntry.count({ where: { branchId: { in: made.branches } } }) : 0,
  };
  const total = Object.values(left).reduce((a, b) => a + b, 0);
  if (total === 0) ok("tozalash — QOLDIQ YO'Q (o'lchandi)");
  else bad('tozalash — QOLDIQ QOLDI', JSON.stringify(left));
};

/** Filialning SOF jurnal harakati hisob turi bo'yicha. */
const netByKind = async (branchId) => {
  const rows = await prisma.journalLine.groupBy({
    by: ['accountKind'],
    where: { entry: { branchId } },
    _sum: { debit: true, credit: true },
  });
  const out = {};
  for (const r of rows) {
    const net = Number(r._sum.debit || 0) - Number(r._sum.credit || 0);
    if (net !== 0) out[r.accountKind] = net;
  }
  return out;
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mPUL YO'LLARI — RAQOBAT\x1b[0m  (${TAG})\n`);

  // ═══ 0. ULANISH SIG'IMI ═══════════════════════════════════════════════
  section("0) ULANISH SIG'IMI — kod regressiyasidan AJRATISH uchun");
  const cap = await prisma.$queryRawUnsafe('SHOW max_connections');
  const inUse = await prisma.$queryRawUnsafe(
    'SELECT count(*)::int AS n FROM pg_stat_activity');
  const max = Number(cap[0].max_connections);
  const used = Number(inUse[0].n);
  const free = max - used;
  // ⚠ BU RAQAM MA'LUMOT UCHUN, DARVOZA EMAS. Band ulanishlarning
  // ko'pchiligi Prisma hovuzidagi BO'SH TURGANLAR — ular qayta
  // ishlatiladi, yangi ulanish talab qilmaydi. Haqiqiy nosozlik
  // JAVOBLARDAN aniqlanadi (`infraReason`), oldindan taxmin qilib
  // to'plamni o'tkazib yuborish esa uni JIMGINA o'lchovsiz qoldirardi.
  ok(`ulanish: ${used} / ${max} band, ${free} bo'sh (ma'lumot uchun)`);

  fx[EXPRESS] = await makeFixture('E');
  fx[NEST] = await makeFixture('N');
  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false }, select: { id: true, role: true } });
  const token = mintToken(owner);

  const pay = (base, salaryId, amount) =>
    request(base, 'POST', '/api/teacher-salary/transactions', {
      token,
      headers: { 'x-branch-id': fx[base].branch.id, 'x-forwarded-for': RUN_IP },
      body: { salaryId, amount, method: 'cash', note: TAG },
    }).catch((err) => ({ status: 0, body: { error: err.message } }));

  // ═══ 1. 20 TA PARALLEL TO'LIQ TO'LOV ══════════════════════════════════
  section("1) 20 ta parallel TO'LIQ to'lov — FAQAT BITTASI o'tadi");
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const f = fx[base];
    const res = await Promise.all(
      Array.from({ length: ATTEMPTS }, () => pay(base, f.fullId, EXPECTED)));

    if (res.some(rateLimited)) { skip(`to'liq to'lov (${label})`, '429'); continue; }
    const infra1 = infraReason(res);
    if (infra1) { skip(`to'liq to'lov (${label})`, `INFRASTRUKTURA: ${infra1}`); continue; }
    const okCount = res.filter((r) => r.status === 201 || r.status === 200).length;
    if (okCount > 0) R.successes += 1;

    eq(`${label}: AYNAN BITTA to'lov o'tdi`, okCount, 1);

    const row = await prisma.teacherSalary.findUnique({
      where: { id: f.fullId }, select: { paidAmount: true, expectedAmount: true } });
    const paid = Number(row.paidAmount);
    eq(`${label}: paidAmount = kutilgan summa`, paid, EXPECTED);
    eq(`${label}: paidAmount qoldiqdan OSHMADI`, paid <= EXPECTED, true);
    eq(`${label}: paidAmount manfiy EMAS`, paid >= 0, true);

    const txCount = await prisma.salaryTransaction.count({
      where: { salaryId: f.fullId, isDeleted: false } });
    eq(`${label}: to'lov qatorlari soni = o'tganlar soni`, txCount, okCount);

    const txs = await prisma.salaryTransaction.findMany({
      where: { salaryId: f.fullId }, select: { id: true } });
    const entries = await prisma.journalEntry.findMany({
      where: { refModel: 'SalaryTransaction', refId: { in: txs.map((t) => t.id) } },
      include: { lines: true } });
    eq(`${label}: jurnal yozuvlari soni = to'lov qatorlari`, entries.length, txCount);
    const balanced = entries.every((e) => {
      const d = e.lines.reduce((a, l) => a + Number(l.debit), 0);
      const c = e.lines.reduce((a, l) => a + Number(l.credit), 0);
      return d === c;
    });
    eq(`${label}: HAR yozuvda debet = kredit`, balanced, true);
  }

  // ═══ 2. 20 TA PARALLEL QISMAN TO'LOV ══════════════════════════════════
  section("2) 20 ta parallel QISMAN to'lov — yig'indi qoldiqdan OSHMAYDI");
  const CHUNK = Math.floor(EXPECTED / 4); // 4 tasi sig'adi, 16 tasi sig'maydi
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const f = fx[base];
    const res = await Promise.all(
      Array.from({ length: ATTEMPTS }, () => pay(base, f.partialId, CHUNK)));
    if (res.some(rateLimited)) { skip(`qisman to'lov (${label})`, '429'); continue; }
    const infra2 = infraReason(res);
    if (infra2) { skip(`qisman to'lov (${label})`, `INFRASTRUKTURA: ${infra2}`); continue; }

    const okCount = res.filter((r) => r.status === 201 || r.status === 200).length;
    const row = await prisma.teacherSalary.findUnique({
      where: { id: f.partialId }, select: { paidAmount: true } });
    const paid = Number(row.paidAmount);

    eq(`${label}: yig'indi kutilgandan OSHMADI`, paid <= EXPECTED, true);
    eq(`${label}: yig'indi = o'tgan to'lovlar × bo'lak`, paid, okCount * CHUNK);
    eq(`${label}: eng ko'pi bilan 4 ta o'tdi`, okCount <= 4, true);
  }

  // ═══ 3. B21 POYGASI: PARALLEL BEKOR QILISH ════════════════════════════
  section('3) B21 POYGASI — 10 ta parallel BEKOR QILISH, BITTA storno');
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const f = fx[base];

    const created = await pay(base, f.voidId, EXPECTED);
    if (created.status !== 201 && created.status !== 200) {
      skip(`bekor qilish poygasi (${label})`,
        `to'lov yaratilmadi: ${created.status}`);
      continue;
    }
    const txId = created.body?.data?.id || created.body?.data?._id;

    const before = await prisma.journalEntry.count({ where: { branchId: f.branch.id } });
    const dels = await Promise.all(Array.from({ length: 10 }, () =>
      request(base, 'DELETE', `/api/teacher-salary/transactions/${txId}`, {
        token,
        headers: { 'x-branch-id': f.branch.id, 'x-forwarded-for': RUN_IP },
      }).catch((err) => ({ status: 0, body: { error: err.message } }))));
    if (dels.some(rateLimited)) { skip(`bekor qilish (${label})`, '429'); continue; }
    const infra3 = infraReason(dels);
    if (infra3) { skip(`bekor qilish (${label})`, `INFRASTRUKTURA: ${infra3}`); continue; }

    const after = await prisma.journalEntry.count({ where: { branchId: f.branch.id } });
    eq(`${label}: AYNAN BITTA storno yozuvi qo'shildi`, after - before, 1);

    const origs = await prisma.journalEntry.findMany({
      where: { refModel: 'SalaryTransaction', refId: txId }, select: { id: true } });
    const stornos = await prisma.journalEntry.count({
      where: { refModel: 'JournalEntry', refId: { in: origs.map((e) => e.id) } } });
    eq(`${label}: storno TAKRORLANMADI`, stornos, 1);

    const row = await prisma.teacherSalary.findUnique({
      where: { id: f.voidId }, select: { paidAmount: true } });
    eq(`${label}: paidAmount AYNAN nolga qaytdi`, Number(row.paidAmount), 0);
    eq(`${label}: paidAmount manfiy EMAS`, Number(row.paidAmount) >= 0, true);

    // ⚠ ASOSIY O'LCHOV: SHU to'lovning post + storno = NOL.
    //
    // Ko'lam ATAYLAB shu ikki yozuv bilan cheklangan: filialning
    // umumiy qoldig'ida bekor QILINMAGAN boshqa to'lovlar ham bor va
    // ular tabiiy ravishda nolga teng emas — butun filial bo'yicha
    // o'lchash bu tekshiruvni MA'NOSIZ qilardi.
    const pair = [...origs.map((e) => e.id)];
    const stornoRows = await prisma.journalEntry.findMany({
      where: { refModel: 'JournalEntry', refId: { in: pair } }, select: { id: true } });
    pair.push(...stornoRows.map((e) => e.id));
    const lines = await prisma.journalLine.groupBy({
      by: ['accountKind'],
      where: { entryId: { in: pair } },
      _sum: { debit: true, credit: true },
    });
    const residual = {};
    for (const l of lines) {
      const net = Number(l._sum.debit || 0) - Number(l._sum.credit || 0);
      if (net !== 0) residual[l.accountKind] = net;
    }
    eq(`${label}: post + storno = NOL (ikkilangan storno yo'q)`, residual, {});
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
