/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOLIYA IZOLYATSIYASI TESTI.
 *
 * SAVOL (o'zgarmadi): "Bir necha filial bo'lsa, ularning pullari
 * aralashib ketmaydimi?"
 *
 * Bu test shu savolga MATEMATIK javob beradi: har filialning pulini
 * MUSTAQIL hisoblab (to'g'ridan-to'g'ri bazadan), servis qaytargan raqam
 * bilan solishtiradi.
 *
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * 1) SO'ROVLAR. Mongoose `aggregate([$match,$group])` → Prisma
 *    `aggregate({ where, _sum })`; `{ student }` → `{ studentId }`.
 *
 * 2) ⚠⚠ MA'LUMOT MANBAI — ENG MUHIM O'ZGARISH ⚠⚠
 *
 *    Eski versiya JONLI bazadagi ma'lumotga tayanardi va
 *    `npm run seed:multi-branch` ni talab qilardi. Prisma'ga o'tgach
 *    tekshirildi: dev bazada `payment_transactions` va
 *    `salary_transactions` jadvallari BO'M-BO'SH (0 qator), 1262 ta
 *    `student_payments` ning HAMMASIDA `paidAmount = 0`.
 *
 *    Ya'ni test o'z-o'zidan YASHIL bo'lardi — hamma yig'indi 0, hamma
 *    solishtiruv `0 === 0`. Bu aynan o'sha "bo'sh natija = toza" degan
 *    SOXTA O'TISH.
 *
 *    Shuning uchun test endi O'Z moliyaviy fixture'ini yaratadi:
 *    3 filial, har birida guruh/o'qituvchi/o'quvchi, haqiqiy to'lov va
 *    maosh tranzaksiyalari, KO'CHGAN o'quvchi va IKKI FILIALDA
 *    ishlaydigan o'qituvchi bilan. Barchasi yakunda o'chiriladi.
 *
 * 3) ⚠ MOLIYAVIY MA'LUMOT DOIMIY QOLDIRILMAYDI. Fixture qatorlari
 *    reyestrga tushadi va `finally` da o'chiriladi; `assertClean()`
 *    tozalash HAQIQATAN tugaganini tasdiqlaydi.
 *
 *    JURNAL YOZUVLARI UMUMAN YARATILMAYDI: qatorlar servis orqali emas,
 *    TO'G'RIDAN-TO'G'RI Prisma bilan yoziladi. Jurnal o'zgarmas
 *    (`JOURNAL_IMMUTABLE`) — uni yaratib, keyin o'chirib bo'lmasdi.
 *
 * 4) YIG'INDI TEKSHIRUVLARI fixture filiallari bilan CHEGARALANADI —
 *    aks holda bazadagi begona ma'lumot natijani buzardi. Konsolidatsiya
 *    ko'rinishi `canSeeAllBranches: false` + `allowedBranchIds: [fixture]`
 *    bilan quriladi, ya'ni `branchFilter()` aynan shu filiallarni beradi.
 *
 * ISHLATISH:  npm run test:money
 * ═══════════════════════════════════════════════════════════════════════════
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import { runWithBranchContext, branchFilter } from "../src/helpers/branchContext.helper.js";
import { createFixtures } from "./helpers/prismaFixtures.js";

