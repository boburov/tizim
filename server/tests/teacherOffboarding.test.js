/**
 * O'QITUVCHINI ISHDAN BO'SHATISH OQIMI TESTI.
 *
 * SAVOL: "Hech qachon ishlamagan o'qituvchini nega o'chirib bo'lmasdi, va
 * haqiqiy qarzdorni o'chirishdan nima to'sib turibdi?"
 *
 * Eski qorovul maosh qatorlarini shunchaki SANARDI. Oylik cron esa har oy
 * HAR BIR o'qituvchiga bo'sh (0 hisoblangan, 0 to'langan) `base`/`group`
 * qatorini ochadi - natijada xato kiritilgan xodim bir yildan keyin
 * "12 ta maosh yozuvi" tufayli abadiy o'chmas bo'lib qolardi.
 *
 * Bu test uchta himoyani qulflaydi:
 *   1. BO'SH qator o'chirishni TO'SMAYDI (materiallik tekshiruvi);
 *   2. PULI bor qator va haqiqiy to'lov HAR DOIM to'sadi (tarix buzilmasin);
 *   3. "Hisobni yopish" qoldiqni ANIQ nolga tushiradi va ikki marta
 *      hisoblamaydi (mavjud jarima ham NET balansga kiradi).
 *
 * IZOLYATSIYA: alohida "<db>_offboarding_test" bazasida ishlaydi va oxirida
 * o'zini o'chiradi - ishchi bazaga TEGMAYDI.
 *
 * ISHLATISH:
 *   npm run test:offboarding
 */
import "dotenv/config";
import mongoose from "mongoose";

const BASE_DB = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/bayyina";
// Ishchi bazani ifloslantirmaslik uchun nomga qo'shimcha qo'shamiz.
const DB = BASE_DB.replace(/(\/[^/?]+)(\?|$)/, "$1_offboarding_test$2");

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
const check = (name, cond, detail = "") =>
  cond ? ok(name) : bad(name, detail || "shart bajarilmadi");
const money = (n) => new Intl.NumberFormat("ru-RU").format(n || 0);

// Xato kutilgan chaqiruv: xabarni qaytaradi, muvaffaqiyat bo'lsa null.
const expectThrow = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e?.message || String(e);
  }
};

