/**
 * MOLIYA IZOLYATSIYASI TESTI (katta hajm).
 *
 * SAVOL: "5 ta filial bo'lsa, ularning to'lovlari aralashib ketmaydimi?"
 *
 * Bu test shu savolga MATEMATIK javob beradi. Har filialning pulini
 * mustaqil hisoblab, servis qaytargan raqam bilan solishtiradi.
 *
 * NEGA katta hajm kerak: 2 filialli kichik fixture ba'zi xatolarni
 * ko'rsatmaydi - ayniqsa KO'CHGAN o'quvchi va IKKI FILIALDA ishlaydigan
 * o'qituvchi holatlarini.
 *
 * ISHLATISH:
 *   npm run seed:multi-branch   (avval ma'lumot)
 *   npm run test:money
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
const money = (n) => new Intl.NumberFormat("uz-UZ").format(n || 0);

const run = async () => {
  await mongoose.connect(DB);

  const Branch = (await import("../src/models/branch.model.js")).default;
  const Group = (await import("../src/models/group.model.js")).default;
  const User = (await import("../src/models/user.model.js")).default;
  const GroupMembership = (await import("../src/models/groupMembership.model.js")).default;
  const StudentPayment = (await import("../src/models/studentPayment.model.js")).default;
  const PaymentTransaction = (await import("../src/models/paymentTransaction.model.js")).default;
  const TeacherSalary = (await import("../src/models/teacherSalary.model.js")).default;
  const SalaryTransaction = (await import("../src/models/salaryTransaction.model.js")).default;

  const { runWithBranchContext } = await import("../src/helpers/branchContext.helper.js");
  const finReport = await import("../src/modules/financeReport/services/financeReport.service.js");
  const dashboard = await import("../src/modules/adminDashboard/services/adminDashboard.service.js");
  const usersSvc = await import("../src/modules/users/services/users.service.js");
  const groupsSvc = await import("../src/modules/groups/services/groups.service.js");

  const branches = await Branch.find({ isDeleted: false }).sort({ name: 1 }).lean();
  if (branches.length < 2) {
    console.log("Kamida 2 filial kerak. Avval: npm run seed:multi-branch");
    process.exit(1);
  }

  const ids = branches.map((b) => String(b._id));
  const asBranch = (b, fn) =>
    runWithBranchContext(
      { branchId: String(b._id), allowedBranchIds: [String(b._id)], canSeeAllBranches: false },
      fn,
    );
  const asAll = (fn) =>
    runWithBranchContext(
      { branchId: null, allowedBranchIds: ids, canSeeAllBranches: true },
      fn,
    );

  console.log(`\n\x1b[1mMOLIYA IZOLYATSIYASI\x1b[0m — ${branches.length} filial\n`);

  // ══════════════════════════════════════════════════════════
  // 1) REFERENTSIAL BUTUNLIK: branchId guruh bilan mos kelishi
  // ══════════════════════════════════════════════════════════
  console.log("\x1b[1m1) Referentsial butunlik\x1b[0m");
  const groupBranch = new Map(
    (await Group.find({}, { branchId: 1 }).lean()).map((g) => [String(g._id), String(g.branchId)]),
  );

  for (const [label, Model] of [
    ["StudentPayment", StudentPayment],
    ["PaymentTransaction", PaymentTransaction],
    ["TeacherSalary", TeacherSalary],
    ["SalaryTransaction", SalaryTransaction],
  ]) {
    const rows = await Model.find({}, { branchId: 1, group: 1 }).lean();
    const drift = rows.filter(
      (r) => r.group && groupBranch.get(String(r.group)) !== String(r.branchId),
    );
    if (drift.length === 0) ok(`${label}: branchId guruh filiali bilan mos`, `${rows.length} yozuv`);
    else bad(`${label}: branchId guruhdan FARQ qiladi`, `${drift.length} ta yozuv`);
  }

  // ══════════════════════════════════════════════════════════
  // 2) HAR FILIAL: servis raqami == mustaqil hisoblangan raqam
  // ══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m2) Har filial pulini mustaqil tekshirish\x1b[0m");
  const now = new Date();
  const P = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };

  let sumIncome = 0;
  let sumExpense = 0;
  const perBranch = [];

  for (const b of branches) {
    // MUSTAQIL hisob - to'g'ridan-to'g'ri bazadan, servisdan emas
    const [inc] = await PaymentTransaction.aggregate([
      { $match: { branchId: b._id, isDeleted: { $ne: true } } },
      { $group: { _id: null, t: { $sum: "$amount" } } },
    ]);
    const [exp] = await SalaryTransaction.aggregate([
      { $match: { branchId: b._id, isDeleted: { $ne: true } } },
      { $group: { _id: null, t: { $sum: "$amount" } } },
    ]);
    const trueIncome = inc?.t || 0;
    const trueExpense = exp?.t || 0;
    sumIncome += trueIncome;
    sumExpense += trueExpense;
    perBranch.push({ b, trueIncome, trueExpense });

    // SERVIS orqali - filial kontekstida
    const svcIncome = await asBranch(b, async () => {
      const [r] = await PaymentTransaction.aggregate([
        ...(await import("../src/helpers/branchContext.helper.js")).branchMatchStage(),
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: null, t: { $sum: "$amount" } } },
      ]);
      return r?.t || 0;
    });

    if (svcIncome === trueIncome) {
      ok(`${b.name}: kirim ${money(trueIncome)} so'm`);
    } else {
      bad(`${b.name}: kirim MOS KELMADI`, `servis=${money(svcIncome)} haqiqiy=${money(trueIncome)}`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // 3) YIG'INDI: filiallar yig'indisi == umumiy ko'rinish
  // ══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m3) Filiallar yig'indisi == «Barcha filiallar»\x1b[0m");
  const [allInc] = await PaymentTransaction.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    { $group: { _id: null, t: { $sum: "$amount" } } },
  ]);
  const [allExp] = await SalaryTransaction.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    { $group: { _id: null, t: { $sum: "$amount" } } },
  ]);

  if (sumIncome === (allInc?.t || 0)) {
    ok(`Kirim: 5 filial yig'indisi == jami`, `${money(sumIncome)} so'm`);
  } else {
    bad("Kirim yig'indisi mos kelmadi", `${money(sumIncome)} vs ${money(allInc?.t)}`);
  }
  if (sumExpense === (allExp?.t || 0)) {
    ok(`Chiqim: 5 filial yig'indisi == jami`, `${money(sumExpense)} so'm`);
  } else {
    bad("Chiqim yig'indisi mos kelmadi", `${money(sumExpense)} vs ${money(allExp?.t)}`);
  }

  // ══════════════════════════════════════════════════════════
  // 4) HISOBOT SERVISI: har filial o'z raqamini beradimi
  // ══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m4) Moliya hisoboti (financeReport)\x1b[0m");
  // getSummary shakli: { income: {collected, billed, outstanding}, expense: {paid, ...} }
  let sumCollected = 0;
  let sumBilled = 0;
  let sumPaidOut = 0;
  for (const { b } of perBranch) {
    const s = await asBranch(b, () => finReport.getSummary(P));
    sumCollected += s?.income?.collected || 0;
    sumBilled += s?.income?.billed || 0;
    sumPaidOut += s?.expense?.paid || 0;
  }
  const allReport = await asAll(() => finReport.getSummary(P));

  for (const [label, mine, theirs] of [
    ["Kirim (collected)", sumCollected, allReport?.income?.collected || 0],
    ["Hisoblangan (billed)", sumBilled, allReport?.income?.billed || 0],
    ["Chiqim (paid)", sumPaidOut, allReport?.expense?.paid || 0],
  ]) {
    if (mine === theirs) ok(`Hisobot ${label}: yig'indi == umumiy`, `${money(mine)} so'm`);
    else bad(`Hisobot ${label} mos kelmadi`, `${money(mine)} vs ${money(theirs)}`);
  }

  // Har filial hisoboti nolga teng bo'lmasligi kerak (ma'lumot bor).
  const zeroBranches = [];
  for (const { b } of perBranch) {
    const s = await asBranch(b, () => finReport.getSummary(P));
    if ((s?.income?.collected || 0) === 0) zeroBranches.push(b.name);
  }
  if (zeroBranches.length === 0) ok("Har filialda kirim bor (hisobot ishlaydi)");
  else bad("Ba'zi filiallarda hisobot 0", zeroBranches.join(", "));

  // ══════════════════════════════════════════════════════════
  // 5) KO'CHGAN O'QUVCHI - eng nozik holat
  // ══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m5) Ko'chgan o'quvchi (2 filialda to'lov tarixi)\x1b[0m");
  const movers = await User.find({
    role: "student",
    "branchAssignments.0": { $exists: true },
  }).limit(3).lean();

  if (movers.length === 0) {
    console.log("  \x1b[33m~\x1b[0m ko'chgan o'quvchi topilmadi");
  } else {
    for (const s of movers) {
      const all = await StudentPayment.find({ student: s._id }, { branchId: 1, paidAmount: 1 }).lean();
      const byBranch = new Map();
      for (const p of all) {
        const k = String(p.branchId);
        byBranch.set(k, (byBranch.get(k) || 0) + (p.paidAmount || 0));
      }
      if (byBranch.size < 2) continue;

      let leaked = false;
      for (const b of branches) {
        const expected = byBranch.get(String(b._id)) || 0;
        const seen = await asBranch(b, async () => {
          const rows = await StudentPayment.find({
            student: s._id,
            branchId: b._id,
          }, { paidAmount: 1 }).lean();
          return rows.reduce((t, r) => t + (r.paidAmount || 0), 0);
        });
        if (seen !== expected) {
          bad(`${s.username}: ${b.name} da noto'g'ri`, `ko'rindi=${money(seen)} kutilgan=${money(expected)}`);
          leaked = true;
        }
      }
      if (!leaked) {
        const parts = [...byBranch.values()].map(money).join(" + ");
        ok(`${s.username}: har filial faqat o'z to'lovini ko'radi`, parts);
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // 6) IKKI FILIALDA ishlaydigan o'qituvchi
  // ══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m6) Ikki filialda ishlaydigan o'qituvchi\x1b[0m");
  const crossTeachers = await User.find({
    role: "teacher",
    "branchAssignments.0": { $exists: true },
  }).limit(3).lean();

  for (const t of crossTeachers) {
    const all = await TeacherSalary.find({ teacher: t._id }, { branchId: 1, paidAmount: 1 }).lean();
    const byBranch = new Map();
    for (const s of all) {
      const k = String(s.branchId);
      byBranch.set(k, (byBranch.get(k) || 0) + (s.paidAmount || 0));
    }
    if (byBranch.size < 2) continue;

    let leaked = false;
    for (const b of branches) {
      const expected = byBranch.get(String(b._id)) || 0;
      const seen = await asBranch(b, async () => {
        const rows = await TeacherSalary.find({ teacher: t._id, branchId: b._id }, { paidAmount: 1 }).lean();
        return rows.reduce((acc, r) => acc + (r.paidAmount || 0), 0);
      });
      if (seen !== expected) {
        bad(`${t.username}: ${b.name} da maosh noto'g'ri`, `${money(seen)} vs ${money(expected)}`);
        leaked = true;
      }
    }
    if (!leaked) {
      const parts = [...byBranch.values()].map(money).join(" + ");
      ok(`${t.username}: maoshi filiallarga to'g'ri bo'lingan`, parts);
    }
  }

  // ══════════════════════════════════════════════════════════
  // 7) KESHLANGAN paidAmount == tranzaksiyalar yig'indisi
  // ══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m7) Keshlangan paidAmount to'g'riligi\x1b[0m");
  const sample = await StudentPayment.find({ paidAmount: { $gt: 0 } }).limit(300).lean();
  let mismatch = 0;
  for (const p of sample) {
    const [agg] = await PaymentTransaction.aggregate([
      { $match: { payment: p._id, isDeleted: { $ne: true } } },
      { $group: { _id: null, t: { $sum: "$amount" } } },
    ]);
    if ((agg?.t || 0) !== p.paidAmount) mismatch += 1;
  }
  if (mismatch === 0) ok(`paidAmount == tranzaksiyalar yig'indisi`, `${sample.length} namuna`);
  else bad("paidAmount mos kelmadi", `${mismatch}/${sample.length} yozuvda`);

  // ══════════════════════════════════════════════════════════
  // 8) DASHBOARD sonlari
  // ══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m8) Dashboard sonlari\x1b[0m");
  let dashStudents = 0;
  let dashGroups = 0;
  for (const b of branches) {
    const o = await asBranch(b, () => dashboard.getOverview({}));
    const trueGroups = await Group.countDocuments({
      branchId: b._id, isActive: true, isDeleted: { $ne: true },
    });
    dashStudents += o.studentsCount || 0;
    dashGroups += o.activeGroupsCount || 0;
    if ((o.activeGroupsCount || 0) === trueGroups) {
      ok(`${b.name}: ${o.studentsCount} o'quvchi, ${o.activeGroupsCount} guruh`);
    } else {
      bad(`${b.name}: guruh soni noto'g'ri`, `${o.activeGroupsCount} vs ${trueGroups}`);
    }
  }
  const totalGroups = await Group.countDocuments({ isActive: true, isDeleted: { $ne: true } });
  if (dashGroups === totalGroups) ok(`Guruhlar yig'indisi == jami`, `${dashGroups}`);
  else bad("Guruh yig'indisi mos kelmadi", `${dashGroups} vs ${totalGroups}`);

  // ══════════════════════════════════════════════════════════
  console.log(
    `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} to'g'ri\x1b[0m / \x1b[31m${R.fail} xato\x1b[0m`,
  );
  if (R.notes.length) {
    console.log("\n\x1b[31mMuammolar:\x1b[0m");
    for (const n of R.notes) console.log(`  • ${n}`);
  }

  await mongoose.disconnect();
  process.exit(R.fail > 0 ? 1 : 0);
};

run().catch((e) => {
  console.error("Test xato:", e);
  process.exit(1);
});
