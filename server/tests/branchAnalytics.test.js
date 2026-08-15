/**
 * FILIAL TAHLILI: P&L · ELIMINATION · KO'CHIRISH · NORMALIZATSIYA (Faza 5).
 *
 * ENG MUHIM SAVOL - ELIMINATION:
 *   A filial B ga 5 mln inkassatsiya qildi. FILIAL hisobotida bu
 *   ko'rinishi kerak (rahbar "kassamdan chiqdi" ni bilsin), TARMOQ
 *   hisobotida esa YO'Q - pul hech qayerga ketmagan, bir cho'ntakdan
 *   ikkinchisiga o'tgan. Ikkala tomonda sanalsa aylanma 10 mln ga
 *   shishib ketardi.
 *
 * IKKINCHI SAVOL - KO'CHIRISH:
 *   O'quvchi A dan B ga o'tsa, uning DEPOZITI ham o'tishi kerak - aks
 *   holda B xizmat ko'rsatadi, puli esa A da qoladi. Va bu filiallararo
 *   qarz sifatida yozilishi shart, ikkala tomonda TENG.
 *
 * IZOLYATSIYA: o'z test bazasini yaratadi va oxirida O'CHIRADI.
 *
 * ISHLATISH:
 *   npm run test:analytics
 */
import "dotenv/config";
import mongoose from "mongoose";

const BASE = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/bayyina";
const DB = BASE.replace(/\/([^/?]+)(\?|$)/, "/bayyina_analytics_test$2");

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
  if (!mongoose.connection.name.includes("analytics_test")) {
    throw new Error(`Kutilmagan baza: ${mongoose.connection.name}`);
  }
  await mongoose.connection.dropDatabase();

  const Branch = (await import("../src/models/branch.model.js")).default;
  const User = (await import("../src/models/user.model.js")).default;
  const Group = (await import("../src/models/group.model.js")).default;
  const GroupMembership = (await import("../src/models/groupMembership.model.js")).default;
  const Room = (await import("../src/models/room.model.js")).default;
  const StudentDeposit = (await import("../src/models/studentDeposit.model.js")).default;
  const Account = (await import("../src/models/account.model.js")).default;
  await Promise.all([Account.syncIndexes(), Room.syncIndexes()]);

  const journal = await import("../src/modules/journal/services/journal.service.js");
  const transferService = await import(
    "../src/modules/journal/services/cashTransfer.service.js"
  );
  const pnlService = await import(
    "../src/modules/branchAnalytics/services/branchPnl.service.js"
  );
  const metrics = await import(
    "../src/modules/branchAnalytics/services/branchMetrics.service.js"
  );
  const studentTransfer = await import(
    "../src/modules/branchAnalytics/services/studentTransfer.service.js"
  );
  const { ACCOUNT_KINDS, ENTRY_KINDS } = await import("../src/constants/ledger.js");
  const { runWithBranchContext } = await import(
    "../src/helpers/branchContext.helper.js"
  );

  const A = await Branch.create({ name: "A filial", isMain: true, areaM2: 100 });
  // B ATAYLAB kichik: absolyut daromadi kam (4 mln vs 12 mln), lekin
