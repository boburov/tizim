/**
 * BIRLASHGAN MOLIYAVIY TARIX (LEDGER) - BALANS TO'G'RILIGI TESTI.
 *
 * Bu test spetsifikatsiyada ATAYLAB berilgan hisob-kitob misollarini
 * AYNAN takrorlaydi va natijani tizim hisoblagan balans bilan
 * solishtiradi. Ya'ni u kodni emas, TALABNI tekshiradi.
 *
 * Tekshiriladigan xavflar:
 *
 *   1) ISHORA TESKARILIGI - o'qituvchida "+3 mln" markaz qarzi emas,
 *      o'qituvchi qarzi bo'lib hisoblanishi (eng qimmat xato: kimga
 *      qancha qarzdorligimiz teskari chiqadi).
 *   2) ESKI YOZUVLAR BUZILISHI - konvensiya o'zgargandan keyin
 *      ilgari kiritilgan qoldiqlar boshqa ma'no kasb etishi.
 *   3) IKKI BARAVAR HISOBLASH - boshlang'ich qoldiq ham langar
 *      hujjatdan, ham uning materializatsiyasidan sanalishi.
 *   4) DEPOZIT IKKI BARAVAR - depozitga tushgan pul kirimda ham,
 *      qarzga qoplanganda ham hisoblanishi.
 *   5) GURUHSIZ QARZ YO'QOLISHI - guruhi yo'q o'quvchining eski qarzi
 *      balansda ko'rinmay qolishi.
 *   6) TARIXNI QAYTA HISOBLASH - hiredAt o'zgartirilganda o'tgan
 *      oylarga maosh qarzi paydo bo'lishi.
 *
 * ISHLATISH:  npm run test:ledger
 */
import "dotenv/config";
import mongoose from "mongoose";

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
const eq = (name, actual, expected) => {
  if (actual === expected) ok(name, String(actual));
  else bad(name, `kutilgan ${expected}, chiqdi ${actual}`);
};

const TAG = "__ledger_test__";
const fmt = (n) => Number(n).toLocaleString("ru-RU");

