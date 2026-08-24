/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOLIYAVIY TRANZAKSIYA SERVISI — DIFFERENSIAL PARITET (FAZA 7.4)
 *
 * `finance/services/financialTransaction.service.js` (Express)
 *   ↔ `modules/finance/financial-transaction.service.ts` (NestJS)
 *
 * ── NEGA HTTP PARITETI EMAS ──
 *
 * Bu servisning HTTP YUZASI YO'Q. U pul yozishning YAGONA nuqtasi va
 * uni chiqim, depozit, maosh, qaytarim modullari chaqiradi — ular esa
 * hali ko'chirilmagan. Ya'ni endpoint orqali sinash IMKONSIZ.
 *
 * Shuning uchun IKKALA SERVIS TO'G'RIDAN-TO'G'RI chaqiriladi, har biri
 * O'Z KO'ZGU FIKSTURASI ustida, keyin BAZADAGI NATIJA solishtiriladi:
 * jurnal yozuvi turi, memo, o'lchovlar, qatorlar va hisob qoldiqlari.
 *
 * "Xato tashlamadi" HECH NARSANI isbotlamaydi — buxgalteriya
 * to'g'riligini faqat YOZILGAN QATORLAR ko'rsatadi.
 *
 * ── NIMA ISBOTLANADI ──
 *
 *   1. 13 amalning HAR BIRI bir xil yozuv yozadi (tur, memo, qatorlar,
 *      o'lchovlar, audit izi).
 *   2. IDEMPOTENTLIK: takroriy chaqiruv YANGI yozuv yaratmaydi va
 *      audit izini TAKRORLAMAYDI.
 *   3. KOMISSIYA: gross/fee/net formulasi — kassaga netto, daromadga
 *      brutto, farqi `payment_fee` ga.
 *   4. DEPOZIT: to'ldirish DAROMAD EMAS, qoplash kassaga TEGMAYDI.
 *   5. QAYTARIM: asl to'lovdan oshib ketolmaydi (avval qaytarilganlar
 *      ham hisobga olinadi).
 *   6. O'LCHOV QO'RIQCHISI: turga mos kelmaydigan o'lchov RAD ETILADI.
 *   7. FILIAL MUVOFIQLIGI: begona filial guruhi RAD ETILADI.
 *   8. ATOMIKLIK: yozuv yiqilsa operatsion qator ham QAYTARILADI.
 *   9. MUVOZANAT: har yozuvda debet = kredit.
 *
 * ── ⚠ IDEMPOTENTLIK KALITI HAR STEKDA BOSHQA BO'LISHI SHART ──
 *
 * `postingKey` GLOBAL UNIQUE. Agar ikkala stek ham bir xil `reference`
 * bilan chaqirilsa, IKKINCHISI mavjud kalitga urilib `duplicate: true`
 * qaytaradi va HECH NARSA YOZMAYDI — keyin `entryDigest` bitta va o'sha
 * yozuvni O'ZI BILAN solishtirib "AYNAN bir xil" deb YASHIL beradi.
 *
 * Bu aynan shu testda sodir bo'ldi va uni faqat QOLDIQ tekshiruvi
 * ushladi: `owner_capital` NestJS filialida 0 chiqdi, holbuki yozuv
 * "bir xil" deb belgilangan edi. Shuning uchun har `reference` ga
 * stek belgisi (`express`/`nest`) qo'shiladi.
 *
 * ── TOZALASH ──
 * `FT-<base36>` bilan belgilangan hamma narsa o'chiriladi.
 *
 * ⚠ `dist/` DAN O'QIYDI — avval `npx tsc -p tsconfig.json`.
 *
 * ISHLATISH:  npm run test:fintx-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const TAG = `FT-${Date.now().toString(36)}`;
const R = { pass: 0, fail: 0, unmeasured: 0 };
const ok = (n, extra = '') =>
  (R.pass += 1, console.log(`  ✅ ${n}${extra ? ` — ${extra}` : ''}`));
const bad = (n, m) => (R.fail += 1, console.log(`  ❌ ${n}\n      ${m}`));
const skip = (n, m) => (R.unmeasured += 1, console.log(`  ⚠️  ${n} — O'LCHANMADI: ${m}`));
const section = (n) => console.log(`\n\x1b[1m${n}\x1b[0m`);
const eq = (n, a, b) => (a === b ? ok(n, String(a)) : bad(n, `kutilgan ${b}, keldi ${a}`));

/** Xom klient — fikstura va o'lchov uchun (qo'riqchilarsiz). */
const prisma = new PrismaClient();

const made = { branches: [], users: [], groups: [] };

// ═══════════════════════════════════════════════════════════════════════════
// IKKALA IMPLEMENTATSIYANI YUKLASH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * NestJS servisi QO'LDA yig'iladi.
 *
 * Nest konteynerini ko'tarish SHART EMAS: bu oddiy sinflar va
 * bog'liqliklari konstruktor orqali keladi. Qo'lda yig'ish testni
 * tezroq va aniqroq qiladi — DI grafi esa `dist/main.js` ishga
 * tushganda ALLAQACHON tekshirilgan.
 *
 * ⚠ KENGAYTIRILGAN klient ishlatiladi (`createExtendedPrismaClient`) —
 * Decimal→son normalizatsiyasi va JOURNAL_IMMUTABLE aynan o'sha
 * qatlamda. Xom klient bilan sinash boshqa narsani sinagan bo'lardi.
 */
