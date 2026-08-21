/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMUMIY CHIQIMLAR — PARITET (FAZA 7.6)
 *
 * Express `/api/expenses` (10 marshrut) ↔ NestJS ekvivalenti.
 *
 * ── NIMA ISBOTLANADI ──
 *   1. Javob VA baza ta'siri bir xil (chiqim + JURNAL yozuvi).
 *   2. ATOMIKLIK: chiqim va jurnal BITTA tranzaksiyada — biri
 *      yiqilsa ikkinchisi ham yozilmaydi.
 *   3. TASDIQ OQIMI: limitdan oshgan chiqim hujjat YARATMAYDI,
 *      202 qaytaradi va faqat so'rov ochiladi.
 *   4. MARKAZ UMUMIY chiqimi (`branchId: null`) har filial
 *      ro'yxatida ko'rinadi, `branch-only` da esa YO'Q.
 *   5. Tasdiqdan o'tgan chiqim summasini tahrirlash TAQIQLANADI
 *      (limitni aylanib o'tish yo'li).
 *   6. VALYUTA: kurssiz chet el valyutasi RAD ETILADI; kurs bilan
 *      summa MUZLATILADI.
 *   7. KAPITAL chiqim amortizatsiya muddatisiz RAD ETILADI.
 *   8. Ishlatilgan kategoriyani o'chirib bo'lmaydi.
 *   9. Filial ko'lami: begona filial chiqimi 404.
 *
 * ISHLATISH:  npm run test:expenses-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, normalize, nowStamps, mintToken,
  waitForStacks, createReporter,
} from './_harness.mjs';

const prisma = new PrismaClient();
const TAG = `EX-${Date.now().toString(36)}`;
const { R, ok, bad, skip, section, finish } = createReporter('expenses');

const made = { branches: [], users: [], categories: [] };

const rateLimited = (r) =>
  r?.status === 429 ||
  /so'rovlar soni juda ko'p/i.test(String(r?.body?.message || ''));

