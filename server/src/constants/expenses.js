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
export const EXPENSE_METHODS = ["cash", "card", "bank", "transfer"];
export const EXPENSE_CURRENCIES = ["UZS", "USD"];
export const EXPENSE_ALLOCATIONS = ["none", "revenue", "students", "equal"];
export const EXPENSE_CATEGORY_KINDS = ["operating", "payroll", "tax", "capital"];
