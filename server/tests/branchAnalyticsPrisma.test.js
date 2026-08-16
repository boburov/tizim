/**
 * FILIAL TAHLILI — PostgreSQL (Prisma) USTIDA.
 *
 * Uchta servis: branchMetrics (utilization/churn/normalized),
 * branchAlerts (evaluate), studentTransfer (preview/transfer).
 *
 * ═══════════════════════════════════════════════════════════════════
 * BU TEST IKKI NARSANI QAT'IY TEKSHIRADI
 *
 * 1) FILIAL IZOLYATSIYASI - adversarial. Filial direktori BOSHQA
 *    filialning raqamlarini ko'ra olmasligi kerak, `?branchId=` ni
 *    qo'lda yozsa ham. Ko'lam SERVERDA (AsyncLocalStorage), mijozda
 *    emas.
 *
 * 2) MOLIYAVIY HAQIQAT BITTA. `branchAnalytics` MOLIYANI QAYTA
 *    HISOBLAMAYDI - u `journal` va `financeReport` dan o'qiydi.
 *    Ikkinchi ta'rif paydo bo'lsa, ikki ekranda ikki xil foyda
 *    ko'rinardi va qaysi biri to'g'ri ekani bilinmasdi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ISHLATISH:  npm run test:branch-analytics
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import * as metrics from "../src/modules/branchAnalytics/services/branchMetrics.service.js";
import * as alerts from "../src/modules/branchAnalytics/services/branchAlerts.service.js";
import * as transferSvc from "../src/modules/branchAnalytics/services/studentTransfer.service.js";
import * as pnlSvc from "../src/modules/branchAnalytics/services/branchPnl.service.js";
import * as journal from "../src/modules/journal/services/journal.service.js";
import { runWithBranchContext } from "../src/helpers/branchContext.helper.js";
import { ACCOUNT_KINDS, ENTRY_KINDS } from "../src/constants/ledger.js";
import { ROLES } from "../src/constants/roles.js";

const R = { pass: 0, fail: 0 };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  ✅ ${n}${extra ? ` — ${extra}` : ""}`);
};
const bad = (n, extra = "") => {
  R.fail += 1;
  console.log(`  ❌ ${n}${extra ? ` — ${extra}` : ""}`);
};
const mustPass = async (name, fn, check) => {
  try {
    const res = await fn();
    const problem = check ? check(res) : null;
    if (problem) bad(name, problem);
    else ok(name);
    return res;
  } catch (err) {
    bad(name, err?.message?.slice(0, 150));
    return null;
  }
};
const mustThrow = async (name, fn, match) => {
  try {
    await fn();
    bad(name, "xato kutilgan edi, lekin o'tib ketdi");
  } catch (err) {
    const msg = err?.message || "";
    if (match && !msg.toLowerCase().includes(String(match).toLowerCase())) {
      bad(name, `boshqa xato: ${msg.slice(0, 120)}`);
    } else ok(name, msg.split("\n")[0].slice(0, 60));
  }
};

const S = `ba${Date.now().toString(36)}`;
const created = { users: [], branches: [], groups: [], courses: [], rooms: [] };

const cleanup = async () => {
  const { users: uids, branches, groups, courses, rooms } = created;
  if (uids.length) {
    await prisma.depositTransaction.deleteMany({ where: { studentId: { in: uids } } });
    await prisma.studentDeposit.deleteMany({ where: { studentId: { in: uids } } });
    await prisma.groupMembership.deleteMany({ where: { studentId: { in: uids } } });
  }
  if (groups.length) {
    await prisma.groupMembership.deleteMany({ where: { groupId: { in: groups } } });
    await prisma.groupScheduleItem.deleteMany({ where: { groupId: { in: groups } } });
    await prisma.group.deleteMany({ where: { id: { in: groups } } });
  }
  if (rooms.length) await prisma.room.deleteMany({ where: { id: { in: rooms } } });
  if (courses.length) await prisma.course.deleteMany({ where: { id: { in: courses } } });
  if (branches.length) {
    const entries = await prisma.journalEntry.findMany({
      where: { branchId: { in: branches } },
      select: { id: true },
    });
    if (entries.length) {
      await prisma.journalLine.deleteMany({
        where: { entryId: { in: entries.map((e) => e.id) } },
      });
      await prisma.journalEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } });
    }
    await prisma.journalLine.deleteMany({ where: { account: { branchId: { in: branches } } } });
    await prisma.account.deleteMany({ where: { branchId: { in: branches } } });
    await prisma.cashTransfer.deleteMany({ where: { fromBranchId: { in: branches } } });
    await prisma.shift.deleteMany({ where: { branchId: { in: branches } } });
    await prisma.expense.deleteMany({ where: { branchId: { in: branches } } });
    await prisma.lead.deleteMany({ where: { branchId: { in: branches } } });
  }
  if (uids.length) await prisma.user.deleteMany({ where: { id: { in: uids } } });
  if (branches.length) await prisma.branch.deleteMany({ where: { id: { in: branches } } });
};

const mkUser = async (name, role, branchId) => {
  const u = await prisma.user.create({
    data: {
      firstName: name,
      lastName: "BA",
      username: `${name.toLowerCase()}_${S}`,
      passwordHash: "x",
      role,
      homeBranchId: branchId,
      ...(role === ROLES.STUDENT
        ? { enrolledAt: new Date(Date.UTC(2024, 0, 1)) }
        : { hiredAt: new Date(Date.UTC(2024, 0, 1)) }),
    },
  });
  created.users.push(u.id);
  return u;
};

const run = async () => {
  console.log("\n=== FILIAL TAHLILI / PRISMA TESTI ===\n");
  await prisma.$queryRaw`SELECT 1`;

  const bA = await prisma.branch.create({ data: { name: `BA A ${S}` } });
  const bB = await prisma.branch.create({ data: { name: `BA B ${S}` } });
  created.branches.push(bA.id, bB.id);

  const course = await prisma.course.create({ data: { title: `K ${S}`, code: `k_${S}` } });
  created.courses.push(course.id);

  const roomA = await prisma.room.create({ data: { name: `A-1 ${S}`, branchId: bA.id } });
  const roomB = await prisma.room.create({ data: { name: `B-1 ${S}`, branchId: bB.id } });
  created.rooms.push(roomA.id, roomB.id);

  // Har filialda bitta guruh + jadval (bandlik hisobi uchun).
  const mkGroup = async (name, branchId, roomId) => {
    const g = await prisma.group.create({
      data: {
        name,
        branchId,
        courseId: course.id,
        roomId,
        isActive: true,
        schedule: {
          create: [{ day: "mon", startTime: "09:00", endTime: "11:00" }],
        },
      },
    });
    created.groups.push(g.id);
    return g;
  };
  const gA = await mkGroup(`A guruh ${S}`, bA.id, roomA.id);
  const gB = await mkGroup(`B guruh ${S}`, bB.id, roomB.id);

  const sA = await mkUser("Anvar", ROLES.STUDENT, bA.id);
  const sB = await mkUser("Bobur", ROLES.STUDENT, bB.id);
  await prisma.groupMembership.create({
    data: { groupId: gA.id, studentId: sA.id, joinedAt: new Date(Date.UTC(2025, 0, 1)) },
  });
  await prisma.groupMembership.create({
    data: { groupId: gB.id, studentId: sB.id, joinedAt: new Date(Date.UTC(2025, 0, 1)) },
  });

  const scopeA = { branchId: bA.id, allowedBranchIds: [bA.id], canSeeAllBranches: false, userId: null };
  const scopeB = { branchId: bB.id, allowedBranchIds: [bB.id], canSeeAllBranches: false, userId: null };
  const superAdmin = { branchId: null, allowedBranchIds: [bA.id, bB.id], canSeeAllBranches: true, userId: null };
  const inA = (fn) => runWithBranchContext(scopeA, fn);
  const inB = (fn) => runWithBranchContext(scopeB, fn);
  const asSuper = (fn) => runWithBranchContext(superAdmin, fn);

  // ══ 1) BANDLIK (utilization) ═══════════════════════════════════
  console.log("1) bandlik (utilization)");

  await mustPass(
    "jadval SOATLARI hisoblanadi (schedule relation include qilingan)",
    () => inA(() => metrics.utilization()),
    (rows) => {
      const mine = rows.find((r) => String(r.branchId) === String(bA.id));
      if (!mine) return "A filial yo'q";
      if (mine.roomCount !== 1) return `roomCount=${mine.roomCount}`;
      // 09:00-11:00 = 2 soat. Agar `schedule` include qilinmasa 0 chiqardi -
      // aynan shu jimgina buzilishni tutamiz.
      if (mine.busyHours !== 2) return `busyHours=${mine.busyHours} (2 kutilgan)`;
      return null;
    },
  );

  await mustPass(
    "FILIAL IZOLYATSIYASI: A kontekstida B filial YO'Q",
    () => inA(() => metrics.utilization()),
    (rows) => (rows.some((r) => String(r.branchId) === String(bB.id)) ? "B sizib chiqdi" : null),
  );

  await mustPass(
    "SUPER ADMIN ikkala filialni ham ko'radi",
    () => asSuper(() => metrics.utilization()),
    (rows) => {
      const ids = rows.map((r) => String(r.branchId));
      if (!ids.includes(String(bA.id))) return "A yo'q";
      if (!ids.includes(String(bB.id))) return "B yo'q";
      return null;
    },
  );

  // ══ 2) CHURN ═══════════════════════════════════════════════════
  console.log("\n2) chiqib ketish (churn)");

  await mustPass(
    "faol a'zolik CHURN emas",
    () => inA(() => metrics.churn({})),
    (rows) => {
      const mine = rows.find((r) => String(r.branchId) === String(bA.id));
      if (!mine) return "A filial yo'q";
      if (mine.active !== 1) return `active=${mine.active}`;
      if (mine.churned !== 0) return `churned=${mine.churned}`;
      return null;
    },
  );

  await mustPass(
    "guruhdan chiqqan va BOSHQA guruhi yo'q -> CHURN",
    async () => {
      await prisma.groupMembership.updateMany({
        where: { studentId: sA.id, groupId: gA.id },
        data: { leftAt: new Date() },
      });
      return inA(() => metrics.churn({}));
    },
    (rows) => {
      const mine = rows.find((r) => String(r.branchId) === String(bA.id));
      if (!mine) return "A filial yo'q";
      if (mine.churned !== 1) return `churned=${mine.churned} (1 kutilgan)`;
      return null;
    },
  );

  await mustPass(
    "BOSHQA guruhga o'tgan o'quvchi CHURN EMAS (ta'rif saqlangan)",
    async () => {
      // Yangi guruhga qo'shamiz - o'quvchi markazni tashlab ketmagan.
      const g2 = await mkGroup(`A guruh 2 ${S}`, bA.id, roomA.id);
      await prisma.groupMembership.create({
        data: { groupId: g2.id, studentId: sA.id, joinedAt: new Date() },
      });
      return inA(() => metrics.churn({}));
    },
    (rows) => {
      const mine = rows.find((r) => String(r.branchId) === String(bA.id));
      if (!mine) return "A filial yo'q";
      if (mine.churned !== 0) return `churned=${mine.churned} - guruh almashtirish churn deb sanaldi`;
      return null;
    },
  );

  await mustPass(
    "FILIAL IZOLYATSIYASI: churn'da B filial YO'Q",
    () => inA(() => metrics.churn({})),
    (rows) => (rows.some((r) => String(r.branchId) === String(bB.id)) ? "B sizib chiqdi" : null),
  );

  // ══ 3) MOLIYAVIY HAQIQAT BITTA ═════════════════════════════════
  console.log("\n3) moliyaviy haqiqat: P&L jurnaldan o'qiydi");

  // A filialga daromad va xarajat yozamiz - TO'G'RIDAN-TO'G'RI jurnalga,
  // ya'ni moliyaning yagona manbasiga.
  await journal.post({
    branchId: bA.id,
    date: new Date(),
    kind: ENTRY_KINDS.PAYMENT,
    memo: "test daromad",
    lines: [
      { accountKind: ACCOUNT_KINDS.CASH, debit: 1_000_000 },
      { accountKind: ACCOUNT_KINDS.REVENUE, credit: 1_000_000 },
    ],
  });
  await journal.post({
    branchId: bA.id,
    date: new Date(),
    kind: ENTRY_KINDS.EXPENSE,
    memo: "test xarajat",
    lines: [
      { accountKind: ACCOUNT_KINDS.EXPENSE, debit: 400_000 },
      { accountKind: ACCOUNT_KINDS.CASH, credit: 400_000 },
    ],
  });

  await mustPass(
    "P&L jurnaldagi daromad/xarajatni AYNAN qaytaradi",
    () => asSuper(() => pnlSvc.pnl({})),
    (res) => {
      const mine = res.items.find((i) => String(i.branchId) === String(bA.id));
      if (!mine) return "A filial yo'q";
      if (mine.revenue !== 1_000_000) return `revenue=${mine.revenue}`;
      if (mine.expense !== 400_000) return `expense=${mine.expense}`;
      // ISHORA KONVENSIYASI: sof = daromad - xarajat - kamomad.
      if (mine.net !== 600_000) return `net=${mine.net} (600 000 kutilgan)`;
      // Marja foizda, so'mda EMAS.
      if (mine.margin !== 60) return `margin=${mine.margin} (60 kutilgan)`;
      return null;
    },
  );

  await mustPass(
    "FILIAL IZOLYATSIYASI: A kontekstidagi P&L da B YO'Q",
    () => inA(() => pnlSvc.pnl({})),
    (res) =>
      res.items.some((i) => String(i.branchId) === String(bB.id))
        ? "B filial P&L ga sizib chiqdi"
        : null,
  );

  await mustPass(
    "B kontekstida A filial ko'rinmaydi (teskari yo'nalish)",
    () => inB(() => pnlSvc.pnl({})),
    (res) =>
      res.items.some((i) => String(i.branchId) === String(bA.id))
        ? "A filial sizib chiqdi"
        : null,
  );

  await mustPass(
    "ELIMINATION: ichki yozuv konsolidatsiyada CHIQARIB tashlanadi",
    async () => {
      // Ichki (filiallararo) yozuv - u `isInternal: true`.
      await journal.post({
        branchId: bA.id,
        date: new Date(),
        kind: ENTRY_KINDS.INTER_BRANCH,
        memo: "ichki",
        lines: [
          { accountKind: ACCOUNT_KINDS.REVENUE, credit: 500_000 },
          { accountKind: ACCOUNT_KINDS.CASH, debit: 500_000 },
        ],
        isInternal: true,
        counterpartyBranchId: bB.id,
      });
      const gross = await asSuper(() => pnlSvc.pnl({ consolidated: false }));
      const cons = await asSuper(() => pnlSvc.pnl({ consolidated: true }));
      return { gross, cons };
    },
    ({ gross, cons }) => {
      const g = gross.items.find((i) => String(i.branchId) === String(bA.id));
      const c = cons.items.find((i) => String(i.branchId) === String(bA.id));
      if (!g || !c) return "filial topilmadi";
      if (g.revenue !== 1_500_000) return `gross revenue=${g.revenue} (1 500 000 kutilgan)`;
      if (c.revenue !== 1_000_000) {
        return `konsolidatsiyalangan revenue=${c.revenue} - ichki yozuv chiqarilmadi`;
      }
      return null;
    },
  );

  // ══ 4) OGOHLANTIRISHLAR ════════════════════════════════════════
  console.log("\n4) ogohlantirishlar (alerts)");

  await mustPass(
    "yo'lda QOTIB QOLGAN inkassatsiya ogohlantirish beradi",
    async () => {
      await prisma.cashTransfer.create({
        data: {
          fromBranchId: bA.id,
          toBranchId: bB.id,
          amount: 250_000,
          status: "in_transit",
          // 10 kun oldin jo'natilgan - ostona 2 kun.
          sentAt: new Date(Date.now() - 10 * 86400000),
        },
      });
      return asSuper(() => alerts.evaluate());
    },
    // `evaluate()` KONVERT qaytaradi: { alerts, counts, thresholds } -
    // massiv EMAS. Klient ham shu shaklni kutadi.
    ({ alerts: list, counts }) => {
      const hit = list.find((a) => a.code === "transfer_stuck");
      if (typeof counts?.critical !== "number") return "counts.critical yo'q";
      if (!hit) return "ogohlantirish chiqmadi";
      if (hit.severity !== "critical") return `severity=${hit.severity}`;
      // Filial NOMI to'ldirilishi kerak (Map orqali topiladi).
      if (!hit.branchName) return "filial nomi bo'sh";
      return null;
    },
  );

  await mustPass(
    "uzoq OCHIQ smena ogohlantirish beradi",
    async () => {
      const cashier = await mkUser("Kassir", "reception", bA.id);
      await prisma.shift.create({
        data: {
          branchId: bA.id,
          cashierId: cashier.id,
          openedAt: new Date(Date.now() - 48 * 3600000),
          status: "open",
        },
      });
      return asSuper(() => alerts.evaluate());
    },
    ({ alerts: list }) =>
      list.some((a) => a.code === "shift_open_too_long") ? null : "ogohlantirish chiqmadi",
  );

  // ══ 5) O'QUVCHINI KO'CHIRISH ═══════════════════════════════════
  console.log("\n5) o'quvchini filiallararo ko'chirish");

  await mustPass(
    "preview: ko'chadigan pul va yopiladigan guruhlar ko'rsatiladi",
    async () => {
      await prisma.studentDeposit.create({
        data: { studentId: sB.id, balance: 300_000 },
      });
      return asSuper(() => transferSvc.preview(sB.id, bA.id));
    },
    (p) => {
      if (p.depositBalance !== 300_000) return `depozit=${p.depositBalance}`;
      if (p.groupsToClose.length !== 1) return `${p.groupsToClose.length} guruh`;
      if (!p.groupsToClose[0].groupName) return "guruh nomi bo'sh";
      if (String(p.toBranchId) !== String(bA.id)) return "maqsad filial noto'g'ri";
      return null;
    },
  );

  await mustThrow(
    "o'sha filialga ko'chirib bo'lmaydi",
    () => asSuper(() => transferSvc.preview(sB.id, bB.id)),
    "allaqachon shu filialda",
  );

  await mustThrow(
    "XAVFSIZLIK: A direktori B filial o'quvchisini ko'chira olmaydi",
    // A ning ko'lamida B filial o'quvchisi umuman ko'rinmaydi.
    () => inA(() => transferSvc.transfer(sB.id, { toBranchId: bA.id }, {
      id: null, allowedBranchIds: [bA.id], canSeeAllBranches: false,
    })),
    "huquq",
  );

  await mustPass(
    "ko'chirish ATOMIK: guruh yopiladi, depozit jurnalda ko'chadi, filial o'zgaradi",
    async () => {
      const res = await asSuper(() => transferSvc.transfer(
        sB.id,
        { toBranchId: bA.id, note: "test" },
        { id: null, allowedBranchIds: [bA.id, bB.id], canSeeAllBranches: true },
      ));
      const after = await prisma.user.findUnique({
        where: { id: sB.id },
        select: { homeBranchId: true },
      });
      const open = await prisma.groupMembership.count({
        where: { studentId: sB.id, leftAt: null, isDeleted: false },
      });
      // Jurnalda IKKI tomon ham yozilgan bo'lishi kerak.
      const entries = await prisma.journalEntry.findMany({
        where: { refModel: "User", refId: sB.id },
        include: { lines: true },
      });
      return { res, after, open, entries };
    },
    ({ res, after, open, entries }) => {
      if (res.movedDeposit !== 300_000) return `movedDeposit=${res.movedDeposit}`;
      if (String(after.homeBranchId) !== String(bA.id)) return "filial o'zgarmadi";
      if (open !== 0) return `${open} ta ochiq a'zolik qoldi`;
      if (entries.length !== 2) return `${entries.length} ta jurnal yozuvi (2 kutilgan)`;
      // HAR YOZUV O'Z ICHIDA muvozanatda bo'lishi shart.
      for (const e of entries) {
        if (e.totalDebit !== e.totalCredit) {
          return `yozuv muvozanatsiz: ${e.totalDebit} ≠ ${e.totalCredit}`;
        }
        if (!e.isInternal) return "ichki yozuv deb belgilanmagan (elimination buziladi)";
      }
      return null;
    },
  );

  console.log(`\n=== NATIJA: ${R.pass} o'tdi, ${R.fail} yiqildi ===\n`);
};

run()
  .catch((err) => {
    console.error("\nTEST YIQILDI:", err);
    R.fail += 1;
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("tozalash xatosi:", e.message));
    await prisma.$disconnect();
    process.exit(R.fail ? 1 : 0);
  });
