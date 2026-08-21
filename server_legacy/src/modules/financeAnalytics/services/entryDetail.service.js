import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { hasAnyPermission } from "../../../helpers/permission.helper.js";
import { PERMISSIONS } from "../../../constants/permissions.js";
import { branchFilter } from "../../../helpers/branchContext.helper.js";
import { n } from "./metrics.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * TRANZAKSIYA TAFSILOTI — "bu raqam nimadan iborat?"
 * ══════════════════════════════════════════════════════════════════════
 *
 * MANBA — MAVJUD JURNAL. Yangi jadval YO'Q.
 *
 * Tahlil sahifasidagi har qanday summani oxirigacha kuzatish uchun
 * kerak: daromad → yo'nalish → guruh → o'quvchi → to'lov → JURNAL
 * YOZUVI. Shu zanjirning oxirgi bo'g'ini shu yerda.
 *
 * ── FAQAT MAVJUD ALOQALAR QAYTARILADI ──
 * `dimensions` obyektiga NULL o'lchovlar UMUMAN kirmaydi. Ijara
 * chiqimida `student: null` qaytarilsa, UI "O'quvchi: —" degan bo'sh
 * qator chizardi va ekran ma'nosiz yorliqlar bilan to'lardi. Yo'q
 * narsa — yo'q.
 */

const fullName = (u) =>
  u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.username || "" : null;

const ref = (id, name, extra = {}) => (id ? { id, name: name || "", ...extra } : null);

/** Yozuv turi → o'zbekcha nom (UI da bir xil atama ishlatilsin). */
export const ENTRY_KIND_LABELS = Object.freeze({
  payment: "O'quvchi to'lovi",
  deposit_in: "Depozitga to'ldirish",
  deposit_out: "Depozitdan qaytarish",
  deposit_apply: "Depozitdan qoplash",
  expense: "Chiqim",
  salary: "Maosh to'lovi",
  refund: "Qaytarim",
  payment_fee: "To'lov komissiyasi",
  owner_investment: "Egasi kiritdi",
  owner_withdrawal: "Egasi yechdi",
  account_transfer: "Hisoblar orasida o'tkazma",
  transfer_send: "Inkassatsiya (jo'natildi)",
  transfer_receive: "Inkassatsiya (qabul qilindi)",
  inter_branch: "Filiallararo",
  shift_close: "Smena yopilishi",
  opening: "Boshlang'ich qoldiq",
  adjustment: "Tuzatish",
});

/** Hisob turi → o'zbekcha nom. */
export const ACCOUNT_KIND_LABELS = Object.freeze({
  cash: "Naqd", terminal: "Terminal", click: "Click", payme: "Payme",
  uzcard: "Uzcard", humo: "Humo", bank: "Bank", other: "Boshqa",
  transit: "Yo'ldagi pul", due_from: "Filialdan talab", due_to: "Filialga majburiyat",
  deposit: "O'quvchi depoziti", equity: "Kapital", revenue: "Daromad",
  expense: "Xarajat", shortage: "Kamomad", owner_capital: "Egasi kapitali",
  payment_fee: "To'lov komissiyasi",
});

/**
 * MAOSH MA'LUMOTI SEZGIR.
 *
 * ── NEGA YON ESHIK YOPILADI ──
 * `/finance-analytics/teachers` allaqachon `salary.read` yoki
 * `payroll.read` talab qiladi. Agar tranzaksiya tafsiloti faqat
 * `finance.read` bilan ochilsa, xodim o'sha jadvalni ko'ra olmasa
 * ham, HAR BIR maosh yozuvini bittalab ochib, aynan o'sha
 * ma'lumotni yig'ib olardi.
 *
 * Shuning uchun maosh yozuvi (`kind = "salary"`) uchun O'SHA IKKI
 * ruxsatdan biri SHART. Bu — ta'rifi bo'yicha ochiq chegara: qisman
 * yashirish (summani berkitib, o'qituvchi ismini qoldirish kabi)
 * qaysi bo'lak "yetarlicha xavfsiz" ekani haqida bahsga aylanardi.
 */
const PAYROLL_KINDS = new Set(["salary"]);

