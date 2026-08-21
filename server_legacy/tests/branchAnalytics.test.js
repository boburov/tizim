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
import prisma from "../src/config/prisma.js";
import { createFixtures } from "./helpers/prismaFixtures.js";

/**
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * Alohida Mongo bazasi + `dropDatabase()` o'rniga prefiksli fixture va
 * kafolatli tozalash (`tests/helpers/prismaFixtures.js`). Xavfsizlik va
 * biznes DA'VOLARI o'zgarmadi — faqat ma'lumotga murojaat qatlami.
 *
 * Bog'lanish maydonlari qayta nomlandi: `teacher` → `teacherId`,
 * `group` → `groupId`, `student` → `studentId` va h.k.
 */
const fx = createFixtures();
/** `asOwner` konsolidatsiyasi shu filiallar bilan chegaralanadi. */
const fxBranchIds = [];

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

  const A = await fx.branch("A-filial", { areaM2: 100 });
  fxBranchIds.push(A.id);
  // B ATAYLAB kichik: absolyut daromadi kam (4 mln vs 12 mln), lekin
// 1 kv.m ga hisoblaganda A dan SAMARALIROQ. Normalizatsiyaning butun
// ma'nosi shu - tartibni TESKARI qilishi.
  const B = await fx.branch("B-filial", { areaM2: 20 });
  fxBranchIds.push(B.id);

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
  /**
   * ⚠ "OWNER" KO'RINISHI FIXTURE FILIALLARI BILAN CHEGARALANGAN.
   *
   * Ilgari bu `canSeeAllBranches: true` edi va bo'sh Mongo bazasida
   * "hamma narsa" = "faqat fixture" degani edi. HAQIQIY bazada esa u
   * 22 ta filialni qamrab olardi va `items.length === 2` kabi
   * tekshiruvlar hech qachon to'g'ri kelmasdi.
   *
   * `branchId: null` + ro'yxat `branchFilter()` da
   * `{ branchId: { in: [A, B] } }` beradi — ya'ni AYNAN o'sha
   * konsolidatsiya ko'rinishi, faqat fixture doirasida. Barcha
   * tekshiruvlar (yig'indi, elimination, normalizatsiya) o'zgarmadi.
   */
  const asOwner = (fn) =>
    runWithBranchContext(
      {
        branchId: null,
        allowedBranchIds: fxBranchIds.map(String),
        canSeeAllBranches: false,
        userId: null,
      },
      fn,
    );
  const asBoth = (fn) =>
    runWithBranchContext(
      {
        branchId: null,
        allowedBranchIds: [String(A.id), String(B.id)],
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
    branchId: A.id,
    kind: ENTRY_KINDS.PAYMENT,
    lines: [
      { accountKind: ACCOUNT_KINDS.CASH, debit: 10_000_000 },
      { accountKind: ACCOUNT_KINDS.REVENUE, credit: 10_000_000 },
    ],
  });
  await journal.post({
    branchId: A.id,
    kind: ENTRY_KINDS.EXPENSE,
    lines: [
      { accountKind: ACCOUNT_KINDS.EXPENSE, debit: 3_000_000 },
      { accountKind: ACCOUNT_KINDS.CASH, credit: 3_000_000 },
    ],
  });
  // B: 4 mln daromad, 1 mln xarajat
  await journal.post({
    branchId: B.id,
    kind: ENTRY_KINDS.PAYMENT,
    lines: [
      { accountKind: ACCOUNT_KINDS.CASH, debit: 4_000_000 },
      { accountKind: ACCOUNT_KINDS.REVENUE, credit: 4_000_000 },
    ],
  });
  await journal.post({
    branchId: B.id,
    kind: ENTRY_KINDS.EXPENSE,
    lines: [
      { accountKind: ACCOUNT_KINDS.EXPENSE, debit: 1_000_000 },
      { accountKind: ACCOUNT_KINDS.CASH, credit: 1_000_000 },
    ],
  });

  const all = await asOwner(() => pnlService.pnl({}));
  check("Ikkala filial ham hisobotda", all.items.length === 2);

  const aRow = all.items.find((i) => String(i.branchId) === String(A.id));
  const bRow = all.items.find((i) => String(i.branchId) === String(B.id));
  check("A: daromad 10 mln", aRow.revenue === 10_000_000, `${money(aRow.revenue)}`);
  check("A: sof natija 7 mln", aRow.net === 7_000_000, `${money(aRow.net)}`);
  check("B: sof natija 3 mln", bRow.net === 3_000_000, `${money(bRow.net)}`);
  check("Marja hisoblandi", aRow.margin === 70, `${aRow.margin}%`);
  check("Eng foydali birinchi turadi", String(all.items[0].branchId) === String(A.id));

  const onlyA = await asBranch(A.id, () => pnlService.pnl({}));
  check(
    "A direktori faqat O'Z P&L ini ko'radi",
    onlyA.items.length === 1 && String(onlyA.items[0].branchId) === String(A.id),
    `${onlyA.items.length} ta filial qaytdi`,
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m2) ELIMINATION\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const grossBefore = (await asOwner(() => pnlService.pnl({ consolidated: false })))
    .totals;

  // A -> B inkassatsiya (ichki harakat).
  const t = await asBranch(A.id, () =>
    transferService.send({ toBranchId: B.id, amount: 5_000_000 }, null),
  );
  await asBranch(B.id, () => transferService.receive(String(t.id), {}, null));

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
    branchId: A.id,
    kind: ENTRY_KINDS.INTER_BRANCH,
    memo: "Ichki xizmat: A -> B",
    lines: [
      {
        accountKind: ACCOUNT_KINDS.DUE_FROM,
        debit: 2_000_000,
        counterpartyBranchId: B.id,
      },
      { accountKind: ACCOUNT_KINDS.REVENUE, credit: 2_000_000 },
    ],
    isInternal: true,
    counterpartyBranchId: B.id,
  });
  await journal.post({
    branchId: B.id,
    kind: ENTRY_KINDS.INTER_BRANCH,
    memo: "Ichki xizmat: B -> A",
    lines: [
      { accountKind: ACCOUNT_KINDS.EXPENSE, debit: 2_000_000 },
      {
        accountKind: ACCOUNT_KINDS.DUE_TO,
        credit: 2_000_000,
        counterpartyBranchId: A.id,
      },
    ],
    isInternal: true,
    counterpartyBranchId: A.id,
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
  const aOwn = await asBranch(A.id, () => pnlService.pnl({ consolidated: false }));
  check(
    "FILIAL hisobotida ichki tushum saqlanadi",
    aOwn.items[0].revenue === 12_000_000,
    `${money(aOwn.items[0].revenue)} — rahbar o'z tushumini to'liq ko'rishi kerak`,
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m3) XONA BANDLIGI\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const roomA = await fx.room("1-xona", A.id, { areaM2: 30 });
  await fx.room("2-xona", A.id);
  await fx.room("1-xona", B.id);

  // A da haftada 2 kun × 2 soat = 4 soat band.
  await fx.group("A-guruh", A.id, {
    roomId: roomA.id,
    schedule: {
      create: [
        { day: "mon", startTime: "10:00", endTime: "12:00" },
        { day: "wed", startTime: "10:00", endTime: "12:00" },
      ],
    },
    startDate: new Date("2026-01-01"),
  });

  const util = await asOwner(() => metrics.utilization());
  const uA = util.find((u) => String(u.branchId) === String(A.id));
  check("A da 2 xona", uA.roomCount === 2);
  check("Band soatlar hisoblandi", uA.busyHours === 4, `${uA.busyHours} soat`);
  // ⚠ ESKI TEKSHIRUV `7` NI QATTIQ YOZGAN EDI.
  //
  // `activeDaysPerWeek` endi MA'LUMOTDAN keltirib chiqariladi
  // (`roomOccupancy.helper.js`): filial guruhlarining jadvalidagi
  // NOYOB kunlar soni, jadval umuman bo'lmasa 7 ga tushadi.
  // Fixture'da bitta guruh bor va u dushanba+chorshanba — demak 2.
  //
  // Shuning uchun ikki narsa alohida tekshiriladi:
  //   1) kunlar soni HAQIQATAN jadvaldan olingan (2, 7 emas);
  //   2) sig'im formulasi o'sha qiymatdan quriladi.
  // Bu tavtologiya emas: birinchi tekshiruv qiymatning O'ZINI qulflaydi.
  check(
    "Faol kunlar jadvaldan olindi (dushanba+chorshanba = 2)",
    uA.activeDaysPerWeek === 2,
    `${uA.activeDaysPerWeek} kun`,
  );
  check(
    "Sig'im = xona × 12 soat × faol kunlar",
    uA.capacityHours === 2 * 12 * uA.activeDaysPerWeek,
    `${uA.capacityHours}`,
  );
  check(
    "Bandlik foizi hisoblandi",
    // Sig'im endi faol kunlardan quriladi — foiz ham o'sha asosda.
    uA.utilizationPercent === Math.round((4 / uA.capacityHours) * 10000) / 100,
    `${uA.utilizationPercent}%`,
  );

  const uB = util.find((u) => String(u.branchId) === String(B.id));
  check("Guruhsiz filialda bandlik 0%", uB.utilizationPercent === 0);

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m4) NORMALIZATSIYA\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const norm = await asOwner(() => metrics.normalized({}));
  const nA = norm.find((n) => String(n.branchId) === String(A.id));
  const nB = norm.find((n) => String(n.branchId) === String(B.id));

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
  const C = await fx.branch("C-filial");
  fxBranchIds.push(C.id);
  await journal.post({
    branchId: C.id,
    kind: ENTRY_KINDS.PAYMENT,
    lines: [
      { accountKind: ACCOUNT_KINDS.CASH, debit: 1_000_000 },
      { accountKind: ACCOUNT_KINDS.REVENUE, credit: 1_000_000 },
    ],
  });
  const norm2 = await asOwner(() => metrics.normalized({}));
  const nC = norm2.find((n) => String(n.branchId) === String(C.id));
  check(
    "Maydon kiritilmagan filialda ko'rsatkich null (0 emas)",
    nC.revenuePerM2 === null,
    "0 bo'lsa «yomon ishlayapti» degan yolg'on xulosa chiqardi",
  );
  check("CAC ma'lumotsiz null", nC.cac === null);

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m5) O'QUVCHINI KO'CHIRISH\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const student = await fx.user("ali_test", {
    firstName: "Ali",
    lastName: "Valiyev",
    passwordHash: "p",
    role: "student",
    homeBranchId: A.id,
  });
  const grp = await fx.group("Eski-guruh", A.id, {
    schedule: { create: [{ day: "tue", startTime: "09:00", endTime: "10:00" }] },
    startDate: new Date("2026-01-01"),
  });
  await fx.membership(grp.id, student.id, { joinedAt: new Date("2026-01-01") });
  // ⚠ `StudentDeposit` da `branchId` YO'Q — depozit o'quvchiga
  // bog'langan (`studentId` UNIQUE), filialga emas.
  const dep = await prisma.studentDeposit.create({
    data: { studentId: student.id, balance: 700_000 },
  });
  fx.track("studentDeposit", dep.id);
  // Depozit A filialning kassasida turibdi.
  await journal.post({
    branchId: A.id,
    kind: ENTRY_KINDS.DEPOSIT_IN,
    lines: [
      { accountKind: ACCOUNT_KINDS.CASH, debit: 700_000 },
      { accountKind: ACCOUNT_KINDS.DEPOSIT, credit: 700_000 },
    ],
  });

  const prev = await studentTransfer.preview(String(student.id), String(B.id));
  check("Preview depozitni ko'rsatadi", prev.depositBalance === 700_000);
  check("Preview yopiladigan guruhni ko'rsatadi", prev.groupsToClose.length === 1);

  const sameBranch = await grab(() =>
    studentTransfer.preview(String(student.id), String(A.id)),
  );
  check("O'sha filialga ko'chirib bo'lmaydi", sameBranch.err?.statusCode === 400);

  // FAQAT BITTA filialga ruxsati bor odam ko'chira olmaydi.
  const oneSided = await grab(() =>
    asBranch(A.id, () =>
      studentTransfer.transfer(
        String(student.id),
        { toBranchId: String(B.id) },
        { allowedBranchIds: [String(A.id)], canSeeAllBranches: false },
      ),
    ),
  );
  check(
    "Bir tomonlama ruxsat bilan ko'chirib bo'lmaydi",
    oneSided.err?.statusCode === 403,
    "aks holda B rahbari xabarsiz qarzga qolardi",
  );

  const depA0 = await journal.accountBalance(A.id, ACCOUNT_KINDS.DEPOSIT);
  const res = await asBoth(() =>
    studentTransfer.transfer(
      String(student.id),
      { toBranchId: String(B.id) },
      { allowedBranchIds: [String(A.id), String(B.id)], canSeeAllBranches: false },
    ),
  );

  check("Ko'chirish bajarildi", res.movedDeposit === 700_000);
  check("Eski guruh yopildi", res.closedGroups === 1);

  const fresh = await prisma.user.findUnique({
    where: { id: student.id },
    select: { homeBranchId: true },
  });
  check(
    "O'quvchi yangi filialga biriktirildi",
    String(fresh.homeBranchId) === String(B.id),
  );

  const memb = await prisma.groupMembership.findFirst({ where: { studentId: student.id } });
  check("Guruh a'zoligida leftAt qo'yildi", memb.leftAt !== null);

  check(
    "A filialning depozit majburiyati kamaydi",
    (await journal.accountBalance(A.id, ACCOUNT_KINDS.DEPOSIT)) === depA0 - 700_000,
  );
  check(
    "B filialda depozit majburiyati paydo bo'ldi",
    (await journal.accountBalance(B.id, ACCOUNT_KINDS.DEPOSIT)) === 700_000,
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
  const cA = ch.find((c) => String(c.branchId) === String(A.id));
  check(
    "Ko'chgan o'quvchi A da churn sifatida sanaldi",
    cA?.churned === 1,
    `churned: ${cA?.churned}`,
  );

  // Guruh ALMASHTIRGAN o'quvchi churn EMAS.
  const s2 = await fx.user("bek_test", {
    firstName: "Bek",
    lastName: "T",
    passwordHash: "p",
    role: "student",
    homeBranchId: A.id,
  });
  const g2 = await fx.group("Yangi-guruh", A.id, {
    schedule: { create: [{ day: "thu", startTime: "09:00", endTime: "10:00" }] },
    startDate: new Date("2026-01-01"),
  });
  await fx.membership(grp.id, s2.id, {
    joinedAt: new Date("2026-01-01"),
    leftAt: new Date(),
  });
  await fx.membership(g2.id, s2.id, { joinedAt: new Date() });

  const ch2 = await asOwner(() => metrics.churn({}));
  const cA2 = ch2.find((c) => String(c.branchId) === String(A.id));
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

  // ⚠ "TOZA TIZIM" TEKSHIRUVI BAZAVIY HOLATGA AYLANTIRILDI.
  //
  // Ilgari bo'sh Mongo bazasida `critical === 0` to'g'ri edi. HAQIQIY
  // dev bazasida esa `wiring_gap` kabi alertlar GLOBAL skanerdan keladi
  // (`branchId: null`) va bazadagi eski ma'lumotga bog'liq — ular bu
  // testning ishi EMAS.
  //
  // Tekshiruv MA'NOSI saqlanadi va hatto aniqlashadi: pastda test O'ZI
  // muammo yaratadi va alert soni AYNAN shundan oshishi kerak.
  // Mutlaq nolga tayanish testni bazaning holatiga bog'lab qo'yardi.
  const baselineCritical = res1.counts.critical;
  const baselineStuck = res1.alerts.filter((a) => a.code === "transfer_stuck").length;
  const baselineGap = res1.alerts.filter((a) => a.code === "wiring_gap").length;
  console.log(
    `  \x1b[2mbazaviy holat: critical=${baselineCritical}, ` +
      `transfer_stuck=${baselineStuck}, wiring_gap=${baselineGap}\x1b[0m`,
  );
  check(
    "Bo'sh xonalar OGOHLANTIRISH beradi",
    res1.alerts.some((a) => a.code === "low_utilization"),
    "bandlik 2.4% - chegara 30%",
  );

  // Yo'lda QOTIB QOLGAN inkassatsiya - kritik bo'lishi kerak.
  const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const stuckTransfer = await prisma.cashTransfer.create({
    data: {
      fromBranchId: A.id,
      toBranchId: B.id,
      amount: 1_000_000,
      status: "in_transit",
      sentAt: old,
    },
  });
  fx.track("cashTransfer", stuckTransfer.id);

  const res2 = await asOwner(() => alertsService.evaluate());
  const stuck = res2.alerts.find((a) => a.code === "transfer_stuck");
  check(
    "Yo'lda qotib qolgan inkassatsiya KRITIK",
    stuck?.severity === SEVERITY.CRITICAL,
    `daraja: ${stuck?.severity}`,
  );
  check(
    "Kritik alert soni AYNAN shu muammodan oshdi",
    res2.counts.critical > baselineCritical,
    `${baselineCritical} → ${res2.counts.critical}`,
  );
  check("Necha kun turgani ko'rsatiladi", stuck?.days >= 10, `${stuck?.days} kun`);

  check(
    "KRITIK alertlar ro'yxat boshida turadi",
    res2.alerts[0].severity === SEVERITY.CRITICAL,
    "alert charchog'iga qarshi - eng muhimi birinchi",
  );

  // Jurnalga tushmagan hujjat - kritik.
  // Jurnalga tushmagan to'lov qatori — `paymentId` HAQIQIY bo'lishi
  // kerak (`payment_transactions_paymentId_fkey`), shuning uchun avval
  // to'lov rejasi yaratiladi.
  const orphanPlan = await prisma.studentPayment.create({
    data: {
      branchId: A.id, studentId: student.id, groupId: grp.id,
      year: 2026, month: 10, baseFee: 50_000, expectedAmount: 50_000,
    },
  });
  fx.track("studentPayment", orphanPlan.id);
  const orphanTx = await prisma.paymentTransaction.create({
    data: {
    branchId: A.id,
    paymentId: orphanPlan.id,
    studentId: student.id,
    groupId: grp.id,
    year: 2026,
    month: 10,
    amount: 50_000,
    source: "direct",
    method: "cash",
    paidAt: new Date(),
    },
  });
  fx.track("paymentTransaction", orphanTx.id);

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

};