const run = async () => {
  await mongoose.connect(DB);
  await mongoose.connection.dropDatabase(); // har yurishda toza boshlanadi

  const User = (await import("../src/models/user.model.js")).default;
  const Branch = (await import("../src/models/branch.model.js")).default;
  const Group = (await import("../src/models/group.model.js")).default;
  const TeacherSalary = (await import("../src/models/teacherSalary.model.js")).default;
  const SalaryTransaction = (await import("../src/models/salaryTransaction.model.js"))
    .default;
  const TeacherGroupPeriod = (
    await import("../src/models/teacherGroupPeriod.model.js")
  ).default;
  const Attendance = (await import("../src/models/attendance.model.js")).default;

  const usersService = await import("../src/modules/users/services/users.service.js");
  const adjustmentService = await import(
    "../src/modules/teacherSalary/services/salaryAdjustment.service.js"
  );

  const branch = await Branch.create({ name: "Asosiy", isMain: true, isActive: true });
  const owner = await User.create({
    firstName: "Ega",
    lastName: "Egayev",
    username: "owner_offb",
    passwordHash: "x",
    role: "owner",
    homeBranchId: branch._id,
  });

  let seq = 0;
  const mkTeacher = async (first) =>
    User.create({
      firstName: first,
      lastName: "Testov",
      username: `t_offb_${(seq += 1)}`,
      passwordHash: "x",
      role: "teacher",
      homeBranchId: branch._id,
    });

  const mkSalary = (teacher, over = {}) =>
    TeacherSalary.create({
      branchId: branch._id,
      teacher: teacher._id,
      kind: "base",
      year: 2026,
      month: 1,
      expectedAmount: 0,
      paidAmount: 0,
      ...over,
    });

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m1) BO'SH qatorlar o'chirishni to'smaydi\x1b[0m");

  // Cron 12 oy davomida yaratgan bo'sh qatorlar + hech narsa bermagan davr.
  const clean = await mkTeacher("Bosh");
  const cronGroup = new mongoose.Types.ObjectId(); // "group" qatori guruhsiz bo'lmaydi
  for (let m = 1; m <= 12; m += 1) {
    await mkSalary(
      clean,
      m % 2 ? { month: m, kind: "base" } : { month: m, kind: "group", group: cronGroup },
    );
  }
  // Ochilgan kuniyoq yopilgan davr - bir kun ham dars bo'lmagan.
  const sameDay = new Date("2026-03-05T00:00:00.000Z");
  await TeacherGroupPeriod.create({
    teacher: clean._id,
    group: new mongoose.Types.ObjectId(),
    startDate: sameDay,
    endDate: sameDay,
  });

  const cleanErr = await expectThrow(() =>
    usersService.permanentRemove(clean._id, owner, { confirmName: "Bosh Testov" }),
  );
  check(
    "12 ta bo'sh qator + nol uzunlikdagi davr — o'chdi",
    cleanErr === null,
    `to'sib qoldi: ${cleanErr}`,
  );
  check(
    "o'chirilgach foydalanuvchi bazada yo'q",
    (await User.countDocuments({ _id: clean._id })) === 0,
  );

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m2) PULI bor tarix har doim to'sadi\x1b[0m");

  const owed = await mkTeacher("Qarzdor");
  for (let m = 1; m <= 6; m += 1) {
    await mkSalary(owed, { month: m, expectedAmount: 2_935_483 });
  }
  const owedErr = await expectThrow(() =>
    usersService.permanentRemove(owed._id, owner, { confirmName: "Qarzdor Testov" }),
  );
  check("to'lanmagan maoshi bor o'qituvchi — to'sildi", owedErr !== null);
  check(
    "xabarda to'lanmagan qoldiq ko'rsatilgan",
    !!owedErr && owedErr.includes(money(6 * 2_935_483)),
    `xabar: ${owedErr}`,
  );
  check(
    "xabar keyingi qadamni aytadi (Hisobni yopish)",
    !!owedErr && owedErr.includes("Hisobni yopish"),
  );

  // To'liq to'langan, lekin haqiqiy to'lov yozuvi bor - baribir to'silishi kerak.
  const paid = await mkTeacher("Tolangan");
  const paidRow = await mkSalary(paid, {
    expectedAmount: 1_000_000,
    paidAmount: 1_000_000,
  });
  await SalaryTransaction.create({
    branchId: branch._id,
    teacher: paid._id,
    salary: paidRow._id,
    year: 2026,
    month: 1,
    amount: 1_000_000,
    method: "cash",
    paidAt: new Date(),
  });
  const paidErr = await expectThrow(() =>
    usersService.permanentRemove(paid._id, owner, { confirmName: "Tolangan Testov" }),
  );
  check("to'lovi bo'lgan o'qituvchi — to'sildi", paidErr !== null, "o'chib ketdi!");

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m3) Davomat o'chirishni to'smaydi, lekin YO'QOLMAYDI ham\x1b[0m");

  const marker = await mkTeacher("Belgilagan");
  const grp = await Group.create({
    branchId: branch._id,
    name: "Test guruh",
    course: new mongoose.Types.ObjectId(),
    startDate: new Date("2026-01-05T00:00:00.000Z"),
    schedule: [{ day: "mon", startTime: "10:00", endTime: "12:00" }],
  });
  const student = await User.create({
    firstName: "Oquvchi",
    lastName: "Testov",
    username: "s_offb_1",
    passwordHash: "x",
    role: "student",
    homeBranchId: branch._id,
  });
  const att = await Attendance.create({
    group: grp._id,
    student: student._id,
    date: new Date("2026-01-05T00:00:00.000Z"),
    dateKey: "2026-01-05",
    status: "present",
    recordedBy: marker._id,
  });

  const markerErr = await expectThrow(() =>
    usersService.permanentRemove(marker._id, owner, {
      confirmName: "Belgilagan Testov",
    }),
  );
  check(
    "faqat davomat belgilagan o'qituvchi — o'chdi",
    markerErr === null,
    `to'sib qoldi: ${markerErr}`,
  );
  const attAfter = await Attendance.findById(att._id).lean();
  check("davomat yozuvi JOYIDA qoldi", !!attAfter, "davomat o'chib ketdi!");
  check(
    "davomatning 'kim belgiladi' havolasi uzildi (null)",
    !!attAfter && attAfter.recordedBy === null,
    `recordedBy: ${attAfter?.recordedBy}`,
  );

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m4) Hisobni yopish qoldiqni aniq nolga tushiradi\x1b[0m");

  const balanceOf = async (teacherId) => {
    const rows = await TeacherSalary.find(
      { teacher: teacherId, isDeleted: { $ne: true } },
      { expectedAmount: 1, paidAmount: 1 },
    ).lean();
    return rows.reduce(
      (s, r) => s + (r.expectedAmount || 0) - (r.paidAmount || 0),
      0,
    );
  };

  const before = await balanceOf(owed._id);
  check("yopishdan oldin qoldiq bor", before === 6 * 2_935_483, `${money(before)}`);

  const res = await adjustmentService.settleBalance(
    owed._id,
    { reason: "Ishdan bo'shatildi, hisob-kitob yopildi" },
    owner,
  );
  check("yopilgan summa qoldiqqa teng", res.settled === before, `${money(res.settled)}`);

  const after = await balanceOf(owed._id);
  check("yopilgandan keyin qoldiq = 0", after === 0, `${money(after)}`);

  const dedRow = await TeacherSalary.findById(res.adjustment._id).lean();
  check("jarima qatori manfiy summa bilan yozilgan", dedRow?.expectedAmount === -before);
  check("jarima turi deduction", dedRow?.kind === "deduction");

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m5) Ikki marta yopilmaydi / mavjud jarima ikki marta sanalmaydi\x1b[0m");

  const twice = await expectThrow(() =>
    adjustmentService.settleBalance(owed._id, { reason: "yana" }, owner),
  );
  check("qoldiq 0 bo'lgach ikkinchi yopish rad etildi", twice !== null);

  // Qisman jarima allaqachon yozilgan holat: NET balans yopilishi kerak.
  const partial = await mkTeacher("Qisman");
  await mkSalary(partial, { expectedAmount: 5_000_000 });
  await adjustmentService.create(
    {
      teacher: partial._id,
      kind: "deduction",
      amount: 2_000_000,
      year: 2026,
      month: 1,
      reason: "kechikish",
      branchId: branch._id,
    },
    owner,
  );
  const partialRes = await adjustmentService.settleBalance(
    partial._id,
    { reason: "bo'shatildi" },
    owner,
  );
  check(
    "mavjud jarima hisobga olindi (5 mln - 2 mln = 3 mln)",
    partialRes.settled === 3_000_000,
    `yopildi: ${money(partialRes.settled)}`,
  );
  check("NET balans nolga tushdi", (await balanceOf(partial._id)) === 0);

  // ─────────────────────────────────────────────────────────────────
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();

  console.log(
    `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
      `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}`,
  );
  if (R.notes.length) {
    console.log("\nYiqilganlar:");
    R.notes.forEach((n) => console.log(`  - ${n}`));
  }
  process.exit(R.fail ? 1 : 0);
};

run().catch((err) => {
  console.error("Test ishga tushmadi:", err);
  process.exit(1);
});
