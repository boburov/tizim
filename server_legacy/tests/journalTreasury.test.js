/**
 * QO'SH YOZUV · SMENA · INKASSATSIYA (Faza 4).
 *
 * BU TEST PUL BILAN ISHLAYDI, shuning uchun u INVARIANTLARNI isbotlaydi,
 * "ishlayaptimi" degan savolga javob bermaydi:
 *
 *   1. MUVOZANAT: har bir yozuvda SUM(debet) === SUM(kredit).
 *      Buzilsa - qoldiqlar hech qachon tenglashmaydi va xatoni topib
 *      bo'lmaydi.
 *
 *   2. YO'LDAGI PUL: jo'natilgan pul na jo'natuvchining kassasida, na
 *      qabul qiluvchinikida - lekin YO'QOLMAYDI. Umumiy xazina
 *      o'zgarmasligi kerak.
 *
 *   3. FILIALLARARO TENGLIK: due_from(A→B) === due_to(B→A).
 *      Teng bo'lmasa - bir tomon yozilib ikkinchisi yozilmagan.
 *
 *   4. O'ZGARMASLIK: yozilgan yozuv tahrirlanmaydi (faqat storno).
 *
 * IZOLYATSIYA: o'z test bazasini yaratadi va oxirida O'CHIRADI.
 *
 * ISHLATISH:
 *   npm run test:journal
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * PRISMA'GA KO'CHIRILDI
 * ══════════════════════════════════════════════════════════════════════
 *
 * Test fiksturani MONGOOSE modellari bilan yozardi (`Branch.create`),
 * `journal.service.js` esa allaqachon PRISMA'dan o'qiydi va yozadi.
 * Ya'ni filial Mongo'da yaratilardi, hisob esa Postgres'da ochilardi —
 * va u yerda bunday filial YO'Q edi:
 *
 *   insert or update on table "accounts" violates foreign key
 *   constraint "accounts_branchId_fkey"
 *
 * Test to'rtinchi tekshiruvda yiqilardi va qolgan ~40 tasi —
 * xazina saqlanish qonuni, inkassatsiya, smena yopilishi — UMUMAN
 * ishlamasdi. Bu invariantlarning Prisma davrida boshqa qoplovchisi
 * yo'q edi.
 *
 * ── IZOLYATSIYA ──
 * Ilgari alohida Mongo bazasi yaratilib, oxirida o'chirilardi.
 * Postgres'da alohida baza yaratish qimmat, shuning uchun fikstura
 * `JT-` prefiksi bilan belgilanadi va oxirida FAQAT o'sha yozuvlar
 * o'chiriladi. Ishlab turgan ma'lumotga tegilmaydi.
 */
const TAG = `JT-${Date.now().toString(36)}`;

