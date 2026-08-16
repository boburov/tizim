/**
 * CHIQIMLAR + TASDIQ ZANJIRI — PostgreSQL (Prisma) USTIDA.
 *
 * Zanjir:
 *   ExpenseCategory → Expense → Journal (qo'sh yozuv)
 *                  ↘ limitdan oshsa → Approval → approve → executeApprovedExpense
 *
 * NEGA TASDIQ QISMI SHU YERDA: `expenseApproval.service.js` ni 29 fayl
 * ishlatadi (jumladan allaqachon ko'chirilgan users, groups,
 * teacherSalary, deposits, finance, staffPayroll). U butun moliyaviy
 * zanjirning to'sig'i edi va uning qaror yo'llari shu to'lqinda
 * ko'chirildi - ya'ni ular aynan shu yerda sinaladi.
 *
 * Ko'chishda JIMGINA buzilishi mumkin bo'lgan joylar:
 *   1) ATOMIK QAROR. Mongo `findOneAndUpdate({status: PENDING})` edi;
 *      Prisma'da `updateMany` + `count` (o'qi-keyin-yoz EMAS).
 *   2) AYNAN BIR MARTA. Tasdiqlangan so'rov ikki marta bajarilmasligi
 *      kerak - qisman unique indeks + mavjudlik tekshiruvi.
 *   3) SUBYEKT QULFI. Bitta subyektga bitta kutilayotgan so'rov.
 *   4) MARKAZ UMUMIY chiqimi (branchId = null) ro'yxatdan TUSHMASLIGI.
 *   5) VALYUTA/KAPITAL invariantlari (avval pre("validate") hook'i).
 *
 * ISHLATISH:  npm run test:expenses-chain
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import * as expenses from "../src/modules/expenses/services/expense.service.js";
import * as categories from "../src/modules/expenses/services/expenseCategory.service.js";
import * as approvals from "../src/modules/expenseApprovals/services/expenseApproval.service.js";
import { runWithBranchContext } from "../src/helpers/branchContext.helper.js";
import { APPROVAL_KINDS, APPROVAL_STATUSES } from "../src/constants/approvals.js";
import { PERMISSIONS } from "../src/constants/permissions.js";

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
      bad(name, `boshqa xato: ${msg.slice(0, 130)}`);
    } else ok(name, msg.split("\n")[0].slice(0, 60));
  }
};

const S = `exp${Date.now().toString(36)}`;
const created = { users: [], branches: [], categories: [] };

const cleanup = async () => {
  const { users: uids, branches, categories: cats } = created;
  if (branches.length) {
    await prisma.expense.deleteMany({ where: { branchId: { in: branches } } });
    await prisma.approval.deleteMany({ where: { branchId: { in: branches } } });
  }
  if (cats.length) {
    await prisma.expense.deleteMany({ where: { categoryId: { in: cats } } });
    await prisma.expenseCategory.deleteMany({ where: { id: { in: cats } } });
  }
  if (uids.length) {
    await prisma.expense.deleteMany({ where: { createdById: { in: uids } } });
    await prisma.approval.deleteMany({ where: { requestedById: { in: uids } } });
  }
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
  }
  if (uids.length) await prisma.user.deleteMany({ where: { id: { in: uids } } });
  if (branches.length) await prisma.branch.deleteMany({ where: { id: { in: branches } } });
};

const mkUser = async (name, branchId) => {
  const u = await prisma.user.create({
    data: {
      firstName: name,
      lastName: "Test",
      username: `${name.toLowerCase()}_${S}`,
      passwordHash: "x",
      role: "reception",
      homeBranchId: branchId,
      hiredAt: new Date(Date.UTC(2024, 0, 1)),
    },
  });
  created.users.push(u.id);
  return u;
};

const run = async () => {
  console.log("\n=== CHIQIMLAR + TASDIQ ZANJIRI / PRISMA TESTI ===\n");
  await prisma.$queryRaw`SELECT 1`;

  const br = await prisma.branch.create({ data: { name: `Chiqim ${S}` } });
  const brB = await prisma.branch.create({ data: { name: `Chiqim B ${S}` } });
  created.branches.push(br.id, brB.id);

  const requester = await mkUser("Sorovchi", br.id);
  const approver = await mkUser("Tasdiqlovchi", br.id);

  const scope = {
    branchId: br.id,
    allowedBranchIds: [br.id],
    canSeeAllBranches: false,
    userId: null,
  };
  const inBr = (fn) => runWithBranchContext(scope, fn);

  // Cheklangan huquqli so'rovchi: limitdan oshsa TASDIQ kerak.
  const staff = { id: requester.id, permissions: [PERMISSIONS.FINANCE_READ] };
  // Owner huquqi - limitdan ozod.
  const owner = { id: approver.id, permissions: ["*"] };
  const decider = { id: approver.id, permissions: [PERMISSIONS.FINANCE_APPROVE] };

  // ══ 1) KATEGORIYALAR ═══════════════════════════════════════════
  console.log("1) chiqim kategoriyalari");

  const cat = await mustPass(
    "kategoriya yaratiladi",
    () => inBr(() => categories.create({ name: `Ijara ${S}`, kind: "operating", branchId: br.id }, owner)),
    (c) => (c?._id ? null : "yaratilmadi"),
  );
  if (cat) created.categories.push(cat._id);

  const shared = await mustPass(
    "UMUMIY kategoriya (branchId = null) yaratiladi",
    () => inBr(() => categories.create({ name: `Umumiy ${S}`, kind: "operating", branchId: null }, owner)),
    (c) => (c?.branchId === null ? null : `branchId=${c?.branchId}`),
  );
  if (shared) created.categories.push(shared._id);

  await mustPass(
    "ro'yxatda FILIAL va UMUMIY kategoriyalar BIRGA chiqadi",
    () => inBr(() => categories.list()),
    (rows) => {
      const ids = rows.map((r) => r._id);
      if (!ids.includes(cat._id)) return "filial kategoriyasi yo'q";
      if (!ids.includes(shared._id)) return "UMUMIY kategoriya tushib qoldi";
      return null;
    },
  );

  await mustThrow(
    "bir xil nomli kategoriya rad etiladi (qisman unique)",
    () => inBr(() => categories.create({ name: `Ijara ${S}`, branchId: br.id }, owner)),
    "allaqachon mavjud",
  );

  // ══ 2) TO'G'RIDAN-TO'G'RI CHIQIM + JURNAL ══════════════════════
  console.log("\n2) chiqim yozish va jurnal");

  const exp1 = await mustPass(
    "owner limitdan OZOD - chiqim darhol yoziladi",
    () => inBr(() => expenses.create(
      { category: cat._id, title: "Avgust ijarasi", amount: 5_000_000, method: "cash", branchId: br.id },
      owner,
    )),
    (e) => {
      if (e?.pendingApproval) return "tasdiq so'raldi, holbuki owner ozod";
      if (e?.amount !== 5_000_000) return `summa ${e?.amount}`;
      if (e?.categoryName !== cat.name) return "kategoriya nomi snapshot bo'lmadi";
      return null;
    },
  );

  await mustPass(
    "JURNAL yozuvi muvozanatda (debet = kredit)",
    async () => {
      const entry = await prisma.journalEntry.findFirst({
        where: { branchId: br.id, refModel: "Expense", refId: exp1._id },
        include: { lines: true },
      });
      return entry;
    },
    (e) => {
      if (!e) return "jurnal yozuvi yo'q";
      if (e.totalDebit !== e.totalCredit) return `${e.totalDebit} ≠ ${e.totalCredit}`;
      if (e.totalDebit !== 5_000_000) return `summa ${e.totalDebit}`;
      if (e.lines.length !== 2) return `${e.lines.length} qator`;
      return null;
    },
  );

  await mustPass(
    "jami summa SAHIFADAN MUSTAQIL hisoblanadi",
    () => inBr(() => expenses.list({ limit: 1 })),
    (r) => {
      if (r.items.length !== 1) return `${r.items.length} element (limit 1)`;
      if (r.totalAmount < 5_000_000) return `totalAmount=${r.totalAmount} - faqat sahifadan hisoblangan`;
      return null;
    },
  );

  // ══ 3) YO'QOLGAN pre("validate") INVARIANTLARI ═════════════════
  console.log("\n3) valyuta va kapital invariantlari");

  await mustThrow(
    "kurssiz valyutali chiqim rad etiladi",
    () => inBr(() => expenses.create(
      { category: cat._id, title: "USD xarid", amount: 100, currency: "USD", branchId: br.id },
      owner,
    )),
    "kurs",
  );

  await mustThrow(
    "muddatsiz kapital chiqim rad etiladi",
    () => inBr(() => expenses.create(
      { category: cat._id, title: "Kompyuter", amount: 10_000_000, isCapital: true, branchId: br.id },
      owner,
    )),
    "amortizatsiya",
  );

  await mustPass(
    "kursli valyutali chiqim UZS ga o'giriladi va MUZLATILADI",
    () => inBr(() => expenses.create(
      {
        category: cat._id, title: "USD xarid", currency: "USD",
        originalAmount: 100, exchangeRate: 12_500, branchId: br.id,
      },
      owner,
    )),
    (e) => {
      if (e?.amount !== 1_250_000) return `amount=${e?.amount} (1 250 000 kutilgan)`;
      if (e?.exchangeRate !== 12_500) return "kurs saqlanmadi";
      return null;
    },
  );

  // ══ 4) TASDIQ OQIMI ════════════════════════════════════════════
  console.log("\n4) tasdiq oqimi (limit → so'rov → tasdiq → bajarish)");

  // Filialga past limit qo'yamiz - shunda cheklangan xodim tasdiqqa
  // tushadi. LIMIT `Branch.expenseApprovalThreshold` da, `delegation`
  // matritsasida EMAS: delegatsiya KONFIGURATSIYA o'zgarishlari uchun
  // (chegirma, maosh stavkasi), chiqim esa bir martalik summa.
  await prisma.branch.update({
    where: { id: br.id },
    data: { expenseApprovalThreshold: 100_000 },
  });

  const pending = await mustPass(
    "limitdan oshgan chiqim HUJJAT YARATMAYDI, so'rov ochadi",
    () => inBr(() => expenses.create(
      { category: cat._id, title: `Katta xarid ${S}`, amount: 9_000_000, branchId: br.id },
      staff,
    )),
    (r) => {
      if (!r?.pendingApproval) return "tasdiq so'ralmadi";
      if (r.approval?.status !== APPROVAL_STATUSES.PENDING) return `status=${r.approval?.status}`;
      return null;
    },
  );

  await mustPass(
    "tasdiq kutilayotgan chiqim RO'YXATDA YO'Q (hisobotga sizmaydi)",
    () => inBr(() => expenses.list({ limit: 200 })),
    (r) => (r.items.some((i) => i.title === `Katta xarid ${S}`) ? "yozilib qolgan" : null),
  );

  await mustThrow(
    "O'Z so'rovini O'ZI tasdiqlay olmaydi",
    () => inBr(() => approvals.approve(
      pending.approval.id, {},
      { id: requester.id }, [PERMISSIONS.FINANCE_APPROVE],
    )),
    "o'zingiz tasdiqlay olmaysiz",
  );

  await mustThrow(
    "ruxsatsiz odam tasdiqlay olmaydi",
    () => inBr(() => approvals.approve(pending.approval.id, {}, decider, [])),
    "huquqingiz yo'q",
  );

  const approved = await mustPass(
    "tasdiqlanadi va DARHOL bajariladi",
    () => inBr(() => approvals.approve(
      pending.approval.id, { note: "ok" }, decider, [PERMISSIONS.FINANCE_APPROVE],
    )),
    (a) => {
      if (a?.status !== APPROVAL_STATUSES.EXECUTED) return `status=${a?.status}`;
      if (!a?.resultTransactionId) return "natija ID yozilmadi";
      return null;
    },
  );

  await mustPass(
    "bajarilgandan keyin chiqim RO'YXATDA paydo bo'ladi",
    () => inBr(() => expenses.list({ limit: 200 })),
    (r) => {
      const hit = r.items.find((i) => i.title === `Katta xarid ${S}`);
      if (!hit) return "chiqim yozilmadi";
      if (hit.amount !== 9_000_000) return `summa ${hit.amount}`;
      if (hit.expenseApprovalId !== pending.approval.id) return "tasdiqqa bog'lanmadi";
      return null;
    },
  );

  await mustThrow(
    "ikkinchi marta tasdiqlab bo'lmaydi (atomik qaror)",
    () => inBr(() => approvals.approve(
      pending.approval.id, {}, decider, [PERMISSIONS.FINANCE_APPROVE],
    )),
    "allaqachon ko'rib chiqilgan",
  );

  await mustPass(
    "AYNAN BIR MARTA: bajaruvchi qayta chaqirilsa YANGI chiqim yozmaydi",
    async () => {
      const before = await prisma.expense.count({
        where: { expenseApprovalId: pending.approval.id },
      });
      const full = await prisma.approval.findUnique({ where: { id: pending.approval.id } });
      await expenses.executeApprovedExpense(full);
      const after = await prisma.expense.count({
        where: { expenseApprovalId: pending.approval.id },
      });
      return { before, after };
    },
    ({ before, after }) =>
      before === 1 && after === 1 ? null : `${before} -> ${after} (1 -> 1 kutilgan)`,
  );

  // ══ 5) SUBYEKT QULFI VA QOLGAN QARORLAR ════════════════════════
  console.log("\n5) subyekt qulfi, rad etish, bekor qilish, qayta urinish");

  const key = `subj-${S}`;
  const first = await mustPass(
    "subyekt kaliti bilan so'rov yaratiladi",
    () => approvals.createRequest({
      branchId: br.id, kind: APPROVAL_KINDS.EXPENSE_CREATE, amount: 1000,
      payload: {}, subjectKey: key, subjectName: "A", currentUser: staff,
    }),
    (a) => (a?.id ? null : "yaratilmadi"),
  );

  await mustThrow(
    "SUBYEKT QULFI: ikkinchi kutilayotgan so'rov to'siladi",
    () => approvals.createRequest({
      branchId: br.id, kind: APPROVAL_KINDS.EXPENSE_CREATE, amount: 2000,
      payload: {}, subjectKey: key, subjectName: "A", currentUser: staff,
    }),
    "allaqachon mavjud",
  );

  await mustPass(
    "rad etiladi (atomik)",
    () => approvals.reject(first.id, { note: "kerak emas" }, decider, [PERMISSIONS.FINANCE_APPROVE]),
    (a) => (a?.status === APPROVAL_STATUSES.REJECTED ? null : `status=${a?.status}`),
  );

  await mustThrow(
    "rad etilganini qayta rad etib bo'lmaydi",
    () => approvals.reject(first.id, {}, decider, [PERMISSIONS.FINANCE_APPROVE]),
    "allaqachon ko'rib chiqilgan",
  );

  await mustPass(
    "qulf BO'SHAYDI - rad etilgandan keyin yangi so'rov mumkin",
    () => approvals.createRequest({
      branchId: br.id, kind: APPROVAL_KINDS.EXPENSE_CREATE, amount: 3000,
      payload: {}, subjectKey: key, subjectName: "A", currentUser: staff,
    }),
    (a) => (a?.id ? null : "qulf bo'shamadi"),
  );

  await mustPass(
    "so'rovchi O'Z so'rovini bekor qiladi",
    async () => {
      const a = await approvals.createRequest({
        branchId: br.id, kind: APPROVAL_KINDS.EXPENSE_CREATE, amount: 4000,
        payload: {}, subjectName: "B", currentUser: staff,
      });
      return approvals.cancel(a.id, staff);
    },
    (a) => (a?.status === APPROVAL_STATUSES.CANCELED ? null : `status=${a?.status}`),
  );

  await mustThrow(
    "BEGONA so'rovni bekor qilib bo'lmaydi",
    async () => {
      const a = await approvals.createRequest({
        branchId: br.id, kind: APPROVAL_KINDS.EXPENSE_CREATE, amount: 5000,
        payload: {}, subjectName: "C", currentUser: staff,
      });
      return approvals.cancel(a.id, decider);
    },
    "faqat o'z so'rovingizni",
  );

  await mustPass(
    "XATO holatidagi so'rov qayta urinishga qaytariladi",
    async () => {
      // Bajaruvchi yiqiladigan so'rov: kategoriya payload'da yo'q.
      const a = await approvals.createRequest({
        branchId: br.id, kind: APPROVAL_KINDS.EXPENSE_CREATE, amount: 6000,
        payload: { title: "Buzuq" }, subjectName: "D", currentUser: staff,
      });
      try {
        await approvals.approve(a.id, {}, decider, [PERMISSIONS.FINANCE_APPROVE]);
      } catch {
        /* bajarish yiqilishi KUTILGAN */
      }
      const failed = await prisma.approval.findUnique({ where: { id: a.id } });
      const retried = await approvals.retry(a.id, [PERMISSIONS.FINANCE_APPROVE]);
      return { failed, retried };
    },
    ({ failed, retried }) => {
      if (failed?.status !== APPROVAL_STATUSES.FAILED) return `bajarishdan keyin status=${failed?.status}`;
      if (!failed?.failureReason) return "xato sababi yozilmadi";
      if (retried?.status !== APPROVAL_STATUSES.PENDING) return `qayta urinishdan keyin status=${retried?.status}`;
      return null;
    },
  );

  // ══ 5b) SUMMA INVARIANTI (avval Mongoose modelida) ═════════════
  console.log("\n5b) tasdiq summasi invarianti");

  await mustThrow(
    "SERVIS: moliyaviy so'rov summasiz rad etiladi",
    () => approvals.createRequest({
      branchId: br.id, kind: APPROVAL_KINDS.EXPENSE_CREATE,
      amount: null, payload: {}, subjectName: "Summasiz", currentUser: staff,
    }),
    "summa ko'rsatilishi shart",
  );

  await mustThrow(
    "SERVIS: manfiy summa rad etiladi",
    () => approvals.createRequest({
      branchId: br.id, kind: APPROVAL_KINDS.EXPENSE_CREATE,
      amount: -5000, payload: {}, subjectName: "Manfiy", currentUser: staff,
    }),
    "manfiy",
  );

  await mustThrow(
    "SERVIS: so'rovchisiz so'rov rad etiladi (FK NOT NULL)",
    () => approvals.createRequest({
      branchId: br.id, kind: APPROVAL_KINDS.EXPENSE_CREATE,
      amount: 1000, payload: {}, subjectName: "Egasiz", currentUser: null,
    }),
    "so'rovchi aniqlanmadi",
  );

  await mustThrow(
    "BAZA: xom SQL ham moliyaviy so'rovni summasiz yoza olmaydi",
    () => prisma.$executeRawUnsafe(
      `INSERT INTO expense_approvals (id,"branchId",kind,category,"requestedById","updatedAt")
       VALUES (gen_object_id(),'${br.id}','expense_create','financial','${requester.id}',NOW())`,
    ),
    "expense_approvals_financial_amount_check",
  );

  // ══ 6) FILIAL IZOLYATSIYASI ════════════════════════════════════
  console.log("\n6) filial izolyatsiyasi");

  const bCat = await categories.create({ name: `B kat ${S}`, branchId: brB.id }, owner);
  created.categories.push(bCat._id);
  const bExp = await runWithBranchContext(
    { branchId: brB.id, allowedBranchIds: [brB.id], canSeeAllBranches: false, userId: null },
    () => expenses.create(
      { category: bCat._id, title: `B chiqimi ${S}`, amount: 700_000, branchId: brB.id },
      owner,
    ),
  );

  await mustPass(
    "A filial ro'yxatida B filial chiqimi YO'Q",
    () => inBr(() => expenses.list({ limit: 500 })),
    (r) => (r.items.some((i) => i._id === bExp._id) ? "B filial chiqimi sizib chiqdi" : null),
  );

  await mustThrow(
    "A kontekstida B filial chiqimini ID bilan ocholmaydi",
    () => inBr(() => expenses.getById(bExp._id)),
    "topilmadi",
  );

  await mustPass(
    "MARKAZ UMUMIY chiqimi HAR IKKALA filialda ko'rinadi",
    async () => {
      // `branchId: null` chiqimni to'g'ridan-to'g'ri yozamiz: servis
      // yo'li tasdiq talab qiladi va `Approval.branchId` majburiy
      // (qarang expense.service.js dagi [MAVJUD XATO] izohi).
      const shared0 = await prisma.expense.create({
        data: {
          branchId: null, categoryId: shared._id, categoryName: shared.name,
          categoryKind: shared.kind, title: `Markaz ${S}`, amount: 3_000_000,
          spentAt: new Date(), accrualYear: 2026, accrualMonth: 8,
        },
      });
      const a = await inBr(() => expenses.list({ limit: 500 }));
      const b = await runWithBranchContext(
        { branchId: brB.id, allowedBranchIds: [brB.id], canSeeAllBranches: false, userId: null },
        () => expenses.list({ limit: 500 }),
      );
      return { shared0, a, b };
    },
    ({ shared0, a, b }) => {
      if (!a.items.some((i) => i._id === shared0.id)) return "A filialda ko'rinmadi";
      if (!b.items.some((i) => i._id === shared0.id)) return "B filialda ko'rinmadi";
      return null;
    },
  );

  await mustPass(
    "branch-only ko'lamida UMUMIY chiqim CHIQARIB TASHLANADI",
    () => inBr(() => expenses.list({ limit: 500, branchScope: "branch-only" })),
    (r) => (r.items.some((i) => i.branchId === null) ? "umumiy chiqim qoldi" : null),
  );

  // ══ 7) HISOBOT YIG'MASI ════════════════════════════════════════
  console.log("\n7) kategoriya bo'yicha yig'ma");

  await mustPass(
    "summaryByCategory kategoriya bo'yicha guruhlaydi",
    () => inBr(() => expenses.summaryByCategory({ year: 2026, month: 8 })),
    (rows) => {
      if (!Array.isArray(rows)) return "massiv emas";
      const mine = rows.find((r) => r.categoryId === cat._id);
      if (!mine) return "kategoriya topilmadi";
      if (typeof mine.total !== "number") return "total son emas";
      if (typeof mine.count !== "number") return "count son emas";
      // Kamayish tartibi
      for (let i = 1; i < rows.length; i += 1) {
        if (rows[i - 1].total < rows[i].total) return "kamayish tartibida emas";
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
