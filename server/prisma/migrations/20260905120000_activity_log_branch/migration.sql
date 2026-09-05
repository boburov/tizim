-- ═══════════════════════════════════════════════════════════════════════
-- AUDIT IZIGA FILIAL USTUNI
-- ═══════════════════════════════════════════════════════════════════════
--
-- Ilgari `activity_logs` da filial YO'Q edi va ko'lam AKTYOR orqali
-- berilardi. Natijada boshqa filialdan kelgan odamning shu filialdagi
-- amali filial administratoriga KO'RINMASDI.
--
-- ⚠ ESKI QATORLAR ORQAGA TO'LDIRILMAYDI. Qaysi filialda sodir bo'lgani
-- endi ma'lum emas; aktyorning BUGUNGI filialini yozib qo'yish audit
-- jurnalini soxtalashtirardi (odam o'shandan beri boshqa filialga
-- o'tgan bo'lishi mumkin). Ular `NULL` bo'lib qoladi va o'qish tomoni
-- ularni aktyor filiali bo'yicha hal qiladi.
--
-- ⚠ FK `ON DELETE SET NULL`: filial o'chirilganda audit yozuvi
-- YO'QOLMASLIGI kerak — aynan o'chirish paytidagi tarix eng kerakli
-- payt. `CASCADE` butun bir filialning izini o'chirib yuborardi.

ALTER TABLE "activity_logs" ADD COLUMN "branchId" VARCHAR(24);

ALTER TABLE "activity_logs"
  ADD CONSTRAINT "activity_logs_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "activity_logs_branchId_createdAt_idx"
  ON "activity_logs"("branchId", "createdAt");
