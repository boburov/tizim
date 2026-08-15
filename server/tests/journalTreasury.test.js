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
import mongoose from "mongoose";

const BASE = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/bayyina";
const DB = BASE.replace(/\/([^/?]+)(\?|$)/, "/bayyina_journal_test$2");

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

const run = async () => {
  if (DB === BASE) throw new Error("Test bazasi nomi ajratilmadi - to'xtatildi");
  mongoose.set("autoIndex", false);
  await mongoose.connect(DB);
  if (!mongoose.connection.name.includes("journal_test")) {
    throw new Error(`Kutilmagan baza: ${mongoose.connection.name}`);
  }
  await mongoose.connection.dropDatabase();

  const Branch = (await import("../src/models/branch.model.js")).default;
  const User = (await import("../src/models/user.model.js")).default;
  const Account = (await import("../src/models/account.model.js")).default;
  const JournalEntry = (await import("../src/models/journalEntry.model.js")).default;
  const CashTransfer = (await import("../src/models/cashTransfer.model.js")).default;
  const Shift = (await import("../src/models/shift.model.js")).default;

  await Promise.all([Account.syncIndexes(), Shift.syncIndexes()]);

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

  const A = await Branch.create({ name: "A filial", isMain: true });
  const B = await Branch.create({ name: "B filial" });

  const cashier = await User.create({
    firstName: "Kassir",
    lastName: "A",
    username: "kassir_a",
    passwordHash: "p",
    role: "teacher",
    homeBranchId: A._id,
  });

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
  check(
    "Owner ikkala filialni ko'radi",
    new Set(balAll.map((b) => String(b.branchId))).size === 2,
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

  const t2doc = await CashTransfer.findById(t2._id).lean();
  check("Farq bo'lganda status `disputed`", t2doc.status === "disputed");
  check("Farq yozildi", t2doc.discrepancy === -20_000, `farq: ${t2doc.discrepancy}`);

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

  const entry = await JournalEntry.findOne({ branchId: A._id }).sort({ createdAt: 1 });
  entry.memo = "buzib ko'ramiz";
  const edited = await grab(() => entry.save());
  check(
    "Yozilgan yozuvni TAHRIRLAB bo'lmaydi",
    edited.err !== null,
    "tahrirlangan jurnal audit uchun yaroqsiz",
  );

  const cashBeforeReverse = await cashOf(A._id);
  const target = await JournalEntry.findOne({
    branchId: A._id,
    kind: ENTRY_KINDS.EXPENSE,
  }).lean();
  await journal.reverse(target._id, {});
  check(
    "Storno yozuvi ta'sirni BEKOR QILDI",
    (await cashOf(A._id)) === cashBeforeReverse + 1_000_000,
    `${money(cashBeforeReverse)} -> ${money(await cashOf(A._id))}`,
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m9) YAKUNIY TEKSHIRUV\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const rec = await journal.reconcile();
  check(
    "reconcile() - hech qanday nomuvozanat yo'q",
    rec.ok,
    JSON.stringify({ unbalanced: rec.unbalancedEntries.length, inter: rec.interBranch.mismatches }),
  );

  // Bazaga TO'G'RIDAN-TO'G'RI nomuvozanat yozuv kiritamiz - tekshiruv
  // uni topishi SHART (model validatsiyasi chetlab o'tilgan holat).
  const someAccount = await Account.findOne({ branchId: A._id });
  await JournalEntry.collection.insertOne({
    branchId: A._id,
    date: new Date(),
    kind: ENTRY_KINDS.ADJUSTMENT,
    memo: "qo'lda kiritilgan buzuq yozuv",
    lines: [
      { accountId: someAccount._id, accountKind: ACCOUNT_KINDS.CASH, debit: 100, credit: 0 },
      { accountId: someAccount._id, accountKind: ACCOUNT_KINDS.REVENUE, debit: 0, credit: 50 },
    ],
    totalDebit: 100,
    totalCredit: 50,
    isInternal: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const recBad = await journal.reconcile();
  check(
    "Chetlab o'tilgan buzuq yozuv TOPILADI",
    !recBad.ok && recBad.unbalancedEntries.length === 1,
    `topilgan: ${recBad.unbalancedEntries.length}`,
  );

  // ── Yakun ──
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();

  console.log(
    `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
      `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}`,
  );
  if (R.fail) {
    console.log("\nYiqilganlar:");
    R.notes.forEach((n) => console.log(`  • ${n}`));
    process.exit(1);
  }
};

run().catch(async (err) => {
  console.error("\x1b[31mTEST YIQILDI:\x1b[0m", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ulanmagan bo'lsa e'tiborsiz */
  }
  process.exit(1);
});
