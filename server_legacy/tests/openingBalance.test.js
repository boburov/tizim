/**
 * BOSHLANG'ICH QOLDIQ - MOLIYAVIY XAVFSIZLIK TESTI.
 *
 * Bu test PULGA tegadigan yagona narsani tekshiradi: import qilingan
 * boshlang'ich qoldiq to'g'ri summada, BIR MARTA va to'g'ri yo'nalishda
 * yoziladimi.
 *
 * Tekshiriladigan xavflar (har biri real pul yo'qotishi yoki ikki
 * baravar hisoblanishi bilan tugaydi):
 *
 *   1) IKKI BARAVAR YOZISH - fayl qayta yuklansa yoki so'rov takrorlansa.
 *   2) AVANS QARZNI YOPMASLIGI - "+300k shu paytgacha bo'lgan to'lovlarni
 *      yopishi kerak" talabi.
 *   3) QARZNI RECALC YO'Q QILISHI - kunlik accrual job boshlang'ich
 *      qarzni nolga tushirib yuborishi.
 *   4) HISOBOTNI BUZISH - eski qarz "shu oy hisoblangan daromad" bo'lib
 *      ko'rinishi.
 *   5) UNIQUE INDEKS TESHIGI - bir oyga ikkita plan yozilishi.
 *   6) XODIM QARZI YO'QOLISHI - oylikdan katta qarzning qoldig'i.
 *
 * ISHLATISH:  npm run test:opening
 */

/**
 * ⚠ BU TEST HOZIRDA ISHLAMAYDI — MONGO→POSTGRES MIGRATSIYASI QOLDIG'I.
 *
 * Fikstura MONGOOSE modellari bilan yoziladi, tekshirilayotgan servis
 * esa allaqachon PRISMA'dan o'qiydi. Ya'ni ma'lumot bir bazaga
 * yoziladi, boshqasidan o'qiladi — test `MongooseError: buffering
 * timed out` bilan yiqiladi.
 *
 * ── BU NIMA DEGANI ──
 * Tekshirilayotgan XUSUSIYAT buzilgan degani EMAS. Servis ishlaydi;
 * uni qo'riqlaydigan test ishlamaydi. Ya'ni bu yerda QOPLOV YO'Q va
 * regressiya jimgina o'tib ketishi mumkin.
 *
 * ── KO'CHIRISH NAMUNASI ──
 * `branchScopeExploit.test.js` va `journalTreasury.test.js` xuddi shu
 * muammodan aziyat chekardi va ko'chirildi: fikstura `prisma.*.create`
 * ga o'tkaziladi, `_id` taxallusi saqlanadi (`{...row, _id: row.id}`),
 * oxirida esa `TAG` prefiksi bo'yicha tozalanadi.
 *
 * Bu fayl KATTAROQ: 11 ta model bo'ylab fiksturalar butun fayl bo'ylab
 * sochilgan. Shuning uchun u alohida ish sifatida qoldirildi —
 * yarim ko'chirilgan test ishlamaydiganidan xavfliroq.
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import { createFixtures } from "./helpers/prismaFixtures.js";

/**
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * Test ilgari MAVJUD filialni qayta ishlatardi. Endi O'Z filialini
 * yaratadi: moliya oqimlari qo'sh yozuv jurnaliga post qiladi va
 * filial uchun hisob varaqlarini ochadi — mavjud filialda ular
 * tozalanmay qolardi.
 *
 * Jurnal tozalash MANTIG'I saqlandi (u ataylab manba hujjat ID'lari
 * bo'yicha ishlaydi), lekin endi umumiy fixture reyestriga tayanadi.
 */
const fx = createFixtures();

const DB = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/bayyina";