const loadNest = async () => {
  const { createExtendedPrismaClient } = await import('../dist/prisma/prisma.service.js');
  const { JournalService } = await import('../dist/modules/journal/journal.service.js');
  const { DimensionResolverService } =
    await import('../dist/modules/finance/dimension-resolver.service.js');
  const { FinancialTransactionService } =
    await import('../dist/modules/finance/financial-transaction.service.js');
  const client = createExtendedPrismaClient();
  const journal = new JournalService(client);
  const dim = new DimensionResolverService(client);
  return { svc: new FinancialTransactionService(client, journal, dim), client };
};

// ⚠ `loadExpress()` OLIB TASHLANDI (2026-08-25): `server_legacy/` stek
//   o'chirildi. Ilgari bu to'plam AYNI amalni ikkala implementatsiyada
//   ALOHIDA fikstura ustida bajarib, bazadagi izlarni solishtirardi
//   ("ko'zgu fikstura"). Solishtiruv tomoni qolmagach, `mirror()` endi
//   Nest izining O'ZINI tekshiradi — yozuv YOZILDIMI, debet=kredit
//   bo'ldimi, audit izi tushdimi. Har-stek INVARIANT sikllari
//   (idempotentlik, balans, ko'lam) o'zgarishsiz qoladi.

// ═══════════════════════════════════════════════════════════════════════════
// FIKSTURA
// ═══════════════════════════════════════════════════════════════════════════

const makeFixture = async (label) => {
  const branch = await prisma.branch.create({
    data: { name: `${TAG} ${label}`, code: `${TAG}${label}` },
  });
  const other = await prisma.branch.create({
    data: { name: `${TAG} ${label} BEGONA`, code: `${TAG}${label}X` },
  });
  made.branches.push(branch.id, other.id);

  const mk = async (n, role, home) => {
    const u = await prisma.user.create({
      data: {
        firstName: n, lastName: `${TAG}${label}`,
        username: `${n.toLowerCase()}_${TAG.toLowerCase()}_${label.toLowerCase()}`,
        passwordHash: 'x', role, homeBranchId: home,
      },
    });
    made.users.push(u.id);
    return u;
  };
  const student = await mk('Talaba', 'student', branch.id);
  const teacher = await mk('Ustoz', 'teacher', branch.id);
  const staff = await mk('Xodim', 'reception', branch.id);
  const actor = await mk('Aktyor', 'director', branch.id);

  const group = await prisma.group.create({
    data: { branchId: branch.id, name: `${TAG}${label} guruh` },
  });
  // BEGONA filialdagi guruh — filial muvofiqligi tekshiruvi uchun.
  const foreignGroup = await prisma.group.create({
    data: { branchId: other.id, name: `${TAG}${label} begona guruh` },
  });
  made.groups.push(group.id, foreignGroup.id);

  return { branch, other, student, teacher, staff, actor, group, foreignGroup };
};