const run = async () => {
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
  const TeacherSalary = (await import("../src/models/teacherSalary.model.js")).default;
  const SalaryTransaction = (await import("../src/models/salaryTransaction.model.js")).default;
  const PaymentTransaction = (await import("../src/models/paymentTransaction.model.js")).default;

  const { runWithBranchContext } = await import(
    "../src/helpers/branchContext.helper.js"
  );
  const openingSvc = await import(
    "../src/modules/openingBalance/services/openingBalance.service.js"
  );
  const ledgerSvc = await import("../src/modules/ledger/services/ledger.service.js");
  const groupsSvc = await import("../src/modules/groups/services/groups.service.js");
  const txnSvc = await import("../src/modules/finance/services/transaction.service.js");
  const salaryTxnSvc = await import(
    "../src/modules/teacherSalary/services/salaryTransaction.service.js"
  );

  const branch =
    (await Branch.findOne({ isDeleted: false }).lean()) ||
    (await Branch.create({ name: `${TAG} filial` }));

  const now = new Date();
  const Y = now.getUTCFullYear();
  const M = now.getUTCMonth() + 1;
  const prev = M === 1 ? { y: Y - 1, m: 12 } : { y: Y, m: M - 1 };

  const ctx = {
    branchId: String(branch._id),
    allowedBranchIds: [String(branch._id)],
    canSeeAllBranches: false,
    userId: null,
  };
  const inBranch = (fn) => runWithBranchContext(ctx, fn);

  const createdUsers = [];
  const createdGroups = [];

  const mkUser = async (role, suffix, extra = {}) => {
    const u = await User.create({
      firstName: TAG,
      lastName: `${role}${suffix}`,
      username: `${TAG}_${role}${suffix}_${Date.now()}`,
      passwordHash: "test1234",
      role,
      homeBranchId: branch._id,
      ...extra,
    });
    createdUsers.push(u);
    return u;
  };

  const cleanup = async () => {
    const ids = createdUsers.map((u) => u._id);
    const gids = createdGroups.map((g) => g._id);
    await Promise.all([
      OpeningBalance.deleteMany({ user: { $in: ids } }),
      StudentPayment.deleteMany({ student: { $in: ids } }),
      PaymentTransaction.deleteMany({ student: { $in: ids } }),
      DepositTransaction.deleteMany({ student: { $in: ids } }),
      StudentDeposit.deleteMany({ student: { $in: ids } }),
      GroupMembership.deleteMany({ student: { $in: ids } }),
      TeacherSalary.deleteMany({ teacher: { $in: ids } }),
      SalaryTransaction.deleteMany({ teacher: { $in: ids } }),
      User.deleteMany({ _id: { $in: ids } }),
    ]);
    await GroupFee.deleteMany({ group: { $in: gids } });
    await Group.deleteMany({ _id: { $in: gids } });
  };

  console.log(`\n\x1b[1mBIRLASHGAN MOLIYAVIY TARIX (LEDGER) TESTI\x1b[0m\n`);

  try {
    // ═════════ 1. O'QITUVCHI: spetsifikatsiya §8 misoli ═════════
    //
    //   Opening Balance  +3 000 000
    //   Salary           +2 000 000
    //   Payment          -1 500 000
    //   ─────────────────────────────
    //   Balans           +3 500 000   (markaz o'qituvchiga qarzdor)
    console.log("\x1b[1m1) O'qituvchi: +3 000 000 → +2 000 000 → -1 500 000\x1b[0m");

    const teacher = await mkUser("teacher", 1, {
      hiredAt: new Date(Date.UTC(Y, now.getUTCMonth() - 2, 1)),
    });

    await inBranch(() =>
      openingSvc.create({
        user: teacher._id,
        role: "teacher",
        // + = MARKAZ o'qituvchiga qarzdor. Guruh BERILMAYDI - qoldiq
        // markaz darajasidagi majburiyat.
        amount: 3_000_000,
        branchId: branch._id,
        group: null,
      }),
    );

    let st = await inBranch(() => ledgerSvc.statementFor(teacher._id));
    eq("Boshlang'ich qoldiq ishorasi to'g'ri", st.openingBalance, 3_000_000);
    eq("Faqat qoldiq bo'lganda balans = qoldiq", st.currentBalance, 3_000_000);

    // Hisoblangan maosh (markaz qarzini oshiradi).
    const salary = await TeacherSalary.create({
      branchId: branch._id,
      teacher: teacher._id,
      group: null,
      year: prev.y,
      month: prev.m,
      kind: "base",
      expectedAmount: 2_000_000,
      paidAmount: 0,
      status: "unpaid",
      isLocked: true,
    });

    st = await inBranch(() => ledgerSvc.statementFor(teacher._id));
    eq("Maosh hisoblangach balans", st.currentBalance, 5_000_000);

    // To'lov (markaz qarzini kamaytiradi).
    await inBranch(() =>
      salaryTxnSvc.create(
        {
          salaryId: salary._id,
          amount: 1_500_000,
          method: "cash",
          paidAt: new Date(),
        },
        { _id: null },
      ),
    );

    st = await inBranch(() => ledgerSvc.statementFor(teacher._id));
    eq("Spetsifikatsiya §8 yakuniy balansi", st.currentBalance, 3_500_000);

    // Har bir qator "shu amaldan keyingi balans"ni ko'rsatishi kerak -
    // aynan shu ustun "balans qayerdan chiqdi?" degan savolga javob.
    const last = st.rows[st.rows.length - 1];
    eq("Oxirgi qatorning balanceAfter'i joriy balansga teng", last.balanceAfter, 3_500_000);
    eq("Tarixda 3 ta qator bor", st.rows.length, 3);

    console.log(
      `  \x1b[2m${st.rows
        .map((r) => `${r.amount > 0 ? "+" : ""}${fmt(r.amount)} → ${fmt(r.balanceAfter)}`)
        .join("  |  ")}\x1b[0m`,
    );

    // ═════════ 2. ESKI (flow) YOZUV TESKARI O'QILMAYDI ═════════
    console.log("\n\x1b[1m2) Eski konvensiyadagi yozuv to'g'ri o'qiladi\x1b[0m");

    const legacyTeacher = await mkUser("teacher", 2, { hiredAt: new Date() });
    // Konvensiya o'zgarishidan OLDIN yozilgandek qilib qo'yamiz:
    // eski qoidada o'qituvchida +2 000 000 "u bizga qarz" degani edi.
    await OpeningBalance.create({
      user: legacyTeacher._id,
      role: "teacher",
      amount: 2_000_000,
      signConvention: "flow",
      branchId: branch._id,
      year: prev.y,
      month: prev.m,
      kind: "teacher_debt",
      materializedAt: new Date(),
    });

    st = await inBranch(() => ledgerSvc.statementFor(legacyTeacher._id));
    eq("Eski (flow) yozuv ishorasi ag'darildi", st.openingBalance, -2_000_000);

    // ═════════ 3. O'QUVCHI: spetsifikatsiya §7 misoli ═════════
    //
    //   Opening Balance  -500 000   (o'quvchi markazga qarz)
    //   To'lov           +300 000
    //   ────────────────────────────
    //   Balans           -200 000
    console.log("\n\x1b[1m3) O'quvchi: -500 000 → +300 000 (guruhsiz yaratilgan)\x1b[0m");

    const enrolled = new Date(Date.UTC(Y, now.getUTCMonth(), 1));
    const student = await mkUser("student", 1, { enrolledAt: enrolled });

    await inBranch(() =>
      openingSvc.create({
        user: student._id,
        role: "student",
        amount: -500_000,
        branchId: branch._id,
        // GURUH YO'Q - o'quvchi hali hech qaysi guruhga qo'shilmagan.
        group: null,
        joinedAt: enrolled,
      }),
    );

    const obDoc = await OpeningBalance.findOne({ user: student._id }).lean();
    eq("Guruhsiz qarz 'kutish' holatida", obDoc.pendingReason, "awaiting_group");
    eq("Materializatsiya qilinmagan", obDoc.materializedAt, null);

    st = await inBranch(() => ledgerSvc.statementFor(student._id));
    eq("Guruhsiz bo'lsa ham balansda KO'RINADI", st.currentBalance, -500_000);
    if (st.summary.openingPending) ok("Kutayotgani hisobotda belgilangan");
    else bad("Kutayotgani hisobotda belgilangan", "openingPending=false");

    // ── Guruhga qo'shamiz: qarz avtomatik yozilishi kerak ──
    // Tarif 0: guruh oylik qarzi balansga aralashmasin, faqat
    // boshlang'ich qarz va to'lov tekshirilsin.
    const group = await Group.create({
      branchId: branch._id,
      name: `${TAG} guruh ${Date.now()}`,
      startDate: enrolled,
      isActive: true,
    });
    createdGroups.push(group);
    await GroupFee.updateOne(
      { group: group._id, year: Y, month: M },
      { $set: { amount: 0, source: "manual" } },
      { upsert: true },
    );

    await inBranch(() => groupsSvc.addStudent(group._id, student._id, { joinedAt: enrolled }));

    const obAfter = await OpeningBalance.findOne({ user: student._id }).lean();
    if (obAfter.materializedAt) {
      ok("Guruhga qo'shilganda qarz avtomatik yozildi");
    } else {
      bad("Guruhga qo'shilganda qarz avtomatik yozildi", obAfter.materializeError || "yozilmadi");
    }
    eq("Kutish holati tozalandi", obAfter.pendingReason, "");

    const openingPlan = await StudentPayment.findOne({
      student: student._id,
      isOpening: true,
    }).lean();
    eq("Qarz qatori summasi", openingPlan?.expectedAmount, 500_000);

    // MATERIALIZATSIYADAN KEYIN BALANS O'ZGARMASLIGI SHART: qator
    // paydo bo'ldi, lekin u boshlang'ich qoldiqning O'ZI - ikki marta
    // sanalmasligi kerak.
    st = await inBranch(() => ledgerSvc.statementFor(student._id));
    eq("Materializatsiyadan keyin balans O'ZGARMADI", st.currentBalance, -500_000);

    // ── 300 000 to'lov ──
    await inBranch(() =>
      txnSvc.create(
        {
          paymentId: openingPlan._id,
          amount: 300_000,
          method: "cash",
          paidAt: new Date(),
        },
        { _id: null },
      ),
    );

    st = await inBranch(() => ledgerSvc.statementFor(student._id));
    eq("Spetsifikatsiya §7 yakuniy balansi", st.currentBalance, -200_000);

    // ── Qolgan 200 000 ni ham to'laydi → 0 ──
    await inBranch(() =>
      txnSvc.create(
        {
          paymentId: openingPlan._id,
          amount: 200_000,
          method: "card",
          paidAt: new Date(),
        },
        { _id: null },
      ),
    );

    st = await inBranch(() => ledgerSvc.statementFor(student._id));
    eq("To'liq to'langach balans nol", st.currentBalance, 0);

    // ═════════ 4. DEPOZIT IKKI MARTA HISOBLANMAYDI ═════════
    console.log("\n\x1b[1m4) Depozit orqali to'lov ikki baravar hisoblanmaydi\x1b[0m");

    const student2 = await mkUser("student", 2, { enrolledAt: enrolled });
    await inBranch(() => groupsSvc.addStudent(group._id, student2._id, { joinedAt: enrolled }));

    // A'zolik joriy oy uchun qator YARATGAN (tarif 0 bo'lgani uchun summa
    // nol). Yangisini yaratmaymiz - unique indeks to'g'ri ishlayotgani
    // uchun bu E11000 berardi; mavjud qatorga summa yozamiz.
    const charge = await StudentPayment.findOneAndUpdate(
      { student: student2._id, group: group._id, year: Y, month: M, isOpening: false },
      { $set: { baseFee: 400_000, expectedAmount: 400_000 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    st = await inBranch(() => ledgerSvc.statementFor(student2._id));
    eq("Hisoblangan oylik qarz sifatida ko'rindi", st.currentBalance, -400_000);

    // Depozitga 400 000 tushadi va avtomatik qarzga qoplanadi.
    const depositSvc = await import("../src/modules/deposits/services/deposit.service.js");
    await inBranch(() =>
      depositSvc.topup(student2._id, { amount: 400_000, method: "cash" }, null),
    );

    const chargeAfter = await StudentPayment.findById(charge._id).lean();
    eq("Depozit qarzni yopdi", chargeAfter.paidAmount, 400_000);

    st = await inBranch(() => ledgerSvc.statementFor(student2._id));
    // +400 000 (depozit kirimi) va -400 000 (qarz) → 0.
    // Agar qoplama ham qator bo'lganida +400 000 bo'lib chiqardi.
    eq("Depozit qoplamasidan keyin balans nol", st.currentBalance, 0);

    // ═════════ 5. BALANS SAQLANMAYDI - QAYTA HISOBLANADI ═════════
    console.log("\n\x1b[1m5) Balans hech qayerda saqlanmaydi\x1b[0m");

    // Manba hujjat o'zgarsa balans DARHOL ergashadi. Agar balans
    // alohida maydonda keshlangan bo'lganida - bu yerda eski qiymat
    // chiqardi.
    await StudentPayment.updateOne({ _id: charge._id }, { $set: { expectedAmount: 600_000 } });
    st = await inBranch(() => ledgerSvc.statementFor(student2._id));
    eq("Manba o'zgarishi balansga darhol ta'sir qildi", st.currentBalance, -200_000);

    const userDoc = await User.findById(student2._id).lean();
    if (userDoc.balance === undefined && userDoc.currentBalance === undefined) {
      ok("User hujjatida yoziladigan 'balance' maydoni yo'q");
    } else {
      bad("User hujjatida yoziladigan 'balance' maydoni yo'q", "maydon topildi");
    }

    // ═════════ 6. TARIXNI BUZMASLIK (spetsifikatsiya §6) ═════════
    console.log("\n\x1b[1m6) hiredAt o'zgarishi eski oylarga maosh yaratmaydi\x1b[0m");

    const salariesBefore = await TeacherSalary.countDocuments({ teacher: teacher._id });
    const balanceBefore = (await inBranch(() => ledgerSvc.statementFor(teacher._id)))
      .currentBalance;

    // Ishga qabul sanasini 8 oy orqaga suramiz.
    await User.updateOne(
      { _id: teacher._id },
      { $set: { hiredAt: new Date(Date.UTC(Y - 1, now.getUTCMonth(), 1)) } },
    );

    const salariesAfter = await TeacherSalary.countDocuments({ teacher: teacher._id });
    const balanceAfter = (await inBranch(() => ledgerSvc.statementFor(teacher._id)))
      .currentBalance;

    eq("Yangi maosh qatori yaratilmadi", salariesAfter, salariesBefore);
    eq("Balans o'zgarmadi", balanceAfter, balanceBefore);
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
