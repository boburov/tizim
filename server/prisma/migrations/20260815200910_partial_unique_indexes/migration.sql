-- ═══════════════════════════════════════════════════════════════════════════
-- QISMAN UNIQUE INDEKSLAR (partial unique indexes)
--
-- Prisma schema'da `WHERE` shartli unique indeksni deklarativ yozib
-- bo'lmaydi, shuning uchun ular shu yerda — xom SQL bilan.
--
-- BU FAYL BEZAK EMAS. Mongo'dagi `partialFilterExpression` indekslari
-- pul hisobining yaxlitligini ushlab turadi. Ularsiz tizim JIMGINA
-- ikki baravar hisoblab ketadi (qarang: eski src/config/db.js dagi
-- migrateStudentPaymentOpeningIndex izohi).
--
-- ─────────────────────────────────────────────────────────────────────────
-- MongoDB → PostgreSQL: NULL SEMANTIKASIDAGI TUZOQ
--
-- MongoDB unique indeksda `null` ni ODDIY QIYMAT deb sanaydi: ikkita
-- {branchId: null} hujjat to'qnashadi.
-- PostgreSQL'da esa NULL != NULL — ikkita NULL hech qachon to'qnashmaydi.
--
-- Ya'ni Mongo'dagi bitta unique indeks bu yerda IKKITAGA bo'linadi:
--   a) ustun NULL EMAS bo'lgan holat — oddiy ko'p ustunli indeks
--   b) ustun NULL bo'lgan holat      — o'sha ustunsiz alohida indeks
--
-- Buni o'tkazib yuborish "bitta filialga ikkita bir xil hisob" yoki
-- "bitta o'quvchiga ikkita narx" degan jimgina buzilishga olib keladi.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────── FILIAL ───────────────────────────

-- Faol filial nomi takrorlanmaydi (arxivlangani hisobga olinmaydi).
CREATE UNIQUE INDEX "branches_name_active_key"
    ON "branches" ("name")
    WHERE "isDeleted" = false;

-- Bosh filial faqat BITTA bo'ladi.
CREATE UNIQUE INDEX "branches_isMain_key"
    ON "branches" ("isMain")
    WHERE "isMain" = true AND "isDeleted" = false;

-- ─────────────────────────── HISOBLAR ───────────────────────────

-- Filiallararo hisob: (filial, tur, qarshi filial) noyob.
CREATE UNIQUE INDEX "accounts_branch_kind_counterparty_key"
    ON "accounts" ("branchId", "kind", "counterpartyBranchId")
    WHERE "counterpartyBranchId" IS NOT NULL;

-- Oddiy kassa hisobi (qarshi filialsiz): (filial, tur) noyob.
-- NULL != NULL bo'lgani uchun yuqoridagi indeks bu holatni QOPLAMAYDI.
CREATE UNIQUE INDEX "accounts_branch_kind_key"
    ON "accounts" ("branchId", "kind")
    WHERE "counterpartyBranchId" IS NULL;

-- ─────────────────────────── KURS NARXI ───────────────────────────

-- Bitta kurs + filial uchun bir vaqtda faqat BITTA ochiq narx (validTo = NULL).
CREATE UNIQUE INDEX "course_prices_course_branch_open_key"
    ON "course_prices" ("courseId", "branchId")
    WHERE "validTo" IS NULL AND "isDeleted" = false AND "branchId" IS NOT NULL;

-- Global narx (filialsiz) — kurs bo'yicha bitta ochiq narx.
CREATE UNIQUE INDEX "course_prices_course_global_open_key"
    ON "course_prices" ("courseId")
    WHERE "validTo" IS NULL AND "isDeleted" = false AND "branchId" IS NULL;

-- ─────────────────────────── XONA ───────────────────────────

CREATE UNIQUE INDEX "rooms_branch_name_key"
    ON "rooms" ("branchId", "name")
    WHERE "isDeleted" = false;

-- ─────────────────────── GURUH VA A'ZOLIK ───────────────────────

