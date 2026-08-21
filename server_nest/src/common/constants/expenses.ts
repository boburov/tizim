// ⚠ `server/src/constants/expenses.js` DAN AYNAN KO'CHIRILGAN.

/**
 * CHIQIM LUG'ATLARI.
 *
 * `models/expense.model.js` va `models/expenseCategory.model.js` dan
 * ko'chirildi: bu qiymatlar bazaga bog'liq emas, lekin Mongoose model
 * fayli o'chirilganda ular bilan birga yo'qolib ketardi.
 *
 * ⚠ RO'YXATLAR `prisma/schema.prisma` DAGI ENUMLAR BILAN AYNAN BIR XIL
 * BO'LISHI SHART (ExpenseMethod, ExpenseCurrency, ExpenseAllocation,
 * ExpenseCategoryKind). Ajralib ketsa zod noto'g'ri qiymatni o'tkazadi
 * va Postgres uni enum xatosi bilan rad etadi - foydalanuvchi esa
 * tushunarsiz 500 ko'radi.
 */
// FAZA 3: raqamli kanallar qo'shildi (schema.prisma, enum ExpenseMethod).
// Chiqim ham Click/Payme orqali to'lanishi mumkin (obuna, reklama).
export const EXPENSE_METHODS: string[] = [
  "cash",
  "card",
  "bank",
  "transfer",
  "click",
  "payme",
  "uzcard",
  "humo",
  "terminal",
];

// FAZA 8: DOIMIY / O'ZGARUVCHAN xarajat (schema.prisma, enum CostType).
//
// `EXPENSE_CATEGORY_KINDS` dan BOSHQA O'Q: u "bu qanday xarajat"
// (operating/payroll/tax/capital), bu esa "u hajm bilan o'sadimi".
// Ijara ham, o'qituvchi foizi ham `operating` bo'lishi mumkin, lekin
// biri o'quvchilar soniga bog'liq emas, ikkinchisi bevosita bog'liq.
export const COST_TYPES: string[] = ["fixed", "variable"];

// FAZA 9: takrorlanish oralig'i (schema.prisma, enum RecurringInterval).
export const RECURRING_INTERVALS: string[] = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];

export const RECURRING_OCCURRENCE_STATUSES: string[] = [
  "pending",
  "paid",
  "skipped",
  "canceled",
];
export const EXPENSE_CURRENCIES: string[] = ["UZS", "USD"];
export const EXPENSE_ALLOCATIONS: string[] = ["none", "revenue", "students", "equal"];
export const EXPENSE_CATEGORY_KINDS: string[] = ["operating", "payroll", "tax", "capital"];
