-- ═══════════════════════════════════════════════════════════════════════════
-- TASDIQ SO'ROVI - SUMMA INVARIANTLARI
--
-- `models/approval.model.js` ikki qoidani ushlab turardi:
--   • sxemada  `amount: { min: 0 }`
--   • pre("validate") da  "moliyaviy so'rovda summa MAJBURIY (>= 1)"
--
-- Tasdiqlar moduli PostgreSQL'ga ko'chirilishi bilan model o'lik qoldi va
-- ikkala qoida ham JIMGINA yo'qoldi. Bu MIGRATION.md §6 dagi #27-invariant -
-- u yerda "⏳ modul ko'chmagan" deb belgilangan edi.
--
-- NEGA MUHIM: chiqim so'rovining butun ma'nosi LIMIT tekshiruvida
-- (`Branch.expenseApprovalThreshold` bilan solishtirish). Summasiz
-- "moliyaviy" so'rovni limit bilan solishtirib bo'lmaydi - ya'ni tasdiq
-- oqimini butunlay aylanib o'tish yo'li ochilardi.
--
-- Qoida TIRIK ekanining dalili kodda turibdi: `groups.service.js` da
-- `Math.max(1, preview.estimatedDebt)` yozilgan - u AYNAN shu tekshiruvni
-- qanoatlantirish uchun qo'yilgan.
--
-- Servis qatlami ham qo'riqlaydi (`createRequest`), bu esa OXIRGI himoya:
-- xom SQL va qo'lda yozilgan tuzatish skripti uchun.
--
-- Migratsiya yozilishidan oldin mavjud ma'lumot ikkala shart bo'yicha
-- tekshirildi - buzilgan qator topilmadi.
-- ═══════════════════════════════════════════════════════════════════════════

-- Manfiy summa hech qanday turdagi so'rovda ma'noga ega emas.
ALTER TABLE "expense_approvals"
  ADD CONSTRAINT "expense_approvals_amount_nonneg_check"
  CHECK (amount IS NULL OR amount >= 0);

-- MOLIYAVIY so'rovda summa MAJBURIY va noldan katta.
--
-- Konfiguratsiya so'rovlarida (`configuration`) summa ATAYLAB `null`
-- bo'lishi mumkin: maosh stavkasi va chegirma TAKRORLANUVCHI o'zgarish,
-- ularning bir martalik "summasi" yo'q. Aynan shu sababdan `stats()`
-- dagi `pendingAmount` faqat `financial` so'rovlarni qo'shadi.
ALTER TABLE "expense_approvals"
  ADD CONSTRAINT "expense_approvals_financial_amount_check"
  CHECK (category <> 'financial' OR (amount IS NOT NULL AND amount >= 1));