-- Bitta o'quvchi bitta guruhda bir vaqtda faqat BIR MARTA faol bo'ladi.
-- Guruhdan chiqqanidan keyin (leftAt to'lgach) qayta qo'shilishi mumkin.
CREATE UNIQUE INDEX "group_memberships_group_student_active_key"
    ON "group_memberships" ("groupId", "studentId")
    WHERE "leftAt" IS NULL AND "isDeleted" = false;

-- Dars jadvalida `effectiveFrom` NULL bo'lgan qatorlar ham takrorlanmasin.
-- (NOT NULL holatini Prisma'ning @@unique indeksi qoplaydi.)
CREATE UNIQUE INDEX "group_schedule_items_no_effective_from_key"
    ON "group_schedule_items" ("groupId", "day", "startTime")
    WHERE "effectiveFrom" IS NULL;

-- ─────────────────────── DAVOMAT VA BAHO ───────────────────────

-- Bitta o'quvchiga bitta darsda bitta davomat.
CREATE UNIQUE INDEX "attendances_group_student_date_slot_key"
    ON "attendances" ("groupId", "studentId", "dateKey", "slot")
    WHERE "isDeleted" = false;

CREATE UNIQUE INDEX "grades_group_student_date_slot_key"
    ON "grades" ("groupId", "studentId", "dateKey", "slot")
    WHERE "isDeleted" = false;

CREATE UNIQUE INDEX "lesson_cancellations_group_date_slot_key"
    ON "lesson_cancellations" ("groupId", "dateKey", "slot")
    WHERE "isDeleted" = false;

-- ─────────────────────── TASDIQ (APPROVAL) ───────────────────────

-- Bitta subyekt bo'yicha bir vaqtda faqat BITTA kutilayotgan so'rov.
-- Ikki xodim bir vaqtda bir xil so'rov yuborsa — ikkinchisi rad etiladi.
CREATE UNIQUE INDEX "expense_approvals_subject_pending_key"
    ON "expense_approvals" ("subjectKey")
    WHERE "status" = 'pending' AND "subjectKey" IS NOT NULL;

-- ─────────────────── TASDIQ → TRANZAKSIYA (1:1) ───────────────────
--
-- Bitta tasdiqlangan so'rovdan FAQAT BITTA pul harakati chiqadi.
-- Bu indekslar "tasdiqni ikki marta bajarish" xatosini to'sadi —
-- ya'ni bir marta tasdiqlangan maoshni ikki marta to'lab bo'lmaydi.

CREATE UNIQUE INDEX "deposit_transactions_approval_key"
    ON "deposit_transactions" ("expenseApprovalId")
    WHERE "expenseApprovalId" IS NOT NULL;

CREATE UNIQUE INDEX "expenses_approval_key"
    ON "expenses" ("expenseApprovalId")
    WHERE "expenseApprovalId" IS NOT NULL;

CREATE UNIQUE INDEX "salary_transactions_approval_key"
    ON "salary_transactions" ("expenseApprovalId")
    WHERE "expenseApprovalId" IS NOT NULL;

CREATE UNIQUE INDEX "staff_salary_transactions_approval_key"
    ON "staff_salary_transactions" ("expenseApprovalId")
    WHERE "expenseApprovalId" IS NOT NULL;

-- ─────────────────────── CHIQIM TOIFASI ───────────────────────

CREATE UNIQUE INDEX "expense_categories_branch_name_key"
    ON "expense_categories" ("branchId", "name")
    WHERE "isDeleted" = false AND "branchId" IS NOT NULL;

CREATE UNIQUE INDEX "expense_categories_global_name_key"
    ON "expense_categories" ("name")
    WHERE "isDeleted" = false AND "branchId" IS NULL;

-- ─────────────────────── TO'LOV IDEMPOTENTLIGI ───────────────────────

-- Tarmoq uzilib, klient to'lovni qayta yuborsa — ikkinchisi rad etiladi.
CREATE UNIQUE INDEX "payment_transactions_idempotency_key"
    ON "payment_transactions" ("idempotencyKey")
    WHERE "idempotencyKey" IS NOT NULL;

-- ─────────────────────── MAOSH SHARTNOMALARI ───────────────────────

-- O'qituvchida bir vaqtda faqat BITTA ochiq stavka bo'ladi.
CREATE UNIQUE INDEX "teacher_compensations_open_key"
    ON "teacher_compensations" ("teacherId")
    WHERE "effectiveTo" IS NULL AND "isDeleted" = false;

CREATE UNIQUE INDEX "staff_compensations_open_key"
    ON "staff_compensations" ("employeeId")
    WHERE "effectiveTo" IS NULL AND "isDeleted" = false;

CREATE UNIQUE INDEX "staff_kpi_assignments_employee_rule_key"
    ON "staff_kpi_assignments" ("employeeId", "ruleId")
    WHERE "isDeleted" = false;

-- Boshlang'ich qoldiq (opening) xodimga bir oyda bir marta yoziladi.
-- Oddiy bonus/jarima esa ko'p marta bo'lishi mumkin — shuning uchun `kind` filtri.
CREATE UNIQUE INDEX "staff_payroll_adjustments_opening_key"
    ON "staff_payroll_adjustments" ("employeeId", "year", "month", "kind")
    WHERE "kind" IN ('opening_credit', 'opening_debt');

-- ─────────────────────── O'QITUVCHI MAOSHI ───────────────────────
--
-- MUHIM: bu IKKI indeks ATAYLAB ajratilgan.
--
-- Bitta umumiy unique indeks (teacher, group, year, month) bo'lsa,
-- `group IS NULL` qatorlari PostgreSQL'da to'qnashmaydi va bitta
-- o'qituvchiga bir oyda cheksiz "base" qatori yozilib ketardi.
-- Aksincha MongoDB'da ular to'qnashib, fiksa (base) va mukofot (bonus)
-- qatorlari BIRGA TURA OLMAY qolardi.
--
-- Yechim: guruhli qatorlar bir indeksda, guruhsiz `base` qatori boshqasida.
-- `bonus`/`deduction`/`opening` qatorlari ataylab CHEKLANMAGAN — ular
-- bir oyda bir nechta bo'lishi mumkin.

CREATE UNIQUE INDEX "teacher_salaries_group_row_key"
    ON "teacher_salaries" ("teacherId", "groupId", "year", "month", "kind")
    WHERE "groupId" IS NOT NULL;

CREATE UNIQUE INDEX "teacher_salaries_base_row_key"
    ON "teacher_salaries" ("teacherId", "year", "month", "kind")
    WHERE "groupId" IS NULL AND "kind" = 'base';

-- ─────────────────────────── SMENA ───────────────────────────

-- Bitta kassirda bitta filialda bir vaqtda faqat BITTA ochiq smena.
CREATE UNIQUE INDEX "shifts_open_per_cashier_key"
    ON "shifts" ("branchId", "cashierId")
    WHERE "status" = 'open';

-- ─────────────────────── LID MARSHRUTLASH ───────────────────────

CREATE UNIQUE INDEX "lead_routing_rules_source_branch_key"
    ON "lead_routing_rules" ("sourceKey", "branchId")
    WHERE "sourceKey" IS NOT NULL;

-- Zaxira (fallback) qoida faqat BITTA faol bo'ladi.
CREATE UNIQUE INDEX "lead_routing_rules_fallback_key"
    ON "lead_routing_rules" ("isFallback")
    WHERE "isFallback" = true AND "isActive" = true;

-- ─────────────────────── BILDIRISHNOMA ───────────────────────

-- Avto-xabar takrorlanmasin (masalan bitta qarz uchun ikkita eslatma).
CREATE UNIQUE INDEX "notifications_dedupe_key"
    ON "notifications" ("dedupeKey")
    WHERE "dedupeKey" IS NOT NULL;

CREATE UNIQUE INDEX "notification_templates_active_name_key"
    ON "notification_templates" ("name")
    WHERE "isActive" = true;

CREATE UNIQUE INDEX "feedback_types_active_name_key"
    ON "feedback_types" ("name")
    WHERE "isActive" = true;

-- ─────────────────────────── BOT ───────────────────────────

-- Bitta Telegram akkaunt bir nechta userga bog'lana OLADI (aka-uka bitta
-- telefondan foydalanadi), lekin bitta userga ikki marta emas.
CREATE UNIQUE INDEX "bot_users_telegram_user_key"
    ON "bot_users" ("telegramId", "userId")
    WHERE "userId" IS NOT NULL;

-- ─────────────────────────── AI ───────────────────────────

-- Bitta subyekt uchun bitta turdagi OCHIQ tavsiya faqat bitta bo'ladi.
-- Yopilgan (done/dismissed/expired) tavsiyalar cheklanmaydi — tarix qoladi.
CREATE UNIQUE INDEX "insights_subject_kind_open_key"
    ON "insights" ("subjectType", "subjectId", "kind")
    WHERE "status" IN ('open', 'acked');

-- Global AI konfiguratsiyasi (branchId = NULL) faqat BITTA bo'ladi.
-- Prisma'dagi @unique NULL'larni cheklamaydi, shuning uchun alohida indeks.
CREATE UNIQUE INDEX "ai_configs_global_key"
    ON "ai_configs" (("branchId" IS NULL))
    WHERE "branchId" IS NULL;