export const getEntryDetail = async (id, currentUser, permissions = []) => {
  const entry = await prisma.journalEntry.findFirst({
    // FILIAL KO'LAMI: begona filial yozuvi umuman ochilmaydi.
    where: { id: String(id), ...branchFilter() },
    include: {
      lines: { orderBy: [{ debit: "desc" }] },
      branch: { select: { id: true, name: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, username: true } },
      student: { select: { id: true, firstName: true, lastName: true, username: true } },
      teacher: { select: { id: true, firstName: true, lastName: true, username: true } },
      staff: { select: { id: true, firstName: true, lastName: true, username: true } },
      group: { select: { id: true, name: true } },
      course: { select: { id: true, title: true } },
      room: { select: { id: true, name: true } },
      expenseCategory: { select: { id: true, name: true, kind: true } },
      membership: { select: { id: true, joinedAt: true, leftAt: true } },
    },
  });

  if (!entry) throw new ApiError(404, "Moliyaviy yozuv topilmadi");

  if (PAYROLL_KINDS.has(entry.kind)) {
    const allowed = hasAnyPermission(permissions, [
      PERMISSIONS.SALARY_READ,
      PERMISSIONS.PAYROLL_READ,
    ]);
    if (!allowed) {
      throw new ApiError(403, "Maosh ma'lumotini ko'rish uchun ruxsat yo'q");
    }
  }

  // ── O'LCHOVLAR: faqat MAVJUDLARI ──
  const dimensions = {};
  const put = (k, v) => { if (v) dimensions[k] = v; };
  put("student", ref(entry.studentId, fullName(entry.student)));
  put("teacher", ref(entry.teacherId, fullName(entry.teacher)));
  put("staff", ref(entry.staffId, fullName(entry.staff)));
  put("group", ref(entry.groupId, entry.group?.name));
  put("course", ref(entry.courseId, entry.course?.title));
  put("room", ref(entry.roomId, entry.room?.name));
  put("membership", ref(entry.membershipId, ""));
  put("expenseCategory", ref(entry.expenseCategoryId, entry.expenseCategory?.name, {
    kind: entry.expenseCategory?.kind || null,
  }));
  if (entry.paymentMethod) dimensions.paymentMethod = entry.paymentMethod;
  if (entry.costType) dimensions.costType = entry.costType;
  if (entry.periodYear && entry.periodMonth) {
    dimensions.period = { year: entry.periodYear, month: entry.periodMonth };
  }

  // ── QATORLAR: debet va kredit ALOHIDA ──
  // UI da ular ikki ustunda ko'rsatiladi, shuning uchun bu yerda
  // ajratiladi — frontend qayta saralamasin.
  const debits = [];
  const credits = [];
  for (const l of entry.lines) {
    const row = {
      accountId: l.accountId,
      accountKind: l.accountKind,
      accountLabel: ACCOUNT_KIND_LABELS[l.accountKind] || l.accountKind,
      debit: n(l.debit),
      credit: n(l.credit),
    };
    if (row.debit > 0) debits.push(row);
    else credits.push(row);
  }

  // ── AUDIT ──
  const logs = await prisma.financialAuditLog.findMany({
    where: {
      OR: [
        { entityId: entry.refId || "___none___" },
        ...(entry.postingKey ? [{ entityId: String(entry.postingKey).split(":")[1] || "___none___" }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true, entityType: true, action: true, actorLabel: true, actorId: true,
      amountBefore: true, amountAfter: true, reason: true, changedFields: true,
      createdAt: true,
    },
  });

  // ── MANBA HUJJAT ──
  const source = await resolveSource(entry);

  return {
    id: entry.id,
    postingKey: entry.postingKey,
    kind: entry.kind,
    kindLabel: ENTRY_KIND_LABELS[entry.kind] || entry.kind,
    date: entry.date,
    memo: entry.memo || "",
    // Yozuv summasi = jami debet (muvozanat tufayli kreditga teng).
    amount: n(entry.totalDebit),
    isInternal: entry.isInternal,
    branch: ref(entry.branchId, entry.branch?.name),
    counterpartyBranchId: entry.counterpartyBranchId || null,
    dimensions,
    accounting: {
      debits,
      credits,
      totalDebit: n(entry.totalDebit),
      totalCredit: n(entry.totalCredit),
      // Muvozanat UI da ko'rsatiladi: buzilgan yozuv darhol ko'zga
      // tashlanishi kerak.
      balanced: n(entry.totalDebit) === n(entry.totalCredit),
    },
    audit: {
      createdBy: entry.createdById
        ? ref(entry.createdById, fullName(entry.createdBy))
        : null,
      createdAt: entry.createdAt,
      logs: logs.map((l) => ({
        ...l,
        amountBefore: l.amountBefore === null ? null : n(l.amountBefore),
        amountAfter: l.amountAfter === null ? null : n(l.amountAfter),
      })),
    },
    source,
  };
};

/**
 * MANBA HUJJATGA HAVOLA.
 *
 * Jurnal yozuvi `refModel`/`refId` orqali o'z manbasini biladi. Bu
 * yerda o'sha hujjatning QISQA ko'rinishi olinadi — UI "asl to'lovni
 * ochish" tugmasini shu asosda chizadi.
 *
 * Hujjat o'chirilgan bo'lsa `exists: false` qaytadi: havolani
 * ko'rsatib, keyin 404 ga olib borish yomonroq.
 */
const resolveSource = async (entry) => {
  if (!entry.refModel || !entry.refId) return null;
  const base = { model: entry.refModel, id: entry.refId };

  try {
    if (entry.refModel === "PaymentTransaction") {
      const p = await prisma.paymentTransaction.findUnique({
        where: { id: entry.refId },
        select: {
          id: true, amount: true, feeAmount: true, method: true, paidAt: true,
          note: true, isDeleted: true, year: true, month: true, paymentId: true,
        },
      });
      if (!p) return { ...base, exists: false };
      return {
        ...base, exists: true, label: "To'lovni ochish",
        route: `/owner/finance/student-payments/student/${entry.studentId || ""}`,
        data: {
          gross: n(p.amount), fee: n(p.feeAmount), net: n(p.amount) - n(p.feeAmount),
          method: p.method, paidAt: p.paidAt, note: p.note,
          period: `${p.year}-${String(p.month).padStart(2, "0")}`,
          canceled: p.isDeleted,
        },
      };
    }
    if (entry.refModel === "Expense") {
      const e = await prisma.expense.findUnique({
        where: { id: entry.refId },
        select: {
          id: true, title: true, amount: true, vendor: true, method: true,
          spentAt: true, categoryName: true, isDeleted: true, description: true,
        },
      });
      if (!e) return { ...base, exists: false };
      return {
        ...base, exists: true, label: "Chiqimni ochish",
        route: "/owner/finance/expenses",
        data: {
          title: e.title, amount: n(e.amount), vendor: e.vendor, method: e.method,
          spentAt: e.spentAt, category: e.categoryName, description: e.description,
          canceled: e.isDeleted,
        },
      };
    }
    if (entry.refModel === "Refund") {
      const r = await prisma.refund.findUnique({
        where: { id: entry.refId },
        select: {
          id: true, amount: true, reason: true, status: true, method: true,
          executedAt: true, originalTransactionId: true,
        },
      });
      if (!r) return { ...base, exists: false };
      return {
        ...base, exists: true, label: "Qaytarim",
        data: {
          amount: n(r.amount), reason: r.reason, status: r.status,
          method: r.method, executedAt: r.executedAt,
          originalTransactionId: r.originalTransactionId,
        },
      };
    }
    if (entry.refModel === "SalaryTransaction" || entry.refModel === "StaffSalaryTransaction") {
      const table = entry.refModel === "SalaryTransaction" ? "salaryTransaction" : "staffSalaryTransaction";
      const s = await prisma[table].findUnique({
        where: { id: entry.refId },
        select: { id: true, amount: true, method: true, paidAt: true, year: true, month: true, note: true },
      });
      if (!s) return { ...base, exists: false };
      return {
        ...base, exists: true, label: "Maosh to'lovi",
        data: {
          amount: n(s.amount), method: s.method, paidAt: s.paidAt,
          period: `${s.year}-${String(s.month).padStart(2, "0")}`, note: s.note,
        },
      };
    }
    if (entry.refModel === "DepositTransaction") {
      const d = await prisma.depositTransaction.findUnique({
        where: { id: entry.refId },
        select: { id: true, amount: true, type: true, method: true, paidAt: true, balanceAfter: true },
      });
      if (!d) return { ...base, exists: false };
      return {
        ...base, exists: true, label: "Depozit amali",
        data: { amount: n(d.amount), type: d.type, method: d.method, paidAt: d.paidAt, balanceAfter: n(d.balanceAfter) },
      };
    }
    if (entry.refModel === "CashTransfer") {
      const t = await prisma.cashTransfer.findUnique({
        where: { id: entry.refId },
        select: { id: true, amount: true, status: true, sentAt: true, receivedAt: true },
      });
      if (!t) return { ...base, exists: false };
      return { ...base, exists: true, label: "Inkassatsiya", data: { amount: n(t.amount), status: t.status, sentAt: t.sentAt, receivedAt: t.receivedAt } };
    }
  } catch {
    // Manba o'qilmasa yozuvning O'ZI baribir ko'rsatiladi — tafsilot
    // manba tufayli butunlay yopilib qolmasligi kerak.
    return { ...base, exists: false };
  }

  // `OwnerCapital`, `AccountTransfer`, `Adjustment`, `PaymentFee` —
  // ular alohida hujjatga ega EMAS: jurnal yozuvining o'zi manba.
  return { ...base, exists: false, selfContained: true };
};

/**
 * ══════════════════════════════════════════════════════════════════════
 * YOZUVLAR RO'YXATI — jamlanma bilan tafsilot orasidagi KO'PRIK
 * ══════════════════════════════════════════════════════════════════════
 *
 * NEGA KERAK: tahlil endpoint'lari JAMLANMA qaytaradi ("IELTS — 1.4 mln"),
 * tafsilot esa BITTA yozuvni oladi. Ular orasida bo'shliq bor edi:
 * foydalanuvchi guruhga yetib kelgach, "qaysi to'lovlar bu summani
 * tashkil qiladi?" degan savolga javob yo'q edi.
 *
 * Bu YANGI TAHLIL EMAS — hech narsa hisoblanmaydi. Bu o'sha jurnalning
 * filtrlangan ro'yxati, aynan tahlil ishlatadigan `journalWhere` bilan.
 * Ya'ni ro'yxatdagi summalar yig'indisi tahlildagi raqam bilan MOS
 * keladi, chunki shart bir xil.
 *
 * MAOSH YOZUVLARI: ruxsati bo'lmagan foydalanuvchi uchun ro'yxatdan
 * BUTUNLAY chiqariladi (tafsilotdagi 403 bilan bir xil chegara —
 * aks holda ro'yxatda summalar ko'rinib qolardi).
 */
export const listEntries = async (filters, permissions = []) => {
  const { parseRange, journalWhere } = await import("./analyticsFilter.js");
  const { Prisma } = await import("@prisma/client");
  const range = parseRange(filters);
  const limit = Math.min(Number(filters.limit) || 25, 100);

  const where = journalWhere({
    ...range,
    branchId: filters.branchId || null,
    dimensions: filters,
    // Ichki o'tkazma va egasining puli ham ko'rinadi: ro'yxat
    // "shu kesimda nima bo'lgan" degan savolga javob beradi.
    excludeNonOperating: false,
  });

  const canPayroll = hasAnyPermission(permissions, [
    PERMISSIONS.SALARY_READ,
    PERMISSIONS.PAYROLL_READ,
  ]);
  const payrollClause = canPayroll ? Prisma.empty : Prisma.sql`AND e.kind <> 'salary'`;

  /**
   * HISOB BO'YICHA FILTR — "Bank hisobini bosdim, nima bo'lgan?"
   *
   * ── NEGA `EXISTS`, JOIN EMAS ──
   * Hisob turi yozuvda emas, uning QATORLARIDA (`journal_lines`).
   * `JOIN` qilinsa, ikki qatori bir xil hisobga tegadigan yozuv
   * ro'yxatda IKKI MARTA chiqardi va summalar qo'shilib ketardi.
   * `EXISTS` esa yozuvni bir marta beradi — "shu hisobga tegdimi?"
   * degan savolga ha/yo'q javob.
   *
   * Kalit qat'iy ro'yxatdan (zod enum) keladi, ya'ni bu yerda
   * in'ektsiya mumkin emas; baribir parametr sifatida uzatiladi.
   */
  const accountClause = filters.accountKind
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM journal_lines jl
        WHERE jl."entryId" = e.id
          AND jl."accountKind"::text = ${String(filters.accountKind)}
      )`
    : Prisma.empty;

  const rows = await prisma.$queryRaw`
    SELECT e.id, e.kind::text AS kind, e.date, e.memo, e."totalDebit" AS amount,
           e."postingKey", e."refModel", e."paymentMethod"::text AS "paymentMethod"
    FROM journal_entries e
    WHERE ${where} ${payrollClause} ${accountClause}
    ORDER BY e.date DESC, e."createdAt" DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    kindLabel: ENTRY_KIND_LABELS[r.kind] || r.kind,
    date: r.date,
    memo: r.memo || "",
    amount: n(r.amount),
    postingKey: r.postingKey,
    refModel: r.refModel,
    paymentMethod: r.paymentMethod,
  }));
};
