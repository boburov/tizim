/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KASSA JURNALI — PARITET (FAZA 7.1)
 *
 * Express `/api/journal` (9 marshrut) ↔ NestJS ekvivalenti.
 *
 * ── NEGA BU TEST BOSHQALARIDAN BOSHQACHA ──
 *
 * Bu MUTATSIYALARNI sinaydi va ular PUL harakatlantiradi. Bir xil so'rovni
 * ikkala stekka yuborib javobni solishtirish YETARLI EMAS:
 *
 *   1. Ikkinchi chaqiruv birinchisining natijasini ko'radi (smena
 *      allaqachon ochiq, o'tkazma allaqachon qabul qilingan) — ya'ni
 *      to'g'ridan-to'g'ri takrorlash 409 beradi va hech narsa o'lchanmaydi.
 *
 *   2. Muvaffaqiyatli HTTP javob HECH NARSANI isbotlamaydi. Pul jurnalga
 *      TUSHDIMI, qoldiq TO'G'RI o'zgardimi, debet = kredit qoldimi —
 *      bularning hech biri javob tanasida ko'rinmaydi.
 *
 * Shuning uchun naqsh boshqacha: HAR STEK UCHUN O'Z KO'ZGU FIKSTURASI.
 * Express A₁→B₁ ustida ishlaydi, NestJS A₂→B₂ ustida. Keyin IKKALASI ham
 * solishtiriladi:
 *   • HTTP javobi (status + normallashtirilgan tana);
 *   • BAZADAGI NATIJA — jurnal yozuvlari, qatorlar, hisob qoldiqlari.
 *
 * ── NIMA ISBOTLANADI ──
 *   1. Paritet: javob VA baza ta'siri bir xil.
 *   2. Filial izolyatsiyasi: 3 filial, musbat VA manfiy nazorat bilan.
 *   3. Konkurentlik: 20 bir vaqtdagi `receive` — FAQAT BITTASI o'tadi.
 *   4. Muvozanat: har yozuvda debet = kredit; xazina saqlanadi.
 *   5. O'zgarmaslik: yozilgan yozuv tahrirlanmaydi (JOURNAL_IMMUTABLE).
 *
 * ── TOZALASH ──
 * Fikstura filiallari `JP-<base36>` bilan belgilanadi va oxirida
 * TO'LIQ o'chiriladi (jurnal qatorlari → yozuvlar → hisoblar → o'tkazma
 * → smena → foydalanuvchi → filial). Moliyaviy qoldiq QOLDIRILMAYDI.
 *
 * ⚠ `process.exit()` `run()` ICHIDA CHAQIRILMAYDI — u tozalashni
 * o'tkazib yuborardi (aynan shu xato `journalTreasury.test.js` da
 * qoldiq to'plab kelayotgan edi).
 *
 * ISHLATISH:  node test/journal-parity.test.mjs
 *             NEST_URL=http://127.0.0.1:5002 node test/journal-parity.test.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS,
  NEST,
  request,
  normalize,
  nowStamps,
  mintToken,
  waitForStacks,
  createReporter,
} from './_harness.mjs';

const prisma = new PrismaClient();
const TAG = `JP-${Date.now().toString(36)}`;
const { R, ok, bad, skip, section, finish } = createReporter('journal');

/** Har stek uchun alohida fikstura to'plami. */
const made = { branches: [], users: [] };

// ═══════════════════════════════════════════════════════════════════════════
// FIKSTURA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bitta stek uchun UCH filial + kassir.
 *
 * UCHTA — ataylab (topshiriq talabi): A va B o'zaro ishlaydi, C esa
 * BEGONA. Ikki filial bilan "begona filial ko'ra olmaydi" tekshiruvi
 * "qabul qiluvchi emas" tekshiruvidan ajralmasdi.
 */