const cleanup = async () => {
  const b = made.branches;
  try {
    if (b.length) {
      await prisma.approval.deleteMany({ where: { branchId: { in: b } } });
      await prisma.expense.deleteMany({ where: { branchId: { in: b } } });
    }
    // Markaz umumiy chiqimlari (branchId = null) — TAG bo'yicha.
    await prisma.expense.deleteMany({ where: { title: { startsWith: TAG } } });
    // ⚠ NOM BO'YICHA, ID ro'yxati bo'yicha EMAS: kategoriyalarning bir
    // qismi HTTP orqali yaratiladi va ularning ID si testda hamma
    // joyda kuzatilmaydi. Nom `TAG` bilan boshlanadi, ya'ni bu qidiruv
    // begona qatorni ushlay olmaydi.
    const mine = await prisma.expenseCategory.findMany({
      where: { name: { startsWith: TAG } }, select: { id: true } });
    const catIds = [...new Set([...made.categories, ...mine.map((c) => c.id)])];
    if (catIds.length) {
      await prisma.expense.deleteMany({ where: { categoryId: { in: catIds } } });
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
    if (catIds.length) {
      await prisma.expenseCategory.deleteMany({ where: { id: { in: catIds } } });
    }
    if (made.users.length) {
      await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    }
    if (b.length) await prisma.branch.deleteMany({ where: { id: { in: b } } });
  } catch (e) {
    console.error('  ⚠ tozalash xatosi:', e.message);
  }
};

const makeFixture = async (label) => {
  const branch = await prisma.branch.create({
    data: { name: `${TAG} ${label}`, code: `${TAG}${label}` } });
  const other = await prisma.branch.create({
    data: { name: `${TAG} ${label}B`, code: `${TAG}${label}B` } });
  made.branches.push(branch.id, other.id);

  const mk = async (n, role, home) => {
    const u = await prisma.user.create({
      data: {
        firstName: n, lastName: `${TAG}${label}`,
        username: `${n.toLowerCase()}_${TAG.toLowerCase()}_${label.toLowerCase()}`,
        passwordHash: 'x', role, homeBranchId: home,
      } });
    made.users.push(u.id);
    return u;
  };
  const dir = await mk('Dir', 'director', branch.id);
  const dirOther = await mk('DirB', 'director', other.id);

  // Kategoriya — FILIALGA tegishli (umumiy emas), toza o'lchov uchun.
  const cat = await prisma.expenseCategory.create({
    data: { name: `${TAG}${label} kat`, kind: 'operating', branchId: branch.id },
  });
  // Nofaol kategoriya — manfiy nazorat uchun.
  const inactive = await prisma.expenseCategory.create({
    data: { name: `${TAG}${label} nofaol`, kind: 'operating',
      branchId: branch.id, isActive: false },
  });
  made.categories.push(cat.id, inactive.id);

  // Filial limiti — tasdiq oqimini ishga tushirish uchun.
  await prisma.branch.update({
    where: { id: branch.id }, data: { expenseApprovalThreshold: 5_000_000 } });

  return { branch, other, dir, dirOther, cat, inactive };
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mUMUMIY CHIQIMLAR — PARITET\x1b[0m  (${TAG})`);
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
      headers: branchId ? { 'x-branch-id': branchId } : {},
    });

  const subs = (base) => {
    const f = fx[base];
    const L = base === EXPRESS ? 'E' : 'N';
    return [
      [f.branch.id, '<A>'], [f.other.id, '<B>'],
      [f.dir.id, '<DIR>'], [f.dirOther.id, '<DIRB>'],
      [f.cat.id, '<CAT>'], [f.inactive.id, '<INACTIVE>'], [owner.id, '<OWNER>'],
      // ⚠ KICHIK harfli stek qo'shimchasi (`EX-xxxe` / `EX-xxxn`) —
      // fikstura nomlari unda yasaladi. U KATTA harfli variantdan
      // OLDIN kelishi shart, aks holda `TAG` avval almashtirilib
      // `<TAG>e` / `<TAG>n` qolib ketardi va solishtiruv yiqilardi.
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
   * BAZA TEKSHIRUVI — FAQAT so'rov HAQIQATAN bajarilgan bo'lsa.
   *
   * ⚠ `mirror()` 429 (tezlik chegarasi) da bo'sh obyekt qaytaradi va
   * so'rov UMUMAN yuborilmagan bo'ladi. Undan keyingi baza tekshiruvi
   * esa shartsiz ishlab, "qator yo'q" deb QIZIL berardi — holbuki
   * implementatsiya to'g'ri, shunchaki hech narsa o'lchanmagan.
   *
   * Aynan shu 4 ta yolg'on qizil berdi (`NaN`, `undefined`, `false`),
   * shuning uchun baza tekshiruvlari ham o'sha shartga bog'landi.
   */
  const ranOk = (m) => Boolean(m && m.e && m.n);
  const eqIf = (m, n, fn) => {
    if (!ranOk(m)) { skip(n, "oldingi so'rov o'lchanmadi (429)"); return null; }
    return fn();
  };

  // ─────────────────────────────────────────────────────────────────
  section('1) KATEGORIYALAR');
  // ─────────────────────────────────────────────────────────────────

  await mirror('GET /expenses/categories', (base, f) =>
    call(base, 'GET', '/api/expenses/categories', { branchId: f.branch.id }));
  await mirror('GET /categories?includeInactive=true', (base, f) =>
    call(base, 'GET', '/api/expenses/categories?includeInactive=true',
      { branchId: f.branch.id }));

  // ⚠ NOM HAR STEKDA BOSHQA VA KATEGORIYA FILIALGA BOG'LANGAN.
  //
  // `branchId: null` kategoriyalar GLOBAL: ikkala stek ham ularni
  // ko'radi va qisman unique indeks `(branchId, name)` bo'yicha
  // ishlaydi. Bir xil nom bilan chaqirilsa Express yaratadi, NestJS
  // esa 409 oladi — bu paritet buzilishi EMAS, fikstura to'qnashuvi.
  const nc = await mirror('POST /categories', (base, f, s) =>
    call(base, 'POST', '/api/expenses/categories', {
      branchId: f.branch.id,
      body: { name: `${TAG}${s} yangi`, kind: 'operating', branchId: f.branch.id },
    }));
  for (const base of [EXPRESS, NEST]) {
    const id = (base === EXPRESS ? nc.e : nc.n)?.body?.data?.id;
    if (id) made.categories.push(id);
  }

  // MANFIY: bir xil nomli kategoriya (qisman unique indeks).
  await mirror('POST /categories (takroriy nom → 409)', (base, f, s) =>
    call(base, 'POST', '/api/expenses/categories', {
      branchId: f.branch.id,
      body: { name: `${TAG}${s} yangi`, kind: 'operating', branchId: f.branch.id },
    }));

  await mirror('PATCH /categories/:id', (base, f) =>
    call(base, 'PATCH', `/api/expenses/categories/${f.cat.id}`, {
      branchId: f.branch.id, body: { sortOrder: 7 },
    }));
  await mirror('PATCH /categories/:id (404)', (base, f) =>
    call(base, 'PATCH', `/api/expenses/categories/${'a'.repeat(24)}`, {
      branchId: f.branch.id, body: { sortOrder: 1 },
    }));

  // ─────────────────────────────────────────────────────────────────
  section('2) CHIQIM YARATISH — ATOMIK (chiqim + jurnal)');
  // ─────────────────────────────────────────────────────────────────

  const created = await mirror('POST /expenses (limitdan past → 201)', (base, f) =>
    call(base, 'POST', '/api/expenses', {
      branchId: f.branch.id,
      body: {
        category: f.cat.id, title: `${TAG} ijara`, amount: 1_000_000,
        method: 'cash', spentAt: '2034-05-10',
        accrualYear: 2034, accrualMonth: 5,
      },
    }));

  for (const base of [EXPRESS, NEST]) {
    const f = fx[base]; const label = base === EXPRESS ? 'express' : 'nest';
    const rows = await prisma.expense.findMany({ where: { branchId: f.branch.id } });
    eq(`bitta chiqim yozildi (${label})`, rows.length, 1);
    // ⚠ ATOMIKLIK: jurnal yozuvi HAM bo'lishi SHART.
    const je = await prisma.journalEntry.findUnique({
      where: { postingKey: `expense:${rows[0]?.id}` } });
    eq(`jurnal yozuvi yozildi (${label})`, Boolean(je), true);
    eq(`jurnal summasi mos (${label})`, Number(je?.totalDebit), 1_000_000);
    // Audit izi ham o'sha tranzaksiyada.
    eq(`audit izi yozildi (${label})`,
      await prisma.financialAuditLog.count({
        where: { entityType: 'Expense', entityId: rows[0]?.id } }), 1);
  }

  // ── TASDIQ OQIMI: limitdan oshgan chiqim ──
  const pending = await mirror('POST /expenses (limitdan oshdi → 202)', (base, f) =>
    call(base, 'POST', '/api/expenses', {
      as: 'dir', branchId: f.branch.id,
      body: {
        category: f.cat.id, title: `${TAG} katta`, amount: 9_000_000,
        method: 'cash', spentAt: '2034-05-11',
      },
    }));
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base]; const label = base === EXPRESS ? 'express' : 'nest';
    // ⚠ HUJJAT YARATILMAYDI — aks holda "tasdiq kutilmoqda" holatidagi
    // chiqim hisobotlarga sizib kirardi.
    eq(`limitdan oshganda chiqim YOZILMADI (${label})`,
      await prisma.expense.count({
        where: { branchId: f.branch.id, title: `${TAG} katta` } }), 0);
    eq(`tasdiq so'rovi ochildi (${label})`,
      await prisma.approval.count({
        where: { branchId: f.branch.id, kind: 'expense_create' } }), 1);
  }
  eq('202 javobida so\'rov qaytadi',
    Boolean(pending.e?.body?.data?.id), true);

  // MANFIY: nofaol kategoriya.
  await mirror('POST /expenses (nofaol kategoriya → 400)', (base, f) =>
    call(base, 'POST', '/api/expenses', {
      branchId: f.branch.id,
      body: { category: f.inactive.id, title: `${TAG} nofaol`, amount: 1000 },
    }));

  // MANFIY: kategoriya topilmadi.
  await mirror('POST /expenses (kategoriya 404)', (base, f) =>
    call(base, 'POST', '/api/expenses', {
      branchId: f.branch.id,
      body: { category: 'a'.repeat(24), title: `${TAG} yo'q`, amount: 1000 },
    }));

  // MANFIY: kapital chiqim amortizatsiyasiz (validator `refine`).
  await mirror('POST /expenses (kapital, muddatsiz → 400)', (base, f) =>
    call(base, 'POST', '/api/expenses', {
      branchId: f.branch.id,
      body: { category: f.cat.id, title: `${TAG} jihoz`, amount: 1000,
        isCapital: true },
    }));

  // MANFIY: chet el valyutasi kurssiz.
  await mirror('POST /expenses (USD, kurssiz → 400)', (base, f) =>
    call(base, 'POST', '/api/expenses', {
      branchId: f.branch.id,
      body: { category: f.cat.id, title: `${TAG} usd`, amount: 100,
        currency: 'USD' },
    }));

  // MUSBAT: valyuta kursi bilan — summa MUZLATILADI.
  const usd = await mirror('POST /expenses (USD + kurs → 201)', (base, f) =>
    call(base, 'POST', '/api/expenses', {
      branchId: f.branch.id,
      body: {
        category: f.cat.id, title: `${TAG} usd-ok`, amount: 100,
        currency: 'USD', originalAmount: 100, exchangeRate: 12_500,
        spentAt: '2034-05-12',
      },
    }));
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base]; const label = base === EXPRESS ? 'express' : 'nest';
    await eqIf(usd, `valyuta yozuvi (${label})`, async () => {
      const row = await prisma.expense.findFirst({
        where: { branchId: f.branch.id, title: `${TAG} usd-ok` } });
      // 100 × 12 500 = 1 250 000 — kurs YOZUVDA muzlatiladi.
      eq(`valyuta summasi muzlatildi (${label})`, Number(row?.amount), 1_250_000);
      eq(`kurs saqlandi (${label})`, Number(row?.exchangeRate), 12_500);
    });
  }

  // ─────────────────────────────────────────────────────────────────
  section('3) MARKAZ UMUMIY CHIQIMI (branchId: null)');
  // ─────────────────────────────────────────────────────────────────
  //
  // ⚠ `Approval.branchId` MAJBURIY, ya'ni umumiy chiqim tasdiq
  // so'roviga tushganda HAR DOIM yiqiladi. Bu Express'da ham shunday
  // (MAVJUD XATO, kodda izohlangan). Test buni PINLAYDI.
  await mirror('POST /expenses (umumiy → Approval.branchId majburiy)',
    (base, f) => call(base, 'POST', '/api/expenses', {
      branchId: f.branch.id,
      body: { category: f.cat.id, title: `${TAG} umumiy`, amount: 1000,
        branchId: null },
    }));

  // ─────────────────────────────────────────────────────────────────
  section("4) RO'YXAT · TAFSILOT · FILIAL KO'LAMI");
  // ─────────────────────────────────────────────────────────────────

  const listed = await mirror('GET /expenses', (base, f) =>
    call(base, 'GET', '/api/expenses?year=2034&month=5', { branchId: f.branch.id }));
  eqIf(listed, "ro'yxatda jami summa bor", () =>
    eq("ro'yxatda jami summa bor",
      typeof listed.e?.body?.meta?.totalAmount, 'number'));

  await mirror('GET /expenses?branchScope=branch-only', (base, f) =>
    call(base, 'GET', '/api/expenses?year=2034&month=5&branchScope=branch-only',
      { branchId: f.branch.id }));
  await mirror('GET /expenses?kind=operating', (base, f) =>
    call(base, 'GET', '/api/expenses?kind=operating&year=2034&month=5',
      { branchId: f.branch.id }));
  await mirror('GET /expenses?limit=201 (400)', (base, f) =>
    call(base, 'GET', '/api/expenses?limit=201', { branchId: f.branch.id }));

  const first = {};
  for (const base of [EXPRESS, NEST]) {
    first[base] = (await prisma.expense.findFirst({
      where: { branchId: fx[base].branch.id, title: `${TAG} ijara` } }))?.id;
  }
  await mirror('GET /expenses/:id', (base) =>
    call(base, 'GET', `/api/expenses/${first[base]}`, {}));
  await mirror('GET /expenses/:id (404)', (base) =>
    call(base, 'GET', `/api/expenses/${'a'.repeat(24)}`, {}));

  // MANFIY: BEGONA filial direktori chiqimni ko'rmaydi (404).
  await mirror('begona filial direktori → 404', (base, f) =>
    call(base, 'GET', `/api/expenses/${first[base]}`, {
      as: 'dirOther', branchId: f.other.id }));

  // MUSBAT NAZORAT: O'Z filiali direktori KO'RADI.
  await mirror("o'z filiali direktori KO'RADI (musbat nazorat)", (base, f) =>
    call(base, 'GET', `/api/expenses/${first[base]}`, {
      as: 'dir', branchId: f.branch.id }));

  await mirror('GET /expenses/summary', (base, f) =>
    call(base, 'GET', '/api/expenses/summary?year=2034&month=5',
      { branchId: f.branch.id }));

  // ─────────────────────────────────────────────────────────────────
  section('5) TAHRIRLASH VA O\'CHIRISH');
  // ─────────────────────────────────────────────────────────────────

  await mirror('PATCH /expenses/:id', (base) =>
    call(base, 'PATCH', `/api/expenses/${first[base]}`, {
      body: { title: `${TAG} ijara (tahrir)`, vendor: 'Vendor' },
    }));

  // ⚠ TASDIQDAN O'TGAN chiqim summasini tahrirlash TAQIQLANADI —
  // aks holda 100 mln so'rab, 1 mln tasdiqlatib, keyin 100 mln
  // qilish yo'li ochilardi.
  // ⚠ `expenseApprovalId` HAQIQIY tasdiq so'roviga ishora qilishi SHART:
  // `expenses_expenseApprovalId_fkey` mavjud. Soxta ID bilan fikstura
  // FK xatosi bilan yiqiladi — bu sxemaning to'g'ri ishlagani, test
  // esa uni hurmat qilishi kerak.
  //
  // Yuqorida "limitdan oshdi → 202" bo'limida HAQIQIY so'rov
  // yaratilgan — o'sha ishlatiladi.
  const approved = {};
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    const appr = await prisma.approval.findFirst({
      where: { branchId: f.branch.id, kind: 'expense_create' },
      select: { id: true },
    });
    if (!appr) { skip(`tasdiqlangan chiqim fiksturasi (${base})`, "so'rov yo'q"); continue; }
    const row = await prisma.expense.create({
      data: {
        branchId: f.branch.id, categoryId: f.cat.id,
        categoryName: f.cat.name, categoryKind: 'operating',
        title: `${TAG} tasdiqlangan`, amount: 2_000_000, method: 'cash',
        spentAt: new Date(Date.UTC(2034, 4, 15)),
        accrualYear: 2034, accrualMonth: 5,
        expenseApprovalId: appr.id,
      } });
    approved[base] = row.id;
  }
  await mirror("tasdiqlangan chiqim summasini tahrirlash → 400", (base) =>
    call(base, 'PATCH', `/api/expenses/${approved[base]}`, {
      body: { amount: 9_000_000 },
    }));
  // MUSBAT NAZORAT: summadan BOSHQA maydon tahrirlanadi.
  await mirror('tasdiqlangan chiqimning IZOHI tahrirlanadi (musbat nazorat)',
    (base) => call(base, 'PATCH', `/api/expenses/${approved[base]}`, {
      body: { description: 'izoh' },
    }));

  const deleted = await mirror('DELETE /expenses/:id', (base) =>
    call(base, 'DELETE', `/api/expenses/${first[base]}`, {}));
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    await eqIf(deleted, `yumshoq o'chirish (${label})`, async () => {
      const row = await prisma.expense.findUnique({ where: { id: first[base] } });
      // O'chirish YUMSHOQ — hujjat qoladi (jurnal yozuvi ham).
      eq(`hujjat saqlanib qoldi (${label})`, Boolean(row), true);
      eq(`isDeleted bayrog'i (${label})`, row?.isDeleted, true);
    });
  }
  await mirror('DELETE /expenses/:id (qayta → 404)', (base) =>
    call(base, 'DELETE', `/api/expenses/${first[base]}`, {}));

  // ⚠ ISHLATILGAN kategoriyani o'chirib bo'lmaydi.
  await mirror("ishlatilgan kategoriyani o'chirish → 400", (base, f) =>
    call(base, 'DELETE', `/api/expenses/categories/${f.cat.id}`, {
      branchId: f.branch.id }));

  // ─────────────────────────────────────────────────────────────────
  section('6) RUXSATLAR');
  // ─────────────────────────────────────────────────────────────────

  for (const [m, p, body] of [
    ['GET', '/api/expenses', undefined],
    ['GET', '/api/expenses/categories', undefined],
    ['GET', '/api/expenses/summary?year=2034&month=5', undefined],
    ['POST', '/api/expenses', {}],
    ['POST', '/api/expenses/categories', {}],
  ]) {
    await mirror(`${m} ${p} — autentifikatsiyasiz → 401`, (base) =>
      request(base, m, p, { body }));
  }

  // ⚠ RUXSAT XARITASI BAZADAN O'LCHANDI, TAXMIN QILINMADI.
  //
  // Birinchi urinishda "direktor kategoriya yarata olmaydi → 403" deb
  // yozilgan edi va Express 201 qaytardi: `director` rolida
  // `finance.manage_expense` BOR. Ya'ni taxmin noto'g'ri edi, xatti-
  // harakat emas.
  //
  // Haqiqiy xarita (bazadan):
  //   director → expenses.read ✓ · finance.create_expense ✓ ·
  //              finance.manage_expense ✓ · finance.approve ✗
  await mirror('direktor kategoriya YARATA OLADI (manage_expense bor)',
    (base, f, s) => call(base, 'POST', '/api/expenses/categories', {
      as: 'dir', branchId: f.branch.id,
      body: { name: `${TAG}${s} dir`, kind: 'operating', branchId: f.branch.id },
    }));
  await mirror("direktor kategoriyalarni O'QIYDI", (base, f) =>
    call(base, 'GET', '/api/expenses/categories', {
      as: 'dir', branchId: f.branch.id }));

  // MANFIY NAZORAT: direktorda `finance.approve` YO'Q — u o'zi
  // yuborgan chiqim so'rovini TASDIQLAY olmaydi.
  await mirror("direktor chiqim so'rovini tasdiqlay olmaydi → 403",
    (base, f) => call(base, 'POST',
      `/api/expense-approvals/${'a'.repeat(24)}/approve`, {
        as: 'dir', branchId: f.branch.id, body: {} }));

  // ─────────────────────────────────────────────────────────────────
  section('7) MUVOZANAT');
  // ─────────────────────────────────────────────────────────────────
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base]; const label = base === EXPRESS ? 'express' : 'nest';
    const entries = await prisma.journalEntry.findMany({
      where: { branchId: f.branch.id }, include: { lines: true } });
    eq(`sarlavha muvozanati (${label})`,
      entries.filter((e) => Number(e.totalDebit) !== Number(e.totalCredit)).length, 0);
    eq(`chiqim yozuvlari bor (${label})`,
      entries.filter((e) => e.kind === 'expense').length > 0, true);
  }
};

run()
  .catch((err) => { console.error('\x1b[31mTEST YIQILDI:\x1b[0m', err); R.fail += 1; })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect().catch(() => {});
    process.exit(finish());
  });
