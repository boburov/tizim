-- ═══════════════════════════════════════════════════════════════════════════
-- LOYIHA (TENANT) DARAJASIDAGI FILIAL KONFIGURATSIYASI.
--
-- Ilgari "ko'p filiallimi" savoli IKKI joyda yashardi va ikkalasi ham
-- noto'g'ri edi:
--   • admin panelda `TenantSetting.MULTI_BRANCH` — tenant serveri uni
--     UMUMAN o'qimasdi (o'lik sozlama);
--   • tenant serverida esa javob BAZADAN hisoblanardi (filiallar soni > 1),
--     ya'ni "yakka markaz" rejimini mijozning o'zi ikkinchi filial ochib
--     bekor qila olardi.
--
-- Chegara esa umuman yo'q edi: mijoz cheksiz filial ocha olardi.
-- ═══════════════════════════════════════════════════════════════════════════

-- Standart: filiallar YOQILGAN. Mavjud loyihalarning hech biri buzilmaydi —
-- ular allaqachon shu rejimda ishlab turibdi.
ALTER TABLE "Tenant" ADD COLUMN "branchesEnabled" BOOLEAN NOT NULL DEFAULT true;

-- null = "meros": tarifdagi `max_branches`, u ham bo'lmasa tizim standarti.
-- Ataylab NOT NULL EMAS — standart o'zgarsa uni qo'lda qo'ymagan loyihalar
-- yangisini avtomatik oladi.
ALTER TABLE "Tenant" ADD COLUMN "branchLimitOverride" INTEGER;

-- ── BACKFILL: eski `MULTI_BRANCH` sozlamasini yangi ustunga ko'chiramiz ──
--
-- U hech qachon tenant `.env` iga bormagan, lekin panelda o'zgartirilgan
-- bo'lishi mumkin. Mijozning ONGLI tanlovini yo'qotmaymiz.
UPDATE "Tenant" t
SET "branchesEnabled" = false
FROM "TenantSetting" s
WHERE s."tenantId" = t."id"
  AND s."key" = 'MULTI_BRANCH'
  AND lower(s."value") = 'false';

-- Ko'chirilgandan keyin eski yozuv KERAK EMAS — bitta sozlama ikki joyda
-- turmasin (registrda ham `MULTI_BRANCH` olib tashlandi).
DELETE FROM "TenantSetting" WHERE "key" = 'MULTI_BRANCH';

-- ⚠ MAVJUD LOYIHALARDA CHEGARADAN ORTIQ FILIAL BO'LISHI MUMKIN.
-- Bu ATAYLAB tuzatilmaydi: chegara faqat YANGI filial ochishni to'sadi
-- (`used >= limit`), mavjudlariga tegilmaydi. Aks holda migratsiya
-- to'lagan mijozning ishlab turgan filialini o'chirib qo'yardi.
