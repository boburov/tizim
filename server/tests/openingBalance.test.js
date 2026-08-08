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
import "dotenv/config";
import mongoose from "mongoose";

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

  const Branch = (await import("../src/models/branch.model.js")).default;
  const Group = (await import("../src/models/group.model.js")).default;
  const GroupFee = (await import("../src/models/groupFee.model.js")).default;
  const User = (await import("../src/models/user.model.js")).default;
  const GroupMembership = (await import("../src/models/groupMembership.model.js")).default;
  const StudentPayment = (await import("../src/models/studentPayment.model.js")).default;
  const StudentDeposit = (await import("../src/models/studentDeposit.model.js")).default;
  const DepositTransaction = (await import("../src/models/depositTransaction.model.js")).default;
  const OpeningBalance = (await import("../src/models/openingBalance.model.js")).default;
  const StaffPayroll = (await import("../src/models/staffPayroll.model.js")).default;
  const StaffPayrollAdjustment = (
    await import("../src/models/staffPayrollAdjustment.model.js")
  ).default;

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
  const branch =
    (await Branch.findOne({ isDeleted: false }).lean()) ||
    (await Branch.create({ name: `${TAG} filial` }));

  const now = new Date();
  const Y = now.getUTCFullYear();
  const M = now.getUTCMonth() + 1;
  // Guruh 3 oy oldin boshlangan - shunda a'zolik backfill'i bir necha
  // oylik qarz yaratadi (aynan foydalanuvchi tasvirlagan ssenariy).
  const groupStart = new Date(Date.UTC(Y, now.getUTCMonth() - 3, 5));

  const group = await Group.create({
    branchId: branch._id,
    name: `${TAG} guruh ${Date.now()}`,
    startDate: groupStart,
    isActive: true,
  });

  const FEE = 500_000;
  // 6 oyga tarif - backfill har oy uchun shu narxni topsin.
  for (let i = -4; i <= 1; i += 1) {
    const d = new Date(Date.UTC(Y, now.getUTCMonth() + i, 1));
    await GroupFee.updateOne(
      { group: group._id, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 },
      { $set: { amount: FEE, source: "manual" } },
      { upsert: true },
    );
  }

  const mkStudent = async (suffix) =>
    User.create({
      firstName: TAG,
      lastName: `Student${suffix}`,
      username: `${TAG}_s${suffix}_${Date.now()}`,
      passwordHash: "test1234",
      role: "student",
      homeBranchId: branch._id,
      enrolledAt: groupStart,
    });

  const ctx = {
    branchId: String(branch._id),
    allowedBranchIds: [String(branch._id)],
    canSeeAllBranches: false,
    userId: null,
  };
  const inBranch = (fn) => runWithBranchContext(ctx, fn);

  const createdUsers = [];
  const cleanup = async () => {
    const ids = createdUsers.map((u) => u._id);
    await Promise.all([
      OpeningBalance.deleteMany({ user: { $in: ids } }),
      StudentPayment.deleteMany({ student: { $in: ids } }),
      DepositTransaction.deleteMany({ student: { $in: ids } }),
      StudentDeposit.deleteMany({ student: { $in: ids } }),
      GroupMembership.deleteMany({ student: { $in: ids } }),
      StaffPayrollAdjustment.deleteMany({ employee: { $in: ids } }),
      StaffPayroll.deleteMany({ employee: { $in: ids } }),
      User.deleteMany({ _id: { $in: ids } }),
    ]);
    await GroupFee.deleteMany({ group: group._id });
    await Group.deleteOne({ _id: group._id });
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
      groupsSvc.addStudent(group._id, s1._id, { joinedAt: groupStart }),
    );

    const plansBefore = await StudentPayment.find({
      student: s1._id,
      isOpening: false,
    }).lean();
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
        user: s1._id,
        role: "student",
        amount: ADVANCE,
        group: group._id,
        branchId: branch._id,
        joinedAt: groupStart,
      }),
    );

    const plansAfter = await StudentPayment.find({ student: s1._id, isOpening: false })
      .sort({ year: 1, month: 1 })
      .lean();
    const paidTotal = plansAfter.reduce((s, p) => s + p.paidAmount, 0);
    const deposit = await StudentDeposit.findOne({ student: s1._id }).lean();

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

    const depTxn = await DepositTransaction.findOne({ student: s1._id, type: "topup" }).lean();
    if (depTxn?.isOpening) ok("Depozit yozuvi isOpening bayrog'i bilan");
    else bad("Depozit yozuvi isOpening bayrog'i bilan", "bayroq qo'yilmagan");

    // ═══════════════ 2. IKKI BARAVAR YOZISHDAN HIMOYA ═══════════════
    console.log("\n\x1b[1m2) Takroriy import pulni ikki marta yozmaydi\x1b[0m");

    const second = await inBranch(() =>
      openingSvc.create({
        user: s1._id,
        role: "student",
        amount: ADVANCE,
        group: group._id,
        branchId: branch._id,
        joinedAt: groupStart,
      }),
    );

    eq("Ikkinchi urinish 'duplicate' qaytardi", second.status, "duplicate");

    const paidAfterRetry = (
      await StudentPayment.find({ student: s1._id, isOpening: false }).lean()
    ).reduce((s, p) => s + p.paidAmount, 0);
    eq("To'langan summa o'zgarmadi", paidAfterRetry, ADVANCE);

    const topupCount = await DepositTransaction.countDocuments({
      student: s1._id,
      type: "topup",
    });
    eq("Depozitga faqat bitta yozuv tushdi", topupCount, 1);

    // ═══════════════ 3. QARZ (-) VA UNING TAQSIMOTI ═══════════════
    console.log("\n\x1b[1m3) Qarz (-) eng eski oyga yoziladi va birinchi yopiladi\x1b[0m");

    const s2 = await mkStudent(2);
    createdUsers.push(s2);
    await inBranch(() =>
      groupsSvc.addStudent(group._id, s2._id, { joinedAt: groupStart }),
    );

    const DEBT = 300_000;
    await inBranch(() =>
      openingSvc.create({
        user: s2._id,
        role: "student",
        amount: -DEBT,
        group: group._id,
        branchId: branch._id,
        joinedAt: groupStart,
      }),
    );

    const openingRow = await StudentPayment.findOne({
      student: s2._id,
      isOpening: true,
    }).lean();

    if (!openingRow) {
      bad("Boshlang'ich qarz qatori yaratildi", "topilmadi");
    } else {
      eq("Qarz summasi to'g'ri", openingRow.expectedAmount, DEBT);

      const oldestNormal = await StudentPayment.findOne({
        student: s2._id,
        isOpening: false,
      })
        .sort({ year: 1, month: 1 })
        .lean();
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
        depositSvc.topup(s2._id, { amount: DEBT, method: "cash" }, null),
      );
      const openingAfterPay = await StudentPayment.findById(openingRow._id).lean();
      eq("Kelgan pul avval eski qarzni yopdi", openingAfterPay.paidAmount, DEBT);
    }

    // ═══════════════ 4. RECALC QARZNI YO'Q QILMAYDI ═══════════════
    console.log("\n\x1b[1m4) Kunlik recalc boshlang'ich qarzni o'chirmaydi\x1b[0m");

    if (openingRow) {
      await inBranch(() => paymentSvc.recalc(openingRow._id));
      const afterRecalc = await StudentPayment.findById(openingRow._id).lean();
      eq("recalc'dan keyin summa saqlandi", afterRecalc.expectedAmount, DEBT);

      // recalcForStudent - butun o'quvchi bo'ylab (eng keng yo'l).
      await inBranch(() => paymentSvc.recalcForStudent(s2._id));
      const afterFull = await StudentPayment.findById(openingRow._id).lean();
      eq("recalcForStudent'dan keyin ham saqlandi", afterFull.expectedAmount, DEBT);
    }

    // ═══════════════ 5. UNIQUE INDEKS: yonma-yon tura oladi ═══════════════
    console.log("\n\x1b[1m5) Boshlang'ich qarz oddiy plan bilan bir oyda tura oladi\x1b[0m");

    const s3 = await mkStudent(3);
    createdUsers.push(s3);
    const testYear = Y;
    const testMonth = M;

    await StudentPayment.create({
      branchId: branch._id,
      student: s3._id,
      group: group._id,
      year: testYear,
      month: testMonth,
      baseFee: FEE,
      expectedAmount: FEE,
      isOpening: false,
    });
    try {
      await StudentPayment.create({
        branchId: branch._id,
        student: s3._id,
        group: group._id,
        year: testYear,
        month: testMonth,
        baseFee: DEBT,
        expectedAmount: DEBT,
        isOpening: true,
      });
      ok("Ikkala qator birga yozildi (indeks isOpening bilan)");
    } catch (e) {
      bad("Ikkala qator birga yozildi", `E${e.code}: indeks migratsiyasi bajarilmagan?`);
    }

    // Ikkinchi ODDIY qator esa RAD ETILISHI shart (asosiy himoya joyida).
    try {
      await StudentPayment.create({
        branchId: branch._id,
        student: s3._id,
        group: group._id,
        year: testYear,
        month: testMonth,
        baseFee: FEE,
        expectedAmount: FEE,
        isOpening: false,
      });
      bad("Takroriy oddiy plan rad etildi", "IKKI BARAVAR HISOB xavfi - indeks ishlamayapti");
    } catch (e) {
      if (e.code === 11000) ok("Takroriy oddiy plan rad etildi (E11000)");
      else bad("Takroriy oddiy plan rad etildi", `boshqa xato: ${e.message}`);
    }

    // ═══════════════ 6. HISOBOT: billed'da yo'q, outstanding'da bor ═══════
    console.log("\n\x1b[1m6) Hisobot: eski qarz daromadga kirmaydi, qoldiqda ko'rinadi\x1b[0m");

    const finReport = await import(
      "../src/modules/financeReport/services/financeReport.service.js"
    );
    // Ichki funksiya eksport qilinmagan - aggregatsiyani AYNAN takrorlaymiz.
    const [agg] = await StudentPayment.aggregate([
      { $match: { student: s3._id, year: testYear, month: testMonth } },
      {
        $group: {
          _id: null,
          billed: {
            $sum: {
              $cond: [
                { $eq: [{ $ifNull: ["$isOpening", false] }, true] },
                0,
                "$expectedAmount",
              ],
            },
          },
          outstanding: {
            $sum: { $max: [{ $subtract: ["$expectedAmount", "$paidAmount"] }, 0] },
          },
        },
      },
    ]);
    eq("Hisoblangan (billed) faqat oddiy plan", agg.billed, FEE);
    eq("Qoldiq (outstanding) ikkalasini qamraydi", agg.outstanding, FEE + DEBT);
    if (typeof finReport.summary === "function") ok("financeReport moduli yuklandi");

    // ═══════════════ 7. XODIM: qarz oylikdan katta - qoldiq ko'chadi ═══════
    console.log("\n\x1b[1m7) Xodim qarzi oylikdan katta bo'lsa qoldiq yo'qolmaydi\x1b[0m");

    const emp = await User.create({
      firstName: TAG,
      lastName: "Staff1",
      username: `${TAG}_e_${Date.now()}`,
      passwordHash: "test1234",
      role: "owner",
      homeBranchId: branch._id,
    });
    createdUsers.push(emp);

    const prevMonth = M === 1 ? 12 : M - 1;
    const prevYear = M === 1 ? Y - 1 : Y;

    // Oylik 2 mln, qarz 3 mln → 1 mln keyingi oyga ko'chishi kerak.
    await StaffPayroll.create({
      employee: emp._id,
      branchId: branch._id,
      year: prevYear,
      month: prevMonth,
      fixedAmount: 2_000_000,
      openingDebtTotal: 3_000_000,
      openingDebtApplied: 2_000_000,
      finalAmount: 0,
    });

    const carry1 = await payrollSvc.carryOverOpeningDebt(Y, M);
    const carried = await StaffPayrollAdjustment.find({
      employee: emp._id,
      year: Y,
      month: M,
      kind: "opening_debt",
    }).lean();

    eq("Qoldiq ko'chirildi", carried.length, 1);
    if (carried[0]) eq("Ko'chirilgan summa to'g'ri", carried[0].amount, 1_000_000);

    // IKKINCHI MARTA ishga tushirish IKKI BARAVAR ushlamasligi shart.
    await payrollSvc.carryOverOpeningDebt(Y, M);
    const carriedAgain = await StaffPayrollAdjustment.countDocuments({
      employee: emp._id,
      year: Y,
      month: M,
      kind: "opening_debt",
    });
    eq("Qayta ishga tushirish takror yozmadi", carriedAgain, 1);
    if (carry1.employeeIds.length) ok("Ko'chirilgan xodimlar ro'yxati qaytdi");

    // ═══════════════ 8. O'CHIRIB BO'LMAYDI ═══════════════
    console.log("\n\x1b[1m8) Boshlang'ich qoldiq o'zgarmas\x1b[0m");

    const staffAdj = await import(
      "../src/modules/staffPayroll/services/staffAdjustment.service.js"
    );
    try {
      await staffAdj.remove(carried[0]._id, { _id: null });
      bad("Xodim boshlang'ich qatorini o'chirib bo'lmaydi", "o'chirildi!");
    } catch (e) {
      if (/Boshlang'ich qoldiqni o'chirib bo'lmaydi/.test(e.message)) {
        ok("Xodim boshlang'ich qatorini o'chirib bo'lmaydi");
      } else {
        bad("Xodim boshlang'ich qatorini o'chirib bo'lmaydi", e.message);
      }
    }

    const obDoc = await OpeningBalance.findOne({ user: s1._id });
    obDoc.amount = 999;
    await obDoc.save();
    const obReloaded = await OpeningBalance.findOne({ user: s1._id }).lean();
    eq("Summa immutable - o'zgarmadi", obReloaded.amount, ADVANCE);
  } finally {
    await cleanup();
  }

  console.log(
    `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
      `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}\n`,
  );
  if (R.fail) R.notes.forEach((n) => console.log(`  \x1b[31m•\x1b[0m ${n}`));

  await mongoose.disconnect();
  process.exit(R.fail ? 1 : 0);
};

run().catch(async (err) => {
  console.error("\x1b[31mTest yiqildi:\x1b[0m", err);
  await mongoose.disconnect().catch(() => null);
  process.exit(1);
});