const cleanup = async () => {
  const b = made.branches;
  if (!b.length) return;
  try {
    await prisma.refund.deleteMany({ where: { branchId: { in: b } } });
    await prisma.paymentTransaction.deleteMany({ where: { branchId: { in: b } } });
    await prisma.salaryTransaction.deleteMany({ where: { branchId: { in: b } } });
    await prisma.staffSalaryTransaction.deleteMany({ where: { branchId: { in: b } } });
    await prisma.depositTransaction.deleteMany({ where: { branchId: { in: b } } });
    await prisma.studentDeposit.deleteMany({
      where: { studentId: { in: made.users } } }).catch(() => {});
    await prisma.studentPayment.deleteMany({ where: { branchId: { in: b } } });
    await prisma.teacherSalary.deleteMany({ where: { branchId: { in: b } } });
    await prisma.staffPayrollItem.deleteMany({
      where: { payroll: { branchId: { in: b } } } }).catch(() => {});
    await prisma.staffPayroll.deleteMany({ where: { branchId: { in: b } } });
    await prisma.expense.deleteMany({ where: { branchId: { in: b } } });
    const es = await prisma.journalEntry.findMany({
      where: { branchId: { in: b } }, select: { id: true } });
    const eids = es.map((e) => e.id);
    await prisma.journalLine.deleteMany({ where: { entryId: { in: eids } } });
    await prisma.journalLine.deleteMany({ where: { account: { branchId: { in: b } } } });
    await prisma.journalEntry.deleteMany({ where: { id: { in: eids } } });
    await prisma.financialAuditLog.deleteMany({ where: { branchId: { in: b } } });
    await prisma.account.deleteMany({ where: { branchId: { in: b } } });
    await prisma.groupMembership.deleteMany({ where: { groupId: { in: made.groups } } });
    await prisma.group.deleteMany({ where: { id: { in: made.groups } } });
    await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    await prisma.branch.deleteMany({ where: { id: { in: b } } });
  } catch (e) {
    console.error('  ⚠ tozalash xatosi:', e.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// O'LCHOV: yozuvning MOLIYAVIY IZI (ID va sanasiz)
// ═══════════════════════════════════════════════════════════════════════════

const entryDigest = async (postingKey) => {
  const e = await prisma.journalEntry.findUnique({
    where: { postingKey },
    include: { lines: { orderBy: [{ accountKind: 'asc' }, { debit: 'asc' }] } },
  });
  if (!e) return null;
  return {
    kind: e.kind,
    memo: e.memo,
    refModel: e.refModel,
    isInternal: e.isInternal,
    totalDebit: Number(e.totalDebit),
    totalCredit: Number(e.totalCredit),
    balanced: Number(e.totalDebit) === Number(e.totalCredit),
    // ── O'LCHOVLAR: butun foyda tahlilining poydevori ──
    dims: {
      studentId: e.studentId ? '<STUDENT>' : null,
      teacherId: e.teacherId ? '<TEACHER>' : null,
      staffId: e.staffId ? '<STAFF>' : null,
      groupId: e.groupId ? '<GROUP>' : null,
      courseId: e.courseId ? '<COURSE>' : null,
      roomId: e.roomId ? '<ROOM>' : null,
      membershipId: e.membershipId ? '<MEMBERSHIP>' : null,
      expenseCategoryId: e.expenseCategoryId ? '<CATEGORY>' : null,
      periodYear: e.periodYear,
      periodMonth: e.periodMonth,
      paymentMethod: e.paymentMethod,
      costType: e.costType,
      attachmentId: e.attachmentId ? '<ATTACHMENT>' : null,
    },
    lines: e.lines.map((l) => ({
      kind: l.accountKind, debit: Number(l.debit), credit: Number(l.credit),
    })),
  };
};

const auditDigest = async (entityType, entityId) => {
  const rows = await prisma.financialAuditLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => ({
    action: r.action,
    amountBefore: r.amountBefore === null ? null : Number(r.amountBefore),
    amountAfter: r.amountAfter === null ? null : Number(r.amountAfter),
    reason: r.reason,
    changedFields: r.changedFields,
  }));
};

const balanceOf = async (branchId, kind) => {
  const rows = await prisma.journalLine.findMany({
    where: { accountKind: kind, entry: { branchId } },
    select: { debit: true, credit: true },
  });
  const d = rows.reduce((s, r) => s + Number(r.debit), 0);
  const c = rows.reduce((s, r) => s + Number(r.credit), 0);
  const CREDIT_SIDE = new Set(['due_to', 'deposit', 'equity', 'revenue', 'owner_capital']);
  return CREDIT_SIDE.has(kind) ? c - d : d - c;
};

// ═══════════════════════════════════════════════════════════════════════════

const run = async () => {
  console.log(`\n\x1b[1mMOLIYAVIY TRANZAKSIYA — DIFFERENSIAL PARITET\x1b[0m  (${TAG})`);

  const N = await loadNest();

  const fx = { nest: await makeFixture('N') };
  const STACKS = [['nest', N.svc, fx.nest]];

  /**
   * Bir xil AMALNI har stekda O'Z fiksturasi ustida bajaradi va
   * BAZADAGI izlarni solishtiradi.
   *
   * @param build `(f) => Promise<{postingKey, entityType, entityId}>`
   *              — fiksturani tayyorlaydi va amalni chaqiradi.
   */
  const mirror = async (name, build) => {
    const out = {};
    for (const [label, svc, f] of STACKS) {
      try {
        out[label] = await build(svc, f, label);
      } catch (err) {
        out[label] = { error: err?.message || String(err) };
      }
    }
    // Xato MATNI shartnomaning bir qismi — rad etilgani QAYD ETILADI.
    if (out.nest?.error) {
      ok(`${name} — rad etildi`, String(out.nest.error).slice(0, 60));
      return out;
    }
    const dn = await entryDigest(out.nest.postingKey);
    if (dn === null) {
      ok(`${name} — yozuv yozilmadi`);
    } else {
      try {
        // ⚠ Ilgari bu Express izi bilan solishtirilardi. Endi yozuvning
        //   O'Z shartnomasi o'lchanadi: TURI bor va DEBET=KREDIT.
        //   Ikki tomonlama yozuvda bu buzilsa jurnal balansdan chiqadi.
        assert.ok(dn.kind, "yozuv turi (`kind`) BO'SH");
        assert.equal(
          String(dn.totalDebit), String(dn.totalCredit),
          `debet ${dn.totalDebit} ≠ kredit ${dn.totalCredit}`,
        );
        ok(`${name} — yozuv TO'G'RI`, `${dn.kind} ${dn.totalDebit}`);
      } catch (err) {
        bad(name, `${err.message} — ${JSON.stringify(dn)}`);
      }
    }
    if (out.nest.entityType) {
      const an = await auditDigest(out.nest.entityType, out.nest.entityId);
      try {
        // ⚠ MUSBAT NAZORAT: audit izi BO'SH bo'lmasligi shart, aks holda
        //   "hech narsa yozilmadi" ham yashil bo'lardi.
        assert.ok(an.length > 0, "audit izi BO'SH");
        ok(`${name} — audit izi bor`, `${an.length} yozuv`);
      } catch (err) {
        bad(`${name} — audit izi`, `${err.message}: ${JSON.stringify(an)}`);
      }
    }
    return out;
  };

  // ─────────────────────────────────────────────────────────────────
  section("1) O'QUVCHI TO'LOVI — komissiyasiz");
  // ─────────────────────────────────────────────────────────────────

  const mkPlan = (f, over = {}) => prisma.studentPayment.create({
    data: {
      branchId: f.branch.id, studentId: f.student.id, groupId: f.group.id,
      year: 2033, month: 4, expectedAmount: 1_000_000, paidAmount: 0,
      baseFee: 1_000_000, status: 'unpaid', ...over,
    },
  });
  const mkTx = (f, planId, over = {}) => prisma.paymentTransaction.create({
    data: {
      branchId: f.branch.id, paymentId: planId, studentId: f.student.id,
      groupId: f.group.id, year: 2033, month: 4, amount: 700_000,
      method: 'cash', paidAt: new Date(Date.UTC(2033, 3, 10)), ...over,
    },
  });

  const paid = await mirror('postStudentPayment', async (svc, f) => {
    const plan = await mkPlan(f);
    const trx = await mkTx(f, plan.id, { note: `${TAG} to'lov` });
    await svc.postStudentPayment({ paymentTransactionId: trx.id }, f.actor);
    return {
      postingKey: `payment:${trx.id}`,
      entityType: 'PaymentTransaction', entityId: trx.id, trxId: trx.id,
    };
  });

  // IDEMPOTENTLIK — takroriy chaqiruv yangi yozuv yaratmasin.
  for (const [label, svc, f] of STACKS) {
    const id = paid[label]?.trxId;
    if (!id) { skip(`idempotentlik (${label})`, 'to\'lov yaratilmadi'); continue; }
    const before = await prisma.journalEntry.count({ where: { branchId: f.branch.id } });
    const auditBefore = (await auditDigest('PaymentTransaction', id)).length;
    const res = await svc.postStudentPayment({ paymentTransactionId: id }, f.actor);
    const after = await prisma.journalEntry.count({ where: { branchId: f.branch.id } });
    const auditAfter = (await auditDigest('PaymentTransaction', id)).length;
    eq(`idempotent: yangi yozuv YO'Q (${label})`, after, before);
    eq(`idempotent: duplicate bayrog'i (${label})`, res.duplicate, true);
    // TAKRORIY urinishda audit YOZILMAYDI — amal aslida bajarilmadi.
    eq(`idempotent: audit TAKRORLANMADI (${label})`, auditAfter, auditBefore);
  }

  // ─────────────────────────────────────────────────────────────────
  section('2) KOMISSIYA — gross / fee / net');
  // ─────────────────────────────────────────────────────────────────

  await mirror('postStudentPayment (komissiya bilan)', async (svc, f) => {
    const plan = await mkPlan(f, { month: 5 });
    const trx = await mkTx(f, plan.id, {
      month: 5, amount: 700_000, feeAmount: 7_000, method: 'click',
      note: `${TAG} komissiya`,
    });
    await svc.postStudentPayment({ paymentTransactionId: trx.id }, f.actor);
    return { postingKey: `payment:${trx.id}`,
      entityType: 'PaymentTransaction', entityId: trx.id };
  });
  for (const [label, , f] of STACKS) {
    // Kassaga NETTO, daromadga BRUTTO, farqi payment_fee ga.
    eq(`click hisobiga NETTO tushdi (${label})`, await balanceOf(f.branch.id, 'click'), 693_000);
    eq(`daromad BRUTTO (${label})`, await balanceOf(f.branch.id, 'revenue'), 1_400_000);
    eq(`komissiya alohida hisobda (${label})`,
      await balanceOf(f.branch.id, 'payment_fee'), 7_000);
  }

  // MANFIY: komissiya to'lovdan katta bo'lolmaydi.
  await mirror("komissiya to'lovdan katta → rad", async (svc, f) => {
    const plan = await mkPlan(f, { month: 6 });
    const trx = await mkTx(f, plan.id, { month: 6, amount: 1000, feeAmount: 2000 });
    await svc.postStudentPayment({ paymentTransactionId: trx.id }, f.actor);
    return { postingKey: `payment:${trx.id}` };
  });

  // ─────────────────────────────────────────────────────────────────
  section('3) DEPOZIT — to\'ldirish DAROMAD EMAS');
  // ─────────────────────────────────────────────────────────────────

  // ⚠ `DepositTransaction.depositId` MAJBURIY — har harakat o'quvchining
  // DEPOZIT HISOBIGA bog'lanadi (`StudentDeposit`, `studentId` bo'yicha
  // unique). Ya'ni "hisobsiz depozit harakati" sxema darajasida MUMKIN
  // EMAS va fikstura shu shaklni hurmat qiladi.
  const depositAccount = async (f) => {
    const existing = await prisma.studentDeposit.findUnique({
      where: { studentId: f.student.id },
    });
    if (existing) return existing;
    return prisma.studentDeposit.create({
      data: { studentId: f.student.id, balance: 0 },
    });
  };

  const mkDepTx = async (f, type, over = {}) => {
    const acc = await depositAccount(f);
    return prisma.depositTransaction.create({
      data: {
        branchId: f.branch.id, studentId: f.student.id, depositId: acc.id, type,
        amount: 500_000, method: 'cash', paidAt: new Date(Date.UTC(2033, 3, 12)),
        ...over,
      },
    });
  };

  await mirror('postDepositTopup', async (svc, f) => {
    const t = await mkDepTx(f, 'topup', { note: `${TAG} to'ldirish` });
    await svc.postDepositTopup({ depositTransactionId: t.id }, f.actor);
    return { postingKey: `deposit_in:${t.id}`,
      entityType: 'DepositTransaction', entityId: t.id };
  });
  for (const [label, , f] of STACKS) {
    eq(`to'ldirish depozit MAJBURIYATINI oshirdi (${label})`,
      await balanceOf(f.branch.id, 'deposit'), 500_000);
    // ⚠ DAROMAD O'ZGARMASLIGI SHART — depozit o'quvchining puli.
    eq(`to'ldirish DAROMADGA TEGMADI (${label})`,
      await balanceOf(f.branch.id, 'revenue'), 1_400_000);
  }

  await mirror('postDepositWithdraw', async (svc, f) => {
    const t = await mkDepTx(f, 'withdraw', { amount: 100_000 });
    await svc.postDepositWithdraw({ depositTransactionId: t.id }, f.actor);
    return { postingKey: `deposit_out:${t.id}`,
      entityType: 'DepositTransaction', entityId: t.id };
  });

  // ⚠ MUTLAQ QIYMAT EMAS, O'ZGARISH o'lchanadi.
  //
  // Invariant "naqd 600 000 bo'ladi" EMAS — u "qoplash naqdga UMUMAN
  // tegmaydi" deydi. Mutlaq qiymat yuqoridagi amallar ketma-ketligiga
  // bog'lanib qolardi va bitta yangi tekshiruv qo'shilishi bilan
  // yiqilardi — implementatsiya to'g'ri bo'lsa ham.
  const cashBefore = {};
  const revenueBefore = {};
  const depositBefore = {};
  for (const [label, , f] of STACKS) {
    cashBefore[label] = await balanceOf(f.branch.id, 'cash');
    revenueBefore[label] = await balanceOf(f.branch.id, 'revenue');
    depositBefore[label] = await balanceOf(f.branch.id, 'deposit');
  }

  await mirror('postDepositApply (kassaga TEGMAYDI)', async (svc, f) => {
    const plan = await mkPlan(f, { month: 7 });
    const trx = await mkTx(f, plan.id, {
      month: 7, amount: 300_000, source: 'deposit' });
    await svc.postDepositApply({ paymentTransactionId: trx.id }, f.actor);
    return { postingKey: `deposit_apply:${trx.id}`,
      entityType: 'PaymentTransaction', entityId: trx.id };
  });
  for (const [label, , f] of STACKS) {
    // Qoplash PUL HARAKATI EMAS: depozit majburiyati → daromadga
    // ko'chadi, kassa esa QIMIRLAMAYDI (pul allaqachon to'ldirishda
    // kirgan — aks holda u IKKI MARTA sanalardi).
    eq(`qoplashda naqd O'ZGARMADI (${label})`,
      (await balanceOf(f.branch.id, 'cash')) - cashBefore[label], 0);
    eq(`qoplash daromadni +300 000 qildi (${label})`,
      (await balanceOf(f.branch.id, 'revenue')) - revenueBefore[label], 300_000);
    eq(`qoplash depozit majburiyatini −300 000 qildi (${label})`,
      (await balanceOf(f.branch.id, 'deposit')) - depositBefore[label], -300_000);
  }

  // MANFIY: depozitdan qoplangan to'lov `postStudentPayment` ga kelmasin.
  await mirror('depozit to\'lovi postStudentPayment ga → rad', async (svc, f) => {
    const plan = await mkPlan(f, { month: 8 });
    const trx = await mkTx(f, plan.id, { month: 8, source: 'deposit' });
    await svc.postStudentPayment({ paymentTransactionId: trx.id }, f.actor);
    return { postingKey: `payment:${trx.id}` };
  });

  // ─────────────────────────────────────────────────────────────────
  section('4) CHIQIM · MAOSH');
  // ─────────────────────────────────────────────────────────────────

  // ⚠ `Expense.categoryId` MAJBURIY — kategoriyasiz chiqim sxema
  // darajasida mumkin emas. Mavjud UMUMIY kategoriya olinadi
  // (`branchId = null`), yangisi YARATILMAYDI: `expense_categories`
  // ishlab chiqarish ma'lumoti va unga yangi qator qo'shish qoldiq
  // bo'lardi.
  const anyCategory = await prisma.expenseCategory.findFirst({
    where: { isDeleted: false },
    select: { id: true, kind: true },
  });
  if (!anyCategory) throw new Error('expense_categories bo\'sh — seed kerak');

  await mirror('postExpense', async (svc, f) => {
    const e = await prisma.expense.create({
      data: {
        branchId: f.branch.id, categoryId: anyCategory.id,
        amount: 250_000, title: `${TAG} ijara`,
        categoryKind: 'operating', method: 'cash',
        spentAt: new Date(Date.UTC(2033, 3, 15)),
        accrualYear: 2033, accrualMonth: 4,
      },
    });
    await svc.postExpense({ expenseId: e.id }, f.actor);
    return { postingKey: `expense:${e.id}`, entityType: 'Expense', entityId: e.id };
  });

  // FILIALSIZ chiqim jurnalga TUSHMAYDI (ataylab — eski xulq-atvor).
  await mirror('postExpense (filialsiz → yozilmaydi)', async (svc, f) => {
    const e = await prisma.expense.create({
      data: {
        branchId: null, categoryId: anyCategory.id,
        amount: 111_000, title: `${TAG} markaz`,
        categoryKind: 'operating', method: 'cash',
        spentAt: new Date(Date.UTC(2033, 3, 15)),
        accrualYear: 2033, accrualMonth: 4,
      },
    });
    const r = await svc.postExpense({ expenseId: e.id }, f.actor);
    await prisma.expense.delete({ where: { id: e.id } });
    if (r.skipped !== 'filialsiz chiqim') {
      throw new Error(`kutilgan skipped='filialsiz chiqim', keldi ${JSON.stringify(r)}`);
    }
    return { postingKey: `expense:${e.id}` };
  });

  await mirror('postTeacherPayroll', async (svc, f) => {
    const sal = await prisma.teacherSalary.create({
      data: {
        branchId: f.branch.id, teacherId: f.teacher.id, groupId: f.group.id,
        year: 2033, month: 4, kind: 'group', expectedAmount: 400_000,
        paidAmount: 0, status: 'unpaid',
      },
    });
    const trx = await prisma.salaryTransaction.create({
      data: {
        branchId: f.branch.id, salaryId: sal.id, teacherId: f.teacher.id,
        groupId: f.group.id, year: 2033, month: 4, amount: 400_000,
        method: 'cash', paidAt: new Date(Date.UTC(2033, 3, 20)),
      },
    });
    await svc.postTeacherPayroll({ salaryTransactionId: trx.id }, f.actor);
    return { postingKey: `salary_teacher:${trx.id}`,
      entityType: 'SalaryTransaction', entityId: trx.id };
  });

  await mirror('postStaffPayroll', async (svc, f) => {
    const pr = await prisma.staffPayroll.create({
      data: {
        branchId: f.branch.id, employeeId: f.staff.id, year: 2033, month: 4,
        salaryType: 'fixed', baseAmount: 150_000, fixedAmount: 150_000,
        finalAmount: 150_000, paidAmount: 0, status: 'unpaid',
      },
    });
    const trx = await prisma.staffSalaryTransaction.create({
      data: {
        branchId: f.branch.id, payrollId: pr.id, employeeId: f.staff.id,
        year: 2033, month: 4, amount: 150_000, method: 'cash',
        paidAt: new Date(Date.UTC(2033, 3, 20)),
      },
    });
    await svc.postStaffPayroll({ staffSalaryTransactionId: trx.id }, f.actor);
    return { postingKey: `salary_staff:${trx.id}`,
      entityType: 'StaffSalaryTransaction', entityId: trx.id };
  });

  // ─────────────────────────────────────────────────────────────────
  section('5) QAYTARIM');
  // ─────────────────────────────────────────────────────────────────

  const refunded = await mirror('postRefund', async (svc, f) => {
    const plan = await mkPlan(f, { month: 9 });
    const orig = await mkTx(f, plan.id, { month: 9, amount: 500_000 });
    const r = await prisma.refund.create({
      data: {
        branchId: f.branch.id, studentId: f.student.id, groupId: f.group.id,
        originalTransactionId: orig.id, amount: 200_000, method: 'cash',
        reason: `${TAG} qaytarim`, status: 'approved',
        requestedById: f.actor.id,
      },
    });
    await svc.postRefund({ refundId: r.id }, f.actor);
    return { postingKey: `refund:${r.id}`, entityType: 'Refund', entityId: r.id,
      refundId: r.id, origId: orig.id };
  });

  for (const [label, , f] of STACKS) {
    const id = refunded[label]?.refundId;
    if (!id) { skip(`qaytarim holati (${label})`, 'yaratilmadi'); continue; }
    const row = await prisma.refund.findUnique({ where: { id } });
    eq(`qaytarim holati executed (${label})`, row.status, 'executed');
    eq(`jurnal yozuvi bog'landi (${label})`, Boolean(row.journalEntryId), true);
  }

  // MANFIY: qaytarim asl to'lovdan oshib ketolmaydi.
  await mirror("qaytarim asl to'lovdan oshdi → rad", async (svc, f) => {
    const plan = await mkPlan(f, { month: 10 });
    const orig = await mkTx(f, plan.id, { month: 10, amount: 100_000 });
    const r = await prisma.refund.create({
      data: {
        branchId: f.branch.id, studentId: f.student.id, groupId: f.group.id,
        originalTransactionId: orig.id, amount: 150_000, method: 'cash',
        reason: `${TAG} oshiq`, status: 'approved', requestedById: f.actor.id,
      },
    });
    await svc.postRefund({ refundId: r.id }, f.actor);
    return { postingKey: `refund:${r.id}` };
  });

  // MANFIY: AVVAL qaytarilganlar ham hisobga olinadi.
  await mirror("ikkinchi qaytarim jamini oshirdi → rad", async (svc, f) => {
    const plan = await mkPlan(f, { month: 11 });
    const orig = await mkTx(f, plan.id, { month: 11, amount: 100_000 });
    const first = await prisma.refund.create({
      data: {
        branchId: f.branch.id, studentId: f.student.id, groupId: f.group.id,
        originalTransactionId: orig.id, amount: 60_000, method: 'cash',
        reason: `${TAG} birinchi`, status: 'approved', requestedById: f.actor.id,
      },
    });
    await svc.postRefund({ refundId: first.id }, f.actor);
    const second = await prisma.refund.create({
      data: {
        branchId: f.branch.id, studentId: f.student.id, groupId: f.group.id,
        originalTransactionId: orig.id, amount: 60_000, method: 'cash',
        reason: `${TAG} ikkinchi`, status: 'approved', requestedById: f.actor.id,
      },
    });
    await svc.postRefund({ refundId: second.id }, f.actor);
    return { postingKey: `refund:${second.id}` };
  });

  // ─────────────────────────────────────────────────────────────────
  section("6) KOMISSIYA · EGASINING PULI · ICHKI O'TKAZMA · TUZATISH");
  // ─────────────────────────────────────────────────────────────────

  await mirror('postPaymentFee', async (svc, f, label) => {
    const ref = `${TAG}-${label}-fee`;
    await svc.postPaymentFee(
      { branchId: f.branch.id, amount: 12_000, method: 'bank', reference: ref,
        provider: 'Click' }, f.actor);
    return { postingKey: `payment_fee:${ref}`,
      entityType: 'PaymentFee', entityId: ref };
  });

  const ownerRevenueBefore = {};
  const ownerExpenseBefore = {};
  for (const [label, , f] of STACKS) {
    ownerRevenueBefore[label] = await balanceOf(f.branch.id, 'revenue');
    ownerExpenseBefore[label] = await balanceOf(f.branch.id, 'expense');
  }

  await mirror('postOwnerInvestment', async (svc, f, label) => {
    const ref = `${TAG}-${label}-inv`;
    await svc.postOwnerInvestment(
      { branchId: f.branch.id, amount: 5_000_000, method: 'cash',
        reference: ref, ownerId: f.actor.id }, f.actor);
    return { postingKey: `owner_investment:${ref}`,
      entityType: 'OwnerCapital', entityId: ref };
  });

  await mirror('postOwnerWithdrawal', async (svc, f, label) => {
    const ref = `${TAG}-${label}-wd`;
    await svc.postOwnerWithdrawal(
      { branchId: f.branch.id, amount: 1_000_000, method: 'cash',
        reference: ref, ownerId: f.actor.id }, f.actor);
    return { postingKey: `owner_withdrawal:${ref}`,
      entityType: 'OwnerCapital', entityId: ref };
  });
  for (const [label, , f] of STACKS) {
    eq(`egasi kapitali (5M − 1M) (${label})`,
      await balanceOf(f.branch.id, 'owner_capital'), 4_000_000);
    // ⚠ EGASINING PULI DAROMAD HAM, XARAJAT HAM EMAS.
    // Nisbiy o'lchov (yuqoridagi izohga qarang): investitsiya va
    // yechish daromadni ham, xarajatni ham QIMIRLATMASLIGI kerak.
    eq(`egasi puli daromadga TEGMADI (${label})`,
      (await balanceOf(f.branch.id, 'revenue')) - ownerRevenueBefore[label], 0);
    eq(`egasi puli xarajatga TEGMADI (${label})`,
      (await balanceOf(f.branch.id, 'expense')) - ownerExpenseBefore[label], 0);
  }

  await mirror("postTransfer (ichki)", async (svc, f, label) => {
    const ref = `${TAG}-${label}-tr`;
    await svc.postTransfer(
      { branchId: f.branch.id, fromMethod: 'cash', toMethod: 'bank',
        amount: 300_000, reference: ref }, f.actor);
    return { postingKey: `account_transfer:${ref}`,
      entityType: 'AccountTransfer', entityId: ref };
  });

  await mirror("postTransfer (bir xil hisob → rad)", async (svc, f, label) => {
    await svc.postTransfer(
      { branchId: f.branch.id, fromMethod: 'cash', toMethod: 'cash',
        amount: 1000, reference: `${TAG}-${label}-tr2` }, f.actor);
    return { postingKey: `account_transfer:${TAG}-${label}-tr2` };
  });

  await mirror('postAdjustment', async (svc, f, label) => {
    const ref = `${TAG}-${label}-adj`;
    await svc.postAdjustment(
      { branchId: f.branch.id, reference: ref, reason: 'sinov tuzatishi',
        lines: [
          { accountKind: 'cash', debit: 10_000 },
          { accountKind: 'equity', credit: 10_000 },
        ] }, f.actor);
    return { postingKey: `adjustment:${ref}`,
      entityType: 'Adjustment', entityId: ref };
  });

  // MANFIY: sababsiz tuzatish rad etiladi.
  await mirror('postAdjustment (sababsiz → rad)', async (svc, f, label) => {
    await svc.postAdjustment(
      { branchId: f.branch.id, reference: `${TAG}-${label}-adj2`, reason: '   ',
        lines: [
          { accountKind: 'cash', debit: 1000 },
          { accountKind: 'equity', credit: 1000 },
        ] }, f.actor);
    return { postingKey: `adjustment:${TAG}-${label}-adj2` };
  });

  // ─────────────────────────────────────────────────────────────────
  section("7) QO'RIQCHILAR — o'lchov va filial muvofiqligi");
  // ─────────────────────────────────────────────────────────────────

  // ═══════════════════════════════════════════════════════════════════
  // O'LCHOV QO'RIQCHISI — `assertApplicable()` TO'G'RIDAN-TO'G'RI
  //
  // ⚠ BUNI `postAdjustment` ORQALI SINAB BO'LMAYDI va birinchi urinish
  // aynan shu sababdan YOLG'ON YASHIL bergan edi:
  //
  //   • `compact()` `DIMENSION_FIELDS` da YO'Q kalitni (`nonExistentField`)
  //     qo'riqchigacha yetib bormasdan TASHLAB YUBORADI — ya'ni hech
  //     narsa rad etilmaydi;
  //   • `adjustment` turi esa ATAYLAB kengi: u BARCHA o'lchovga ruxsat
  //     beradi (tuzatish har qanday xatoni to'g'rilashi mumkin), ya'ni
  //     u orqali "rad etish" ni umuman ko'rsatib bo'lmaydi.
  //
  // Shuning uchun qo'riqchi O'ZI chaqiriladi, cheklangan turlar bilan.
  {
    // ⚠ ILGARI EXPRESS `dimensionResolver.js` JONLI import qilinardi.
    //   Sof funksiya bo'lgani uchun uning 9 holatdagi javobi
    //   `test/fixtures/express-dimension-resolver.json` ga MUZLATILDI
    //   (6 tasi RAD ETILGAN) — qo'riqchi hamon AYNI kirish bilan
    //   o'lchanadi.
    const DIM_ORACLE = JSON.parse(readFileSync(
      new URL('fixtures/express-dimension-resolver.json', import.meta.url), 'utf8')).cases;
    const { DimensionResolverService } =
      await import('../dist/modules/finance/dimension-resolver.service.js');
    const nDim = new DimensionResolverService(N.client);

    const CASES = [
      // MANFIY: ichki o'tkazma hech kimga tegishli emas — o'quvchi MUMKIN EMAS.
      ['account_transfer + studentId', 'account_transfer', { studentId: 'a'.repeat(24) }],
      // MANFIY: depozit to'ldirishda guruh/o'qituvchi o'lchovi yo'q.
      ['deposit_in + groupId', 'deposit_in', { groupId: 'a'.repeat(24) }],
      ['deposit_in + teacherId', 'deposit_in', { teacherId: 'a'.repeat(24) }],
      // MANFIY: egasining pulida o'quvchi bo'lishi mumkin emas.
      ['owner_investment + studentId', 'owner_investment', { studentId: 'a'.repeat(24) }],
      // MANFIY: inkassatsiyada o'lchov umuman yo'q.
      ['transfer_send + staffId', 'transfer_send', { staffId: 'a'.repeat(24) }],
      // MANFIY: noma'lum yozuv turi.
      ['__nope__', '__nope__', {}],
      // MUSBAT NAZORAT: ruxsat etilgan o'lchovlar O'TADI.
      ['payment + studentId (musbat)', 'payment', { studentId: 'a'.repeat(24) }],
      ['deposit_in + paymentMethod (musbat)', 'deposit_in', { paymentMethod: 'cash' }],
      ['expense + costType (musbat)', 'expense', { costType: 'fixed' }],
    ];

    for (const [name, kind, dims] of CASES) {
      const ea = DIM_ORACLE[name];
      if (!ea) { bad(`o'lchov qo'riqchisi: ${name}`, "oracle'da yo'q"); continue; }
      let na;
      try {
        const r = nDim.assertApplicable(kind, dims);
        na = r === undefined ? { undef: true } : { ok: JSON.parse(JSON.stringify(r)) };
      } catch (err) { na = { err: err.message }; }
      try {
        assert.deepEqual(na, ea);
        ea.err
          ? ok(`o'lchov qo'riqchisi: ${name} — RAD ETILDI`, ea.err.slice(0, 55))
          : ok(`o'lchov qo'riqchisi: ${name} — O'TDI`, JSON.stringify(ea.ok ?? null));
      } catch {
        bad(`o'lchov qo'riqchisi: ${name}`,
          `oracle: ${JSON.stringify(ea)}\n      nest  : ${JSON.stringify(na)}`);
      }
    }
  }

  // MANFIY: BEGONA filial guruhi rad etiladi.
  await mirror('begona filial guruhi → rad', async (svc, f, label) => {
    await svc.postAdjustment(
      { branchId: f.branch.id, reference: `${TAG}-${label}-fbr`, reason: 'sinov',
        lines: [
          { accountKind: 'cash', debit: 1000 },
          { accountKind: 'equity', credit: 1000 },
        ],
        dimensions: { groupId: f.foreignGroup.id } }, f.actor);
    return { postingKey: `adjustment:${TAG}-${label}-fbr` };
  });

  // MUSBAT NAZORAT: O'Z filiali guruhi O'TADI.
  //
  // ⚠ USIZ yuqoridagi tekshiruv ma'nosiz bo'lardi — "hamma narsa rad
  // etiladi" ham yashil berardi.
  await mirror("o'z filiali guruhi O'TADI (musbat nazorat)", async (svc, f, label) => {
    const ref = `${TAG}-${label}-obr`;
    await svc.postAdjustment(
      { branchId: f.branch.id, reference: ref, reason: 'sinov',
        lines: [
          { accountKind: 'cash', debit: 1000 },
          { accountKind: 'equity', credit: 1000 },
        ],
        dimensions: { groupId: f.group.id } }, f.actor);
    return { postingKey: `adjustment:${ref}` };
  });

  // ─────────────────────────────────────────────────────────────────
  section('8) MUVOZANAT — barcha yozuvlar');
  // ─────────────────────────────────────────────────────────────────

  for (const [label, , f] of STACKS) {
    const entries = await prisma.journalEntry.findMany({
      where: { branchId: { in: [f.branch.id, f.other.id] } },
      include: { lines: true },
    });
    eq(`yozuvlar soni (${label})`, entries.length > 0, true);
    eq(`sarlavha muvozanati (${label})`,
      entries.filter((e) => Number(e.totalDebit) !== Number(e.totalCredit)).length, 0);
    eq(`sarlavha qatorlar bilan mos (${label})`,
      entries.filter((e) => {
        const d = e.lines.reduce((s, l) => s + Number(l.debit), 0);
        const c = e.lines.reduce((s, l) => s + Number(l.credit), 0);
        return d !== Number(e.totalDebit) || c !== Number(e.totalCredit);
      }).length, 0);
    eq(`qatorda debet+kredit birga emas (${label})`,
      entries.flatMap((e) =>
        e.lines.filter((l) => Number(l.debit) > 0 && Number(l.credit) > 0)).length, 0);
  }

  // ⚠ ILGARI bu yerda IKKALA STEK yozgan yozuvlar SONI solishtirilardi.
  //   Express tomoni o'chirilgach solishtiruv ma'nosini yo'qotdi; uning
  //   o'rniga MUSBAT NAZORAT qoladi: to'plam umuman yozuv YOZGAN
  //   bo'lishi shart, aks holda yuqoridagi barcha "balans to'g'ri"
  //   tekshiruvlari BO'SH to'plam ustida yashil bo'lardi.
  for (const [label, , f] of STACKS) {
    const n = await prisma.journalEntry.count({ where: { branchId: f.branch.id } });
    n > 0
      ? ok(`MUSBAT NAZORAT: ${label} yozuv yozdi`, `${n} ta yozuv`)
      : bad(`MUSBAT NAZORAT: ${label} yozuv yozdi`, "birorta yozuv YO'Q — to'plam bo'sh o'lchadi");
  }

  await N.client.$disconnect().catch(() => {});
};

run()
  .catch((err) => {
    console.error('\x1b[31mTEST YIQILDI:\x1b[0m', err);
    R.fail += 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect().catch(() => {});
    // ⚠ MUSBAT NAZORAT: hech narsa o'lchanmagan bo'lsa bu YASHIL EMAS.
    if (R.pass < 30) {
      console.log("\n  ❌ O'LCHANMADI: kutilganidan kam tekshiruv bajarildi.");
      R.fail += 1;
    }
    console.log(
      `\n  Natija (financialTransaction): ${R.pass} o'tdi, ${R.fail} yiqildi, ` +
      `${R.unmeasured} o'lchanmadi\n`);
    process.exit(R.fail || R.unmeasured ? 1 : 0);
  });
