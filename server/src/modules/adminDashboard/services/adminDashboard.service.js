import prisma from "../../../config/prisma.js";
import { ROLES } from "../../../constants/roles.js";
import {
  branchFilter,
  branchGroupFilter,
  userBranchCondition,
} from "../../../helpers/branchContext.helper.js";

// ═══════════════════════════════════════════════════════════════════════════
// DIQQAT — MAYDON NOMLARI O'ZGARDI.
//
// Mongo'da bog'lanish maydoni `group` / `student` edi, Prisma'da esa
// `groupId` / `studentId`. Shuning uchun ko'lam helperlariga maydon nomi
// OCHIQ uzatiladi: `branchGroupFilter("groupId")`.
//
// Standart qiymatga tayanib qolish xavfli: `group` nomli ustun yo'q, ya'ni
// Prisma xato beradi - lekin ba'zi joyda filtr JIMGINA tushib qolishi
// mumkin edi va dashboard butun tashkilot raqamlarini ko'rsatardi.
// ═══════════════════════════════════════════════════════════════════════════

// === Sana yordamchilari (UTC) ===
const monthRange = (year, month) => {
  const y = Number(year);
  const m = Number(month);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { start, end };
};

const todayRange = () => {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
  );
  return { start, end };
};

const previousMonths = (count) => {
  const now = new Date();
  const arr = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    arr.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return arr;
};

// === Bugungi davomat taqsimoti (gauge uchun) ===
const computeAttendanceGauge = async () => {
  const { start, end } = todayRange();

  // Mongo: aggregate([$match, $group by status]).
  // Prisma: groupBy - bitta so'rov, bazada hisoblanadi.
  const rows = await prisma.attendance.groupBy({
    by: ["status"],
    where: {
      // FILIAL: Attendance'da branchId yo'q - guruh orqali bog'lanadi.
      ...(await branchGroupFilter("groupId")),
      date: { gte: start, lte: end },
      isDeleted: false,
    },
    _count: { _all: true },
  });

  const counts = { present: 0, late: 0, excused: 0, absent: 0, exempt: 0 };
  for (const r of rows) counts[r.status] = r._count._all || 0;

  // Yagona ta'rif: maxraj = present + absent + late (exempt va excused tashqarida)
  const denom = counts.present + counts.late + counts.absent;
  const rate =
    denom === 0 ? null : Math.round(((counts.present + counts.late) / denom) * 100);
  return {
    rate,
    present: counts.present,
    late: counts.late,
    absent: counts.absent,
    total: denom,
  };
};

const DAY_LABELS = ["Yak", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

// So'nggi 30 kun ichida har hafta kunidagi dars (davomat yozuvi) soni - bar chart.
const computeWeekdayActivity = async () => {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30, 0, 0, 0, 0),
  );

  // Mongo'da bu `$group: { _id: { $dayOfWeek: "$date" } }` edi.
  //
  // XOM SQL ISHLATILMADI (`EXTRACT(DOW ...)` bo'lardi): u holda filial
  // ko'lami sharti ham QO'LDA SQL'ga ko'chirilishi kerak edi, ya'ni
  // xavfsizlik qoidasi ikki joyda ikki xil yozilardi. Bu yerda faqat
  // `date` ustuni o'qiladi (30 kunlik yozuvlar) va guruhlash JS'da -
  // ko'lam mantig'i yagona manbada (`branchGroupFilter`) qoladi.
  const rows = await prisma.attendance.findMany({
    where: {
      ...(await branchGroupFilter("groupId")),
      date: { gte: start },
      isDeleted: false,
    },
    select: { date: true },
  });

  const counts = new Array(7).fill(0);
  for (const r of rows) counts[new Date(r.date).getUTCDay()] += 1;

  // Du-Yak tartibida qaytaramiz
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((idx) => ({ day: DAY_LABELS[idx], lessonsCount: counts[idx] }));
};