const R = { pass: 0, fail: 0, notes: [] };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`);
};
const bad = (n, d) => {
  R.fail += 1;
  R.notes.push(`${n} — ${d}`);
  console.log(`  \x1b[31m✗\x1b[0m ${n} → \x1b[31m${d}\x1b[0m`);
};
const check = (n, cond, d = "shart bajarilmadi") => (cond ? ok(n) : bad(n, d));
const grab = async (fn) => {
  try {
    return { value: await fn(), err: null };
  } catch (err) {
    return { value: null, err };
  }
};
const money = (n) => new Intl.NumberFormat("uz-UZ").format(n || 0);

/** Fikstura izlarini o'chiradi — faqat `TAG` bilan belgilanganlarini. */
const cleanup = async (ids = {}) => {
  const bids = ids.branches || [];
  const uids = ids.users || [];
  if (bids.length) {
    await prisma.cashTransfer.deleteMany({
      where: { OR: [{ fromBranchId: { in: bids } }, { toBranchId: { in: bids } }] },
    }).catch(() => {});
    await prisma.shift.deleteMany({ where: { branchId: { in: bids } } }).catch(() => {});
    const entries = await prisma.journalEntry.findMany({
      where: { branchId: { in: bids } }, select: { id: true },
    });
    await prisma.journalLine.deleteMany({
      where: { entryId: { in: entries.map((e) => e.id) } },
    });
    await prisma.journalEntry.deleteMany({ where: { branchId: { in: bids } } });
    await prisma.financialAuditLog.deleteMany({ where: { branchId: { in: bids } } }).catch(() => {});
    await prisma.account.deleteMany({ where: { branchId: { in: bids } } });
  }
  if (uids.length) await prisma.user.deleteMany({ where: { id: { in: uids } } });
  if (bids.length) await prisma.branch.deleteMany({ where: { id: { in: bids } } });
};

const made = { branches: [], users: [] };

const run = async () => {
  await prisma.$queryRaw`SELECT 1`;

  const journal = await import("../src/modules/journal/services/journal.service.js");
  const shiftService = await import("../src/modules/journal/services/shift.service.js");
  const transferService = await import(
    "../src/modules/journal/services/cashTransfer.service.js"
  );
  const { ACCOUNT_KINDS, ENTRY_KINDS, TREASURY_KINDS } = await import(
    "../src/constants/ledger.js"
  );
  const { runWithBranchContext } = await import(
    "../src/helpers/branchContext.helper.js"
  );

  // `_id` TAXALLUSI SAQLANADI: quyidagi ~40 tekshiruv `A._id` shaklida
  // yozilgan. Ularni qayta yozish o'rniga fikstura ikkala nomni ham
  // beradi — port o'zgarishi FAQAT shu blok bilan cheklanadi.
  const withLegacy = (row) => ({ ...row, _id: row.id });

  // BAZAVIY SURAT: test hech narsa qilmasdan OLDIN bazada nechta
  // nomuvozanat yozuv bor. Yakuniy tekshiruv shunga nisbatan
  // o'lchanadi (quyida, "9) YAKUNIY TEKSHIRUV").
  const baselineUnbalanced = (await journal.findUnbalanced({ limit: 1000 })).length;

  const A = withLegacy(await prisma.branch.create({
    data: { name: `${TAG} A filial`, code: `${TAG}A` },
  }));
  const B = withLegacy(await prisma.branch.create({
    data: { name: `${TAG} B filial`, code: `${TAG}B` },
  }));
  made.branches.push(A.id, B.id);

  const cashier = withLegacy(await prisma.user.create({
    data: {
      firstName: "Kassir",
      lastName: TAG,
      username: `kassir_${TAG.toLowerCase()}`,
      passwordHash: "p",
      role: "teacher",
      homeBranchId: A.id,
    },
  }));
  made.users.push(cashier.id);

  const asBranch = (branchId, fn) =>
    runWithBranchContext(
      {
        branchId: String(branchId),
        allowedBranchIds: [String(branchId)],
        canSeeAllBranches: false,
        userId: null,
      },
      fn,
    );
  const asOwner = (fn) =>
    runWithBranchContext(
      { branchId: null, allowedBranchIds: [], canSeeAllBranches: true, userId: null },
      fn,
    );

  const cashOf = (branchId) => journal.accountBalance(branchId, ACCOUNT_KINDS.CASH);
  const transitOf = (branchId) =>
    journal.accountBalance(branchId, ACCOUNT_KINDS.TRANSIT);

  /** Butun tarmoqdagi XAZINA (naqd + yo'ldagi) - saqlanish qonuni uchun. */
  const networkTreasury = async () => {
    let total = 0;
    for (const br of [A, B]) {
      for (const kind of TREASURY_KINDS) {
        total += await journal.accountBalance(br._id, kind);
      }
    }
    return total;
  };

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m1) MUVOZANAT INVARIANTI\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const unbalanced = await grab(() =>
    journal.post({
      branchId: A._id,
      kind: ENTRY_KINDS.PAYMENT,
      lines: [
        { accountKind: ACCOUNT_KINDS.CASH, debit: 100 },
        { accountKind: ACCOUNT_KINDS.REVENUE, credit: 90 },
      ],
    }),
  );
  check(
    "Nomuvozanat yozuv RAD ETILADI",
    unbalanced.err !== null,
    "debet ≠ kredit yozuv o'tib ketdi - butun jurnal ma'nosini yo'qotardi",
  );

  const bothSides = await grab(() =>
    journal.post({
      branchId: A._id,
      kind: ENTRY_KINDS.PAYMENT,
      lines: [
        { accountKind: ACCOUNT_KINDS.CASH, debit: 100, credit: 100 },
        { accountKind: ACCOUNT_KINDS.REVENUE, credit: 100 },
      ],
    }),
  );
  check("Bitta qatorda debet+kredit birga RAD ETILADI", bothSides.err !== null);

  const zero = await grab(() =>
    journal.post({
      branchId: A._id,
      kind: ENTRY_KINDS.PAYMENT,
      lines: [
        { accountKind: ACCOUNT_KINDS.CASH, debit: 0 },
        { accountKind: ACCOUNT_KINDS.REVENUE, credit: 0 },
      ],
    }),
  );
  check("Nol summali yozuv RAD ETILADI", zero.err !== null);

  const oneLine = await grab(() =>
    journal.post({
      branchId: A._id,
      kind: ENTRY_KINDS.PAYMENT,
      lines: [{ accountKind: ACCOUNT_KINDS.CASH, debit: 100 }],
    }),
  );
  check("Bitta qatorli yozuv RAD ETILADI", oneLine.err !== null);

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m2) TO'LOV VA QOLDIQ\x1b[0m");
  // ─────────────────────────────────────────────────────────

  await journal.post({
    branchId: A._id,
    kind: ENTRY_KINDS.PAYMENT,
    memo: "O'quvchi to'lovi",
    lines: [
      { accountKind: ACCOUNT_KINDS.CASH, debit: 5_000_000 },
      { accountKind: ACCOUNT_KINDS.REVENUE, credit: 5_000_000 },
    ],
  });
  check("Naqd qoldiq o'sdi", (await cashOf(A._id)) === 5_000_000);

  await journal.post({
    branchId: A._id,
    kind: ENTRY_KINDS.EXPENSE,
    memo: "Ijara",
    lines: [
      { accountKind: ACCOUNT_KINDS.EXPENSE, debit: 1_000_000 },
      { accountKind: ACCOUNT_KINDS.CASH, credit: 1_000_000 },
    ],
  });
  check(
    "Chiqimdan keyin qoldiq kamaydi",
    (await cashOf(A._id)) === 4_000_000,
    `qoldiq: ${money(await cashOf(A._id))}`,
  );

  // B filial mustaqil.
  await journal.post({
    branchId: B._id,
    kind: ENTRY_KINDS.PAYMENT,
    lines: [
      { accountKind: ACCOUNT_KINDS.TERMINAL, debit: 2_000_000 },
      { accountKind: ACCOUNT_KINDS.REVENUE, credit: 2_000_000 },
    ],
  });
  check("B filialning naqdi A dan mustaqil", (await cashOf(B._id)) === 0);
  check(
    "B filialning terminali alohida",
    (await journal.accountBalance(B._id, ACCOUNT_KINDS.TERMINAL)) === 2_000_000,
  );

  // FILIAL KO'LAMI: A direktori B ning qoldig'ini ko'rmaydi.
  const balA = await asBranch(A._id, () => journal.treasuryBalances());
  check(
    "A direktori faqat A hisoblarini ko'radi",
    balA.every((b) => String(b.branchId) === String(A._id)),
    "boshqa filial qoldig'i ko'rinyapti",
  );
  const balAll = await asOwner(() => journal.treasuryBalances());
  // ⚠ ILGARI BU YERDA `...size === 2` TURGAN EDI.
  //
  // U owner IKKALA FILIALNI ko'rishini emas, BAZADA BOSHQA HECH QANDAY
  // filial yo'qligini o'lchardi — ya'ni tekshiruv o'z fiksturasidan
  // tashqaridagi holatga bog'liq edi va ishlab turgan (yoki qoldiq
  // qolgan) bazada HAR DOIM yiqilardi. Sinalayotgan xususiyat esa
  // butunlay boshqa narsa: OWNER KO'LAMI FILIAL KO'LAMIDAN KENG.
  //
  // Endi aynan o'sha ikki narsa o'lchanadi:
  //   a) owner o'z fiksturasining IKKALA filialini ham ko'radi;
  //   b) owner ko'rgan to'plam filial direktori ko'rganidan QAT'IY keng
  //      (musbat nazorat: ikkalasi teng chiqsa ko'lam ajratilmagan).
  const ownerBranchIds = new Set(balAll.map((b) => String(b.branchId)));
  check(
    "Owner ikkala filialni ko'radi",
    ownerBranchIds.has(String(A._id)) && ownerBranchIds.has(String(B._id)),
    `owner ko'rgan filiallar: ${[...ownerBranchIds].join(", ") || "(bo'sh)"}`,
  );
  const dirBranchIds = new Set(balA.map((b) => String(b.branchId)));
  check(
    "Owner ko'lami direktornikidan KENG",
    ownerBranchIds.size > dirBranchIds.size &&
      [...dirBranchIds].every((id) => ownerBranchIds.has(id)),
    `owner: ${ownerBranchIds.size}, direktor: ${dirBranchIds.size}`,
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m3) INKASSATSIYA - yo'ldagi pul\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const beforeSend = await networkTreasury();

  const transfer = await asBranch(A._id, () =>
    transferService.send({ toBranchId: B._id, amount: 3_000_000 }, null),
  );
  check("O'tkazma yo'lda holatida", transfer.status === "in_transit");
  check(
    "A kassasidan pul chiqdi",
    (await cashOf(A._id)) === 1_000_000,
    `qoldiq: ${money(await cashOf(A._id))}`,
  );
  check("Yo'ldagi pul hisobida turibdi", (await transitOf(A._id)) === 3_000_000);
  check(
    "B kassasiga hali tushmadi",
    (await cashOf(B._id)) === 0,
    "qabul qilinmasdan turib kirim yozilgan",
  );

  const afterSend = await networkTreasury();
  check(
    "SAQLANISH QONUNI: jo'natishda umumiy xazina o'zgarmadi",
    beforeSend === afterSend,
    `${money(beforeSend)} -> ${money(afterSend)} — pul yo'qoldi yoki paydo bo'ldi`,
  );

  // Kassada yo'q pulni jo'natib bo'lmaydi.
  const tooMuch = await grab(() =>
    asBranch(A._id, () =>
      transferService.send({ toBranchId: B._id, amount: 999_000_000 }, null),
    ),
  );
  check(
    "Kassada yo'q pulni jo'natib bo'lmaydi",
    tooMuch.err?.statusCode === 400,
    "manfiy naqd qoldiq - fizik jihatdan mumkin emas",
  );

  // Jo'natuvchi O'ZI qabul qila olmaydi.
  const selfReceive = await grab(() =>
    asBranch(A._id, () => transferService.receive(String(transfer._id), {}, null)),
  );
  check(
    "Jo'natuvchi o'zi qabul qila olmaydi",
    selfReceive.err?.statusCode === 403,
    "yo'ldagi pul nazorati ma'nosini yo'qotardi",
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m4) QABUL QILISH - to'liq summa\x1b[0m");
  // ─────────────────────────────────────────────────────────

  await asBranch(B._id, () =>
    transferService.receive(String(transfer._id), { countedAmount: 3_000_000 }, null),
  );

  check("B kassasiga tushdi", (await cashOf(B._id)) === 3_000_000);
  check("Yo'ldagi pul yopildi", (await transitOf(A._id)) === 0);

  const dueFrom = await journal.accountBalance(A._id, ACCOUNT_KINDS.DUE_FROM);
  const dueTo = await journal.accountBalance(B._id, ACCOUNT_KINDS.DUE_TO);
  check(
    "FILIALLARARO TENGLIK: due_from === due_to",
    dueFrom === dueTo && dueFrom === 3_000_000,
    `due_from=${money(dueFrom)}, due_to=${money(dueTo)}`,
  );

  const afterReceive = await networkTreasury();
  check(
    "SAQLANISH QONUNI: qabul qilishda ham xazina o'zgarmadi",
    afterReceive === beforeSend,
    `${money(beforeSend)} -> ${money(afterReceive)}`,
  );

  const interCheck = await journal.checkInterBranchBalance();
  check(
    "checkInterBranchBalance() muvozanatni tasdiqlaydi",
    interCheck.balanced,
    JSON.stringify(interCheck.mismatches),
  );

  // Ikki marta qabul qilib bo'lmaydi.
  const twice = await grab(() =>
    asBranch(B._id, () => transferService.receive(String(transfer._id), {}, null)),
  );
  check("Ikki marta qabul qilib bo'lmaydi", twice.err?.statusCode === 409);

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m5) QABUL QILISH - FARQ bilan\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const t2 = await asBranch(A._id, () =>
    transferService.send({ toBranchId: B._id, amount: 1_000_000 }, null),
  );
  // 20 000 kam yetib keldi.
  await asBranch(B._id, () =>
    transferService.receive(String(t2._id), { countedAmount: 980_000 }, null),
  );

  const t2doc = await prisma.cashTransfer.findUnique({ where: { id: String(t2._id) } });
  check("Farq bo'lganda status `disputed`", t2doc.status === "disputed");
  check("Farq yozildi", Number(t2doc.discrepancy) === -20_000, `farq: ${t2doc.discrepancy}`);

  check(
    "B kassasiga FAQAT haqiqatan kelgan summa tushdi",
    (await cashOf(B._id)) === 3_980_000,
    `qoldiq: ${money(await cashOf(B._id))}`,
  );
  check("Yo'ldagi pul to'liq yopildi", (await transitOf(A._id)) === 0);

  const shortage = await journal.accountBalance(A._id, ACCOUNT_KINDS.SHORTAGE);
  check(
    "Kamomad JO'NATUVCHIGA yozildi",
    shortage === 20_000,
    `kamomad: ${money(shortage)} — pul A ning javobgarligida yo'qolgan`,
  );

  const interAfterGap = await journal.checkInterBranchBalance();
  check(
    "Farqdan keyin ham filiallararo balans TENG",
    interAfterGap.balanced,
    JSON.stringify(interAfterGap.mismatches),
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m6) BEKOR QILISH\x1b[0m");
  // ─────────────────────────────────────────────────────────

  // Oldingi bo'limlarda A ning naqdi tugagan (5M − 1M chiqim − 3M − 1M
  // inkassatsiya = 0). Bekor qilishni sinash uchun kassaga pul kerak.
  await journal.post({
    branchId: A._id,
    kind: ENTRY_KINDS.PAYMENT,
    memo: "Test uchun to'lov",
    lines: [
      { accountKind: ACCOUNT_KINDS.CASH, debit: 800_000 },
      { accountKind: ACCOUNT_KINDS.REVENUE, credit: 800_000 },
    ],
  });

  const cashBeforeCancel = await cashOf(A._id);
  const t3 = await asBranch(A._id, () =>
    transferService.send({ toBranchId: B._id, amount: 500_000 }, null),
  );
  await asBranch(A._id, () => transferService.cancel(String(t3._id), {}, null));

  check(
    "Bekor qilingach pul kassaga QAYTDI",
    (await cashOf(A._id)) === cashBeforeCancel,
    `${money(cashBeforeCancel)} -> ${money(await cashOf(A._id))}`,
  );
  check("Yo'ldagi pul nolga qaytdi", (await transitOf(A._id)) === 0);

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m7) SMENA\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const shift = await asBranch(A._id, () =>
    shiftService.open({ cashierId: cashier._id }, { _id: cashier._id }),
  );
  check("Smena ochildi", shift.status === "open");
  check(
    "Ochilish summasi JURNALDAN olindi",
    shift.openingCash === (await cashOf(A._id)),
    "qo'lda kiritilsa kassir farqni yashira olardi",
  );

  const twoShifts = await grab(() =>
    asBranch(A._id, () =>
      shiftService.open({ cashierId: cashier._id }, { _id: cashier._id }),
    ),
  );
  check("Ikkinchi ochiq smena RAD ETILADI", twoShifts.err?.statusCode === 409);

  // Kamomad bilan yopamiz.
  const expectedCash = await cashOf(A._id);
  const closed = await asBranch(A._id, () =>
    shiftService.close(
      String(shift._id),
      { countedCash: expectedCash - 50_000, note: "50 ming yetishmadi" },
      { _id: cashier._id },
    ),
  );

  check("Smena yopildi", closed.status === "closed");
  check("Kutilgan summa jurnaldan", closed.expectedCash === expectedCash);
  check("Kamomad hisoblandi", closed.variance === -50_000, `farq: ${closed.variance}`);
  check(
    "Kamomad NAQD qoldig'ini kamaytirdi",
    (await cashOf(A._id)) === expectedCash - 50_000,
    "sanoq bilan jurnal tenglashishi kerak",
  );

  const shortageAfter = await journal.accountBalance(A._id, ACCOUNT_KINDS.SHORTAGE);
  check(
    "Kamomad `shortage` hisobiga tushdi (xarajat EMAS)",
    shortageAfter === 70_000,
    `${money(shortageAfter)} = 20 000 (inkassatsiya) + 50 000 (smena)`,
  );

  const closeTwice = await grab(() =>
    asBranch(A._id, () =>
      shiftService.close(String(shift._id), { countedCash: 1 }, { _id: cashier._id }),
    ),
  );
  check("Yopilgan smenani qayta yopib bo'lmaydi", closeTwice.err?.statusCode === 409);

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m8) O'ZGARMASLIK va STORNO\x1b[0m");
  // ─────────────────────────────────────────────────────────

  // ── O'ZGARMASLIK ──
  //
  // Mongo'da bu model darajasidagi `pre('save')` qo'riqchisi edi.
  // Postgres'ga ko'chishda u YO'QOLGANDI va aynan shu test uni
  // tutishi kerak edi — lekin testning o'zi ham ishlamay qolgandi.
  //
  // Himoya `config/prisma.js` dagi `journal-immutability`
  // kengaytmasida tiklandi: `journal_entries` va `journal_lines`
  // ustidagi har qanday `update` rad etiladi. Tuzatishning yagona
  // to'g'ri yo'li — storno (pastda tekshiriladi).
  const entry = await prisma.journalEntry.findFirst({
    where: { branchId: A._id }, orderBy: { createdAt: "asc" },
  });
  const edited = await grab(() => prisma.journalEntry.update({
    where: { id: entry.id }, data: { memo: "buzib ko'ramiz" },
  }));
  if (edited.err) {
    ok("Yozilgan yozuvni TAHRIRLAB bo'lmaydi",
      `to'sildi: ${edited.err.code || edited.err.statusCode}`);
  } else {
    // Tahrirni QAYTARAMIZ — keyingi tekshiruvlar toza holatda ketsin.
    await prisma.journalEntry.update({
      where: { id: entry.id }, data: { memo: entry.memo },
    });
    bad("Yozilgan yozuvni TAHRIRLAB bo'lmaydi",
      "tahrir O'TDI — `journal-immutability` kengaytmasi ishlamayapti");
  }

  const cashBeforeReverse = await cashOf(A._id);
  const target = await prisma.journalEntry.findFirst({
    where: { branchId: A._id, kind: ENTRY_KINDS.EXPENSE },
  });
  await journal.reverse(target.id, {});
  check(
    "Storno yozuvi ta'sirni BEKOR QILDI",
    (await cashOf(A._id)) === cashBeforeReverse + 1_000_000,
    `${money(cashBeforeReverse)} -> ${money(await cashOf(A._id))}`,
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m9) YAKUNIY TEKSHIRUV\x1b[0m");
  // ─────────────────────────────────────────────────────────

  // ⚠ `reconcile()` KO'LAMSIZ — u BUTUN bazani tekshiradi. Shuning
  // uchun "nomuvozanat yo'q" ni MUTLAQ NOL bilan o'lchash bu testni
  // begona qoldiqqa bog'lab qo'yardi. O'lchanishi kerak bo'lgan narsa
  // esa boshqa: SHU TEST bajargan ~40 amaldan keyin nomuvozanat
  // PAYDO BO'LMADI. Shuning uchun boshlanishdagi surat bilan
  // solishtiriladi — invariant susaymaydi, aksincha aniqlashadi.
  const rec = await journal.reconcile();
  check(
    "reconcile() - hech qanday nomuvozanat yo'q",
    rec.unbalancedEntries.length === baselineUnbalanced &&
      rec.interBranch.mismatches.length === 0,
    JSON.stringify({
      boshlanishda: baselineUnbalanced,
      hozir: rec.unbalancedEntries.length,
      inter: rec.interBranch.mismatches,
    }),
  );

  // Bazaga TO'G'RIDAN-TO'G'RI nomuvozanat yozuv kiritamiz - tekshiruv
  // uni topishi SHART (model validatsiyasi chetlab o'tilgan holat).
  // Servis qatlamini CHETLAB O'TIB buzuq yozuv kiritamiz —
  // `reconcile()` uni topishi SHART. Mongo'da bu
  // `collection.insertOne()` edi (model validatsiyasini chetlab
  // o'tish uchun); Postgres'da esa oddiy `create` yetarli, chunki
  // muvozanat qoidasi SERVISDA, bazada emas.
  const someAccount = await prisma.account.findFirst({ where: { branchId: A._id } });
  const broken = await prisma.journalEntry.create({
    data: {
      branchId: A._id,
      date: new Date(),
      kind: ENTRY_KINDS.ADJUSTMENT,
      memo: "qo'lda kiritilgan buzuq yozuv",
      totalDebit: 100,
      totalCredit: 50,
      isInternal: false,
      lines: {
        create: [
          { accountId: someAccount.id, accountKind: ACCOUNT_KINDS.CASH, debit: 100, credit: 0 },
          { accountId: someAccount.id, accountKind: ACCOUNT_KINDS.REVENUE, debit: 0, credit: 50 },
        ],
      },
    },
  });

  const recBad = await journal.reconcile();
  check(
    "Chetlab o'tilgan buzuq yozuv TOPILADI",
    !recBad.ok &&
      recBad.unbalancedEntries.length === baselineUnbalanced + 1 &&
      recBad.unbalancedEntries.some((e) => String(e.id) === String(broken.id)),
    `topilgan: ${recBad.unbalancedEntries.length}, kutilgan: ${baselineUnbalanced + 1}`,
  );

  // ⚠ ATAYLAB BUZILGAN YOZUV DARHOL O'CHIRILADI.
  //
  // U oxirdagi `cleanup()` ga QOLDIRILMAYDI: bu yozuvning butun
  // vazifasi — `reconcile()` ni qizartirish, ya'ni u bazada qolsa
  // MOLIYA TO'PLAMINING QOLGAN QISMINI ham qizartiradi
  // (`test:fintx`, `test:fin-ops`, `test:fin-entry`,
  // `test:fin-analytics` — hammasi `reconcile().ok` ni tekshiradi).
  // Zarari fikstura filialiga bog'liq emas, shuning uchun tozalash
  // ham unga bog'lanmaydi.
  await prisma.journalLine.deleteMany({ where: { entryId: broken.id } });
  await prisma.journalEntry.delete({ where: { id: broken.id } });
  const recAfter = await journal.reconcile();
  check(
    "Buzuq yozuv o'chirildi — jurnal boshlang'ich holatga qaytdi",
    recAfter.unbalancedEntries.length === baselineUnbalanced,
    `qolgan: ${recAfter.unbalancedEntries.length}, kutilgan: ${baselineUnbalanced}`,
  );

  // ── Yakun ──

  console.log(
    `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
      `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}`,
  );
  if (R.fail) {
    console.log("\nYiqilganlar:");
    R.notes.forEach((n) => console.log(`  • ${n}`));
    // ⚠ BU YERDA `process.exit(1)` TURGAN EDI VA U TOZALASHNI
    // O'TKAZIB YUBORARDI. Node darhol to'xtaydi, ya'ni quyidagi
    // `.finally(cleanup)` UMUMAN ISHLAMASDI: har yiqilgan ishga
    // tushirish bazada 2 filial, ularning hisoblari va ATAYLAB
    // buzilgan jurnal yozuvini QOLDIRARDI.
    //
    // Natija o'z-o'zini kuchaytiruvchi edi: qolgan buzuq yozuv
    // KEYINGI ishga tushirishdagi `reconcile()` ni ham yiqitardi,
    // u yana erta chiqardi, yana qoldiq qolardi. Bir necha
    // ishga tushirishdan keyin `test:fintx`, `test:fin-ops`,
    // `test:fin-entry` va `test:fin-analytics` ham shu BITTA
    // qoldiq sababli qizarib turardi.
    //
    // Chiqish kodi `.finally` da baribir beriladi — bu yerda
    // chiqishning hech qanday keragi yo'q.
  }
};

run()
  .catch((err) => {
    console.error("\x1b[31mTEST YIQILDI:\x1b[0m", err);
    R.fail += 1;
  })
  .finally(async () => {
    await cleanup(made).catch((e) => console.error("tozalash xatosi:", e.message));
    await prisma.$disconnect().catch(() => {});
    process.exit(R.fail ? 1 : 0);
  });
