/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B21 — BEKOR QILINGAN OPERATSIYA JURNALDA STORNO QILINADI.
 *
 * ── MUAMMO (O'LCHANGAN, IKKALA STEKDA BIR XIL EDI) ──
 *
 * To'lov / chiqim BEKOR QILINGANDA manba yozuv soft-delete bo'lardi va
 * `paidAmount` kamayardi, JURNAL esa TEGILMAY qolardi. Jurnal esa P&L
 * (`/branch-analytics/pnl`) va kassa qoldig'ining (`journal.balances`)
 * MANBAI — ya'ni:
 *
 *   • bekor qilingan CHIQIM hisobotda ABADIY chiqim bo'lib qolardi;
 *   • bekor qilingan TO'LOV esa ABADIY daromad;
 *   • kassa qoldig'i har ikki holatda ham YOLG'ON bo'lardi.
 *
 * ── QAROR: STORNO (qaytarim EMAS) ──
 *
 * Qaytarim (`postRefund`) — "to'lov BO'LGAN, keyin pul qaytarildi":
 * ikkala harakat ham tarixda ko'rinishi kerak. Bekor qilish esa "bu
 * operatsiya UMUMAN BO'LMAGAN" (xato kiritilgan). Kodbazaning o'zi bu
 * farqni `financialTransaction.service.js` da OCHIQ hujjatlagan.
 *
 * ── NIMA O'LCHANADI ──
 *   1. Bekor qilishdan KEYIN jurnalda STORNO yozuvi paydo bo'ladi.
 *   2. ASL yozuv O'ZGARMAY qoladi (`JOURNAL_IMMUTABLE`).
 *   3. Storno MUVOZANATLI: debet == kredit.
 *   4. FILIAL SOF QOLDIG'I NOLGA qaytadi — ya'ni hisobot ta'siri to'liq
 *      bekor qilinadi (aynan shu narsa buzilgan edi).
 *   5. IDEMPOTENT: ikkinchi bekor qilish urinishi IKKINCHI stornoni
 *      YARATMAYDI (aks holda balans yolg'on o'sardi).
 *   6. Ikkala stekda ham AYNAN bir xil (ko'zgu fikstura).
 *
 * ISHLATISH:  npm run test:journal-storno
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, mintToken, waitForStacks, createReporter,
} from './_harness.mjs';
import { runIp } from './_mirror.mjs';

const prisma = new PrismaClient();
const T = createReporter('B21 — jurnal stornosi');
const { R, ok, bad, skip, section, finish } = T;
const RUN_IP = runIp();
const TAG = `__parity_st${process.hrtime.bigint() % 100000n}`;

const made = { branches: [], users: [], categories: [] };
const fx = {};

const eq = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) ok(`${name} — ${JSON.stringify(got)}`);
  else bad(name, `kutilgan ${JSON.stringify(want)}, keldi ${JSON.stringify(got)}`);
};

/**
 * FILIALNING SOF JURNAL HARAKATI — `(debet − kredit)` yig'indisi
 * hisob TURI bo'yicha.
 *
 * ⚠ NEGA AYNAN SHU O'LCHOV: P&L ham, kassa qoldig'i ham shu
 * yig'indidan chiqadi. Storno to'g'ri bo'lsa post + storno = NOL.
 */
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

const makeFixture = async (label) => {
  const branch = await prisma.branch.create({
    data: { name: `${TAG} ${label}`, code: `${TAG}${label}` } });
  made.branches.push(branch.id);

  const dir = await prisma.user.create({
    data: {
      firstName: 'Dir', lastName: `${TAG}${label}`,
      username: `dir_${TAG.toLowerCase()}_${label.toLowerCase()}`,
      passwordHash: 'x', role: 'director', homeBranchId: branch.id,
    } });
  made.users.push(dir.id);

  const cat = await prisma.expenseCategory.create({
    data: { name: `${TAG}${label} kat`, kind: 'operating', branchId: branch.id } });
  made.categories.push(cat.id);

  // Limit YUQORI — chiqim tasdiqsiz, TO'G'RIDAN yozilsin.
  await prisma.branch.update({
    where: { id: branch.id }, data: { expenseApprovalThreshold: 100_000_000 } });

  return { branch, dir, cat };
};

