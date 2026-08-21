/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QUVCHI DEPOZITI — PARITET (FAZA 7.7)
 *
 * Express `/api/deposits` (8 marshrut) ↔ NestJS ekvivalenti.
 *
 * ── NIMA ISBOTLANADI ──
 *   1. Javob VA baza ta'siri bir xil (balans + tranzaksiya + JURNAL).
 *   2. BUXGALTERIYA INVARIANTI: har bir jurnal yozuvida debet = kredit.
 *   3. BALANS HECH QACHON MANFIY BO'LMAYDI — yetarli mablag' yo'q
 *      bo'lsa yozuv UMUMAN bajarilmaydi (shartli xom SQL).
 *   4. ORTIQCHA QOPLASH YO'Q: `/apply` plan qoldig'idan oshirmaydi.
 *   5. CHIQIM LIMITI: limitdan oshgan yechish pulni QIMIRLATMAYDI,
 *      202 qaytaradi va faqat tasdiq so'rovi ochiladi.
 *   6. IDEMPOTENTLIK: bir tasdiq bo'yicha ikkinchi yechish yozilmaydi.
 *   7. FILIAL IZOLYATSIYASI: begona filial direktori boshqa filial
 *      depozit tranzaksiyalarini KO'RMAYDI.
 *   8. Qoplangan `topup` ni o'chirib bo'lmaydi (pulni "yo'q" qilish yo'li).
 *
 * ── NEGA HAR STEKKA O'Z FIKSTURASI ──
 *
 * Mutatsiyani bir xil so'rovni ikki marta yuborib sinab bo'lmaydi:
 * ikkinchi chaqiruv birinchisining natijasini ko'radi (balans allaqachon
 * o'zgargan) va hech narsa o'lchanmaydi. Shuning uchun ko'zgu fikstura.
 *
 * ⚠ "Muvaffaqiyatli HTTP javob" moliyada HECH NARSANI isbotlamaydi —
 * har bir pul amalidan keyin BAZA holati ham solishtiriladi.
 *
 * ISHLATISH:  npm run test:deposits-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, normalize, nowStamps, mintToken,
  waitForStacks, createReporter,
} from './_harness.mjs';

const prisma = new PrismaClient();
const TAG = `DP-${Date.now().toString(36)}`;
const { R, ok, bad, skip, section, finish } = createReporter('deposits');

const made = { branches: [], users: [], groups: [] };

/**
 * ⚠ SHU YURISHGA XOS MIJOZ MANZILI.
 *
 * Bu to'plam ~40 ta so'rov yuboradi va `generalLimiter` (IP bo'yicha
 * 200/daq) haqiqiy IP'ni parallel to'plamlar bilan BAHAM ko'radi.
 * Chegaraga urilganda test 429 oladi va HECH NARSA O'LCHANMAYDI.
 *
 * Ikkala stek ham `trust proxy: 1` bilan ishlaydi, ya'ni chegara shu
 * manzil bo'yicha sanaladi. CHEGARA ZAIFLASHMAYDI — to'plam faqat
 * boshqa mashinadan kelayotgandek ko'rinadi.
 */
const RUN_IP = `198.51.100.${(Number(process.hrtime.bigint() % 250n) + 2)}`;

const rateLimited = (r) =>
  r?.status === 429 ||
  /so'rovlar soni juda ko'p/i.test(String(r?.body?.message || ''));

/**
 * ⚠ TARTIB FK BO'YICHA: bola → ota. Noto'g'ri tartib `RESTRICT` beradi
 * va tozalash YARIM qoladi — keyingi yurish begona ma'lumot ustida
 * ishlab ketardi.
 */