const R = { pass: 0, fail: 0, notes: [] };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`);
};
const bad = (n, d) => {
  R.fail += 1;
  R.notes.push(`${n} — ${d}`);
  console.log(`  \x1b[31m✗\x1b[0m ${n} → ${d}`);
};
const eq = (name, actual, expected, unit = "") => {
  if (actual === expected) ok(name, `${actual}${unit}`);
  else bad(name, `kutilgan ${expected}${unit}, chiqdi ${actual}${unit}`);
};

const TAG = "__ob_test__";

const run = async () => {
  // ATAYLAB connectDB() - mongoose.connect() emas.
  //
  // Test AYNAN production yo'lidan o'tishi kerak: connectDB() ichida
  // StudentPayment unique indeksining migratsiyasi bor (isOpening
  // qo'shilishi). Xom ulanish bilan test eski indeks ustida ishlab,
  // "hammasi joyida" deb aldab qo'yardi.
  const { connectDB } = await import("../src/config/db.js");
  await connectDB();

  const { runWithBranchContext } = await import(
    "../src/helpers/branchContext.helper.js"
  );
  const openingSvc = await import(
    "../src/modules/openingBalance/services/openingBalance.service.js"
  );
  const paymentSvc = await import(
    "../src/modules/finance/services/studentPayment.service.js"
  );
  const payrollSvc = await import(
    "../src/modules/staffPayroll/services/staffPayroll.service.js"
  );

  // ─────────────────────── FIXTURE ───────────────────────
  const branch = await fx.branch(`${TAG}-filial`);

  const now = new Date();
  const Y = now.getUTCFullYear();
  const M = now.getUTCMonth() + 1;
  // Guruh 3 oy oldin boshlangan - shunda a'zolik backfill'i bir necha
  // oylik qarz yaratadi (aynan foydalanuvchi tasvirlagan ssenariy).
  const groupStart = new Date(Date.UTC(Y, now.getUTCMonth() - 3, 5));

  const group = await fx.group(`${TAG}-guruh`, branch.id, {
    startDate: groupStart,
    isActive: true,
  });

  const FEE = 500_000;
  // 6 oyga tarif - backfill har oy uchun shu narxni topsin.
  for (let i = -4; i <= 1; i += 1) {
    const d = new Date(Date.UTC(Y, now.getUTCMonth() + i, 1));
    const fee = await prisma.groupFee.upsert({
      where: {
        groupId_year_month: {
          groupId: group.id,
          year: d.getUTCFullYear(),
          month: d.getUTCMonth() + 1,
        },
      },
      update: { amount: FEE, source: "manual" },
      create: {
        groupId: group.id,
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        amount: FEE,
        source: "manual",
      },
    });
    fx.track("groupFee", fee.id);
  }

  const mkStudent = async (suffix) =>
    fx.user(`${TAG}_s${suffix}`, {
      firstName: TAG,
      lastName: `Student${suffix}`,
      passwordHash: "test1234",
      role: "student",
      homeBranchId: branch.id,
      enrolledAt: groupStart,
    });

  const ctx = {
    branchId: String(branch.id),
    allowedBranchIds: [String(branch.id)],
    canSeeAllBranches: false,
    userId: null,
  };
  const inBranch = (fn) => runWithBranchContext(ctx, fn);

  const createdUsers = [];

  /**
   * TOZALASH.
   *
   * ⚠ JURNAL YOZUVLARI TARTIBI MUHIM (mantiq o'zgarmadi): avval MANBA
   * hujjatlarning ID'lari yig'iladi, keyin ular bo'yicha jurnal
   * topiladi. Manba o'chirilgach uning ID'sini topib bo'lmaydi va
   * jurnal yozuvi YETIM qolardi — `journalVerify` esa har safar
   * "farq bor" deb qichqirardi.
   *
   * Jurnalni O'CHIRISH `JOURNAL_IMMUTABLE` ni buzmaydi: qo'riqchi faqat
   * TAHRIRNI to'sadi (`config/prisma.js`).
   */
  const cleanup = async () => {
    const uids = [...(fx.registry.get("user") || [])];
    const pairs = [
      ["paymentTransaction", { studentId: { in: uids } }],
      ["depositTransaction", { studentId: { in: uids } }],
      ["openingBalance", { userId: { in: uids } }],
      ["studentPayment", { studentId: { in: uids } }],
      ["studentDeposit", { studentId: { in: uids } }],
      ["groupMembership", { studentId: { in: uids } }],
      ["staffPayrollAdjustment", { employeeId: { in: uids } }],
      ["staffPayroll", { employeeId: { in: uids } }],
      ["journalEntry", { branchId: branch.id }],
    ];
    for (const [model, where] of pairs) {
      const rows = await prisma[model].findMany({ where, select: { id: true } }).catch(() => []);
      for (const r of rows) fx.track(model, r.id);
    }
    const entryIds = [...(fx.registry.get("journalEntry") || [])];
    if (entryIds.length) {
      const lines = await prisma.journalLine
        .findMany({ where: { entryId: { in: entryIds } }, select: { id: true } })
        .catch(() => []);
      for (const l of lines) fx.track("journalLine", l.id);
    }
    const accounts = await prisma.account
      .findMany({ where: { branchId: branch.id }, select: { id: true } })
      .catch(() => []);
    for (const a of accounts) fx.track("account", a.id);

    const problems = await fx.cleanup();
    const leftovers = await fx.assertClean();
    if (problems.length) bad("fixture tozalash", problems.join(" · "));
    else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
    else ok(`fixture tozalandi (${fx.suffix})`);
  };

  console.log(`\n\x1b[1mBOSHLANG'ICH QOLDIQ - MOLIYA TESTI\x1b[0m`);
  console.log(`\x1b[2mGuruh ${groupStart.toISOString().slice(0, 10)} da boshlangan, tarif ${FEE}\x1b[0m\n`);

  try {
    // ═══════════════ 1. AVANS ESKI QARZLARNI YOPADI ═══════════════
    console.log("\x1b[1m1) Avans (+) o'tgan oylar qarzini yopadi\x1b[0m");

    const s1 = await mkStudent(1);
    createdUsers.push(s1);

    const groupsSvc = await import("../src/modules/groups/services/groups.service.js");
    await inBranch(() =>
      groupsSvc.addStudent(group.id, s1.id, { joinedAt: groupStart }),
    );

    const plansBefore = await prisma.studentPayment.findMany({
      where: { studentId: s1.id, isOpening: false },
    });
    const billedTotal = plansBefore.reduce((s, p) => s + p.expectedAmount, 0);

    if (plansBefore.length >= 3) {
      ok(
        "A'zolik o'tgan oylar uchun plan yaratdi",
        `${plansBefore.length} oy, jami ${billedTotal}`,
      );
    } else {
      bad("A'zolik o'tgan oylar uchun plan yaratdi", `faqat ${plansBefore.length} oy`);
    }

    // +700 000 avans: eng eski oydan boshlab yopishi kerak.
    const ADVANCE = 700_000;
    await inBranch(() =>
      openingSvc.create({
        user: s1.id,
        role: "student",
        amount: ADVANCE,
        group: group.id,
        branchId: branch.id,
        joinedAt: groupStart,
      }),
    );

    const plansAfter = await prisma.studentPayment.findMany({
      where: { studentId: s1.id, isOpening: false },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });
    const paidTotal = plansAfter.reduce((acc, p) => acc + Number(p.paidAmount), 0);
    const deposit = await prisma.studentDeposit.findFirst({ where: { studentId: s1.id } });

    eq("Avans to'liq taqsimlandi", paidTotal, ADVANCE);
    eq("Depozitda qoldiq qolmadi", deposit?.balance || 0, 0);

    // ENG ESKI oy birinchi va TO'LIQ yopilishi shart.
    //
    // DIQQAT: birinchi oy PRORATSIYALANGAN bo'lishi mumkin (o'quvchi
    // oyning 5-kunida qo'shilgan → 500 000 emas, 435 484). Shuning
    // uchun FEE bilan emas, o'sha qatorning O'Z expectedAmount'i bilan
    // solishtiriladi - aks holda test proratsiyani "xato" deb ko'rsatardi.
    const first = plansAfter[0];
    if (first && first.paidAmount === first.expectedAmount && first.expectedAmount > 0) {
      ok(
        "Eng eski oy birinchi va to'liq yopildi",
        `${first.year}/${first.month} — ${first.paidAmount}/${first.expectedAmount}`,
      );
    } else {
      bad(
        "Eng eski oy birinchi va to'liq yopildi",
        `${first?.year}/${first?.month} da ${first?.paidAmount}/${first?.expectedAmount}`,
      );
    }

    // Taqsimot TARTIBI: to'langan oylar ketma-ket eng eskisidan boshlansin.
    const paidMonths = plansAfter.filter((p) => p.paidAmount > 0);
    const firstUnpaidIdx = plansAfter.findIndex((p) => p.paidAmount === 0);
    const orderOk =
      firstUnpaidIdx === -1 ||
      plansAfter.slice(firstUnpaidIdx).every((p) => p.paidAmount === 0);
    if (orderOk) {
      ok("Taqsimot eng eskisidan ketma-ket bordi", `${paidMonths.length} oy yopildi`);
    } else {
      bad("Taqsimot eng eskisidan ketma-ket bordi", "oylar sakrab yopilgan");
    }

    const depTxn = await prisma.depositTransaction.findFirst({
      where: { studentId: s1.id, type: "topup" },
    });
    if (depTxn?.isOpening) ok("Depozit yozuvi isOpening bayrog'i bilan");
    else bad("Depozit yozuvi isOpening bayrog'i bilan", "bayroq qo'yilmagan");

    // ═══════════════ 2. IKKI BARAVAR YOZISHDAN HIMOYA ═══════════════
    console.log("\n\x1b[1m2) Takroriy import pulni ikki marta yozmaydi\x1b[0m");

    const second = await inBranch(() =>
      openingSvc.create({
        user: s1.id,
        role: "student",
        amount: ADVANCE,
        group: group.id,
        branchId: branch.id,
        joinedAt: groupStart,
      }),
    );

    eq("Ikkinchi urinish 'duplicate' qaytardi", second.status, "duplicate");

    const paidAfterRetry = (
      await prisma.studentPayment.findMany({
        where: { studentId: s1.id, isOpening: false },
      })
    ).reduce((acc, p) => acc + Number(p.paidAmount), 0);
    eq("To'langan summa o'zgarmadi", paidAfterRetry, ADVANCE);

    const topupCount = await prisma.depositTransaction.count({
      where: { studentId: s1.id, type: "topup" },
    });
    eq("Depozitga faqat bitta yozuv tushdi", topupCount, 1);

    // ═══════════════ 3. QARZ (-) VA UNING TAQSIMOTI ═══════════════
    console.log("\n\x1b[1m3) Qarz (-) eng eski oyga yoziladi va birinchi yopiladi\x1b[0m");

    const s2 = await mkStudent(2);
    createdUsers.push(s2);
    await inBranch(() =>
      groupsSvc.addStudent(group.id, s2.id, { joinedAt: groupStart }),
    );

    const DEBT = 300_000;
    await inBranch(() =>
      openingSvc.create({
        user: s2.id,
        role: "student",
        amount: -DEBT,
        group: group.id,
        branchId: branch.id,
        joinedAt: groupStart,
      }),
    );

    const openingRow = await prisma.studentPayment.findFirst({
      where: { studentId: s2.id, isOpening: true },
    });

    if (!openingRow) {
      bad("Boshlang'ich qarz qatori yaratildi", "topilmadi");
    } else {
      eq("Qarz summasi to'g'ri", openingRow.expectedAmount, DEBT);

      const oldestNormal = await prisma.studentPayment.findFirst({
        where: { studentId: s2.id, isOpening: false },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      });
      const openIdx = openingRow.year * 12 + openingRow.month;
      const normIdx = oldestNormal.year * 12 + oldestNormal.month;
      if (openIdx < normIdx) {
        ok(
          "Qarz eng eski oydan ham OLDIN turibdi",
          `${openingRow.year}/${openingRow.month} < ${oldestNormal.year}/${oldestNormal.month}`,
        );
      } else {
        bad(
          "Qarz eng eski oydan ham OLDIN turibdi",
          `qarz ${openingRow.year}/${openingRow.month}, plan ${oldestNormal.year}/${oldestNormal.month}`,
        );
      }

      // To'lov kelganda BIRINCHI shu qarzga tushishi kerak.
      const depositSvc = await import("../src/modules/deposits/services/deposit.service.js");
      await inBranch(() =>
        depositSvc.topup(s2.id, { amount: DEBT, method: "cash" }, null),
      );
      const openingAfterPay = await prisma.studentPayment.findUnique({ where: { id: openingRow.id } });
      eq("Kelgan pul avval eski qarzni yopdi", openingAfterPay.paidAmount, DEBT);
    }

    // ═══════════════ 4. RECALC QARZNI YO'Q QILMAYDI ═══════════════
    console.log("\n\x1b[1m4) Kunlik recalc boshlang'ich qarzni o'chirmaydi\x1b[0m");

    if (openingRow) {
      await inBranch(() => paymentSvc.recalc(openingRow.id));
      const afterRecalc = await prisma.studentPayment.findUnique({ where: { id: openingRow.id } });
      eq("recalc'dan keyin summa saqlandi", afterRecalc.expectedAmount, DEBT);

      // recalcForStudent - butun o'quvchi bo'ylab (eng keng yo'l).
      await inBranch(() => paymentSvc.recalcForStudent(s2.id));
      const afterFull = await prisma.studentPayment.findUnique({ where: { id: openingRow.id } });
      eq("recalcForStudent'dan keyin ham saqlandi", afterFull.expectedAmount, DEBT);
    }

    // ═══════════════ 5. UNIQUE INDEKS: yonma-yon tura oladi ═══════════════
    console.log("\n\x1b[1m5) Boshlang'ich qarz oddiy plan bilan bir oyda tura oladi\x1b[0m");

    const s3 = await mkStudent(3);
    createdUsers.push(s3);
    const testYear = Y;
    const testMonth = M;

    const mkPlan = async (over) => {
      const row = await prisma.studentPayment.create({
        data: {
          branchId: branch.id,
          studentId: s3.id,
          groupId: group.id,
          year: testYear,
          month: testMonth,
          ...over,
        },
      });
      return fx.track("studentPayment", row.id), row;
    };

    await mkPlan({ baseFee: FEE, expectedAmount: FEE, isOpening: false });
    try {
      await mkPlan({ baseFee: DEBT, expectedAmount: DEBT, isOpening: true });
      ok("Ikkala qator birga yozildi (indeks isOpening bilan)");
    } catch (e) {
      bad("Ikkala qator birga yozildi", `${e.code}: indeks migratsiyasi bajarilmagan?`);
    }

    // Ikkinchi ODDIY qator esa RAD ETILISHI shart (asosiy himoya joyida).
    try {
      await mkPlan({ baseFee: FEE, expectedAmount: FEE, isOpening: false });
      bad("Takroriy oddiy plan rad etildi", "IKKI BARAVAR HISOB xavfi - indeks ishlamayapti");
    } catch (e) {
      // ⚠ Mongo `E11000` → Postgres/Prisma `P2002` (unique cheklov).
      if (e.code === "P2002") ok("Takroriy oddiy plan rad etildi (P2002)");
      else bad("Takroriy oddiy plan rad etildi", `boshqa xato: ${e.message}`);
    }

    // ═══════════════ 6. HISOBOT: billed'da yo'q, outstanding'da bor ═══════
    console.log("\n\x1b[1m6) Hisobot: eski qarz daromadga kirmaydi, qoldiqda ko'rinadi\x1b[0m");

    const finReport = await import(
      "../src/modules/financeReport/services/financeReport.service.js"
    );
    // Ichki funksiya eksport qilinmagan - aggregatsiyani AYNAN takrorlaymiz.
    // ⚠ Mongo `aggregate` quvuri → Prisma o'qish + JS arifmetikasi.
    // Ichki funksiya eksport qilinmagan, shuning uchun HISOB QOIDASI
    // aynan takrorlanadi: `isOpening` qatorlar `billed` ga KIRMAYDI,
    // lekin `outstanding` ga kiradi.
    const planRows = await prisma.studentPayment.findMany({
      where: { studentId: s3.id, year: testYear, month: testMonth },
      select: { isOpening: true, expectedAmount: true, paidAmount: true },
    });
    const agg = planRows.reduce(
      (acc, p) => {
        const exp = Number(p.expectedAmount);
        const paid = Number(p.paidAmount);
        acc.billed += p.isOpening ? 0 : exp;
        acc.outstanding += Math.max(exp - paid, 0);
        return acc;
      },
      { billed: 0, outstanding: 0 },
    );
    eq("Hisoblangan (billed) faqat oddiy plan", agg.billed, FEE);
    eq("Qoldiq (outstanding) ikkalasini qamraydi", agg.outstanding, FEE + DEBT);
    if (typeof finReport.summary === "function") ok("financeReport moduli yuklandi");

    // ═══════════════ 7. XODIM: qarz oylikdan katta - qoldiq ko'chadi ═══════
    console.log("\n\x1b[1m7) Xodim qarzi oylikdan katta bo'lsa qoldiq yo'qolmaydi\x1b[0m");

    const emp = await fx.user(`${TAG}_e`, {
      firstName: TAG,
      lastName: "Staff1",
      passwordHash: "test1234",
      role: "owner",
      homeBranchId: branch.id,
    });
    createdUsers.push(emp);

    const prevMonth = M === 1 ? 12 : M - 1;
    const prevYear = M === 1 ? Y - 1 : Y;

    // Oylik 2 mln, qarz 3 mln → 1 mln keyingi oyga ko'chishi kerak.
    const payroll = await prisma.staffPayroll.create({
      data: {
      employeeId: emp.id,
      branchId: branch.id,
      year: prevYear,
      month: prevMonth,
      fixedAmount: 2_000_000,
      openingDebtTotal: 3_000_000,
      openingDebtApplied: 2_000_000,
      finalAmount: 0,
      },
    });
    fx.track("staffPayroll", payroll.id);

    const carry1 = await payrollSvc.carryOverOpeningDebt(Y, M);
    const carried = await prisma.staffPayrollAdjustment.findMany({
      where: { employeeId: emp.id, year: Y, month: M, kind: "opening_debt" },
    });

    eq("Qoldiq ko'chirildi", carried.length, 1);
    if (carried[0]) eq("Ko'chirilgan summa to'g'ri", Number(carried[0].amount), 1_000_000);

    // IKKINCHI MARTA ishga tushirish IKKI BARAVAR ushlamasligi shart.
    await payrollSvc.carryOverOpeningDebt(Y, M);
    const carriedAgain = await prisma.staffPayrollAdjustment.count({
      where: { employeeId: emp.id, year: Y, month: M, kind: "opening_debt" },
    });
    eq("Qayta ishga tushirish takror yozmadi", carriedAgain, 1);
    if (carry1.employeeIds.length) ok("Ko'chirilgan xodimlar ro'yxati qaytdi");

    // ═══════════════ 8. O'CHIRIB BO'LMAYDI ═══════════════
    console.log("\n\x1b[1m8) Boshlang'ich qoldiq o'zgarmas\x1b[0m");

    const staffAdj = await import(
      "../src/modules/staffPayroll/services/staffAdjustment.service.js"
    );
    try {
      await staffAdj.remove(carried[0].id, { _id: null });
      bad("Xodim boshlang'ich qatorini o'chirib bo'lmaydi", "o'chirildi!");
    } catch (e) {
      if (/Boshlang'ich qoldiqni o'chirib bo'lmaydi/.test(e.message)) {
        ok("Xodim boshlang'ich qatorini o'chirib bo'lmaydi");
      } else {
        bad("Xodim boshlang'ich qatorini o'chirib bo'lmaydi", e.message);
      }
    }

    // ⚠ ILGARI BU MONGOOSE `immutable: true` MAYDONI EDI — u
    // o'zgarishni JIMGINA e'tiborsiz qoldirardi. Prisma'da model qatlami
    // yo'q, shuning uchun himoya `config/prisma.js` kengaytmasiga
    // ko'chirildi va u JIMGINA emas, OCHIQ rad etadi
    // (`OPENING_BALANCE_IMMUTABLE`) — jurnal qo'riqchisi bilan bir uslub.
    //
    // DA'VO O'ZGARMADI (hatto kuchaydi): summani o'zgartirib bo'lmaydi.
    const obDoc = await prisma.openingBalance.findFirst({ where: { userId: s1.id } });
    let immutableErr = null;
    try {
      await prisma.openingBalance.update({
        where: { id: obDoc.id },
        data: { amount: 999 },
      });
    } catch (e) {
      immutableErr = e;
    }
    if (immutableErr?.code === "OPENING_BALANCE_IMMUTABLE") {
      ok("Summani o'zgartirish RAD ETILDI", immutableErr.message);
    } else {
      bad("Summani o'zgartirish rad etilishi kerak", `xato: ${immutableErr?.message || "yo'q"}`);
    }
    const obReloaded = await prisma.openingBalance.findFirst({ where: { userId: s1.id } });
    eq("Summa immutable - o'zgarmadi", Number(obReloaded.amount), ADVANCE);
  } finally {
    await cleanup();
  }

  console.log(
    `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
      `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}\n`,
  );
  if (R.fail) R.notes.forEach((n) => console.log(`  \x1b[31m•\x1b[0m ${n}`));

  await prisma.$disconnect().catch(() => {});
  process.exit(R.fail ? 1 : 0);
};

run().catch(async (err) => {
  console.error("\x1b[31mTest yiqildi:\x1b[0m", err);
  await prisma.$disconnect().catch(() => null);
  process.exit(1);
});