const cleanup = async () => {
  try {
    const b = made.branches;
    if (made.categories.length) {
      await prisma.expense.deleteMany({
        where: { categoryId: { in: made.categories } } });
    }
    if (b.length) {
      const es = await prisma.journalEntry.findMany({
        where: { branchId: { in: b } }, select: { id: true } });
      const eids = es.map((e) => e.id);
      await prisma.journalLine.deleteMany({ where: { entryId: { in: eids } } });
      await prisma.journalLine.deleteMany({
        where: { account: { branchId: { in: b } } } });
      await prisma.journalEntry.deleteMany({ where: { id: { in: eids } } });
      await prisma.financialAuditLog.deleteMany({ where: { branchId: { in: b } } });
      await prisma.account.deleteMany({ where: { branchId: { in: b } } });
    }
    if (made.categories.length) {
      await prisma.expenseCategory.deleteMany({
        where: { id: { in: made.categories } } });
    }
    if (made.users.length) {
      await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    }
    if (b.length) await prisma.branch.deleteMany({ where: { id: { in: b } } });
  } catch (e) {
    console.log(`  ⚠️  tozalashda xato: ${e.message}`);
  }
};

/** ⚠ Tozalash O'LCHANADI — yutilgan FK xatosi qoldiq qoldirardi. */
const assertNoResidue = async () => {
  const left = {
    branch: await prisma.branch.count({ where: { id: { in: made.branches } } }),
    entry: made.branches.length
      ? await prisma.journalEntry.count({ where: { branchId: { in: made.branches } } })
      : 0,
    expense: made.categories.length
      ? await prisma.expense.count({ where: { categoryId: { in: made.categories } } })
      : 0,
  };
  const total = Object.values(left).reduce((a, b) => a + b, 0);
  if (total === 0) ok("tozalash — QOLDIQ YO'Q (o'lchandi)");
  else bad('tozalash — QOLDIQ QOLDI', JSON.stringify(left));
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mB21 — JURNAL STORNOSI\x1b[0m  (${TAG})\n`);

  fx[EXPRESS] = await makeFixture('E');
  fx[NEST] = await makeFixture('N');
  const token = {};
  for (const base of [EXPRESS, NEST]) token[base] = mintToken(fx[base].dir);

  const call = (base, method, path, body) =>
    request(base, method, path, {
      token: token[base],
      headers: { 'x-branch-id': fx[base].branch.id, 'x-forwarded-for': RUN_IP },
      ...(body !== undefined ? { body } : {}),
    });

  // ═══ 1. CHIQIM YARATILADI ══════════════════════════════════════════
  section("1) CHIQIM YARATILADI — jurnal yozuvi paydo bo'ladi");
  const AMOUNT = 1_234_000;
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    const label = base === EXPRESS ? 'express' : 'nest';
    const res = await call(base, 'POST', '/api/expenses', {
      category: f.cat.id, title: `${TAG} storno sinovi`, amount: AMOUNT,
      method: 'cash', spentAt: '2034-07-10',
      accrualYear: 2034, accrualMonth: 7,
    });
    if (res.status !== 201 && res.status !== 200) {
      bad(`${label}: chiqim yaratilmadi`,
        `status=${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
      return finish();
    }
    R.successes += 1;
    f.expenseId = res.body?.data?.id;
    const je = await prisma.journalEntry.findUnique({
      where: { postingKey: `expense:${f.expenseId}` } });
    eq(`${label}: jurnal yozuvi yozildi`, Boolean(je), true);
    eq(`${label}: jurnal summasi`, Number(je?.totalDebit), AMOUNT);
    f.originalEntryId = je?.id;

    // ⚠ MUSBAT NAZORAT: bekor qilishdan OLDIN sof qoldiq NOL EMAS.
    // Aks holda pastdagi "nol" natijasi hech narsani isbotlamasdi.
    const before = await netByKind(f.branch.id);
    const nonZero = Object.keys(before).length > 0;
    eq(`${label}: bekor qilishdan OLDIN sof qoldiq nol EMAS`, nonZero, true);
    f.netBefore = before;
  }

  // ═══ 2. BEKOR QILINADI ═════════════════════════════════════════════
  section('2) BEKOR QILINADI — storno yozuvi qo\'shiladi');
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    const label = base === EXPRESS ? 'express' : 'nest';
    const res = await call(base, 'DELETE', `/api/expenses/${f.expenseId}`);
    eq(`${label}: DELETE /expenses/:id`, res.status, 200);

    const storno = await prisma.journalEntry.findUnique({
      where: { postingKey: `storno:expense:${f.expenseId}` },
      include: { lines: true },
    });
    eq(`${label}: STORNO yozuvi yaratildi`, Boolean(storno), true);
    if (!storno) continue;

    eq(`${label}: storno turi ADJUSTMENT`, storno.kind, 'adjustment');
    eq(`${label}: storno asl yozuvga bog'langan`,
      { refModel: storno.refModel, refId: storno.refId },
      { refModel: 'JournalEntry', refId: f.originalEntryId });

    // MUVOZANAT: debet == kredit.
    const d = storno.lines.reduce((a, l) => a + Number(l.debit), 0);
    const c = storno.lines.reduce((a, l) => a + Number(l.credit), 0);
    eq(`${label}: storno MUVOZANATLI (debet == kredit)`, d === c && d === AMOUNT, true);

    // ASL YOZUV O'ZGARMAS.
    const orig = await prisma.journalEntry.findUnique({
      where: { id: f.originalEntryId } });
    eq(`${label}: ASL yozuv o'zgarmadi`,
      { total: Number(orig?.totalDebit), kind: orig?.kind },
      { total: AMOUNT, kind: 'expense' });

    // ⚠ ASOSIY O'LCHOV: hisobot ta'siri TO'LIQ bekor qilindi.
    const after = await netByKind(f.branch.id);
    eq(`${label}: filial sof qoldig'i NOLGA qaytdi`, after, {});
  }

  // ═══ 3. IDEMPOTENTLIK ══════════════════════════════════════════════
  section('3) IDEMPOTENTLIK — ikkinchi bekor qilish ikkinchi storno YARATMAYDI');
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    const label = base === EXPRESS ? 'express' : 'nest';
    const before = await prisma.journalEntry.count({ where: { branchId: f.branch.id } });
    const res = await call(base, 'DELETE', `/api/expenses/${f.expenseId}`);
    const after = await prisma.journalEntry.count({ where: { branchId: f.branch.id } });
    // Ikkinchi urinish 404 bo'lishi ham, 200 bo'lishi ham mumkin —
    // MUHIMI: YANGI yozuv PAYDO BO'LMASIN.
    eq(`${label}: ikkinchi DELETE yangi yozuv yaratmadi (status ${res.status})`,
      after, before);
    eq(`${label}: sof qoldiq hamon NOL`, await netByKind(f.branch.id), {});
  }

  // ═══ 3b. IDEMPOTENTLIK — TO'G'RIDAN-TO'G'RI ═══════════════════════
  //
  // ⚠ NEGA ALOHIDA: yuqoridagi ikkinchi `DELETE` 404 bilan TO'XTAYDI,
  // ya'ni storno KODIGA UMUMAN YETIB BORMAYDI. Bu "idempotent" degani
  // EMAS — u shunchaki o'lchanmagan. Haqiqiy xavf PARALLEL bekor
  // qilish: ikkala so'rov ham 404 dan o'tib, ikkita storno yozardi va
  // balans YOLG'ON o'sardi. Himoya `postingKey` unique indeksida —
  // shuni TO'G'RIDAN chaqirib o'lchaymiz.
  section("3b) IDEMPOTENTLIK — `reverse()` ikki marta to'g'ridan chaqirildi");
  {
    // ⚠ ILGARI EXPRESS SERVISI chaqirilardi
    //   (`server_legacy/.../journal.service.js`). Stek o'chirilgach
    //   AYNI invariant NEST servisida o'lchanadi — himoya baribir
    //   `postingKey` UNIQUE INDEKSIDA, ya'ni qaysi implementatsiya
    //   chaqirgani muhim emas: ikkinchi `reverse()` yangi yozuv
    //   YARATMASLIGI shart.
    const { JournalService } = await import('../dist/modules/journal/journal.service.js');
    const journal = new JournalService(prisma);
    const f = fx[EXPRESS];
    const key = `storno:expense:${f.expenseId}`;
    const before = await prisma.journalEntry.count({ where: { branchId: f.branch.id } });
    const again = await journal.reverse(f.originalEntryId, {
      memo: 'takroriy storno', postingKey: key });
    const after = await prisma.journalEntry.count({ where: { branchId: f.branch.id } });
    eq('takroriy `reverse()` YANGI yozuv yaratmadi', after, before);
    eq('takroriy `reverse()` MAVJUD stornoni qaytardi',
      (await prisma.journalEntry.findUnique({ where: { postingKey: key } }))?.id,
      again?.id);
    eq('sof qoldiq hamon NOL', await netByKind(f.branch.id), {});
  }

  // ═══ 4. STEKLAR ORASIDA PARITET ════════════════════════════════════
  section('4) IKKALA STEK BIR XIL NATIJA BERDI');
  const shape = async (f) => {
    const rows = await prisma.journalEntry.findMany({
      where: { branchId: f.branch.id },
      orderBy: { createdAt: 'asc' },
      select: { kind: true, refModel: true, totalDebit: true, totalCredit: true },
    });
    return rows.map((r) => ({
      kind: r.kind, refModel: r.refModel,
      debit: Number(r.totalDebit), credit: Number(r.totalCredit),
    }));
  };
  const e = await shape(fx[EXPRESS]);
  const n = await shape(fx[NEST]);
  eq('jurnal yozuvlari IKKALA stekda bir xil', n, e);

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
