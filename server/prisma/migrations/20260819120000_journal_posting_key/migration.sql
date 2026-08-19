-- ═══════════════════════════════════════════════════════════════════════════
-- JURNAL: IDEMPOTENTLIK KALITI
--
-- Takroriy urinish (webhook retry, cron qayta ishga tushishi, double-click)
-- bir xil pulni ikki marta yozib qo'yishi mumkin edi. Bunday dublikat
-- jurnalni MUVOZANATDA qoldiradi — ya'ni `reconcile()` uni topmaydi —
-- lekin kassada yo'qdan pul paydo bo'ladi.
--
-- `postingKey` NULLABLE: kalitsiz yozuv (qo'lda tuzatish, smena yopilishi)
-- hamon yoziladi va Postgres'da NULL != NULL bo'lgani uchun ular
-- bir-birini bloklamaydi. Kalit berilgan yozuvlar esa DB DARAJASIDA
-- takrorlana olmaydi — bu servis mantiqiga emas, indeksga tayanadi.
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "postingKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_postingKey_key" ON "journal_entries"("postingKey");

