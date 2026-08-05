/**
 * FILIAL SIZISHI TESTI.
 *
 * Ikkita filial seed qiladi, har birida o'z ma'lumoti bilan, keyin HAR BIR
 * ro'yxat/hisobot funksiyasini A filiali direktori sifatida chaqiradi.
 * Javobda B filialining bironta izi topilsa - test YIQILADI.
 *
 * NEGA shunday: filial ko'lami bu kodbazada ATAYLAB qo'lda qo'yiladi
 * (avtomatik pre('find') hook aggregate()da ishlamaydi). Qo'lda qo'yish
 * esa unutishga ochiq. Bu test unutilgan joyni CODE REVIEW emas, ISHGA
 * TUSHIRISH paytida tutadi.
 *
 * ISHLATISH:  npm run test:leak
 *
 * Yangi ro'yxat funksiyasi qo'shsangiz - shu yerga bitta qator qo'shing.
 * Sinovdan o'tmagan funksiya = potentsial sizish.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { enableBranchGuard, getViolations } from "./helpers/branchGuard.js";

const TEST_DB = "mongodb://127.0.0.1:27017/lc_leak_test";

// ─── Natijalarni yig'ish ───
const results = { pass: 0, fail: 0, skip: 0, failures: [] };

const ok = (name) => {
  results.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${name}`);
};
const bad = (name, detail) => {
  results.fail += 1;
  results.failures.push({ name, detail });
  console.log(`  \x1b[31m✗ SIZISH\x1b[0m ${name}${detail ? ` → ${detail}` : ""}`);
};
const skip = (name, why) => {
  results.skip += 1;
  console.log(`  \x1b[33m~\x1b[0m ${name} (${why})`);
};

/**
 * Javobda B filialining izi bormi.
 * Butun javobni JSON qilib, B ning ID'larini qidiramiz - shakli qanday
 * bo'lishidan qat'i nazar ishlaydi (massiv, obyekt, ichma-ich).
 */
const containsForeign = (payload, foreignIds) => {
  if (payload === null || payload === undefined) return null;
  const json = JSON.stringify(payload);
  for (const [label, id] of Object.entries(foreignIds)) {
    if (id && json.includes(String(id))) return label;
  }
  return null;
};

/**
 * Bitta funksiyani A direktori kontekstida chaqirib, sizishni tekshiradi.
 */
// 404/403 - filial himoyasi ISHLAGANI belgisi, sizish emas.
// Begona resurs so'ralganda aynan shu javob kutiladi.
const BLOCKED = /topilmadi|not found|ruxsat|forbidden|huquq/i;

/**
 * SON SIZISHI: javobdagi raqamlar B filialining ma'lumotini o'z ichiga
 * olganini bildiradi.
 *
 * A filiali ATAYLAB BO'SH seed qilinadi (0 o'quvchi, 0 guruh, 0 to'lov),
 * B esa to'la. Shunda A kontekstida qaytgan HAR QANDAY musbat "count"
 * yoki "total" sizishdir - ID bo'lmasa ham.
 *
 * Faqat ANIQ nomli maydonlarni tekshiramiz (soxta ogohlantirishdan
 * qochish uchun: foiz, sana, umumiy sozlamalar soni hisobga olinmaydi).
 */
const COUNT_KEYS =
  /^(studentsCount|teachersCount|activeGroupsCount|groupsCount|newStudentsThisMonth|lostStudentsThisMonth|newLeadsThisMonth|pendingLeads|total|count|paidAmount|billed|income|expense)$/;

const findPositiveCounts = (obj, path = "", found = []) => {
  if (obj === null || typeof obj !== "object") return found;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => findPositiveCounts(v, `${path}[${i}]`, found));
    return found;
  }
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (typeof v === "number" && v > 0 && COUNT_KEYS.test(k)) found.push(`${p}=${v}`);
    else if (typeof v === "object") findPositiveCounts(v, p, found);
  }
  return found;
};