const makeFixture = async (label) => {
  const mk = (suffix) =>
    prisma.branch.create({
      data: { name: `${TAG} ${label} ${suffix}`, code: `${TAG}${label}${suffix}` },
    });
  const [a, b, c] = [await mk('A'), await mk('B'), await mk('C')];
  made.branches.push(a.id, b.id, c.id);

  const mkUser = async (name, role, homeBranchId) => {
    const u = await prisma.user.create({
      data: {
        firstName: name,
        lastName: `${TAG}${label}`,
        username: `${name.toLowerCase()}_${TAG.toLowerCase()}_${label.toLowerCase()}`,
        passwordHash: 'x',
        role,
        homeBranchId,
      },
    });
    made.users.push(u.id);
    return u;
  };

  const cashier = await mkUser('Kassir', 'teacher', a.id);

  // ═══════════════════════════════════════════════════════════════════
  // KO'LAMLI DIREKTORLAR — FILIAL IZOLYATSIYASI UCHUN SHART
  //
  // ⚠ OWNER BILAN IZOLYATSIYANI O'LCHAB BO'LMAYDI va bu o'lchandi:
  // owner'da `branches.view_all` bor, ya'ni `resolveAllowedBranchIds`
  // unga BARCHA filialni beradi va `isBranchAllowed(...)` HAR DOIM
  // haqiqat qaytaradi — `x-branch-id` sarlavhasidan qat'i nazar.
  //
  // Ya'ni "C filial begona o'tkazmani qabul qila olmaydi" tekshiruvi
  // owner tokeni bilan 403 EMAS, 200 berardi — va bu XATO EMAS,
  // mahsulotning ataylab qilingan xatti-harakati (owner butun tarmoq
  // uchun javobgar).
  //
  // `director` rolida `finance.manage_transfers` BOR, lekin
  // `branches.view_all` YO'Q — chegara aynan shu aktyorda o'lchanadi.
  // ═══════════════════════════════════════════════════════════════════
  const dirA = await mkUser('DirA', 'director', a.id);
  const dirB = await mkUser('DirB', 'director', b.id);
  const dirC = await mkUser('DirC', 'director', c.id);

  return { a, b, c, cashier, dirA, dirB, dirC };
};

/**
 * Kassaga boshlang'ich pul QO'YADI — servisdan CHETLAB O'TIB emas,
 * MUVOZANATLI yozuv bilan.
 *
 * ⚠ Ikkala stek uchun ham AYNAN bir xil yo'l ishlatiladi (to'g'ridan-
 * to'g'ri Prisma). Agar Express uchun Express servisi, NestJS uchun
 * NestJS servisi ishlatilsa, boshlang'ich holatning O'ZI sinalayotgan
 * narsaga bog'liq bo'lib qolardi.
 */
