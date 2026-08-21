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
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * IZOLYATSIYA. Ilgari alohida Mongo bazasi (`lc_leak_test`) ochilib,
 * oxirida `dropDatabase()` qilinardi. PostgreSQL'da bu naqsh ishlamaydi,
 * shuning uchun izolyatsiya PREFIKSLI FIXTURE + kafolatli tozalash bilan
 * (`tests/helpers/prismaFixtures.js`).
 *
 * ⚠ BUNING MUHIM OQIBATI BOR: endi test HAQIQIY dev bazasida ishlaydi,
 * ya'ni unda BOSHQA (begona) ma'lumot ham bor. Shuning uchun:
 *
 *   • "sizish" tekshiruvi AVVALGIDEK ishlaydi — u B filialining ANIQ
 *     ID'larini qidiradi, umumiy son emas;
 *   • "SON SIZISHI" bo'limi esa BO'M-BO'SH filial (C) yaratadi va
 *     uning kontekstida har qanday musbat son sizish hisoblanadi —
 *     bu ham bazadagi begona ma'lumotdan mustaqil.
 *
 * RUXSAT/ROL: ilgari test o'z `Permission` qatorlarini yaratardi
 * (bo'sh bazada boshqa yo'l yo'q edi). Endi ular SEED bilan boshqariladi
 * va test faqat MAVJUD ruxsatlarga `connect` qiladi — katalogga doimiy
 * test qatori qo'shilmasligi uchun.
 *
 * ISHLATISH:  npm run test:leak
 *
 * Yangi ro'yxat funksiyasi qo'shsangiz - shu yerga bitta qator qo'shing.
 * Sinovdan o'tmagan funksiya = potentsial sizish.
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import { enableBranchGuard, getViolations } from "./helpers/branchGuard.js";
import { createFixtures } from "./helpers/prismaFixtures.js";

const fx = createFixtures();
let restoreGuard = () => {};

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
  // SO'ROV QO'RIQCHISI: filtrsiz so'rovlarni yozib boradi.
  restoreGuard = enableBranchGuard();

  const { runWithBranchContext } = await import(
    "../src/helpers/branchContext.helper.js"
  );
  const { invalidateRoleCache } = await import(
    "../src/helpers/permission.helper.js"
  );

  // ─── Rol ───
  //
  // ⚠ `Permission` QATORLARI YARATILMAYDI — ular seed bilan boshqariladi
  // va katalogga test qatori qo'shilsa u DOIMIY qolib ketardi. Fixture
  // yordamchisi mavjud kalitlarga `connect` qiladi va kalit topilmasa
  // ANIQ xato beradi (jimgina ruxsatsiz rol yaratmaydi).
  await fx.role("leak-director", [
    "users.read", "finance.read", "finance.pay", "salary.read", "salary.pay",
    "groups.read", "attendance.read", "leads.read", "grades.read",
    "notifications.read", "notifications.send", "feedback.read",
    "activity_logs.read", "admin_dashboard.read", "branches.read", "rating.read",
  ]);
  invalidateRoleCache();

  // ─── Ikki filial, har birida to'liq ma'lumot ───
  const A = await fx.branch("A-FILIAL");
  const B = await fx.branch("B-FILIAL");

  const mkUser = (n, role, branch) =>
    fx.user(n, { firstName: n, lastName: "X", passwordHash: "p", role, homeBranchId: branch.id });

  const teachA = await mkUser("TeachA", "teacher", A);
  const teachB = await mkUser("TeachB", "teacher", B);
  const studA = await mkUser("StudA", "student", A);
  const studB = await mkUser("StudB", "student", B);

  // `Group.teachers` — ko'p-ko'pga bog'lanish (Mongo'da massiv edi).
  const gA = await fx.group("GROUP-A", A.id, { isActive: true, teachers: { connect: [{ id: teachA.id }] } });
  const gB = await fx.group("GROUP-B", B.id, { isActive: true, teachers: { connect: [{ id: teachB.id }] } });

  await fx.membership(gA.id, studA.id, { joinedAt: new Date("2026-01-01") });
  await fx.membership(gB.id, studB.id, { joinedAt: new Date("2026-01-01") });

  await fx.groupFee(gA.id, 2026, 7, 500000);
  await fx.groupFee(gB.id, 2026, 7, 900000);

  const mkPayment = async (branch, stud, g, amount) => {
    const r = await prisma.studentPayment.create({
      data: {
        branchId: branch.id, studentId: stud.id, groupId: g.id, year: 2026, month: 7,
        baseFee: amount, expectedAmount: amount, paidAmount: amount,
      },
    });
    return fx.track("studentPayment", r.id), r;
  };
  const spA = await mkPayment(A, studA, gA, 500000);
  const spB = await mkPayment(B, studB, gB, 900000);

  const mkPayTx = async (branch, sp, stud, g, amount) => {
    const r = await prisma.paymentTransaction.create({
      data: {
        branchId: branch.id, paymentId: sp.id, studentId: stud.id, groupId: g.id,
        year: 2026, month: 7, amount, source: "direct", method: "cash", paidAt: new Date(),
      },
    });
    return fx.track("paymentTransaction", r.id), r;
  };
  await mkPayTx(A, spA, studA, gA, 500000);
  await mkPayTx(B, spB, studB, gB, 900000);

  const mkSalary = async (branch, teach, g, expected, paid) => {
    const r = await prisma.teacherSalary.create({
      data: {
        branchId: branch.id, teacherId: teach.id, groupId: g.id,
        year: 2026, month: 7, expectedAmount: expected, paidAmount: paid,
      },
    });
    return fx.track("teacherSalary", r.id), r;
  };
  const tsA = await mkSalary(A, teachA, gA, 2000000, 1000000);
  const tsB = await mkSalary(B, teachB, gB, 3000000, 1500000);

  const mkSalaryTx = async (branch, ts, teach, g, amount) => {
    const r = await prisma.salaryTransaction.create({
      data: {
        branchId: branch.id, salaryId: ts.id, teacherId: teach.id, groupId: g.id,
        year: 2026, month: 7, amount, method: "cash", paidAt: new Date(),
      },
    });
    return fx.track("salaryTransaction", r.id), r;
  };
  await mkSalaryTx(A, tsA, teachA, gA, 1000000);
  await mkSalaryTx(B, tsB, teachB, gB, 1500000);

  const mkAttendance = async (g, stud, status) => {
    const r = await prisma.attendance.create({
      data: {
        groupId: g.id, studentId: stud.id, date: new Date("2026-07-20"),
        dateKey: "2026-07-20", status, recordedById: teachA.id,
      },
    });
    return fx.track("attendance", r.id), r;
  };
  await mkAttendance(gA, studA, "present");
  await mkAttendance(gB, studB, "absent");

  // FEEDBACK va ACTIVITY LOG - bu modellarda `branchId` YO'Q.
  //
  // Ilgari bu test ular uchun HECH QANDAY yozuv yaratmasdi, ya'ni
  // servislar bo'sh ro'yxat qaytarardi va test ularni "toza" deb
  // belgilardi. Bu SOXTA O'TISH edi: filtr umuman yo'qligini bo'sh
  // natija yashirib turardi.
  const fbType = await prisma.feedbackType.create({
    data: { name: `Shikoyat-${fx.suffix}`, isActive: true },
  });
  fx.track("feedbackType", fbType.id);

  const mkFeedback = async (author, g, message) => {
    const r = await prisma.feedback.create({
      data: { authorId: author.id, typeId: fbType.id, groupId: g.id, message, status: "new" },
    });
    return fx.track("feedback", r.id), r;
  };
  await mkFeedback(studA, gA, `A filial fikri ${fx.suffix}`);
  await mkFeedback(studB, gB, `StudB maxfiy shikoyati ${fx.suffix}`);

  const mkActivityLog = async (u, path) => {
    const r = await prisma.activityLog.create({
      data: {
        userId: u.id, actorLabel: u.firstName, userRole: u.role,
        method: "POST", path, status: 201,
      },
    });
    return fx.track("activityLog", r.id), r;
  };
  await mkActivityLog(teachA, "/api/groups");
  await mkActivityLog(teachB, `/api/groups/B-MAXFIY-${fx.suffix}`);

  const mkLead = async (branch, name, phone) => {
    const r = await prisma.lead.create({
      data: { branchId: branch.id, firstName: `${name}-${fx.suffix}`, phone, status: "new" },
    });
    return fx.track("lead", r.id), r;
  };
  await mkLead(A, "LeadA", "998901111111");
  await mkLead(B, "LeadB", "998902222222");

  // B filialiga tegishli - javobda BULARDAN birortasi chiqmasligi kerak
  const foreign = {
    "B-filial": B.id, "GROUP-B": gB.id, "StudB": studB.id,
    "TeachB": teachB.id, "B-to'lov": spB.id, "B-maosh": tsB.id,
  };

  // A direktori konteksti
  const asA = (fn) =>
    runWithBranchContext(
      { branchId: String(A.id), allowedBranchIds: [String(A.id)], canSeeAllBranches: false },
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
  const RANGE = { fromDate: "2026-07-01", toDate: "2026-07-31" };

  const CASES = [
    ["users.list", () => users.list({ status: "active", limit: 100 })],
    // XODIMLAR ro'yxati va uning statistikasi - ikkalasi ham alohida
    // predikat bilan ishlaydi, shuning uchun alohida tekshiriladi.
    ["users.list(staff)", () => users.list({ staff: true, status: "active", limit: 100 })],
    ["users.staffStats", () => users.staffStats()],
    ["groups.list", () => groups.list({ limit: 100 })],
    ["groups.getById(B)", () => groups.getById(gB.id)],
    ["groups.history(B)", () => groups.history(gB.id, {})],
    ["groups.listMemberships(B)", () => groups.listMemberships(gB.id, studB.id)],
    ["attendance.getDashboardStats", () => attendance.getDashboardStats({ fromDate: "2026-07-01", toDate: "2026-07-31" })],
    ["attendance.getGroupSummary(B)", () => attendance.getGroupSummary(gB.id, { fromDate: "2026-07-01", toDate: "2026-07-31" })],
    ["attendance.getGroupMonthly(B)", () => attendance.getGroupMonthly(gB.id, P)],
    ["attendance.getStudentSummary(B)", () => attendance.getStudentSummary(studB.id, { fromDate: "2026-07-01", toDate: "2026-07-31" })],
    ["leads.list", () => leads.list({ limit: 100 })],
    ["leads.stats", () => leads.stats({})],
    ["financeReport.getSummary", () => finReport.getSummary(P)],
    ["financeReport.getWriteOffs", () => finReport.getWriteOffs(P)],
    ["financeReport.getLedger", () => finReport.getLedger(P)],
    ["financeReport.getGroupBreakdown", () => finReport.getGroupBreakdown(P)],
    ["studentPayment.list", () => studentPayment.list({ ...P, limit: 100 })],
    ["studentPayment.obligations", () => studentPayment.obligations(P)],
    ["studentPayment.historyByStudent(B)", () => studentPayment.historyByStudent(studB.id)],
    ["groupFee.list", () => groupFee.list({ ...P, limit: 100 })],
    ["discount.list", () => discount.list({ limit: 100 })],
    ["deposits.list", () => deposits.list({ limit: 100 })],
    ["deposits.report", () => deposits.report({})],
    ["salary.list", () => salary.list({ ...P, limit: 100 })],
    ["salary.obligations", () => salary.obligations(P)],
    ["salary.historyByTeacher(B)", () => salary.historyByTeacher(teachB.id)],
    ["dashboard.getOverview", () => dashboard.getOverview({})],
    ["dashboard.getStudentFlow", () => dashboard.getStudentFlow({})],
    ["dashboard.getCashflow", () => dashboard.getCashflow({})],
    ["studentStats.getStudentStats", () => studentStats.getStudentStats({})],
    ["search.globalSearch", () => search.globalSearch("B")],
    ["activityLogs.list", () => activityLogs.list({ limit: 100 })],
    ["activityLogs.getStats", () => activityLogs.getStats({})],
    // ⚠ `getGroupSummary` sana DIAPAZONI oladi ({fromDate,toDate}), oy
    // raqamini EMAS. Ilgari unga `P` ({year,month}) uzatilardi va chaqiruv
    // "Sana noto'g'ri" bilan yiqilib, holat O'TKAZIB YUBORILARDI — ya'ni bu
    // yo'l umuman O'LCHANMASDI.
    ["grades.getGroupSummary(B)", () => grades.getGroupSummary(gB.id, RANGE)],
    ["grades.getStudentSummary(B)", () => grades.getStudentSummary(studB.id, P)],
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

  await mustThrow("groups.update(B)", () => groups.update(gB.id, { name: "BUZILDI" }));
  await mustThrow("groups.permanentRemove(B)", () =>
    groups.permanentRemove(gB.id, { _id: teachA.id }, { confirmName: "GROUP-B" }),
  );
  await mustThrow("groupFee.upsert(B)", () =>
    groupFee.upsert({ groupId: gB.id, year: 2026, month: 7, amount: 1 }, { _id: teachA.id }),
  );
  await mustThrow("finance.transaction.create(B-plan)", () =>
    financeTxn.create({ paymentId: spB.id, amount: 1000, method: "cash" }, { _id: teachA.id }),
  );
  await mustThrow("salary.transaction.create(B-maosh)", () =>
    salaryTxn.create(
      { salaryId: tsB.id, amount: 1000, method: "cash" },
      { _id: teachA.id, permissions: ["salary.pay"] },
    ),
  );
  await mustThrow("attendance.bulkRecord(B-guruh)", () =>
    attendance.bulkRecord(
      gB.id,
      { dateKey: "2026-07-25", records: [{ student: studB.id, status: "present" }] },
      { _id: teachA.id },
    ),
  );

  // B filialining ma'lumoti HALI HAM joyidami (yozuv amallari o'tib ketmadimi)
  const gBAfter = await prisma.group.findUnique({ where: { id: gB.id } });
  // ⚠ Nom fixture SUFFIKSI bilan yaratiladi (`GROUP-B-<suffix>`), shuning
  // uchun qattiq satr emas, YARATILGAN qiymat bilan solishtiriladi.
  if (gBAfter && gBAfter.name === gB.name) ok("B-guruh o'zgarmagan (yakuniy tekshiruv)");
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

  const C = await fx.branch("C-BOSH-FILIAL");
  const asC = (fn) =>
    runWithBranchContext(
      { branchId: String(C.id), allowedBranchIds: [String(C.id)], canSeeAllBranches: false },
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

};

run()
  .catch((err) => {
    bad("TEST ISHGA TUSHMADI", err?.message || String(err));
    if (process.env.DEBUG) console.error(err);
  })
  .finally(async () => {
    // ⚠ QO'RIQCHI AVVAL TIKLANADI: tozalash so'rovlari uning ro'yxatiga
    // tushmasligi kerak (ular ataylab filtrsiz — ID bo'yicha o'chirish).
    restoreGuard();
    const problems = await fx.cleanup();
    const leftovers = await fx.assertClean();
    if (problems.length) bad("fixture tozalash", problems.join(" · "));
    else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
    else ok(`fixture tozalandi (${fx.suffix})`);

    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${results.pass} toza\x1b[0m / ` +
        `\x1b[31m${results.fail} sizish\x1b[0m / \x1b[33m${results.skip} o'tkazib yuborildi\x1b[0m`,
    );
    if (results.failures.length) {
      console.log("\n\x1b[31mSIZAYOTGAN funksiyalar:\x1b[0m");
      for (const f of results.failures) console.log(`  • ${f.name} — ${f.detail}`);
    }
    await prisma.$disconnect().catch(() => {});
    process.exit(results.fail > 0 ? 1 : 0);
  });
