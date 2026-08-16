-- ═══════════════════════════════════════════════════════════════════════════
-- VALIDATSIYA INVARIANTLARI (CHECK constraints)
--
-- MongoDB'dan ko'chishda 19 ta Mongoose `pre("validate")` hook'i ishlamay
-- qoldi. Ularning har biri qayta ko'rib chiqildi (qarang: MIGRATION.md,
-- "Validatsiya invariantlari inventarizatsiyasi") va UCHGA ajratildi:
--
--   a) BAZA INVARIANTI     - bitta qatorning ustunlariga bog'liq, tashqi
--                            kontekst kerak emas -> SHU FAYL.
--   b) DASTUR INVARIANTI   -> servis qatlamida (import/job/seed ham
--                            chetlab o'tolmaydi).
--   c) HTTP VALIDATSIYASI  -> Zod (faqat qulay xato matni uchun).
--
-- ─────────────────────────────────────────────────────────────────────────
-- BU FAYL NEGA KERAK, servis tekshiruvi bo'la turib?
--
-- Servis tekshiruvi JS kodidan o'tgan yozuvni ushlaydi. Bu yerdagi
-- shartlar esa `psql`, qo'lda yozilgan tuzatish skripti, kelajakdagi
-- xom SQL va e'tibordan chetda qolgan yangi yo'l uchun ham ishlaydi.
-- Ya'ni bular OXIRGI himoya chizig'i, birinchisi emas: foydalanuvchi
-- odatda servisdan chiroyli o'zbekcha xato oladi, bu yerga esa faqat
-- kod xato bo'lgandagina yetib keladi.
--
-- Faqat SOF, bitta qatorli qoidalar shu yerda. Kontekst talab qiladigan
-- qoidalar (masalan "stavka ishga olingan sanadan oldin bo'lmasin" -
-- boshqa jadvalni o'qishni talab qiladi) ATAYLAB kiritilmagan.
--
-- ─────────────────────────────────────────────────────────────────────────
-- OGOHLANTIRISH: MIGRATSIYA MA'LUMOT BUZUQ BO'LSA YIQILADI.
--
-- Bu KUTILGAN xatti-harakat: buzilgan moliyaviy qatorni jimgina qabul
-- qilgandan ko'ra deploy'ni to'xtatgan yaxshi. Yiqilsa, xato matnidagi
-- constraint nomi bo'yicha pastdagi shartni topib, aybdor qatorlarni
-- shu shartning INKORI bilan qidiring, masalan:
--
--   SELECT * FROM discounts WHERE type = 'percent' AND value > 100;
--
-- Ushbu migratsiya yozilishidan oldin bazadagi mavjud ma'lumot har bir
-- shart bo'yicha tekshirildi - buzilgan qator topilmadi.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────── JURNAL (buxgalteriya) ───────────────────────────

-- BITTA QATOR - BITTA TOMON.
--
-- `{debit: 500000, credit: 500000}` qatori YIG'INDI muvozanatidan
-- muammosiz o'tadi (debet == kredit), lekin bitta hisobning ikkala
-- tomonini bir vaqtda harakatlantiradi: balans abadiy ikki marta
-- sanaladi va `reconcile()` "hammasi joyida" deb turaveradi.
--
-- DIQQAT: "debet yig'indisi = kredit yig'indisi" qoidasi BU YERDA YO'Q -
-- u bir nechta qatorga tegishli, CHECK esa faqat bitta qatorni ko'radi.
-- U `journal.service.js` -> `post()` da (DASTUR INVARIANTI).
ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_amounts_nonneg_check"
  CHECK (debit >= 0 AND credit >= 0);

ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_single_side_check"
  CHECK (NOT (debit > 0 AND credit > 0));

ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_nonzero_check"
  CHECK (NOT (debit = 0 AND credit = 0));

-- ─────────────────────────── HISOBLAR (accounts) ───────────────────────────

-- Filiallararo hisob (due_from / due_to) qarshi filialsiz ma'nosiz, qolgan
-- turlarda esa qarshi filial bo'lishi mumkin emas - aks holda bitta filial
-- ichidagi pul harakati "kimgadir qarz" bo'lib ko'rinardi.
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_counterparty_shape_check"
  CHECK ((kind IN ('due_from', 'due_to')) = ("counterpartyBranchId" IS NOT NULL));

-- Filial o'ziga qarzdor bo'la olmaydi: bunday hisob ikki tomonlama
-- yozuvda o'zini o'zi bekor qilib, pulni yo'q qilardi.
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_no_self_counterparty_check"
  CHECK ("counterpartyBranchId" IS NULL OR "counterpartyBranchId" <> "branchId");

-- ─────────────────────────── FILIALLARARO O'TKAZMA ───────────────────────────

-- Filial o'ziga pul jo'nata olmaydi.
ALTER TABLE "cash_transfers"
  ADD CONSTRAINT "cash_transfers_distinct_branches_check"
  CHECK ("fromBranchId" <> "toBranchId");

-- ─────────────────────────── CHEGIRMA ───────────────────────────

-- 100% dan katta foiz o'quvchi hisobini MANFIY qiladi - markaz unga
-- qarzdor bo'lib qoladi.
ALTER TABLE "discounts"
  ADD CONSTRAINT "discounts_percent_max_check"
  CHECK (type <> 'percent' OR value <= 100);

-- Oylik chegirma qaysi oyga tegishli ekani ko'rsatilmasa, hisob-kitob uni
-- hech qachon topmaydi: yozuv bazada turadi, lekin hech qachon
-- qo'llanmaydi (operator esa "qo'ydim" deb hisoblaydi).
ALTER TABLE "discounts"
  ADD CONSTRAINT "discounts_monthly_scope_check"
  CHECK (scope <> 'monthly' OR (year IS NOT NULL AND month IS NOT NULL));

-- ─────────────────────────── O'QITUVCHI STAVKASI ───────────────────────────

-- Yopilgan davr uzunligi musbat bo'lishi shart. Teng bo'lsa `rateResolver`
-- uni [from, to) oynasida hech qachon tanlamaydi: stavka bazada bor,
-- lekin maoshga hech qachon qo'shilmaydi.
ALTER TABLE "teacher_compensations"
  ADD CONSTRAINT "teacher_compensations_range_check"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

-- "Yo'q" deb belgilangan qism summasi 0 bo'lishi SHART. Aks holda
-- `rateResolver` o'sha summani baribir o'qiydi va o'chirilgan qism
-- maoshga qo'shilib ketadi.
ALTER TABLE "teacher_compensations"
  ADD CONSTRAINT "teacher_compensations_none_zeroed_check"
  CHECK (
    ("baseType" <> 'none' OR "baseAmount" = 0)
    AND ("variableType" <> 'none' OR "variableRate" = 0)
  );

-- Ikkala qism ham yo'q bo'lgan stavka har oy 0 so'm maosh yozib beradi.
ALTER TABLE "teacher_compensations"
  ADD CONSTRAINT "teacher_compensations_not_empty_check"
  CHECK (NOT ("baseType" = 'none' AND "variableType" = 'none'));

-- Foiz turida stavka 100 dan oshsa, o'qituvchi guruh tushumidan
-- KO'PROQ maosh oladi.
ALTER TABLE "teacher_compensations"
  ADD CONSTRAINT "teacher_compensations_percent_max_check"
  CHECK ("variableType" <> 'percent' OR "variableRate" <= 100);

-- ─────────────────────────── O'QITUVCHI OYLIGI ───────────────────────────

-- Guruh qatori guruhsiz bo'lolmaydi; fiksa (base) qatori esa guruhga
-- BOG'LANMAYDI - u markaz darajasidagi to'lov.
--
-- Qolgan turlar (bonus, deduction, opening) ATAYLAB cheklanmagan:
-- boshlang'ich qoldiq odatda guruhsiz, mukofot esa guruhli ham,
-- guruhsiz ham bo'lishi mumkin.
ALTER TABLE "teacher_salaries"
  ADD CONSTRAINT "teacher_salaries_kind_group_check"
  CHECK (
    (kind <> 'group' OR "groupId" IS NOT NULL)
    AND (kind <> 'base' OR "groupId" IS NULL)
  );

-- ─────────────────────────── XODIM SHARTNOMASI ───────────────────────────

ALTER TABLE "staff_compensations"
  ADD CONSTRAINT "staff_compensations_range_check"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

-- ─────────────────────────── KPI QOIDASI ───────────────────────────

-- `rewardType='percent'` da qiymat FOIZ, so'm emas.
ALTER TABLE "kpi_rules"
  ADD CONSTRAINT "kpi_rules_percent_max_check"
  CHECK ("rewardType" <> 'percent' OR "rewardValue" <= 100);

-- ─────────────────────── XODIM MUKOFOTI / JARIMASI ───────────────────────
--
-- Bular Mongoose SXEMASIDA (`min`, `max`, `maxlength`) edi, hook'da emas -
-- ya'ni ular ham baza darajasidagi cheklov bo'lgan va ko'chishda tushib
-- qolgan. Prisma sxemasi bunday cheklovni ifodalay olmaydi.

-- 0 so'mlik "mukofot" hech kimga hech narsa bermaydi, lekin maosh
-- varaqasida qator bo'lib turadi. ISHORA `kind` da (jarima = penalty),
-- summaning o'zi HAR DOIM musbat - manfiy summa jarimani mukofotga
-- aylantirib yuborardi.
ALTER TABLE "staff_payroll_adjustments"
  ADD CONSTRAINT "staff_payroll_adjustments_amount_min_check"
  CHECK (amount >= 1);

ALTER TABLE "staff_payroll_adjustments"
  ADD CONSTRAINT "staff_payroll_adjustments_month_check"
  CHECK (month BETWEEN 1 AND 12);

-- Sababsiz ushlab qolish xodim uchun tushunarsiz - har jarima izohlanadi.
ALTER TABLE "staff_payroll_adjustments"
  ADD CONSTRAINT "staff_payroll_adjustments_reason_len_check"
  CHECK (length(reason) BETWEEN 1 AND 500);

-- YASSILASH OQIBATI: Mongo'da `carriedFrom` BITTA ichki obyekt edi -
-- u yo bor, yo yo'q. Prisma'da ikkita mustaqil ustunga bo'lindi, ya'ni
-- "yil bor, oy yo'q" holati texnik jihatdan mumkin bo'lib qoldi. Bunday
-- qator qarz qaysi oydan ko'chganini yo'qotadi va zanjir uziladi.
ALTER TABLE "staff_payroll_adjustments"
  ADD CONSTRAINT "staff_payroll_adjustments_carried_from_pair_check"
  CHECK (("carriedFromYear" IS NULL) = ("carriedFromMonth" IS NULL));

ALTER TABLE "staff_payroll_adjustments"
  ADD CONSTRAINT "staff_payroll_adjustments_carried_from_month_check"
  CHECK ("carriedFromMonth" IS NULL OR "carriedFromMonth" BETWEEN 1 AND 12);

-- ─────────────────────────── BOSHLANG'ICH QOLDIQ ───────────────────────────

-- Nol qoldiq hech narsani anglatmaydi, lekin materializatsiya bosqichida
-- 0 so'mlik "to'lov" qatorini yaratib, hisobotlarni chalkashtiradi.
--
-- ISHORA CHEKLANMAYDI: manfiy summa "o'qituvchi markazga qarzdor" degan
-- MA'NOLI holat (qarang: MIGRATION.md, signConvention = "party").
ALTER TABLE "opening_balances"
  ADD CONSTRAINT "opening_balances_nonzero_check"
  CHECK (amount <> 0);

-- Butun so'm: tiyin yo'q. Import faylidagi `3 000 000.5` kabi qiymat
-- keyinchalik yaxlitlanib, balansni bir tiyinga qiyshaytirardi.
ALTER TABLE "opening_balances"
  ADD CONSTRAINT "opening_balances_integer_check"
  CHECK (amount = trunc(amount));

-- Yuqori chegara - barmoq siljishidan himoya (500 mln so'm).
ALTER TABLE "opening_balances"
  ADD CONSTRAINT "opening_balances_max_check"
  CHECK (abs(amount) <= 500000000);

-- ─────────────────────────── BAYRAMLAR ───────────────────────────

-- Har yili takrorlanadigan bayramda yil bo'lmaydi, bir martaligida esa
-- SHART. Aks holda dars kunlarini hisoblash "qaysi yil?" degan savolga
-- javob topolmay, bayramni umuman hisobga olmasdi.
ALTER TABLE "holidays"
  ADD CONSTRAINT "holidays_recurring_year_check"
  CHECK ("isRecurring" = (year IS NULL));

-- ─────────────────────────── LEAD MARSHRUTI ───────────────────────────

-- Zaxira qoida hammaga qo'llanadi - manbasi bo'lmaydi. Oddiy qoida esa
-- manbasiz qaysi lead'ga tegishli ekanini bilmaydi.
ALTER TABLE "lead_routing_rules"
  ADD CONSTRAINT "lead_routing_rules_fallback_shape_check"
  CHECK ("isFallback" <> ("sourceKey" IS NOT NULL));

-- ─────────────────────────── SANA ORALIQLARI ───────────────────────────

-- Tugash sanasi boshlanish sanasidan oldin bo'lmasin. TENG bo'lishi
-- MUMKIN: bir kunlik muzlatish/ozod qilish haqiqiy holat.
ALTER TABLE "student_freezes"
  ADD CONSTRAINT "student_freezes_range_check"
  CHECK ("endDate" IS NULL OR "endDate" >= "startDate");

ALTER TABLE "attendance_exemptions"
  ADD CONSTRAINT "attendance_exemptions_range_check"
  CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