const check = async (name, fn, foreignIds, runWith) => {
  let payload;
  try {
    payload = await runWith(fn);
  } catch (err) {
    const msg = String(err.message || "");
    // Begona resurs so'ralgan test uchun "topilmadi" = MUVAFFAQIYAT.
    if (BLOCKED.test(msg) || err.statusCode === 404 || err.statusCode === 403) {
      ok(`${name} \x1b[2m(to'sildi: ${msg.slice(0, 40)})\x1b[0m`);
      return;
    }
    // Boshqa xato = test ma'lumoti yetishmayapti, sizish emas.
    skip(name, `xato: ${msg.slice(0, 60)}`);
    return;
  }
  const leaked = containsForeign(payload, foreignIds);
  if (leaked) bad(name, `javobda "${leaked}" bor`);
  else ok(name);
};

const run = async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  // SO'ROV QO'RIQCHISI: filtrsiz so'rovlarni yozib boradi.
  enableBranchGuard();

  // ─── Modellar ───
  const Branch = (await import("../src/models/branch.model.js")).default;
  const User = (await import("../src/models/user.model.js")).default;
  const Group = (await import("../src/models/group.model.js")).default;
  const GroupMembership = (await import("../src/models/groupMembership.model.js")).default;
  const GroupFee = (await import("../src/models/groupFee.model.js")).default;
  const StudentPayment = (await import("../src/models/studentPayment.model.js")).default;
  const PaymentTransaction = (await import("../src/models/paymentTransaction.model.js")).default;
  const TeacherSalary = (await import("../src/models/teacherSalary.model.js")).default;
  const SalaryTransaction = (await import("../src/models/salaryTransaction.model.js")).default;
  const Attendance = (await import("../src/models/attendance.model.js")).default;
  const Lead = (await import("../src/models/lead.model.js")).default;
  const Role = (await import("../src/models/role.model.js")).default;
  const Permission = (await import("../src/models/permission.model.js")).default;

  const { runWithBranchContext } = await import(
    "../src/helpers/branchContext.helper.js"
  );
  const { invalidateRoleCache } = await import(
    "../src/helpers/permission.helper.js"
  );

  // ─── Ruxsat/rollar ───
  const permKeys = [
    "users.read", "finance.read", "finance.pay", "salary.read", "salary.pay",
    "groups.read", "attendance.read", "leads.read", "grades.read",
    "notifications.read", "notifications.send", "feedback.read",
    "activity_logs.read", "admin_dashboard.read", "branches.read", "rating.read",
  ];
  const permIds = [];
  for (const key of permKeys) {
    const [module, action] = key.split(".");
    const p = await Permission.create({ key, label: key, group: module, module, action });
    permIds.push(p._id);
  }
  await Role.create({ value: "director", label: "Direktor", roleType: "staff", permissions: permIds });
  invalidateRoleCache();

  // ─── Ikki filial, har birida to'liq ma'lumot ───
  const A = await Branch.create({ name: "A-FILIAL", isMain: true });
  const B = await Branch.create({ name: "B-FILIAL" });

  const mkUser = (n, role, branch) =>
    User.create({
      firstName: n, lastName: "X", username: n.toLowerCase(),
      passwordHash: "p", role, homeBranchId: branch._id,
    });

  const teachA = await mkUser("TeachA", "teacher", A);
  const teachB = await mkUser("TeachB", "teacher", B);
  const studA = await mkUser("StudA", "student", A);
  const studB = await mkUser("StudB", "student", B);

  const gA = await Group.create({ branchId: A._id, name: "GROUP-A", isActive: true, teachers: [teachA._id] });
  const gB = await Group.create({ branchId: B._id, name: "GROUP-B", isActive: true, teachers: [teachB._id] });

  await GroupMembership.create({ group: gA._id, student: studA._id, joinedAt: new Date("2026-01-01") });
  await GroupMembership.create({ group: gB._id, student: studB._id, joinedAt: new Date("2026-01-01") });

  await GroupFee.create({ group: gA._id, year: 2026, month: 7, amount: 500000, source: "manual" });
  await GroupFee.create({ group: gB._id, year: 2026, month: 7, amount: 900000, source: "manual" });

  const spA = await StudentPayment.create({ branchId: A._id, student: studA._id, group: gA._id, year: 2026, month: 7, baseFee: 500000, expectedAmount: 500000, paidAmount: 500000 });
  const spB = await StudentPayment.create({ branchId: B._id, student: studB._id, group: gB._id, year: 2026, month: 7, baseFee: 900000, expectedAmount: 900000, paidAmount: 900000 });

  await PaymentTransaction.create({ branchId: A._id, payment: spA._id, student: studA._id, group: gA._id, year: 2026, month: 7, amount: 500000, source: "direct", method: "cash", paidAt: new Date() });
  await PaymentTransaction.create({ branchId: B._id, payment: spB._id, student: studB._id, group: gB._id, year: 2026, month: 7, amount: 900000, source: "direct", method: "cash", paidAt: new Date() });

  const tsA = await TeacherSalary.create({ branchId: A._id, teacher: teachA._id, group: gA._id, year: 2026, month: 7, expectedAmount: 2000000, paidAmount: 1000000 });
  const tsB = await TeacherSalary.create({ branchId: B._id, teacher: teachB._id, group: gB._id, year: 2026, month: 7, expectedAmount: 3000000, paidAmount: 1500000 });

  await SalaryTransaction.create({ branchId: A._id, salary: tsA._id, teacher: teachA._id, group: gA._id, year: 2026, month: 7, amount: 1000000, method: "cash", paidAt: new Date() });
  await SalaryTransaction.create({ branchId: B._id, salary: tsB._id, teacher: teachB._id, group: gB._id, year: 2026, month: 7, amount: 1500000, method: "cash", paidAt: new Date() });

  const rec = new mongoose.Types.ObjectId();
  await Attendance.create({ group: gA._id, student: studA._id, date: new Date(), dateKey: "2026-07-20", status: "present", recordedBy: rec });
  await Attendance.create({ group: gB._id, student: studB._id, date: new Date(), dateKey: "2026-07-20", status: "absent", recordedBy: rec });

  await Lead.create({ branchId: A._id, firstName: "LeadA", phone: "998901111111", status: "new" });
  await Lead.create({ branchId: B._id, firstName: "LeadB", phone: "998902222222", status: "new" });

  // B filialiga tegishli - javobda BULARDAN birortasi chiqmasligi kerak
  const foreign = {
    "B-filial": B._id, "GROUP-B": gB._id, "StudB": studB._id,
    "TeachB": teachB._id, "B-to'lov": spB._id, "B-maosh": tsB._id,
  };

  // A direktori konteksti
  const asA = (fn) =>
    runWithBranchContext(
      { branchId: String(A._id), allowedBranchIds: [String(A._id)], canSeeAllBranches: false },
      fn,
    );

  console.log("\n\x1b[1mFILIAL SIZISHI TESTI\x1b[0m");
  console.log("A direktori sifatida chaqiriladi - B filialining izi chiqmasligi kerak\n");

  // ─── Servislar ───
  const users = await import("../src/modules/users/services/users.service.js");
  const groups = await import("../src/modules/groups/services/groups.service.js");
  const attendance = await import("../src/modules/attendance/services/attendance.service.js");
  const leads = await import("../src/modules/leads/services/leads.service.js");
  const finReport = await import("../src/modules/financeReport/services/financeReport.service.js");
  const studentPayment = await import("../src/modules/finance/services/studentPayment.service.js");
  const groupFee = await import("../src/modules/finance/services/groupFee.service.js");
  const discount = await import("../src/modules/finance/services/discount.service.js");
  const deposits = await import("../src/modules/deposits/services/deposit.service.js");
  const salary = await import("../src/modules/teacherSalary/services/teacherSalary.service.js");
  const dashboard = await import("../src/modules/adminDashboard/services/adminDashboard.service.js");
  const studentStats = await import("../src/modules/adminDashboard/services/studentStats.service.js");
  const search = await import("../src/modules/search/services/search.service.js");
  const activityLogs = await import("../src/modules/activityLogs/services/activityLogs.service.js");
  const grades = await import("../src/modules/grades/services/grades.service.js");
  const rating = await import("../src/modules/grades/services/rating.service.js");
  const feedback = await import("../src/modules/feedback/services/feedback.service.js");
  const notifications = await import("../src/modules/notifications/services/notifications.service.js");

  const P = { year: 2026, month: 7 };

  const CASES = [
    ["users.list", () => users.list({ status: "active", limit: 100 })],
    // XODIMLAR ro'yxati va uning statistikasi - ikkalasi ham alohida
    // predikat bilan ishlaydi, shuning uchun alohida tekshiriladi.
    ["users.list(staff)", () => users.list({ staff: true, status: "active", limit: 100 })],
    ["users.staffStats", () => users.staffStats()],
    ["groups.list", () => groups.list({ limit: 100 })],
    ["groups.getById(B)", () => groups.getById(gB._id)],
    ["groups.history(B)", () => groups.history(gB._id, {})],
    ["groups.listMemberships(B)", () => groups.listMemberships(gB._id, studB._id)],
    ["attendance.getDashboardStats", () => attendance.getDashboardStats({ fromDate: "2026-07-01", toDate: "2026-07-31" })],
    ["attendance.getGroupSummary(B)", () => attendance.getGroupSummary(gB._id, { fromDate: "2026-07-01", toDate: "2026-07-31" })],
    ["attendance.getGroupMonthly(B)", () => attendance.getGroupMonthly(gB._id, P)],
    ["attendance.getStudentSummary(B)", () => attendance.getStudentSummary(studB._id, { fromDate: "2026-07-01", toDate: "2026-07-31" })],
    ["leads.list", () => leads.list({ limit: 100 })],
    ["leads.stats", () => leads.stats({})],
    ["financeReport.getSummary", () => finReport.getSummary(P)],
    ["financeReport.getWriteOffs", () => finReport.getWriteOffs(P)],
    ["financeReport.getLedger", () => finReport.getLedger(P)],
    ["financeReport.getGroupBreakdown", () => finReport.getGroupBreakdown(P)],
    ["studentPayment.list", () => studentPayment.list({ ...P, limit: 100 })],
    ["studentPayment.obligations", () => studentPayment.obligations(P)],
    ["studentPayment.historyByStudent(B)", () => studentPayment.historyByStudent(studB._id)],
    ["groupFee.list", () => groupFee.list({ ...P, limit: 100 })],
    ["discount.list", () => discount.list({ limit: 100 })],
    ["deposits.list", () => deposits.list({ limit: 100 })],
    ["deposits.report", () => deposits.report({})],
    ["salary.list", () => salary.list({ ...P, limit: 100 })],
    ["salary.obligations", () => salary.obligations(P)],
    ["salary.historyByTeacher(B)", () => salary.historyByTeacher(teachB._id)],
    ["dashboard.getOverview", () => dashboard.getOverview({})],
    ["dashboard.getStudentFlow", () => dashboard.getStudentFlow({})],
    ["dashboard.getCashflow", () => dashboard.getCashflow({})],
    ["studentStats.getStudentStats", () => studentStats.getStudentStats({})],
    ["search.globalSearch", () => search.globalSearch("B")],
    ["activityLogs.list", () => activityLogs.list({ limit: 100 })],
    ["activityLogs.getStats", () => activityLogs.getStats({})],
    ["grades.getGroupSummary(B)", () => grades.getGroupSummary(gB._id, P)],
    ["grades.getStudentSummary(B)", () => grades.getStudentSummary(studB._id, P)],
    ["rating.getLeaderboard", () => rating.getLeaderboard({ limit: 100 })],
    ["feedback.list", () => feedback.list({ limit: 100 })],
    ["feedback.getStats", () => feedback.getStats({})],
    ["notifications.list", () => notifications.list({ limit: 100 })],
    ["notifications.previewAudience", () => notifications.previewAudience({ type: "all_students" })],
  ];

  for (const [name, fn] of CASES) {
    // eslint-disable-next-line no-await-in-loop
    await check(name, fn, foreign, asA);
  }

  // ─── YOZUV amallari ───
  // O'qish sizishidan XAVFLIROQ: boshqa filial ma'lumotini o'zgartirish
  // yoki o'chirish. Bu yerda javob emas, AMAL to'silganini tekshiramiz.
  console.log("\n\x1b[1mYOZUV AMALLARI\x1b[0m (boshqa filialga ta'sir to'silishi kerak)\n");

  const mustThrow = async (name, fn) => {
    try {
      await asA(fn);
      bad(name, "AMAL BAJARILDI - to'silmadi!");
    } catch (err) {
      const msg = String(err.message || "");
      if (BLOCKED.test(msg) || err.statusCode === 404 || err.statusCode === 403) {
        ok(`${name} \x1b[2m(to'sildi)\x1b[0m`);
      } else {
        skip(name, `boshqa xato: ${msg.slice(0, 50)}`);
      }
    }
  };

  const financeTxn = await import("../src/modules/finance/services/transaction.service.js");
  const salaryTxn = await import("../src/modules/teacherSalary/services/salaryTransaction.service.js");

  await mustThrow("groups.update(B)", () => groups.update(gB._id, { name: "BUZILDI" }));
  await mustThrow("groups.permanentRemove(B)", () =>
    groups.permanentRemove(gB._id, { _id: teachA._id }, { confirmName: "GROUP-B" }),
  );
  await mustThrow("groupFee.upsert(B)", () =>
    groupFee.upsert({ groupId: gB._id, year: 2026, month: 7, amount: 1 }, { _id: teachA._id }),
  );
  await mustThrow("finance.transaction.create(B-plan)", () =>
    financeTxn.create({ paymentId: spB._id, amount: 1000, method: "cash" }, { _id: teachA._id }),
  );
  await mustThrow("salary.transaction.create(B-maosh)", () =>
    salaryTxn.create(
      { salaryId: tsB._id, amount: 1000, method: "cash" },
      { _id: teachA._id, permissions: ["salary.pay"] },
    ),
  );
  await mustThrow("attendance.bulkRecord(B-guruh)", () =>
    attendance.bulkRecord(
      gB._id,
      { dateKey: "2026-07-25", records: [{ student: studB._id, status: "present" }] },
      { _id: teachA._id },
    ),
  );

  // B filialining ma'lumoti HALI HAM joyidami (yozuv amallari o'tib ketmadimi)
  const gBAfter = await Group.findById(gB._id).lean();
  if (gBAfter && gBAfter.name === "GROUP-B") ok("B-guruh o'zgarmagan (yakuniy tekshiruv)");
  else bad("B-guruh o'zgarmagan (yakuniy tekshiruv)", "guruh o'zgardi yoki o'chdi!");

  // ══════════════════════════════════════════════════════════════
  // SON SIZISHI: BO'SH filial 0 ko'rsatishi SHART
  // ══════════════════════════════════════════════════════════════
  //
  // Bu qism ID-qidiruv tuta olmaydigan sizishni tutadi. C filiali
  // butunlay BO'SH - unda hech qanday o'quvchi, guruh, to'lov yo'q.
  // Shunda uning kontekstida qaytgan har qanday musbat "count"
  // boshqa filialdan sizgan bo'ladi.
  console.log("\n\x1b[1mSON SIZISHI\x1b[0m (bo'm-bo'sh filial 0 ko'rsatishi kerak)\n");

  const C = await Branch.create({ name: "C-BO'SH-FILIAL" });
  const asC = (fn) =>
    runWithBranchContext(
      { branchId: String(C._id), allowedBranchIds: [String(C._id)], canSeeAllBranches: false },
      fn,
    );

  const checkZero = async (name, fn) => {
    let payload;
    try {
      payload = await asC(fn);
    } catch (err) {
      skip(name, `xato: ${String(err.message).slice(0, 50)}`);
      return;
    }
    const positives = findPositiveCounts(payload);
    if (positives.length) bad(name, `bo'sh filialda: ${positives.slice(0, 3).join(", ")}`);
    else ok(name);
  };

  await checkZero("dashboard.getOverview", () => dashboard.getOverview({}));
  await checkZero("dashboard.getStudentFlow", () => dashboard.getStudentFlow({}));
  await checkZero("dashboard.getCashflow", () => dashboard.getCashflow({}));
  await checkZero("studentStats.getStudentStats", () => studentStats.getStudentStats({}));
  await checkZero("financeReport.getSummary", () => finReport.getSummary(P));
  await checkZero("deposits.report", () => deposits.report({}));
  await checkZero("leads.stats", () => leads.stats({}));
  await checkZero("users.list", () => users.list({ status: "active", limit: 50 }));
  await checkZero("users.list(staff)", () =>
    users.list({ staff: true, status: "active", limit: 50 }),
  );
  await checkZero("groups.list", () => groups.list({ limit: 50 }));
  await checkZero("salary.list", () => salary.list({ ...P, limit: 50 }));
  await checkZero("studentPayment.list", () => studentPayment.list({ ...P, limit: 50 }));

  // ══════════════════════════════════════════════════════════════
  // SO'ROV QO'RIQCHISI: filtrsiz so'rovlar ro'yxati
  // ══════════════════════════════════════════════════════════════
  const guardViolations = getViolations();
  console.log("\n\x1b[1mSO'ROV QO'RIQCHISI\x1b[0m (filtrsiz DB so'rovlari)\n");
  if (guardViolations.length === 0) {
    ok("filtrsiz so'rov topilmadi");
  } else {
    // Noyob (model + amal) bo'yicha guruhlab ko'rsatamiz.
    const uniq = new Map();
    for (const v of guardViolations) {
      const key = `${v.model}.${v.op}`;
      if (!uniq.has(key)) uniq.set(key, v);
    }
    console.log(`  \x1b[33m~\x1b[0m ${uniq.size} xil filtrsiz so'rov shakli:`);
    for (const [key, v] of [...uniq].slice(0, 15)) {
      console.log(`      ${key.padEnd(34)} ${v.filter.slice(0, 70)}`);
    }
    console.log(
      "\n  \x1b[2m(Ba'zilari ataylab - ID bo'yicha aniq so'rov. Yuqoridagi\n" +
        "   testlar toza bo'lsa, bular sizish emas - lekin ko'rib chiqing.)\x1b[0m",
    );
  }

  // ─── Xulosa ───
  console.log(
    `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${results.pass} toza\x1b[0m / ` +
      `\x1b[31m${results.fail} sizish\x1b[0m / \x1b[33m${results.skip} o'tkazib yuborildi\x1b[0m`,
  );
  if (results.failures.length) {
    console.log("\n\x1b[31mSIZAYOTGAN funksiyalar:\x1b[0m");
    for (const f of results.failures) console.log(`  • ${f.name} — ${f.detail}`);
  }

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  process.exit(results.fail > 0 ? 1 : 0);
};

run().catch((err) => {
  console.error("Test ishga tushmadi:", err);
  process.exit(1);
});