const R = { pass: 0, fail: 0, unmeasured: 0, notes: [] };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`);
};
const bad = (n, d) => {
  R.fail += 1;
  R.notes.push(`${n} — ${d}`);
  console.log(`  \x1b[31m✗\x1b[0m ${n} → ${d}`);
};
/** O'LCHANMADI — «o'tdi» ham emas, «yiqildi» ham emas, lekin YASHIL EMAS. */
const unmeasured = (n, d) => {
  R.unmeasured += 1;
  R.notes.push(`${n} — O'LCHANMADI: ${d}`);
  console.log(`  \x1b[33m~\x1b[0m ${n} → O'LCHANMADI: ${d}`);
};
const money = (n) => new Intl.NumberFormat("uz-UZ").format(Math.round(n || 0));

const fx = createFixtures();
const P = { year: 2026, month: 3 };

const run = async () => {
  const finReport = await import("../src/modules/financeReport/services/financeReport.service.js");
  const dashboard = await import("../src/modules/adminDashboard/services/adminDashboard.service.js");

  // ═══════════════════════════════════════════════════════════
  // FIXTURE: 3 filial, to'liq moliyaviy zanjir bilan
  // ═══════════════════════════════════════════════════════════
  const names = ["MI-A", "MI-B", "MI-C"];
  const branches = [];
  for (const n of names) branches.push(await fx.branch(n));

  /** Bitta to'lov + unga MOS keladigan tranzaksiya. */
  const addPayment = async (branch, group, student, amount) => {
    const sp = await prisma.studentPayment.create({
      data: {
        branchId: branch.id, groupId: group.id, studentId: student.id,
        year: P.year, month: P.month,
        baseFee: amount, expectedAmount: amount, paidAmount: amount,
        status: "paid",
      },
    });
    fx.track("studentPayment", sp.id);
    // Tranzaksiya YIG'INDISI keshlangan `paidAmount` ga TENG bo'lishi
    // shart — 7-bo'lim aynan shuni tekshiradi. Ataylab IKKI bo'lakka
    // bo'lamiz: bitta qatorli holat xatoni yashira olardi.
    for (const part of [Math.floor(amount / 2), amount - Math.floor(amount / 2)]) {
      const tx = await prisma.paymentTransaction.create({
        data: {
          branchId: branch.id, paymentId: sp.id, groupId: group.id, studentId: student.id,
          year: P.year, month: P.month, amount: part,
          source: "direct", method: "cash", paidAt: new Date(Date.UTC(P.year, P.month - 1, 10)),
        },
      });
      fx.track("paymentTransaction", tx.id);
    }
    return sp;
  };

  /** Bitta maosh + unga MOS keladigan tranzaksiya. */
  const addSalary = async (branch, group, teacher, expected, paid) => {
    const ts = await prisma.teacherSalary.create({
      data: {
        branchId: branch.id, groupId: group.id, teacherId: teacher.id,
        year: P.year, month: P.month, expectedAmount: expected, paidAmount: paid,
      },
    });
    fx.track("teacherSalary", ts.id);
    if (paid > 0) {
      const tx = await prisma.salaryTransaction.create({
        data: {
          branchId: branch.id, salaryId: ts.id, groupId: group.id, teacherId: teacher.id,
          year: P.year, month: P.month, amount: paid, method: "cash",
          paidAt: new Date(Date.UTC(P.year, P.month - 1, 25)),
        },
      });
      fx.track("salaryTransaction", tx.id);
    }
    return ts;
  };

  const perBranchSetup = [];
  let idx = 0;
  for (const b of branches) {
    idx += 1;
    const teacher = await fx.user(`mi-teach-${idx}`, { role: "teacher", homeBranchId: b.id });
    const group = await fx.group(`MI-G${idx}`, b.id, {
      isActive: true,
      teachers: { connect: [{ id: teacher.id }] },
    });
    await fx.groupFee(group.id, P.year, P.month, 400000 * idx);

    const students = [];
    for (const k of [1, 2]) {
      const st = await fx.user(`mi-stud-${idx}-${k}`, { role: "student", homeBranchId: b.id });
      await fx.membership(group.id, st.id, { joinedAt: new Date(Date.UTC(P.year, 0, 1)) });
      await addPayment(b, group, st, 100000 * idx + 20000 * k);
      students.push(st);
    }
    await addSalary(b, group, teacher, 900000 * idx, 300000 * idx);
    perBranchSetup.push({ branch: b, teacher, group, students });
  }

  // ── KO'CHGAN O'QUVCHI: A da ham, B da ham to'lovi bor ──
  const mover = await fx.user("mi-mover", {
    role: "student",
    homeBranchId: branches[0].id,
  });
  await fx.assignment(mover.id, branches[1].id, null);
  await fx.membership(perBranchSetup[0].group.id, mover.id, {
    joinedAt: new Date(Date.UTC(P.year, 0, 1)),
    leftAt: new Date(Date.UTC(P.year, 1, 1)),
  });
  await fx.membership(perBranchSetup[1].group.id, mover.id, {
    joinedAt: new Date(Date.UTC(P.year, 1, 1)),
  });
  await addPayment(branches[0], perBranchSetup[0].group, mover, 111000);
  await addPayment(branches[1], perBranchSetup[1].group, mover, 222000);

  // ── IKKI FILIALDA ishlaydigan o'qituvchi ──
  const crossTeacher = await fx.user("mi-cross-teach", {
    role: "teacher",
    homeBranchId: branches[0].id,
  });
  await fx.assignment(crossTeacher.id, branches[2].id, null);
  await addSalary(branches[0], perBranchSetup[0].group, crossTeacher, 500000, 500000);
  await addSalary(branches[2], perBranchSetup[2].group, crossTeacher, 700000, 700000);

  const ids = branches.map((b) => String(b.id));
  const asBranch = (b, fn) =>
    runWithBranchContext(
      { branchId: String(b.id), allowedBranchIds: [String(b.id)], canSeeAllBranches: false },
      fn,
    );
  /**
   * KONSOLIDATSIYA — faqat fixture filiallari bo'ylab.
   *
   * ⚠ `canSeeAllBranches: true` ISHLATILMAYDI: u `branchFilter()` ni
   * BUTUNLAY o'chiradi va bazadagi begona ma'lumot ham qo'shilib
   * ketardi. `branchId: null` + ro'yxat esa `{ branchId: { in: [...] } }`
   * beradi — aynan kerakli konsolidatsiya.
   */
  const asFixtureAll = (fn) =>
    runWithBranchContext(
      { branchId: null, allowedBranchIds: ids, canSeeAllBranches: false },
      fn,
    );

  console.log(`\n\x1b[1mMOLIYA IZOLYATSIYASI\x1b[0m — ${branches.length} fixture filiali\n`);

  // ═══════════════════════════════════════════════════════════
  // 0) MUSBAT NAZORAT — fixture HAQIQATAN pul yaratdimi
  // ═══════════════════════════════════════════════════════════
  console.log("\x1b[1m0) Musbat nazorat\x1b[0m");
  const fixtureIncome = await prisma.paymentTransaction.aggregate({
    where: { branchId: { in: ids }, isDeleted: false },
    _sum: { amount: true },
  });
  const fixtureExpense = await prisma.salaryTransaction.aggregate({
    where: { branchId: { in: ids }, isDeleted: false },
    _sum: { amount: true },
  });
  const totalIn = Number(fixtureIncome._sum.amount || 0);
  const totalOut = Number(fixtureExpense._sum.amount || 0);
  if (totalIn > 0 && totalOut > 0) {
    ok("fixture pul yaratdi", `kirim ${money(totalIn)} · chiqim ${money(totalOut)} so'm`);
  } else {
    bad(
      "MUSBAT NAZORAT YIQILDI",
      `kirim=${totalIn} chiqim=${totalOut} — pastdagi solishtiruvlar 0===0 bo'lib ` +
        `SOXTA yashil berardi`,
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 1) REFERENTSIAL BUTUNLIK: branchId guruh bilan mos kelishi
  // ═══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m1) Referentsial butunlik\x1b[0m");
  const allGroups = await prisma.group.findMany({ select: { id: true, branchId: true } });
  const groupBranch = new Map(allGroups.map((g) => [String(g.id), String(g.branchId)]));

  for (const [label, model] of [
    ["StudentPayment", "studentPayment"],
    ["PaymentTransaction", "paymentTransaction"],
    ["TeacherSalary", "teacherSalary"],
    ["SalaryTransaction", "salaryTransaction"],
  ]) {
    const rows = await prisma[model].findMany({ select: { branchId: true, groupId: true } });
    const drift = rows.filter(
      (r) => r.groupId && groupBranch.get(String(r.groupId)) !== String(r.branchId),
    );
    if (rows.length === 0) {
      unmeasured(`${label}: branchId guruh filiali bilan mos`, "jadval bo'sh");
    } else if (drift.length === 0) {
      ok(`${label}: branchId guruh filiali bilan mos`, `${rows.length} yozuv`);
    } else {
      bad(`${label}: branchId guruhdan FARQ qiladi`, `${drift.length} ta yozuv`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 2) HAR FILIAL: servis raqami == mustaqil hisoblangan raqam
  // ═══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m2) Har filial pulini mustaqil tekshirish\x1b[0m");
  let sumIncome = 0;
  let sumExpense = 0;

  for (const b of branches) {
    // MUSTAQIL hisob — to'g'ridan-to'g'ri bazadan, ko'lam qatlamisiz.
    const inc = await prisma.paymentTransaction.aggregate({
      where: { branchId: b.id, isDeleted: false },
      _sum: { amount: true },
    });
    const exp = await prisma.salaryTransaction.aggregate({
      where: { branchId: b.id, isDeleted: false },
      _sum: { amount: true },
    });
    const trueIncome = Number(inc._sum.amount || 0);
    const trueExpense = Number(exp._sum.amount || 0);
    sumIncome += trueIncome;
    sumExpense += trueExpense;

    // KO'LAM QATLAMI orqali — `branchFilter()` bilan, xuddi servis kabi.
    const svcIncome = await asBranch(b, async () => {
      const r = await prisma.paymentTransaction.aggregate({
        where: { ...branchFilter(), isDeleted: false },
        _sum: { amount: true },
      });
      return Number(r._sum.amount || 0);
    });

    if (svcIncome === trueIncome) ok(`${b.name}: kirim ${money(trueIncome)} so'm`);
    else {
      bad(
        `${b.name}: kirim MOS KELMADI`,
        `ko'lam=${money(svcIncome)} haqiqiy=${money(trueIncome)}`,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 3) YIG'INDI: filiallar yig'indisi == konsolidatsiya
  // ═══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m3) Filiallar yig'indisi == konsolidatsiya\x1b[0m");
  const allInc = await asFixtureAll(async () => {
    const r = await prisma.paymentTransaction.aggregate({
      where: { ...branchFilter(), isDeleted: false },
      _sum: { amount: true },
    });
    return Number(r._sum.amount || 0);
  });
  const allExp = await asFixtureAll(async () => {
    const r = await prisma.salaryTransaction.aggregate({
      where: { ...branchFilter(), isDeleted: false },
      _sum: { amount: true },
    });
    return Number(r._sum.amount || 0);
  });

  if (sumIncome === allInc) ok("Kirim: filiallar yig'indisi == konsolidatsiya", `${money(sumIncome)} so'm`);
  else bad("Kirim yig'indisi mos kelmadi", `${money(sumIncome)} vs ${money(allInc)}`);
  if (sumExpense === allExp) ok("Chiqim: filiallar yig'indisi == konsolidatsiya", `${money(sumExpense)} so'm`);
  else bad("Chiqim yig'indisi mos kelmadi", `${money(sumExpense)} vs ${money(allExp)}`);

  // ═══════════════════════════════════════════════════════════
  // 4) HISOBOT SERVISI: har filial o'z raqamini beradimi
  // ═══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m4) Moliya hisoboti (financeReport)\x1b[0m");
  let sumCollected = 0;
  let sumBilled = 0;
  let sumPaidOut = 0;
  const zeroBranches = [];
  for (const b of branches) {
    const s = await asBranch(b, () => finReport.getSummary(P));
    sumCollected += s?.income?.collected || 0;
    sumBilled += s?.income?.billed || 0;
    sumPaidOut += s?.expense?.paid || 0;
    if ((s?.income?.collected || 0) === 0) zeroBranches.push(b.name);
  }
  const allReport = await asFixtureAll(() => finReport.getSummary(P));

  for (const [label, mine, theirs] of [
    ["Kirim (collected)", sumCollected, allReport?.income?.collected || 0],
    ["Hisoblangan (billed)", sumBilled, allReport?.income?.billed || 0],
    ["Chiqim (paid)", sumPaidOut, allReport?.expense?.paid || 0],
  ]) {
    if (mine === theirs) ok(`Hisobot ${label}: yig'indi == konsolidatsiya`, `${money(mine)} so'm`);
    else bad(`Hisobot ${label} mos kelmadi`, `${money(mine)} vs ${money(theirs)}`);
  }

  if (zeroBranches.length === 0) ok("Har filialda kirim bor (hisobot ishlaydi)");
  else bad("Ba'zi filiallarda hisobot 0", zeroBranches.join(", "));

  // ═══════════════════════════════════════════════════════════
  // 5) KO'CHGAN O'QUVCHI — eng nozik holat
  // ═══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m5) Ko'chgan o'quvchi (2 filialda to'lov tarixi)\x1b[0m");
  {
    const all = await prisma.studentPayment.findMany({
      where: { studentId: mover.id },
      select: { branchId: true, paidAmount: true },
    });
    const byBranch = new Map();
    for (const p of all) {
      const k = String(p.branchId);
      byBranch.set(k, (byBranch.get(k) || 0) + Number(p.paidAmount || 0));
    }

    if (byBranch.size < 2) {
      bad("ko'chgan o'quvchi fixture'i", `faqat ${byBranch.size} filialda to'lov bor`);
    } else {
      let leaked = false;
      for (const b of branches) {
        const expected = byBranch.get(String(b.id)) || 0;
        const seen = await asBranch(b, async () => {
          const rows = await prisma.studentPayment.findMany({
            where: { studentId: mover.id, ...branchFilter() },
            select: { paidAmount: true },
          });
          return rows.reduce((t, r) => t + Number(r.paidAmount || 0), 0);
        });
        if (seen !== expected) {
          bad(
            `${mover.username}: ${b.name} da noto'g'ri`,
            `ko'rindi=${money(seen)} kutilgan=${money(expected)}`,
          );
          leaked = true;
        }
      }
      if (!leaked) {
        ok(
          `${mover.username}: har filial faqat o'z to'lovini ko'radi`,
          [...byBranch.values()].map(money).join(" + "),
        );
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 6) IKKI FILIALDA ishlaydigan o'qituvchi
  // ═══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m6) Ikki filialda ishlaydigan o'qituvchi\x1b[0m");
  {
    const all = await prisma.teacherSalary.findMany({
      where: { teacherId: crossTeacher.id },
      select: { branchId: true, paidAmount: true },
    });
    const byBranch = new Map();
    for (const s of all) {
      const k = String(s.branchId);
      byBranch.set(k, (byBranch.get(k) || 0) + Number(s.paidAmount || 0));
    }

    if (byBranch.size < 2) {
      bad("filiallararo o'qituvchi fixture'i", `faqat ${byBranch.size} filialda maosh bor`);
    } else {
      let leaked = false;
      for (const b of branches) {
        const expected = byBranch.get(String(b.id)) || 0;
        const seen = await asBranch(b, async () => {
          const rows = await prisma.teacherSalary.findMany({
            where: { teacherId: crossTeacher.id, ...branchFilter() },
            select: { paidAmount: true },
          });
          return rows.reduce((acc, r) => acc + Number(r.paidAmount || 0), 0);
        });
        if (seen !== expected) {
          bad(
            `${crossTeacher.username}: ${b.name} da maosh noto'g'ri`,
            `${money(seen)} vs ${money(expected)}`,
          );
          leaked = true;
        }
      }
      if (!leaked) {
        ok(
          `${crossTeacher.username}: maoshi filiallarga to'g'ri bo'lingan`,
          [...byBranch.values()].map(money).join(" + "),
        );
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 7) KESHLANGAN paidAmount == tranzaksiyalar yig'indisi
  // ═══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m7) Keshlangan paidAmount to'g'riligi\x1b[0m");
  {
    const sample = await prisma.studentPayment.findMany({
      where: { branchId: { in: ids }, paidAmount: { gt: 0 } },
      select: { id: true, paidAmount: true },
      take: 300,
    });
    if (sample.length === 0) {
      bad("paidAmount namunasi", "fixture to'lov yaratmadi — tekshiruv ma'nosiz");
    } else {
      let mismatch = 0;
      for (const p of sample) {
        const agg = await prisma.paymentTransaction.aggregate({
          where: { paymentId: p.id, isDeleted: false },
          _sum: { amount: true },
        });
        if (Number(agg._sum.amount || 0) !== Number(p.paidAmount)) mismatch += 1;
      }
      if (mismatch === 0) ok("paidAmount == tranzaksiyalar yig'indisi", `${sample.length} namuna`);
      else bad("paidAmount mos kelmadi", `${mismatch}/${sample.length} yozuvda`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 8) DASHBOARD sonlari
  // ═══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m8) Dashboard sonlari\x1b[0m");
  let dashGroups = 0;
  for (const b of branches) {
    const o = await asBranch(b, () => dashboard.getOverview({}));
    const trueGroups = await prisma.group.count({
      where: { branchId: b.id, isActive: true, isDeleted: false },
    });
    dashGroups += o.activeGroupsCount || 0;
    if ((o.activeGroupsCount || 0) === trueGroups) {
      ok(`${b.name}: ${o.studentsCount} o'quvchi, ${o.activeGroupsCount} guruh`);
    } else {
      bad(`${b.name}: guruh soni noto'g'ri`, `${o.activeGroupsCount} vs ${trueGroups}`);
    }
  }
  const totalGroups = await prisma.group.count({
    where: { branchId: { in: ids }, isActive: true, isDeleted: false },
  });
  if (dashGroups === totalGroups) ok("Guruhlar yig'indisi == fixture jami", `${dashGroups}`);
  else bad("Guruh yig'indisi mos kelmadi", `${dashGroups} vs ${totalGroups}`);
};

run()
  .catch((e) => {
    bad("TEST YIQILDI", e?.message || String(e));
    if (process.env.DEBUG) console.error(e);
  })
  .finally(async () => {
    const problems = await fx.cleanup();
    const leftovers = await fx.assertClean();
    if (problems.length) bad("fixture tozalash", problems.join(" · "));
    else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
    else ok(`fixture tozalandi (${fx.suffix}) — moliyaviy qator qolmadi`);

    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} to'g'ri\x1b[0m / ` +
        `\x1b[31m${R.fail} xato\x1b[0m / \x1b[33m${R.unmeasured} o'lchanmadi\x1b[0m`,
    );
    if (R.notes.length) {
      console.log("\n\x1b[31mMuammolar:\x1b[0m");
      for (const n of R.notes) console.log(`  • ${n}`);
    }
    await prisma.$disconnect().catch(() => {});
    process.exit(R.fail || R.unmeasured ? 1 : 0);
  });