run()
  .catch((err) => {
    bad("TEST YIQILDI", err?.message || String(err));
    if (process.env.DEBUG) console.error(err);
  })
  .finally(async () => {
    // ⚠ JURNAL YOZUVLARI: bu test `journal.post` ni TO'G'RIDAN-TO'G'RI
    // chaqiradi va o'tkazma servisi ham post qiladi. Ular tozalanmasa
    // fixture filiallarini FK RESTRICT tufayli o'chirib bo'lmasdi va
    // dev bazada soxta moliyaviy iz qolardi.
    const bids = fxBranchIds.map(String);
    const entries = await prisma.journalEntry
      .findMany({ where: { branchId: { in: bids } }, select: { id: true } })
      .catch(() => []);
    for (const e of entries) fx.track("journalEntry", e.id);
    if (entries.length) {
      const lines = await prisma.journalLine
        .findMany({ where: { entryId: { in: entries.map((e) => e.id) } }, select: { id: true } })
        .catch(() => []);
      for (const l of lines) fx.track("journalLine", l.id);
    }
    // ⚠ `CashTransfer` da `branchId` YO'Q — u IKKI filialga tegishli
    // (`fromBranchId` + `toBranchId`, `resourceScope` da `branch-pair`).
    const transfers = await prisma.cashTransfer
      .findMany({
        where: { OR: [{ fromBranchId: { in: bids } }, { toBranchId: { in: bids } }] },
        select: { id: true },
      })
      .catch(() => []);
    for (const t of transfers) fx.track("cashTransfer", t.id);

    for (const model of ["account", "depositTransaction"]) {
      const rows = await prisma[model]
        .findMany({ where: { branchId: { in: bids } }, select: { id: true } })
        .catch(() => []);
      for (const r of rows) fx.track(model, r.id);
    }
    // Depozit o'quvchi bo'yicha (filial ustuni yo'q).
    const uids = [...(fx.registry.get("user") || [])];
    const deposits = await prisma.studentDeposit
      .findMany({ where: { studentId: { in: uids } }, select: { id: true } })
      .catch(() => []);
    for (const d of deposits) fx.track("studentDeposit", d.id);

    const problems = await fx.cleanup();
    const leftovers = await fx.assertClean();
    if (problems.length) bad("fixture tozalash", problems.join(" · "));
    else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
    else ok(`fixture tozalandi (${fx.suffix})`);

    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
        `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}`,
    );
    if (R.fail) R.notes.forEach((n) => console.log(`  • ${n}`));
    await prisma.$disconnect().catch(() => {});
    process.exit(R.fail ? 1 : 0);
  });