// 1 kv.m ga hisoblaganda A dan SAMARALIROQ. Normalizatsiyaning butun
// ma'nosi shu - tartibni TESKARI qilishi.
  const B = await Branch.create({ name: "B filial", areaM2: 20 });

  const asBranch = (id, fn) =>
    runWithBranchContext(
      {
        branchId: String(id),
        allowedBranchIds: [String(id)],
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
  const asBoth = (fn) =>
    runWithBranchContext(
      {
        branchId: null,
        allowedBranchIds: [String(A._id), String(B._id)],
        canSeeAllBranches: false,
        userId: null,
      },
      fn,
    );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m1) FILIAL P&L\x1b[0m");
  // ─────────────────────────────────────────────────────────

  // A: 10 mln daromad, 3 mln xarajat
  await journal.post({
    branchId: A._id,
    kind: ENTRY_KINDS.PAYMENT,
    lines: [
      { accountKind: ACCOUNT_KINDS.CASH, debit: 10_000_000 },
      { accountKind: ACCOUNT_KINDS.REVENUE, credit: 10_000_000 },
    ],
  });
  await journal.post({
    branchId: A._id,
    kind: ENTRY_KINDS.EXPENSE,
    lines: [
      { accountKind: ACCOUNT_KINDS.EXPENSE, debit: 3_000_000 },
      { accountKind: ACCOUNT_KINDS.CASH, credit: 3_000_000 },
    ],
  });
  // B: 4 mln daromad, 1 mln xarajat
  await journal.post({
    branchId: B._id,
    kind: ENTRY_KINDS.PAYMENT,
    lines: [
      { accountKind: ACCOUNT_KINDS.CASH, debit: 4_000_000 },
      { accountKind: ACCOUNT_KINDS.REVENUE, credit: 4_000_000 },
    ],
  });
  await journal.post({
    branchId: B._id,
    kind: ENTRY_KINDS.EXPENSE,
    lines: [
      { accountKind: ACCOUNT_KINDS.EXPENSE, debit: 1_000_000 },
      { accountKind: ACCOUNT_KINDS.CASH, credit: 1_000_000 },
    ],
  });

  const all = await asOwner(() => pnlService.pnl({}));
  check("Ikkala filial ham hisobotda", all.items.length === 2);

  const aRow = all.items.find((i) => String(i.branchId) === String(A._id));
  const bRow = all.items.find((i) => String(i.branchId) === String(B._id));
  check("A: daromad 10 mln", aRow.revenue === 10_000_000, `${money(aRow.revenue)}`);
  check("A: sof natija 7 mln", aRow.net === 7_000_000, `${money(aRow.net)}`);
  check("B: sof natija 3 mln", bRow.net === 3_000_000, `${money(bRow.net)}`);
  check("Marja hisoblandi", aRow.margin === 70, `${aRow.margin}%`);
  check("Eng foydali birinchi turadi", String(all.items[0].branchId) === String(A._id));

  const onlyA = await asBranch(A._id, () => pnlService.pnl({}));
  check(
    "A direktori faqat O'Z P&L ini ko'radi",
    onlyA.items.length === 1 && String(onlyA.items[0].branchId) === String(A._id),
    `${onlyA.items.length} ta filial qaytdi`,
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m2) ELIMINATION\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const grossBefore = (await asOwner(() => pnlService.pnl({ consolidated: false })))
    .totals;

  // A -> B inkassatsiya (ichki harakat).
  const t = await asBranch(A._id, () =>
    transferService.send({ toBranchId: B._id, amount: 5_000_000 }, null),
  );
  await asBranch(B._id, () => transferService.receive(String(t._id), {}, null));

  const gross = (await asOwner(() => pnlService.pnl({ consolidated: false }))).totals;
  const cons = (await asOwner(() => pnlService.pnl({ consolidated: true }))).totals;

  check(
    "Inkassatsiya DAROMADGA ta'sir qilmadi",
    gross.revenue === grossBefore.revenue,
    "pul o'tkazish daromad emas - agar oshgan bo'lsa yozuvlar noto'g'ri",
  );
  check(
    "Konsolidatsiyada ham daromad o'zgarmadi",
    cons.revenue === grossBefore.revenue,
    `${money(cons.revenue)}`,
  );

  const impact = await asOwner(() => pnlService.eliminationImpact({}));
  check(
    "eliminationImpact ikki rejimni qaytaradi",
    typeof impact.gross === "object" && typeof impact.consolidated === "object",
  );

  // ELIMINATION haqiqatan ishlashini ko'rsatish uchun ichki
  // DAROMAD/XARAJAT yozuvi qo'shamiz (masalan A filial B ga xizmat sotdi).
  await journal.post({
    branchId: A._id,
    kind: ENTRY_KINDS.INTER_BRANCH,
    memo: "Ichki xizmat: A -> B",
    lines: [
      {
        accountKind: ACCOUNT_KINDS.DUE_FROM,
        debit: 2_000_000,
        counterpartyBranchId: B._id,
      },
      { accountKind: ACCOUNT_KINDS.REVENUE, credit: 2_000_000 },
    ],
    isInternal: true,
    counterpartyBranchId: B._id,
  });
  await journal.post({
    branchId: B._id,
    kind: ENTRY_KINDS.INTER_BRANCH,
    memo: "Ichki xizmat: B -> A",
    lines: [
      { accountKind: ACCOUNT_KINDS.EXPENSE, debit: 2_000_000 },
      {
        accountKind: ACCOUNT_KINDS.DUE_TO,
        credit: 2_000_000,
        counterpartyBranchId: A._id,
      },
    ],
    isInternal: true,
    counterpartyBranchId: A._id,
  });

  const gross2 = (await asOwner(() => pnlService.pnl({ consolidated: false }))).totals;
  const cons2 = (await asOwner(() => pnlService.pnl({ consolidated: true }))).totals;

  check(
    "XOM hisobotda ichki daromad KO'RINADI",
    gross2.revenue === grossBefore.revenue + 2_000_000,
    `${money(gross2.revenue)} — filial uchun bu haqiqiy tushum`,
  );
  check(
    "KONSOLIDATSIYADA ichki daromad AYIRILDI",
    cons2.revenue === grossBefore.revenue,
    `${money(cons2.revenue)} — ikki marta sanash oldini olindi`,
  );
  check(
    "Konsolidatsiyada ichki xarajat ham ayirildi",
    cons2.expense === gross2.expense - 2_000_000,
    `${money(cons2.expense)} vs ${money(gross2.expense)}`,
  );

  const impact2 = await asOwner(() => pnlService.eliminationImpact({}));
  check(
    "eliminationImpact farqni AYNAN ko'rsatadi",
    impact2.eliminated.revenue === 2_000_000,
    `${money(impact2.eliminated.revenue)}`,
  );

  // Filial darajasida ichki tushum baribir ko'rinadi.
  const aOwn = await asBranch(A._id, () => pnlService.pnl({ consolidated: false }));
  check(
    "FILIAL hisobotida ichki tushum saqlanadi",
    aOwn.items[0].revenue === 12_000_000,
    `${money(aOwn.items[0].revenue)} — rahbar o'z tushumini to'liq ko'rishi kerak`,
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m3) XONA BANDLIGI\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const roomA = await Room.create({ branchId: A._id, name: "1-xona", areaM2: 30 });
  await Room.create({ branchId: A._id, name: "2-xona" });
  await Room.create({ branchId: B._id, name: "1-xona" });

  // A da haftada 2 kun × 2 soat = 4 soat band.
  await Group.create({
    branchId: A._id,
    name: "A guruh",
    roomId: roomA._id,
    schedule: [
      { day: "mon", startTime: "10:00", endTime: "12:00" },
      { day: "wed", startTime: "10:00", endTime: "12:00" },
    ],
    startDate: new Date("2026-01-01"),
  });

  const util = await asOwner(() => metrics.utilization());
  const uA = util.find((u) => String(u.branchId) === String(A._id));
  check("A da 2 xona", uA.roomCount === 2);
  check("Band soatlar hisoblandi", uA.busyHours === 4, `${uA.busyHours} soat`);
  check(
    "Sig'im = xona × 12 soat × 7 kun",
    uA.capacityHours === 2 * 12 * 7,
    `${uA.capacityHours}`,
  );
  check(
    "Bandlik foizi hisoblandi",
    uA.utilizationPercent === Math.round((4 / 168) * 10000) / 100,
    `${uA.utilizationPercent}%`,
  );

  const uB = util.find((u) => String(u.branchId) === String(B._id));
  check("Guruhsiz filialda bandlik 0%", uB.utilizationPercent === 0);

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m4) NORMALIZATSIYA\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const norm = await asOwner(() => metrics.normalized({}));
  const nA = norm.find((n) => String(n.branchId) === String(A._id));
  const nB = norm.find((n) => String(n.branchId) === String(B._id));

  check(
    "1 kv.m ga tushum hisoblandi",
    nA.revenuePerM2 === 12_000_000 / 100,
    `A: ${money(nA.revenuePerM2)}/kv.m`,
  );
  check(
    "ABSOLYUT raqamda A yetakchi",
    nA.revenue > nB.revenue,
    `A: ${money(nA.revenue)}, B: ${money(nB.revenue)}`,
  );
  check(
    "NORMALIZATSIYADA tartib TESKARI - B samaraliroq",
    nB.revenuePerM2 > nA.revenuePerM2,
    `A: ${money(nA.revenuePerM2)}/kv.m, B: ${money(nB.revenuePerM2)}/kv.m — ` +
      "absolyut raqamga qarab xulosa chiqarish noto'g'ri bo'lardi",
  );

  // areaM2 kiritilmagan filial - null, 0 EMAS.
  const C = await Branch.create({ name: "C filial" });
  await journal.post({
    branchId: C._id,
    kind: ENTRY_KINDS.PAYMENT,
    lines: [
      { accountKind: ACCOUNT_KINDS.CASH, debit: 1_000_000 },
      { accountKind: ACCOUNT_KINDS.REVENUE, credit: 1_000_000 },
    ],
  });
  const norm2 = await asOwner(() => metrics.normalized({}));
  const nC = norm2.find((n) => String(n.branchId) === String(C._id));
  check(
    "Maydon kiritilmagan filialda ko'rsatkich null (0 emas)",
    nC.revenuePerM2 === null,
    "0 bo'lsa «yomon ishlayapti» degan yolg'on xulosa chiqardi",
  );
  check("CAC ma'lumotsiz null", nC.cac === null);

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m5) O'QUVCHINI KO'CHIRISH\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const student = await User.create({
    firstName: "Ali",
    lastName: "Valiyev",
    username: "ali_test",
    passwordHash: "p",
    role: "student",
    homeBranchId: A._id,
  });
  const grp = await Group.create({
    branchId: A._id,
    name: "Eski guruh",
    schedule: [{ day: "tue", startTime: "09:00", endTime: "10:00" }],
    startDate: new Date("2026-01-01"),
  });
  await GroupMembership.create({
    group: grp._id,
    student: student._id,
    joinedAt: new Date("2026-01-01"),
  });
  await StudentDeposit.create({ student: student._id, balance: 700_000 });
  // Depozit A filialning kassasida turibdi.
  await journal.post({
    branchId: A._id,
    kind: ENTRY_KINDS.DEPOSIT_IN,
    lines: [
      { accountKind: ACCOUNT_KINDS.CASH, debit: 700_000 },
      { accountKind: ACCOUNT_KINDS.DEPOSIT, credit: 700_000 },
    ],
  });

  const prev = await studentTransfer.preview(String(student._id), String(B._id));
  check("Preview depozitni ko'rsatadi", prev.depositBalance === 700_000);
  check("Preview yopiladigan guruhni ko'rsatadi", prev.groupsToClose.length === 1);

  const sameBranch = await grab(() =>
    studentTransfer.preview(String(student._id), String(A._id)),
  );
  check("O'sha filialga ko'chirib bo'lmaydi", sameBranch.err?.statusCode === 400);

  // FAQAT BITTA filialga ruxsati bor odam ko'chira olmaydi.
  const oneSided = await grab(() =>
    asBranch(A._id, () =>
      studentTransfer.transfer(
        String(student._id),
        { toBranchId: String(B._id) },
        { allowedBranchIds: [String(A._id)], canSeeAllBranches: false },
      ),
    ),
  );
  check(
    "Bir tomonlama ruxsat bilan ko'chirib bo'lmaydi",
    oneSided.err?.statusCode === 403,
    "aks holda B rahbari xabarsiz qarzga qolardi",
  );

  const depA0 = await journal.accountBalance(A._id, ACCOUNT_KINDS.DEPOSIT);
  const res = await asBoth(() =>
    studentTransfer.transfer(
      String(student._id),
      { toBranchId: String(B._id) },
      { allowedBranchIds: [String(A._id), String(B._id)], canSeeAllBranches: false },
    ),
  );

  check("Ko'chirish bajarildi", res.movedDeposit === 700_000);
  check("Eski guruh yopildi", res.closedGroups === 1);

  const fresh = await User.findById(student._id).select("homeBranchId").lean();
  check(
    "O'quvchi yangi filialga biriktirildi",
    String(fresh.homeBranchId) === String(B._id),
  );

  const memb = await GroupMembership.findOne({ student: student._id }).lean();
  check("Guruh a'zoligida leftAt qo'yildi", memb.leftAt !== null);

  check(
    "A filialning depozit majburiyati kamaydi",
    (await journal.accountBalance(A._id, ACCOUNT_KINDS.DEPOSIT)) === depA0 - 700_000,
  );
  check(
    "B filialda depozit majburiyati paydo bo'ldi",
    (await journal.accountBalance(B._id, ACCOUNT_KINDS.DEPOSIT)) === 700_000,
  );

  const inter = await journal.checkInterBranchBalance();
  check(
    "Ko'chirishdan keyin filiallararo balans TENG",
    inter.balanced,
    JSON.stringify(inter.mismatches),
  );

  const rec = await journal.reconcile();
  check("Jurnal to'liq muvozanatda", rec.ok, JSON.stringify(rec.unbalancedEntries));

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m6) CHURN\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const ch = await asOwner(() => metrics.churn({}));
  const cA = ch.find((c) => String(c.branchId) === String(A._id));
  check(
    "Ko'chgan o'quvchi A da churn sifatida sanaldi",
    cA?.churned === 1,
    `churned: ${cA?.churned}`,
  );

  // Guruh ALMASHTIRGAN o'quvchi churn EMAS.
  const s2 = await User.create({
    firstName: "Bek",
    lastName: "T",
    username: "bek_test",
    passwordHash: "p",
    role: "student",
    homeBranchId: A._id,
  });
  const g2 = await Group.create({
    branchId: A._id,
    name: "Yangi guruh",
    schedule: [{ day: "thu", startTime: "09:00", endTime: "10:00" }],
    startDate: new Date("2026-01-01"),
  });
  await GroupMembership.create({
    group: grp._id,
    student: s2._id,
    joinedAt: new Date("2026-01-01"),
    leftAt: new Date(),
  });
  await GroupMembership.create({
    group: g2._id,
    student: s2._id,
    joinedAt: new Date(),
  });

  const ch2 = await asOwner(() => metrics.churn({}));
  const cA2 = ch2.find((c) => String(c.branchId) === String(A._id));
  check(
    "Guruh almashtirgan o'quvchi CHURN EMAS",
    cA2.churned === 1,
    `churned: ${cA2.churned} — shartsiz churn ikki barobar yuqori ko'rinardi`,
  );
  check("Faol o'quvchi sanaldi", cA2.active === 1);

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m7) ANOMALIYA XABARNOMALARI\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const alertsService = await import(
    "../src/modules/branchAnalytics/services/branchAlerts.service.js"
  );
  const { SEVERITY, THRESHOLDS } = alertsService;

  const res1 = await asOwner(() => alertsService.evaluate());
  check("Alert dvigateli ishlaydi", Array.isArray(res1.alerts));
  check(
    "Toza tizimda KRITIK alert yo'q",
    res1.counts.critical === 0,
    JSON.stringify(res1.alerts.filter((a) => a.severity === SEVERITY.CRITICAL)),
  );
  check(
    "Bo'sh xonalar OGOHLANTIRISH beradi",
    res1.alerts.some((a) => a.code === "low_utilization"),
    "bandlik 2.4% - chegara 30%",
  );

  // Yo'lda QOTIB QOLGAN inkassatsiya - kritik bo'lishi kerak.
  const CashTransfer = (await import("../src/models/cashTransfer.model.js")).default;
  const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  await CashTransfer.create({
    fromBranchId: A._id,
    toBranchId: B._id,
    amount: 1_000_000,
    status: "in_transit",
    sentAt: old,
  });

  const res2 = await asOwner(() => alertsService.evaluate());
  const stuck = res2.alerts.find((a) => a.code === "transfer_stuck");
  check(
    "Yo'lda qotib qolgan inkassatsiya KRITIK",
    stuck?.severity === SEVERITY.CRITICAL,
    `daraja: ${stuck?.severity}`,
  );
  check("Necha kun turgani ko'rsatiladi", stuck?.days >= 10, `${stuck?.days} kun`);

  check(
    "KRITIK alertlar ro'yxat boshida turadi",
    res2.alerts[0].severity === SEVERITY.CRITICAL,
    "alert charchog'iga qarshi - eng muhimi birinchi",
  );

  // Jurnalga tushmagan hujjat - kritik.
  const PaymentTransaction = (await import("../src/models/paymentTransaction.model.js"))
    .default;
  await PaymentTransaction.create({
    branchId: A._id,
    payment: new mongoose.Types.ObjectId(),
    student: student._id,
    group: grp._id,
    year: 2026,
    month: 10,
    amount: 50_000,
    source: "direct",
    method: "cash",
    paidAt: new Date(),
  });

  const res3 = await asOwner(() => alertsService.evaluate());
  const gap = res3.alerts.find((a) => a.code === "wiring_gap");
  check(
    "Jurnalga tushmagan hujjat KRITIK alert beradi",
    gap?.severity === SEVERITY.CRITICAL,
    `daraja: ${gap?.severity}`,
  );
  check(
    "Tuzatish yo'li ko'rsatiladi",
    String(gap?.fix || "").includes("backfill"),
    `fix: ${gap?.fix}`,
  );

  check(
    "Chegaralar javobda qaytadi (shaffoflik)",
    THRESHOLDS.LOW_UTILIZATION_PERCENT === 30 && res3.thresholds != null,
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