// Oylik kirim (to'lov tranzaksiyalari yig'indisi)
const computeRevenue = async (start, end) => {
  const row = await prisma.paymentTransaction.aggregate({
    where: {
      // FILIAL: PaymentTransaction'da branchId bor (denormalizatsiya).
      ...branchFilter(),
      paidAt: { gte: start, lte: end },
      isDeleted: false,
    },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return { total: row._sum.amount || 0, count: row._count._all || 0 };
};

// So'nggi to'lovlar ro'yxati
const computeRecentPayments = async () => {
  const rows = await prisma.paymentTransaction.findMany({
    where: { ...branchFilter(), isDeleted: false },
    orderBy: { paidAt: "desc" },
    take: 5,
    include: {
      student: { select: { firstName: true, lastName: true } },
      group: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: String(r.id),
    studentName: r.student
      ? `${r.student.firstName} ${r.student.lastName || ""}`.trim()
      : "Noma'lum",
    groupName: r.group?.name || "-",
    amount: r.amount,
    method: r.method,
    paidAt: r.paidAt,
  }));
};

// Eng faol o'qituvchilar - faol guruhlardagi o'quvchilar soni bo'yicha.
const computeTopTeachers = async () => {
  // Mongo'da bu $unwind + ikkita $lookup + $group edi. Prisma'da
  // relation'lar bilan bitta so'rov: guruhlar, ularning o'qituvchilari va
  // FAOL a'zolar soni birga keladi.
  //
  // Guruhlar soni kichik (yuzlab), shuning uchun yig'ish JS'da - bu
  // $lookup quvurini takrorlashdan ancha o'qiladigan va xatoga
  // kamroq moyil.
  const groups = await prisma.group.findMany({
    where: { ...branchFilter(), isActive: true, isDeleted: false },
    select: {
      teachers: { select: { id: true, firstName: true, lastName: true } },
      _count: {
        select: {
          memberships: { where: { leftAt: null, isDeleted: false } },
        },
      },
    },
  });

  const byTeacher = new Map();
  for (const g of groups) {
    const students = g._count.memberships || 0;
    for (const t of g.teachers) {
      const cur = byTeacher.get(t.id) || {
        id: String(t.id),
        name: `${t.firstName} ${t.lastName || ""}`.trim(),
        groupsCount: 0,
        studentsCount: 0,
      };
      cur.groupsCount += 1;
      cur.studentsCount += students;
      byTeacher.set(t.id, cur);
    }
  }

  return [...byTeacher.values()]
    .sort(
      (a, b) => b.studentsCount - a.studentsCount || b.groupsCount - a.groupsCount,
    )
    .slice(0, 4);
};

// === Asosiy: getOverview ===
export const getOverview = async ({ year, month } = {}) => {
  const now = new Date();
  const y = year ? Number(year) : now.getUTCFullYear();
  const m = month ? Number(month) : now.getUTCMonth() + 1;
  const { start, end } = monthRange(y, m);
  const prev = monthRange(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);

  // Foydalanuvchi filtri: userBranchCondition() OR beradi, shuning uchun
  // uni AND ichiga qo'yamiz (boshqa OR bilan to'qnashmasin).
  const userScoped = (base) => {
    const cond = userBranchCondition();
    return cond ? { ...base, AND: [cond] } : base;
  };
  // A'zoliklar guruh orqali filialga bog'lanadi (branchId maydoni yo'q).
  const memberScope = await branchGroupFilter("groupId");

  const [
    studentsCount,
    teachersCount,
    activeGroupsCount,
    newStudentsThisMonth,
    lostStudentsThisMonth,
    newLeadsThisMonth,
    pendingLeads,
    revenueThisMonth,
    revenueLastMonth,
    attendanceGauge,
    weekdayActivity,
    recentPayments,
    topTeachers,
  ] = await Promise.all([
    // FILIAL: bu hisoblagichlarda filtr YO'Q edi - dashboard tanlangan
    // filialda turib BUTUN tashkilot sonlarini ko'rsatardi.
    prisma.user.count({
      where: userScoped({ role: ROLES.STUDENT, isActive: true, isDeleted: false }),
    }),
    prisma.user.count({
      where: userScoped({ role: ROLES.TEACHER, isActive: true, isDeleted: false }),
    }),
    prisma.group.count({
      where: { ...branchFilter(), isActive: true, isDeleted: false },
    }),
    // GroupMembership'da branchId yo'q - guruh orqali.
    prisma.groupMembership.count({
      where: { ...memberScope, joinedAt: { gte: start, lte: end }, isDeleted: false },
    }),
    prisma.groupMembership.count({
      where: { ...memberScope, leftAt: { gte: start, lte: end }, isDeleted: false },
    }),
    prisma.lead.count({
      where: { ...branchFilter(), createdAt: { gte: start, lte: end } },
    }),
    prisma.lead.count({
      where: { ...branchFilter(), status: { in: ["new", "info_given", "trial"] } },
    }),
    computeRevenue(start, end),
    computeRevenue(prev.start, prev.end),
    computeAttendanceGauge(),
    computeWeekdayActivity(),
    computeRecentPayments(),
    computeTopTeachers(),
  ]);

  // O'zgarish foizi (o'tgan oyga nisbatan kirim)
  const revenueDelta =
    revenueLastMonth.total > 0
      ? Math.round(
          ((revenueThisMonth.total - revenueLastMonth.total) /
            revenueLastMonth.total) *
            100,
        )
      : null;

  return {
    period: { year: y, month: m },
    studentsCount,
    teachersCount,
    activeGroupsCount,
    newStudentsThisMonth,
    lostStudentsThisMonth,
    netGrowth: newStudentsThisMonth - lostStudentsThisMonth,
    newLeadsThisMonth,
    pendingLeads,
    revenueThisMonth: revenueThisMonth.total,
    revenueLastMonth: revenueLastMonth.total,
    paymentsCount: revenueThisMonth.count,
    revenueDelta,
    attendanceGauge,
    todayAttendanceRate: attendanceGauge.rate,
    weekdayActivity,
    recentPayments,
    topTeachers,
  };
};

// === getStudentFlow (o'quvchilar oqimi - oylik) ===
export const getStudentFlow = async ({ months = 6 } = {}) => {
  const periods = previousMonths(months);
  // FILIAL: a'zoliklar guruh orqali (GroupMembership'da branchId yo'q).
  // Bir marta hisoblab, sikl ichida qayta ishlatamiz.
  const flowScope = await branchGroupFilter("groupId");
  const result = [];
  for (const p of periods) {
    const { start, end } = monthRange(p.year, p.month);
    const [joined, left] = await Promise.all([
      prisma.groupMembership.count({
        where: { ...flowScope, joinedAt: { gte: start, lte: end }, isDeleted: false },
      }),
      prisma.groupMembership.count({
        where: { ...flowScope, leftAt: { gte: start, lte: end }, isDeleted: false },
      }),
    ]);
    result.push({ year: p.year, month: p.month, joined, left, netGrowth: joined - left });
  }
  return result;
};

// === getCashflow (moliyaviy kirim/chiqim bar chart) ===
// range: "week" | "month" -> kunlik buckets, "year" -> oylik buckets.
//
// Kirim  = PaymentTransaction (o'quvchi to'lovlari)
// Chiqim = SalaryTransaction (maosh) + Expense (ijara, kommunal, ta'mir...)
//
// MUHIM: ilgari chiqim FAQAT maoshdan iborat edi - grafik markazning haqiqiy
// xarajatini ko'rsatmasdi va foyda doim yuqori ko'rinardi.
//
// Sana maydoni modelga qarab farq qiladi (paidAt / spentAt).

// Mongo'da bu `$dateToString` / `$month` bilan bazada guruhlanardi.
// Prisma'da sana bo'yicha guruhlash yo'q, XOM SQL esa filial shartini
// ikkinchi marta (SQL'da) yozishni talab qilardi - ya'ni ko'lam qoidasi
// ikki joyda bo'lib qolardi. Shuning uchun faqat KERAKLI ikki ustun
// o'qiladi (sana + summa) va bucket JS'da yig'iladi.
const sumBuckets = async (delegate, start, end, dateField, keyOf) => {
  const rows = await delegate.findMany({
    where: {
      // FILIAL: PaymentTransaction/SalaryTransaction/Expense'da branchId bor.
      ...branchFilter(),
      [dateField]: { gte: start, lte: end },
      isDeleted: false,
    },
    select: { [dateField]: true, amount: true },
  });

  const map = new Map();
  for (const r of rows) {
    const k = keyOf(new Date(r[dateField]));
    map.set(k, (map.get(k) || 0) + (r.amount || 0));
  }
  return map;
};

const dayKey = (d) => d.toISOString().slice(0, 10);
const monthKey = (d) => d.getUTCMonth() + 1;

const sumByDay = (delegate, start, end, dateField = "paidAt") =>
  sumBuckets(delegate, start, end, dateField, dayKey);

const sumByMonth = (delegate, start, end, dateField = "paidAt") =>
  sumBuckets(delegate, start, end, dateField, monthKey);

// Ikki bucket xaritasini qo'shadi (maosh + umumiy chiqim bitta "chiqim" ustuni).
const mergeSums = (a, b) => {
  const out = new Map(a);
  for (const [k, v] of b) out.set(k, (out.get(k) || 0) + v);
  return out;
};

const DAY_SHORT = ["Yak", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];
const MONTH_SHORT = [
  "Yan", "Fev", "Mar", "Apr", "May", "Iyn",
  "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek",
];

export const getCashflow = async ({ range = "month" } = {}) => {
  const now = new Date();
  const y = now.getUTCFullYear();

  if (range === "year") {
    const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
    const [income, salaryExpense, opexExpense] = await Promise.all([
      sumByMonth(prisma.paymentTransaction, start, end),
      sumByMonth(prisma.salaryTransaction, start, end),
      sumByMonth(prisma.expense, start, end, "spentAt"),
    ]);
    const expense = mergeSums(salaryExpense, opexExpense);
    const buckets = [];
    for (let m = 1; m <= 12; m += 1) {
      buckets.push({
        label: MONTH_SHORT[m - 1],
        income: income.get(m) || 0,
        expense: expense.get(m) || 0,
      });
    }
    return { range, buckets };
  }

  // week | month -> kunlik buckets
  let start;
  let end;
  if (range === "week") {
    // Joriy hafta (Dushanba -> Yakshanba)
    const dow = now.getUTCDay() || 7; // Yak=7
    start = new Date(Date.UTC(y, now.getUTCMonth(), now.getUTCDate() - (dow - 1), 0, 0, 0, 0));
    end = new Date(
      Date.UTC(y, now.getUTCMonth(), now.getUTCDate() - (dow - 1) + 6, 23, 59, 59, 999),
    );
  } else {
    // Joriy oy
    start = new Date(Date.UTC(y, now.getUTCMonth(), 1, 0, 0, 0, 0));
    end = new Date(Date.UTC(y, now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  }

  const [income, salaryExpense, opexExpense] = await Promise.all([
    sumByDay(prisma.paymentTransaction, start, end),
    sumByDay(prisma.salaryTransaction, start, end),
    sumByDay(prisma.expense, start, end, "spentAt"),
  ]);
  const expense = mergeSums(salaryExpense, opexExpense);

  const buckets = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = dayKey(cursor);
    const label =
      range === "week" ? DAY_SHORT[cursor.getUTCDay()] : String(cursor.getUTCDate());
    buckets.push({
      label,
      income: income.get(key) || 0,
      expense: expense.get(key) || 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { range, buckets };
};
