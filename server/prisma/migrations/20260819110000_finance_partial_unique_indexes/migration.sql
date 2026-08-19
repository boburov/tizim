-- ═══════════════════════════════════════════════════════════════════════════
-- MOLIYA: QISMAN UNIQUE INDEKSLAR
--
-- Bir xil sabab, bir xil naqsh — qarang
-- 20260815200910_partial_unique_indexes: PostgreSQL'da NULL != NULL,
-- ya'ni nullable ustunli unique indeks dublikatni TO'SMAYDI. Shuning
-- uchun har bir qoida IKKITA indeksga bo'linadi.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────── BYUDJET ───────────────────────────
--
-- Bitta davr uchun bitta byudjet. Ikkita bo'lsa "reja vs fakt"
-- taqqoslashi QAYSI rejaga nisbatan ekani noma'lum bo'lardi va
-- ogohlantirishlar ikki xil javob berardi.
--
-- `month`/`quarter` NULL EMAS (default 0) — ataylab, aynan shu NULL
-- muammosini oldini olish uchun (qarang schema.prisma, model Budget).
-- Bo'linish faqat `branchId` bo'yicha.

-- a) Filialga tegishli byudjet
CREATE UNIQUE INDEX "budgets_branch_period_key"
  ON "budgets" ("branchId", "periodType", "year", "month", "quarter")
  WHERE "branchId" IS NOT NULL AND "isDeleted" = false;

-- b) Markaz umumiy byudjeti (branchId IS NULL)
CREATE UNIQUE INDEX "budgets_global_period_key"
  ON "budgets" ("periodType", "year", "month", "quarter")
  WHERE "branchId" IS NULL AND "isDeleted" = false;

-- ─────────────── BYUDJET QATORI ───────────────
--
-- Bitta byudjetda bitta kategoriya IKKI MARTA turmasligi kerak — aks
-- holda "marketing byudjeti" ikki qatorning qaysi biri ekani noaniq
-- bo'lib, taqqoslash jimgina ikki baravar hisoblardi.

-- a) Kategoriya bo'yicha qator
CREATE UNIQUE INDEX "budget_lines_category_key"
  ON "budget_lines" ("budgetId", "categoryId")
  WHERE "categoryId" IS NOT NULL;

-- b) Kategoriya TURI bo'yicha qator (payroll / operating / tax / capital)
CREATE UNIQUE INDEX "budget_lines_kind_key"
  ON "budget_lines" ("budgetId", "categoryKind")
  WHERE "categoryKind" IS NOT NULL;

-- c) Umumiy (total) qator — byudjetda faqat BITTA bo'lishi mumkin
CREATE UNIQUE INDEX "budget_lines_total_key"
  ON "budget_lines" ("budgetId")
  WHERE "scope" = 'total';

-- ─────────────────────────── QAYTARIM ───────────────────────────
--
-- TASDIQ SO'ROVI bilan bog'langan qaytarim BITTA bo'lishi shart:
-- bitta tasdiq ikkita qaytarimni bajarsa, kassadan pul IKKI MARTA
-- chiqardi. Bu Approval bilan bog'langan boshqa hujjatlardagi
-- (Expense, DepositTransaction) qoidaning aynan o'zi.
CREATE UNIQUE INDEX "refunds_approval_key"
  ON "refunds" ("approvalId")
  WHERE "approvalId" IS NOT NULL;