const seedCash = async (branchId, amount) => {
  const ensure = async (kind) => {
    const found = await prisma.account.findFirst({
      where: { branchId, kind, counterpartyBranchId: null },
    });
    if (found) return found;
    return prisma.account.create({ data: { branchId, kind } });
  };
  const cash = await ensure('cash');
  const equity = await ensure('equity');
  await prisma.journalEntry.create({
    data: {
      branchId,
      date: new Date(),
      kind: 'opening',
      memo: `${TAG} boshlang'ich naqd`,
      totalDebit: amount,
      totalCredit: amount,
      lines: {
        create: [
          { accountId: cash.id, accountKind: 'cash', debit: amount, credit: 0 },
          { accountId: equity.id, accountKind: 'equity', debit: 0, credit: amount },
        ],
      },
    },
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// BAZA O'LCHOVLARI — "muvaffaqiyatli javob" YETARLI EMAS
// ═══════════════════════════════════════════════════════════════════════════

const NORMAL_SIDE_CREDIT = new Set(['due_to', 'deposit', 'equity', 'revenue', 'owner_capital']);

/** Hisob turi bo'yicha filial qoldig'i — jurnaldan, ishorasi bilan. */
const balanceOf = async (branchId, kind) => {
  const rows = await prisma.journalLine.findMany({
    where: { accountKind: kind, entry: { branchId } },
    select: { debit: true, credit: true },
  });
  const d = rows.reduce((s, r) => s + Number(r.debit), 0);
  const c = rows.reduce((s, r) => s + Number(r.credit), 0);
  return NORMAL_SIDE_CREDIT.has(kind) ? c - d : d - c;
};

/**
 * Filialning MOLIYAVIY IZI — solishtirish uchun bitta obyektga siqiladi.
 * ID va sana KIRMAYDI: ular ikki stekda tabiiy ravishda boshqacha.
 */
const branchDigest = async (branchId) => {
  const entries = await prisma.journalEntry.findMany({
    where: { branchId },
    orderBy: [{ date: 'asc' }, { kind: 'asc' }, { memo: 'asc' }],
    include: { lines: { orderBy: [{ accountKind: 'asc' }, { debit: 'asc' }] } },
  });
  return {
    entries: entries.map((e) => ({
      kind: e.kind,
      memo: e.memo,
      isInternal: e.isInternal,
      refModel: e.refModel,
      totalDebit: Number(e.totalDebit),
      totalCredit: Number(e.totalCredit),
      balanced: Number(e.totalDebit) === Number(e.totalCredit),
      lines: e.lines.map((l) => ({
        kind: l.accountKind,
        debit: Number(l.debit),
        credit: Number(l.credit),
      })),
    })),
    balances: Object.fromEntries(
      await Promise.all(
        ['cash', 'transit', 'due_from', 'due_to', 'shortage', 'equity'].map(
          async (k) => [k, await balanceOf(branchId, k)],
        ),
      ),
    ),
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// TOZALASH
// ═══════════════════════════════════════════════════════════════════════════

const cleanup = async () => {
  const bids = made.branches;
  if (!bids.length) return;
  try {
    await prisma.cashTransfer.deleteMany({
      where: { OR: [{ fromBranchId: { in: bids } }, { toBranchId: { in: bids } }] },
    });
    await prisma.shift.deleteMany({ where: { branchId: { in: bids } } });
    const entries = await prisma.journalEntry.findMany({
      where: { branchId: { in: bids } },
      select: { id: true },
    });
    const eids = entries.map((e) => e.id);
    await prisma.journalLine.deleteMany({ where: { entryId: { in: eids } } });
    // Boshqa filialning yozuvidagi qator BIZNING hisobga ishora qilishi
    // mumkin emas (`post()` faqat o'z filiali hisoblarini ishlatadi),
    // lekin himoya sifatida hisob bo'yicha ham tozalanadi — aks holda
    // `account.deleteMany` FK bilan yiqilardi va qoldiq qolardi.
    await prisma.journalLine.deleteMany({
      where: { account: { branchId: { in: bids } } },
    });
    await prisma.journalEntry.deleteMany({ where: { id: { in: eids } } });
    await prisma.financialAuditLog.deleteMany({ where: { branchId: { in: bids } } });
    await prisma.account.deleteMany({ where: { branchId: { in: bids } } });
    if (made.users.length) {
      await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    }
    await prisma.branch.deleteMany({ where: { id: { in: bids } } });
  } catch (e) {
    console.error('  ⚠ tozalash xatosi:', e.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mKASSA JURNALI — PARITET\x1b[0m  (${TAG})`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false },
    select: { id: true, role: true },
  });
  if (!owner) throw new Error("owner topilmadi — fikstura kerak");
  const token = mintToken(owner);

  const fx = {
    [EXPRESS]: await makeFixture('E'),
    [NEST]: await makeFixture('N'),
  };
  // Ko'lamli aktyorlar uchun tokenlar (filial izolyatsiyasi shular bilan
  // o'lchanadi — owner bilan EMAS, yuqoridagi izohga qarang).
  const dirToken = {};
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    dirToken[base] = {
      a: mintToken(f.dirA),
      b: mintToken(f.dirB),
      c: mintToken(f.dirC),
    };
  }
  for (const base of [EXPRESS, NEST]) {
    await seedCash(fx[base].a.id, 10_000_000);
  }

  const call = (base, method, path, { body, branchId, as } = {}) =>
    request(base, method, path, {
      // `as` — ko'lamli aktyor ("a" | "b" | "c"); berilmasa owner.
      token: as ? dirToken[base][as] : token,
      body,
      headers: branchId ? { 'x-branch-id': branchId } : {},
    });

  /** Stekka xos ID/nomlarni belgiga almashtiradi. */
  const subs = (base) => {
    const f = fx[base];
    const L = base === EXPRESS ? 'E' : 'N';
    return [
      [f.a.id, '<A>'], [f.b.id, '<B>'], [f.c.id, '<C>'],
      [f.cashier.id, '<CASHIER>'],
      [f.dirA.id, '<DIR_A>'], [f.dirB.id, '<DIR_B>'], [f.dirC.id, '<DIR_C>'],
      [owner.id, '<OWNER>'],
      [`${TAG} ${L} `, '<TAG> '],
      [`${TAG}${L}`, '<TAG>'],
      // Kichik harfli shakl — `username` da (`dira_jp-xxxx_e`).
      [`${TAG.toLowerCase()}_${L.toLowerCase()}`, '<tag>'],
      nowStamps(),
      // ⚠ OXIRGI QOIDA: qolgan 24-belgili ID lar `<ID>` ga aylanadi.
      //
      // Bular SHU SO'ROVDA yaratilgan qatorlar (smena, o'tkazma, hisob,
      // jurnal yozuvi) — ular har stekda O'Z fiksturasida yaratiladi,
      // ya'ni ID lari TABIIY ravishda boshqacha va ularni solishtirish
      // shovqindan boshqa narsa bermaydi.
      //
      // Qoida XAVFSIZ, chunki u OXIRIDA ishlaydi: filial, kassir,
      // direktor va owner ID lari YUQORIDA allaqachon o'z belgisiga
      // almashtirilgan. Ya'ni "A o'rniga B yozildi" kabi HAQIQIY farq
      // baribir ko'rinadi — u `<A>` ≠ `<B>` bo'lib chiqadi.
      (v) => v.replace(/\b[0-9a-f]{24}\b/g, '<ID>'),
    ];
  };

  /**
   * Bir xil AMALNI har stekda O'Z fiksturasi ustida bajaradi va
   * javoblarni solishtiradi.
   *
   * @param fn `(base, f) => Promise<{status, body}>` — `f` o'sha
   *           stekning fikstura to'plami.
   */
  const mirror = async (name, fn) => {
    let e, n;
    try {
      e = await fn(EXPRESS, fx[EXPRESS]);
      n = await fn(NEST, fx[NEST]);
    } catch (err) {
      skip(name, err.message);
      return {};
    }
    if (e.status >= 200 && e.status < 300) R.successes += 1;
    const en = { status: e.status, body: normalize(e.body, subs(EXPRESS)) };
    const nn = { status: n.status, body: normalize(n.body, subs(NEST)) };
    try {
      assert.deepEqual(nn, en);
      ok(`${name} — ${e.status}`);
    } catch {
      bad(
        name,
        `express: ${JSON.stringify(en).slice(0, 700)}\n      ` +
        `nest   : ${JSON.stringify(nn).slice(0, 700)}`,
      );
    }
    return { e, n };
  };

  /** Ikki stekning BAZADAGI izini solishtiradi. */
  const mirrorDigest = async (name, pick) => {
    const de = await branchDigest(pick(fx[EXPRESS]).id);
    const dn = await branchDigest(pick(fx[NEST]).id);
    try {
      assert.deepEqual(dn, de);
      ok(`${name} — baza izi bir xil`);
    } catch {
      bad(
        name,
        `express: ${JSON.stringify(de).slice(0, 700)}\n      ` +
        `nest   : ${JSON.stringify(dn).slice(0, 700)}`,
      );
    }
  };

  const eq = (name, actual, expected) =>
    actual === expected
      ? ok(`${name} — ${actual}`)
      : bad(name, `kutilgan ${expected}, keldi ${actual}`);

  // ─────────────────────────────────────────────────────────────────
  section('1) SMENA — ochish, ikkilanish, yopish');
  // ─────────────────────────────────────────────────────────────────

  const opened = await mirror('POST /journal/shifts', (base, f) =>
    call(base, 'POST', '/api/journal/shifts', {
      branchId: f.a.id,
      body: { cashierId: f.cashier.id, note: 'paritet' },
    }),
  );

  // ⚠ OCHILISH SUMMASI JURNALDAN olinadi, so'rovdan EMAS — kassir
  // smena boshida istagan raqamni yozib, farqni yashira olmasin.
  if (opened.e?.body?.data) {
    eq('ochilish summasi jurnaldan (express)',
      Number(opened.e.body.data.openingCash), 10_000_000);
    eq('ochilish summasi jurnaldan (nest)',
      Number(opened.n.body.data.openingCash), 10_000_000);
  }

  await mirror('POST /journal/shifts (ikkinchi ochiq smena → 409)', (base, f) =>
    call(base, 'POST', '/api/journal/shifts', {
      branchId: f.a.id,
      body: { cashierId: f.cashier.id },
    }),
  );

  const shiftId = {
    [EXPRESS]: opened.e?.body?.data?.id,
    [NEST]: opened.n?.body?.data?.id,
  };

  // KAMOMAD: sanoq kutilgandan 500 000 kam.
  await mirror('POST /journal/shifts/:id/close (kamomad)', (base, f) =>
    call(base, 'POST', `/api/journal/shifts/${shiftId[base]}/close`, {
      branchId: f.a.id,
      body: { countedCash: 9_500_000, note: 'sanoq' },
    }),
  );

  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    const cash = await balanceOf(f.a.id, 'cash');
    const short = await balanceOf(f.a.id, 'shortage');
    const label = base === EXPRESS ? 'express' : 'nest';
    eq(`kamomad naqdni kamaytirdi (${label})`, cash, 9_500_000);
    // ⚠ KAMOMAD `expense` EMAS, `shortage` — u xarajat emas, YO'QOTISH
    // va mas'ul shaxsga bog'lanadi (constants/ledger.js).
    eq(`kamomad \`shortage\` hisobiga tushdi (${label})`, short, 500_000);
    eq(`kamomad \`expense\` ga TUSHMADI (${label})`,
      await balanceOf(f.a.id, 'expense'), 0);
  }

  await mirror('POST /journal/shifts/:id/close (qayta yopish → 409)', (base, f) =>
    call(base, 'POST', `/api/journal/shifts/${shiftId[base]}/close`, {
      branchId: f.a.id,
      body: { countedCash: 9_500_000 },
    }),
  );

  await mirror('GET /journal/shifts', (base, f) =>
    call(base, 'GET', '/api/journal/shifts?limit=10', { branchId: f.a.id }),
  );

  // ─────────────────────────────────────────────────────────────────
  section("2) INKASSATSIYA — yo'ldagi pul va saqlanish qonuni");
  // ─────────────────────────────────────────────────────────────────

  const treasuryBefore = {};
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    treasuryBefore[base] =
      (await balanceOf(f.a.id, 'cash')) + (await balanceOf(f.a.id, 'transit')) +
      (await balanceOf(f.b.id, 'cash')) + (await balanceOf(f.b.id, 'transit'));
  }

  const sent = await mirror('POST /journal/transfers', (base, f) =>
    call(base, 'POST', '/api/journal/transfers', {
      branchId: f.a.id,
      body: { toBranchId: f.b.id, amount: 3_000_000, note: 'inkassatsiya' },
    }),
  );
  const transferId = {
    [EXPRESS]: sent.e?.body?.data?.id,
    [NEST]: sent.n?.body?.data?.id,
  };

  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    const label = base === EXPRESS ? 'express' : 'nest';
    eq(`A kassasidan pul chiqdi (${label})`, await balanceOf(f.a.id, 'cash'), 6_500_000);
    eq(`yo'ldagi pul hisobida turibdi (${label})`, await balanceOf(f.a.id, 'transit'), 3_000_000);
    eq(`B kassasiga hali tushmadi (${label})`, await balanceOf(f.b.id, 'cash'), 0);
    const after =
      (await balanceOf(f.a.id, 'cash')) + (await balanceOf(f.a.id, 'transit')) +
      (await balanceOf(f.b.id, 'cash')) + (await balanceOf(f.b.id, 'transit'));
    // SAQLANISH QONUNI: pul yo'lda bo'lsa ham TARMOQDAN yo'qolmaydi.
    eq(`saqlanish qonuni — xazina o'zgarmadi (${label})`, after, treasuryBefore[base]);
  }

  // ── MANFIY NAZORAT: kassada yo'q pulni jo'natib bo'lmaydi ──
  await mirror("POST /journal/transfers (kassada yetarli pul yo'q → 400)", (base, f) =>
    call(base, 'POST', '/api/journal/transfers', {
      branchId: f.a.id,
      body: { toBranchId: f.b.id, amount: 999_000_000 },
    }),
  );

  // ── MANFIY NAZORAT: filial o'ziga jo'nata olmaydi ──
  await mirror("POST /journal/transfers (o'ziga → 400)", (base, f) =>
    call(base, 'POST', '/api/journal/transfers', {
      branchId: f.a.id,
      body: { toBranchId: f.a.id, amount: 1000 },
    }),
  );

  // ─────────────────────────────────────────────────────────────────
  section('3) FILIAL IZOLYATSIYASI — 3 filial, ko\'lamli direktor bilan');
  // ─────────────────────────────────────────────────────────────────
  //
  // ⚠ TARTIB MUHIM: manfiy nazoratlar KONKURENTLIKDAN OLDIN turadi va
  // ularning hech biri MUVAFFAQIYATLI BO'LMASLIGI kerak. Bittasi o'tib
  // ketsa o'tkazma "qabul qilingan" holatga o'tardi va pastdagi 20 ta
  // bir vaqtdagi urinish 409 olardi — ya'ni konkurentlik himoyasi
  // UMUMAN o'lchanmasdi (aynan shu sodir bo'lgan edi).

  // MANFIY: BEGONA filial (C) qabul qila olmaydi.
  await mirror("C filial begona o'tkazmani qabul qila olmaydi → 403", (base, f) =>
    call(base, 'POST', `/api/journal/transfers/${transferId[base]}/receive`, {
      as: 'c',
      branchId: f.c.id,
      body: { countedAmount: 3_000_000 },
    }),
  );

  // MANFIY: JO'NATUVCHI (A) o'zi qabul qila olmaydi — yo'ldagi pul
  // nazorati aynan shu bilan ma'noga ega.
  await mirror("jo'natuvchi o'zi qabul qila olmaydi → 403", (base, f) =>
    call(base, 'POST', `/api/journal/transfers/${transferId[base]}/receive`, {
      as: 'a',
      branchId: f.a.id,
      body: { countedAmount: 3_000_000 },
    }),
  );

  // MANFIY NAZORAT PULGA TEGMADIMI — javobga emas, BAZAGA qaraymiz.
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    const label = base === EXPRESS ? 'express' : 'nest';
    eq(`rad etilgan urinishlardan keyin B kassasi hamon bo'sh (${label})`,
      await balanceOf(f.b.id, 'cash'), 0);
    eq(`rad etilgan urinishlardan keyin yo'ldagi pul turibdi (${label})`,
      await balanceOf(f.a.id, 'transit'), 3_000_000);
    eq(`rad etilgan urinish C ga hech narsa yozmadi (${label})`,
      await prisma.journalEntry.count({ where: { branchId: f.c.id } }), 0);
  }

  // MANFIY: C filial A ning qoldig'ini KO'RMAYDI.
  const cSees = await mirror("C direktori begona filial qoldig'ini ko'rmaydi", (base, f) =>
    call(base, 'GET', '/api/journal/balances', { as: 'c', branchId: f.c.id }),
  );
  for (const [base, res] of [[EXPRESS, cSees.e], [NEST, cSees.n]]) {
    const f = fx[base];
    const label = base === EXPRESS ? 'express' : 'nest';
    const rows = res?.body?.data || [];
    const leaked = rows.filter((r) => String(r.branchId) !== String(f.c.id));
    eq(`C ko'lamida begona filial yo'q (${label})`, leaked.length, 0);
  }

  // MUSBAT NAZORAT: A direktori O'Z qoldig'ini KO'RADI.
  //
  // ⚠ USIZ yuqoridagi tekshiruv MA'NOSIZ bo'lardi: bo'sh javob ham
  // "sizish yo'q" deb yashil berardi. Bu yerda esa A ning kassasida
  // HAQIQATAN pul bor, ya'ni "ko'rinmadi" faqat CHEGARA tufayli
  // bo'lishi mumkin.
  const aSees = await mirror("A direktori O'Z qoldig'ini ko'radi (musbat nazorat)", (base, f) =>
    call(base, 'GET', '/api/journal/balances', { as: 'a', branchId: f.a.id }),
  );
  for (const [base, res] of [[EXPRESS, aSees.e], [NEST, aSees.n]]) {
    const f = fx[base];
    const label = base === EXPRESS ? 'express' : 'nest';
    const rows = res?.body?.data || [];
    const mine = rows.filter((r) => String(r.branchId) === String(f.a.id));
    const foreign = rows.filter((r) => String(r.branchId) !== String(f.a.id));
    if (mine.length > 0) ok(`A o'z hisoblarini ko'radi (${label}) — ${mine.length} hisob`);
    else bad(`A o'z hisoblarini ko'radi (${label})`,
      "bo'sh — izolyatsiya tekshiruvi O'LCHANMAGAN bo'lardi");
    eq(`A ko'lamida begona filial yo'q (${label})`, foreign.length, 0);
  }

  // ─────────────────────────────────────────────────────────────────
  section('4) KONKURENTLIK — 20 bir vaqtdagi qabul qilish');
  // ─────────────────────────────────────────────────────────────────

  // ⚠ ENG XAVFLI JOY. Ikki `receive` bir vaqtda o'tsa `due_from`/`due_to`
  // va kassa IKKI BAROBAR oshardi — ya'ni yo'qdan pul paydo bo'lardi.
  // Himoya `claimTransfer()` da: shartli `updateMany` ikkinchi urinishda
  // count=0 beradi va jurnal UMUMAN yozilmaydi.
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    const label = base === EXPRESS ? 'express' : 'nest';
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        call(base, 'POST', `/api/journal/transfers/${transferId[base]}/receive`, {
          as: 'b',
          branchId: f.b.id,
          body: { countedAmount: 3_000_000 },
        }).catch((err) => ({ status: 0, body: { error: err.message } })),
      ),
    );
    const okCount = results.filter((r) => r.status === 200).length;
    const conflicts = results.filter((r) => r.status === 409).length;
    eq(`20 bir vaqtdagi qabul — FAQAT BITTASI o'tdi (${label})`, okCount, 1);
    eq(`qolgan 19 tasi 409 bilan rad etildi (${label})`, conflicts, 19);

    // IKKI BAROBARLASHUV BO'LMADIMI — javobga emas, BAZAGA qaraymiz.
    eq(`B kassasiga BIR MARTA tushdi (${label})`,
      await balanceOf(f.b.id, 'cash'), 3_000_000);
    eq(`yo'ldagi pul BIR MARTA yopildi (${label})`,
      await balanceOf(f.a.id, 'transit'), 0);
    eq(`due_from BIR MARTA yozildi (${label})`,
      await balanceOf(f.a.id, 'due_from'), 3_000_000);
    // INVARIANT: due_from(A→B) === due_to(B→A).
    eq(`filiallararo TENGLIK: due_from === due_to (${label})`,
      await balanceOf(f.b.id, 'due_to'), await balanceOf(f.a.id, 'due_from'));

    // Faqat bitta `transfer_receive` yozuvi har filialda.
    eq(`A da bitta qabul yozuvi (${label})`,
      await prisma.journalEntry.count({
        where: { branchId: f.a.id, kind: 'transfer_receive' } }), 1);
    eq(`B da bitta qabul yozuvi (${label})`,
      await prisma.journalEntry.count({
        where: { branchId: f.b.id, kind: 'transfer_receive' } }), 1);
  }

  await mirrorDigest('konkurentlikdan keyin A filiali', (f) => f.a);
  await mirrorDigest('konkurentlikdan keyin B filiali', (f) => f.b);

  // ─────────────────────────────────────────────────────────────────
  section('5) MUVOZANAT VA O\'ZGARMASLIK');
  // ─────────────────────────────────────────────────────────────────

  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    const label = base === EXPRESS ? 'express' : 'nest';
    const entries = await prisma.journalEntry.findMany({
      where: { branchId: { in: [f.a.id, f.b.id, f.c.id] } },
      include: { lines: true },
    });
    const unbalanced = entries.filter(
      (e) => Number(e.totalDebit) !== Number(e.totalCredit),
    );
    eq(`sarlavha muvozanati: debet = kredit (${label})`, unbalanced.length, 0);

    // Sarlavha yig'indisi QATORLAR bilan mos keladimi — denormalizatsiya
    // yolg'on gapirmasin.
    const lineMismatch = entries.filter((e) => {
      const d = e.lines.reduce((s, l) => s + Number(l.debit), 0);
      const c = e.lines.reduce((s, l) => s + Number(l.credit), 0);
      return d !== Number(e.totalDebit) || c !== Number(e.totalCredit);
    });
    eq(`sarlavha qatorlar bilan mos (${label})`, lineMismatch.length, 0);

    // Bitta qatorda debet VA kredit birga bo'lmasin — bu yig'indi
    // tekshiruvidan o'tib ketadigan, lekin balansni ikki marta
    // sanaydigan holat.
    const bothSides = entries.flatMap((e) =>
      e.lines.filter((l) => Number(l.debit) > 0 && Number(l.credit) > 0),
    );
    eq(`birorta qatorda debet+kredit birga emas (${label})`, bothSides.length, 0);

    // ⚠ O'ZGARMASLIK SHU YERDA TEKSHIRILMAYDI — pastda, ALOHIDA
    // bo'limda. Sabab: bu fayldagi `prisma` — XOM `PrismaClient`,
    // unda `journal-immutability` kengaytmasi YO'Q. U bilan sinash
    // "himoya ishlamayapti" degan YOLG'ON qizil berardi (va berdi ham),
    // chunki xom klient qo'riqchini umuman ko'rmaydi.
    //
    // Har stekning O'Z kengaytirilgan klienti sinaladi — qarang
    // "5b) O'ZGARMASLIK".
  }

  // ─────────────────────────────────────────────────────────────────
  section("5b) O'ZGARMASLIK — har stekning O'Z klienti bilan");
  // ─────────────────────────────────────────────────────────────────
  //
  // `JOURNAL_IMMUTABLE` — ILOVA QATLAMIDAGI qo'riqchi (Prisma klient
  // kengaytmasi), bazadagi trigger EMAS. Ya'ni uni tekshirishning
  // yagona to'g'ri yo'li — HAR STEKNING O'Z KLIENTINI ishlatish:
  //   • Express  → `server/src/config/prisma.js`
  //   • NestJS   → `dist/prisma/prisma.service.js`
  //
  // Ikkalasi ham ALOHIDA ulanish ochadi, shuning uchun oxirida
  // yopiladi.
  {
    const victim = await prisma.journalEntry.findFirst({
      where: { branchId: fx[EXPRESS].a.id },
      select: { id: true, memo: true },
    });

    const probes = [];
    const expressPrisma = (await import('../../server/src/config/prisma.js')).default;
    probes.push(['express', expressPrisma, null]);
    const { createExtendedPrismaClient } = await import(
      '../dist/prisma/prisma.service.js'
    );
    const nestPrisma = createExtendedPrismaClient();
    probes.push(['nest', nestPrisma, nestPrisma]);

    for (const [label, client, toClose] of probes) {
      let code = null;
      try {
        await client.journalEntry.update({
          where: { id: victim.id },
          data: { memo: 'BUZILGAN' },
        });
      } catch (err) {
        code =
          err?.details?.code ||
          err?.response?.code ||
          err?.code ||
          (typeof err?.getResponse === 'function' ? err.getResponse()?.code : null) ||
          err?.message?.slice(0, 60);
      }
      if (code) ok(`jurnal yozuvi O'ZGARMAS (${label}) — to'sildi: ${code}`);
      else {
        bad(`jurnal yozuvi O'ZGARMAS (${label})`,
          "tahrir O'TDI — `journal-immutability` kengaytmasi ishlamayapti");
        // Tahrir o'tgan bo'lsa QAYTARAMIZ — keyingi solishtiruvlar
        // buzilgan matn ustida ketmasin.
        await prisma.journalEntry.update({
          where: { id: victim.id }, data: { memo: victim.memo },
        }).catch(() => {});
      }
      if (toClose) await toClose.$disconnect().catch(() => {});
    }

    // MUSBAT NAZORAT: qo'riqchi HAMMA yozishni to'smaydi — u FAQAT
    // jurnalga tegishli. Aks holda "hech narsa yozib bo'lmaydi" degan
    // holat ham yashil berardi.
    const probe = await prisma.branch.update({
      where: { id: fx[EXPRESS].c.id },
      data: { code: `${TAG}EC` },
    }).then(() => true).catch(() => false);
    if (probe) ok("qo'riqchi FAQAT jurnalga tegishli (musbat nazorat)");
    else bad("qo'riqchi FAQAT jurnalga tegishli",
      'oddiy yozish ham to\'sildi — tekshiruv o\'lchamaydi');
  }

  // ── BEKOR QILISH: pul kassaga qaytadi ──
  section('6) BEKOR QILISH');
  const sent2 = await mirror("POST /journal/transfers (bekor qilish uchun)", (base, f) =>
    call(base, 'POST', '/api/journal/transfers', {
      as: 'a',
      branchId: f.a.id,
      body: { toBranchId: f.b.id, amount: 1_000_000 },
    }),
  );
  const t2 = { [EXPRESS]: sent2.e?.body?.data?.id, [NEST]: sent2.n?.body?.data?.id };

  // MANFIY: qabul qiluvchi bekor qila olmaydi (ko'lamli aktyor bilan).
  await mirror('B (qabul qiluvchi) bekor qila olmaydi → 403', (base, f) =>
    call(base, 'POST', `/api/journal/transfers/${t2[base]}/cancel`, {
      as: 'b',
      branchId: f.b.id,
      body: { note: 'urinish' },
    }),
  );

  // Rad etilgan urinish pulni QAYTARMAGANINI tasdiqlaymiz.
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    const label = base === EXPRESS ? 'express' : 'nest';
    eq(`rad etilgan bekor qilish pulni qaytarmadi (${label})`,
      await balanceOf(f.a.id, 'transit'), 1_000_000);
  }

  // MUSBAT: jo'natuvchi bekor qiladi.
  await mirror('POST /journal/transfers/:id/cancel', (base, f) =>
    call(base, 'POST', `/api/journal/transfers/${t2[base]}/cancel`, {
      as: 'a',
      branchId: f.a.id,
      body: { note: 'bekor' },
    }),
  );

  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    const label = base === EXPRESS ? 'express' : 'nest';
    eq(`bekor qilingach pul kassaga QAYTDI (${label})`,
      await balanceOf(f.a.id, 'cash'), 6_500_000);
    eq(`yo'ldagi pul nolga qaytdi (${label})`, await balanceOf(f.a.id, 'transit'), 0);
  }

  await mirror('GET /journal/transfers', (base, f) =>
    call(base, 'GET', '/api/journal/transfers?limit=20', { branchId: f.a.id }),
  );

  await mirrorDigest('yakunda A filiali', (f) => f.a);
  await mirrorDigest('yakunda B filiali', (f) => f.b);
  await mirrorDigest('yakunda C filiali (hech narsa tegmagan)', (f) => f.c);

  // ─────────────────────────────────────────────────────────────────
  section('7) RUXSATLAR');
  // ─────────────────────────────────────────────────────────────────

  for (const [name, method, path] of [
    ['balances', 'GET', '/api/journal/balances'],
    ['reconcile', 'GET', '/api/journal/reconcile'],
    ['shifts', 'GET', '/api/journal/shifts'],
    ['transfers (POST)', 'POST', '/api/journal/transfers'],
  ]) {
    await mirror(`${name} — autentifikatsiyasiz → 401`, (base) =>
      request(base, method, path, { body: method === 'POST' ? {} : undefined }),
    );
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
    // ⚠ Chiqish SHU YERDA — `run()` ichida emas. Aks holda tozalash
    // o'tkazib yuborilardi va test moliyaviy qoldiq qoldirardi.
    process.exit(finish());
  });