const cleanup = async () => {
  const b = made.branches;
  const u = made.users;
  try {
    if (u.length) {
      await prisma.paymentTransaction.deleteMany({ where: { studentId: { in: u } } });
      await prisma.depositTransaction.deleteMany({ where: { studentId: { in: u } } });
      await prisma.studentDeposit.deleteMany({ where: { studentId: { in: u } } });
      await prisma.studentPayment.deleteMany({ where: { studentId: { in: u } } });
    }
    if (b.length) {
      // Jurnal yozuvlari — avval qatorlar, keyin bosh yozuv.
      const entries = await prisma.journalEntry.findMany({
        where: { branchId: { in: b } }, select: { id: true } });
      const ids = entries.map((e) => e.id);
      if (ids.length) {
        await prisma.journalLine.deleteMany({ where: { entryId: { in: ids } } });
        await prisma.journalEntry.deleteMany({ where: { id: { in: ids } } });
      }
      await prisma.approval.deleteMany({ where: { branchId: { in: b } } });
      await prisma.account.deleteMany({ where: { branchId: { in: b } } });
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

  const student = await mk('Talaba', 'student', branch.id);
  //  Ikkinchi o'quvchi — "qoplangan topup ni o'chirib bo'lmaydi" uchun
  //  alohida nishon (birinchisining balansi boshqa testlarda o'zgaradi).
  const student2 = await mk('Talaba2', 'student', branch.id);
  const dir = await mk('Dir', 'director', branch.id);
  const dirOther = await mk('DirB', 'director', other.id);

  const group = await prisma.group.create({
    data: { branchId: branch.id, name: `${TAG}${label} guruh` } });
  made.groups.push(group.id);

  // QOLDIQ PLAN — `/apply` qoplaydigan nishon.
  // ⚠ Kelajakdagi yil (2034): haqiqiy hisobotlarga aralashmasin.
  const plan = await prisma.studentPayment.create({
    data: {
      branchId: branch.id, studentId: student.id, groupId: group.id,
      year: 2034, month: 5, expectedAmount: 300_000, paidAmount: 0,
      baseFee: 300_000, status: 'unpaid',
    } });

  // CHIQIM LIMITI — tasdiq oqimini ishga tushirish uchun.
  await prisma.branch.update({
    where: { id: branch.id }, data: { expenseApprovalThreshold: 1_000_000 } });

  return { branch, other, student, student2, dir, dirOther, group, plan };
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mO'QUVCHI DEPOZITI — PARITET\x1b[0m  (${TAG})`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false }, select: { id: true, role: true } });
  if (!owner) throw new Error('owner topilmadi');
  const ownerToken = mintToken(owner);

  const fx = { [EXPRESS]: await makeFixture('E'), [NEST]: await makeFixture('N') };
  const dirToken = {}; const dirOtherToken = {};
  for (const base of [EXPRESS, NEST]) {
    dirToken[base] = mintToken(fx[base].dir);
    dirOtherToken[base] = mintToken(fx[base].dirOther);
  }

  const call = (base, method, path, { body, branchId, as } = {}) =>
    request(base, method, path, {
      token: as === 'dir' ? dirToken[base]
        : as === 'dirOther' ? dirOtherToken[base] : ownerToken,
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
      [f.branch.id, '<A>'], [f.other.id, '<B>'],
      [f.student.id, '<STU>'], [f.student2.id, '<STU2>'],
      [f.dir.id, '<DIR>'], [f.dirOther.id, '<DIRB>'],
      [f.group.id, '<GRP>'], [f.plan.id, '<PLAN>'], [owner.id, '<OWNER>'],
      // ⚠ USERNAME SHAKLI: `talaba_dp-xxxx_e` — ya'ni KICHIK harfli TAG,
      // so'ng PASTKI CHIZIQ, so'ng stek harfi. Bu almashtirish eng
      // OLDINDA turishi shart: `TAG` avval almashtirilsa `<TAG>_e`
      // qolib ketardi va faqat stek harfi bilan farq qilardi.
      [`${TAG.toLowerCase()}_${L.toLowerCase()}`, '<TAG>'],
      [`${TAG}${L.toLowerCase()}`, '<TAG>'],
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

  /**
   * ⚠⚠ PUL YO'LIDA PARITETNING O'ZI YETARLI EMAS.
   *
   * `mirror()` faqat "ikkala stek bir xilmi" deb so'raydi. Ikkalasi ham
   * 400 qaytarsa u YASHIL beradi — lekin pul UMUMAN qimirlamagan bo'ladi
   * va undan keyingi invariant tekshiruvlari BO'SH jadval ustida ishlab,
   * "debet=kredit, 0 qator" deb yolg'on tasdiq berardi.
   *
   * Aynan shu sodir bo'ldi: fikstura `paidAt: 2034-05-10` (kelajak)
   * yuborgan edi va topup ikkala stekda ham 400 olardi — test esa
   * 38/38 YASHIL ko'rsatardi.
   *
   * Shuning uchun HAR BIR muvaffaqiyatli pul amali uchun KUTILGAN
   * STATUS ochiq talab qilinadi.
   */
  const expectStatus = (m, code, name) => {
    if (!ranOk(m)) { skip(`${name} (status)`, "so'rov o'lchanmadi"); return false; }
    if (m.e.status !== code) {
      bad(`${name} — KUTILGAN STATUS`,
        `kutilgan ${code}, keldi ${m.e.status}: ` +
        `${JSON.stringify(m.e.body).slice(0, 300)}`);
      return false;
    }
    ok(`${name} — kutilgan status ${code} tasdiqlandi`);
    return true;
  };
  const ranOk = (m) => Boolean(m && m.e && m.n);
  const eqIf = (m, n, fn) => {
    if (!ranOk(m)) { skip(n, "oldingi so'rov o'lchanmadi (429)"); return null; }
    return fn();
  };

  /** Ikkala stekdagi bir xil o'lchovni solishtiradi. */
  const bothDb = async (name, fn) => {
    const e = await fn(fx[EXPRESS]);
    const n = await fn(fx[NEST]);
    if (JSON.stringify(e) === JSON.stringify(n)) {
      ok(`${name} — ${JSON.stringify(e)}`);
      return e;
    }
    bad(name, `express: ${JSON.stringify(e)}\n      nest   : ${JSON.stringify(n)}`);
    return null;
  };

  const balOf = async (f) => {
    const d = await prisma.studentDeposit.findUnique({
      where: { studentId: f.student.id }, select: { balance: true } });
    return Number(d?.balance ?? 0);
  };

  // ─────────────────────────────────────────────────────────────────
  section("1) BOSHLANG'ICH O'QISH");
  // ─────────────────────────────────────────────────────────────────

  await mirror("GET /deposits/students/:id (bo'sh balans)", (base, f) =>
    call(base, 'GET', `/api/deposits/students/${f.student.id}`));
  await mirror('GET /deposits/students/:id (404)', (base) =>
    call(base, 'GET', `/api/deposits/students/${'a'.repeat(24)}`));
  await mirror('GET /deposits/students/:id/history (bo\'sh)', (base, f) =>
    call(base, 'GET', `/api/deposits/students/${f.student.id}/history`));
  await mirror('GET /deposits/transactions', (base, f) =>
    call(base, 'GET', `/api/deposits/transactions?studentId=${f.student.id}`));
  await mirror('GET /deposits/report', (base, f) =>
    call(base, 'GET', '/api/deposits/report', { branchId: f.branch.id }));

  // ─────────────────────────────────────────────────────────────────
  section("2) TO'LDIRISH (topup)");
  // ─────────────────────────────────────────────────────────────────

  const top = await mirror("POST /deposits/topup → 201", (base, f) =>
    call(base, 'POST', '/api/deposits/topup', {
      // ⚠ `paidAt` BERILMAYDI → bugungi kun. Kelajakdagi sana ATAYLAB
      // rad etiladi (400) va u alohida manfiy nazorat sifatida pastda
      // sinaladi — bu yerda esa pul HAQIQATAN harakatlanishi kerak.
      body: { studentId: f.student.id, amount: 500_000, method: 'cash',
              note: `${TAG} topup` },
    }));

  expectStatus(top, 201, 'POST /deposits/topup');

  await eqIf(top, "to'ldirishdan keyin balans (500k − 300k qoplandi = 200k)", () =>
    bothDb('balans', async (f) => ({ balance: await balOf(f) })));

  // ⚠ BUXGALTERIYA INVARIANTI — jurnal yozuvi MUVOZANATLI bo'lishi SHART.
  // Bu HTTP javobida umuman ko'rinmaydi.
  await eqIf(top, 'jurnal: debet = kredit', () =>
    bothDb('debet=kredit', async (f) => {
      const lines = await prisma.journalLine.findMany({
        where: { entry: { branchId: f.branch.id } },
        select: { debit: true, credit: true },
      });
      const debit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
      const credit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
      // ⚠ `lines > 0` NATIJAGA KIRITILADI: bo'sh jadvalda debet=kredit
      // BEKORDAN tenglik va u hech nimani isbotlamaydi. Shart natijaning
      // bir qismi bo'lgani uchun uni e'tibordan chetda qoldirib bo'lmaydi.
      return {
        debit, credit,
        balanced: debit === credit,
        lines: lines.length,
        measured: lines.length > 0,
      };
    }));

  // ⚠ AVTO-QOPLASH: to'ldirish qoldiq planni DARHOL qoplaydi.
  await eqIf(top, "avto-qoplash: plan to'landi", () =>
    bothDb('plan holati', async (f) => {
      const p = await prisma.studentPayment.findUnique({ where: { id: f.plan.id } });
      return { paid: Number(p.paidAmount), status: p.status };
    }));

  await mirror("POST /topup (summa 0 → 400)", (base, f) =>
    call(base, 'POST', '/api/deposits/topup', {
      body: { studentId: f.student.id, amount: 0 } }));
  await mirror("POST /topup (kelajak sanasi → 400)", (base, f) =>
    call(base, 'POST', '/api/deposits/topup', {
      body: { studentId: f.student.id, amount: 1000, paidAt: '2099-01-01' } }));
  await mirror("POST /topup (o'quvchi yo'q → 400)", (base) =>
    call(base, 'POST', '/api/deposits/topup', {
      body: { studentId: 'a'.repeat(24), amount: 1000 } }));

  // ─────────────────────────────────────────────────────────────────
  section('3) YECHISH (withdraw)');
  // ─────────────────────────────────────────────────────────────────

  // ⚠ MANFIY NAZORAT KONKURENTLIKDAN OLDIN: balans 200k, 500k so'raymiz.
  const over = await mirror("POST /withdraw (balansdan ko'p → 400)", (base, f) =>
    call(base, 'POST', '/api/deposits/withdraw', {
      body: { studentId: f.student.id, amount: 500_000 } }));

  await eqIf(over, 'rad etilgach balans O\'ZGARMADI', () =>
    bothDb('balans', async (f) => ({ balance: await balOf(f) })));

  /**
   * ⚠ MANFIY BALANS SHU YERDA O'LCHANADI — OXIRIDA EMAS.
   *
   * Yakuniy tekshiruv YETARLI EMAS: undan keyin yana to'ldirish
   * bo'ladi va manfiy balans QAYTA MUSBATGA chiqib, izini yo'qotadi.
   * Sabotaj tekshiruvi aynan shuni ko'rsatdi — qorovul olib
   * tashlanganda balans -300k ga tushdi, lekin yakuniy invariant
   * `negatives: 0` deb YASHIL berdi (keyingi 2 mln uni yopgan edi).
   *
   * Shuning uchun tekshiruv rad etilishi KERAK bo'lgan amaldan
   * KEYIN, darhol turadi.
   */
  await eqIf(over, 'INVARIANT (darhol): balans manfiy emas', () =>
    bothDb('manfiy balans', async (f) => {
      const bal = await balOf(f);
      return { balance: bal, negative: bal < 0 };
    }));

  const wd = await mirror('POST /withdraw (limitdan past → 200)', (base, f) =>
    call(base, 'POST', '/api/deposits/withdraw', {
      body: { studentId: f.student.id, amount: 50_000, note: `${TAG} wd` } }));

  expectStatus(wd, 200, 'POST /withdraw (limitdan past)');

  await eqIf(wd, 'yechishdan keyin balans (200k − 50k = 150k)', () =>
    bothDb('balans', async (f) => ({ balance: await balOf(f) })));

  // ⚠ CHIQIM LIMITI: 1 mln dan oshsa pul QIMIRLAMAYDI, 202 + so'rov.
  // Avval balansni ko'taramiz (limitdan oshadigan summa uchun).
  await mirror("POST /topup (limit testi uchun 2 mln)", (base, f) =>
    call(base, 'POST', '/api/deposits/topup', {
      body: { studentId: f.student.id, amount: 2_000_000, note: `${TAG} big` } }));

  const pending = await mirror('POST /withdraw (limitdan oshdi → 202)', (base, f) =>
    call(base, 'POST', '/api/deposits/withdraw', {
      as: 'dir', branchId: f.branch.id,
      body: { studentId: f.student.id, amount: 1_500_000, note: `${TAG} over` } }));

  expectStatus(pending, 202, 'POST /withdraw (limitdan oshdi)');

  await eqIf(pending, '202 dan keyin PUL QIMIRLAMADI (balans o\'zgarmadi)', () =>
    bothDb('balans', async (f) => ({ balance: await balOf(f) })));

  await eqIf(pending, "202 faqat so'rov ochdi (tranzaksiya YO'Q)", () =>
    bothDb('so\'rov/tranzaksiya', async (f) => ({
      approvals: await prisma.approval.count({
        where: { branchId: f.branch.id, kind: 'deposit_withdraw' } }),
      withdrawTxns: await prisma.depositTransaction.count({
        where: { studentId: f.student.id, type: 'withdraw', isDeleted: false } }),
    })));

  // ─────────────────────────────────────────────────────────────────
  section('4) QOPLASH (apply) — ORTIQCHA QOPLASH YO\'Q');
  // ─────────────────────────────────────────────────────────────────

  // Plan allaqachon to'langan (topup avto-qoplagan). Yangi qoldiq plan
  // ochamiz va qoldiqdan KO'P balans bilan `/apply` chaqiramiz.
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    await prisma.studentPayment.create({
      data: {
        branchId: f.branch.id, studentId: f.student.id, groupId: f.group.id,
        year: 2034, month: 6, expectedAmount: 100_000, paidAmount: 0,
        baseFee: 100_000, status: 'unpaid',
      } });
  }

  const applied = await mirror('POST /deposits/apply → 200', (base, f) =>
    call(base, 'POST', '/api/deposits/apply', { body: { studentId: f.student.id } }));

  expectStatus(applied, 200, 'POST /deposits/apply');

  await eqIf(applied, 'ORTIQCHA QOPLASH YO\'Q: plan aynan qoldig\'igacha', () =>
    bothDb('iyun plani', async (f) => {
      const p = await prisma.studentPayment.findFirst({
        where: { studentId: f.student.id, year: 2034, month: 6 } });
      return {
        expected: Number(p.expectedAmount),
        paid: Number(p.paidAmount),
        overAllocated: Number(p.paidAmount) > Number(p.expectedAmount),
        status: p.status,
      };
    }));

  // ─────────────────────────────────────────────────────────────────
  section("5) TRANZAKSIYANI O'CHIRISH");
  // ─────────────────────────────────────────────────────────────────

  // ⚠ QOPLANGAN topup ni o'chirib bo'lmaydi — bu PULNI "YO'Q" QILISH
  // yo'li bo'lardi. `student2` uchun toza nishon: topup qilamiz,
  // qoldiq plan YO'Q (ya'ni pul balansda qoladi) → o'chirish ISHLAYDI.
  const t2 = await mirror("POST /topup (student2, qoplanmaydi)", (base, f) =>
    call(base, 'POST', '/api/deposits/topup', {
      body: { studentId: f.student2.id, amount: 70_000, note: `${TAG} s2` } }));

  const txnId = {};
  if (ranOk(t2)) {
    for (const base of [EXPRESS, NEST]) {
      const f = fx[base];
      const row = await prisma.depositTransaction.findFirst({
        where: { studentId: f.student2.id, type: 'topup', isDeleted: false },
        orderBy: { createdAt: 'desc' } });
      txnId[base] = row?.id || null;
    }
  }

  if (txnId[EXPRESS] && txnId[NEST]) {
    await mirror("DELETE /transactions/:id (qoplanmagan → 200)", (base) =>
      call(base, 'DELETE', `/api/deposits/transactions/${txnId[base]}`));
    await bothDb("o'chirilgach balans 0 ga qaytdi", async (f) => {
      const d = await prisma.studentDeposit.findUnique({
        where: { studentId: f.student2.id }, select: { balance: true } });
      return { balance: Number(d?.balance ?? 0) };
    });
  } else {
    skip("DELETE /transactions/:id", "topup tranzaksiyasi topilmadi");
  }

  await mirror('DELETE /transactions/:id (404)', (base) =>
    call(base, 'DELETE', `/api/deposits/transactions/${'a'.repeat(24)}`));

  // ─────────────────────────────────────────────────────────────────
  section('6) FILIAL IZOLYATSIYASI');
  // ─────────────────────────────────────────────────────────────────

  // ⚠ MUSBAT NAZORAT: O'Z filiali direktori tranzaksiyalarni KO'RADI.
  const ownSee = await mirror("o'z filiali direktori tranzaksiyalarni ko'radi", (base, f) =>
    call(base, 'GET', '/api/deposits/transactions', {
      as: 'dir', branchId: f.branch.id }));
  await eqIf(ownSee, "musbat nazorat: ro'yxat BO'SH EMAS", () => {
    const cnt = ownSee.e.body?.data?.length ?? 0;
    return cnt > 0
      ? ok(`musbat nazorat — ${cnt} ta yozuv ko'rindi`)
      : bad('musbat nazorat', "o'z filialida ham bo'sh — izolyatsiya testi ma'nosiz");
  });

  // ⚠ SALBIY NAZORAT: BEGONA filial direktori KO'RMAYDI.
  const foreign = await mirror("begona filial direktori KO'RMAYDI", (base, f) =>
    call(base, 'GET', '/api/deposits/transactions', {
      as: 'dirOther', branchId: f.other.id }));
  await eqIf(foreign, 'begona filial: 0 yozuv', () => {
    const cnt = foreign.e.body?.data?.length ?? 0;
    return cnt === 0
      ? ok('begona filial — 0 yozuv (izolyatsiya ishlaydi)')
      : bad('filial izolyatsiyasi', `begona filialda ${cnt} ta yozuv ko'rindi`);
  });

  await mirror("ruxsatsiz (o'quvchi tokeni) → 403", (base, f) =>
    request(base, 'GET', '/api/deposits/report', {
      token: mintToken(f.student), headers: { 'x-forwarded-for': RUN_IP } }));
  await mirror("token yo'q → 401", (base) =>
    request(base, 'GET', '/api/deposits/report', {
      headers: { 'x-forwarded-for': RUN_IP } }));

  // ─────────────────────────────────────────────────────────────────
  section('7) YAKUNIY O\'QISH VA INVARIANTLAR');
  // ─────────────────────────────────────────────────────────────────

  await mirror('GET /deposits/students/:id (yakuniy summary)', (base, f) =>
    call(base, 'GET', `/api/deposits/students/${f.student.id}`));
  await mirror('GET /deposits/students/:id/history (yakuniy)', (base, f) =>
    call(base, 'GET', `/api/deposits/students/${f.student.id}/history`));
  await mirror('GET /deposits/report (yakuniy)', (base, f) =>
    call(base, 'GET', '/api/deposits/report', { branchId: f.branch.id }));

  // ⚠ INVARIANT: balans HECH QACHON manfiy emas.
  await bothDb('INVARIANT: balans manfiy emas', async (f) => {
    const rows = await prisma.studentDeposit.findMany({
      where: { studentId: { in: [f.student.id, f.student2.id] } },
      select: { balance: true } });
    return { negatives: rows.filter((r) => Number(r.balance) < 0).length };
  });

  // ⚠ INVARIANT: barcha jurnal yozuvlari muvozanatli.
  await bothDb('INVARIANT: har bir jurnal yozuvi muvozanatli', async (f) => {
    const entries = await prisma.journalEntry.findMany({
      where: { branchId: f.branch.id },
      select: { id: true, lines: { select: { debit: true, credit: true } } },
    });
    const unbalanced = entries.filter((en) => {
      const d = en.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
      const c = en.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
      return d !== c;
    });
    return { entries: entries.length, unbalanced: unbalanced.length };
  });

  // ─────────────────────────────────────────────────────────────────
  section('8) BAZA DRIFTI');
  // ─────────────────────────────────────────────────────────────────

  await cleanup();
  const leftover = {
    branches: await prisma.branch.count({ where: { name: { startsWith: TAG } } }),
    users: await prisma.user.count({ where: { lastName: { startsWith: TAG } } }),
    deposits: await prisma.depositTransaction.count({
      where: { note: { startsWith: TAG } } }),
  };
  const total = Object.values(leftover).reduce((a, b) => a + b, 0);
  total === 0
    ? ok('test o\'zidan keyin hech narsa qoldirmadi')
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
