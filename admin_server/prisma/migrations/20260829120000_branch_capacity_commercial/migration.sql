-- Filial paketlari: TAKRORIY sotib olish va tijorat auditi.
--
-- `20260829090000_tenant_branch_limits` USTIGA qo'shiladi va undagi
-- modelni o'zgartirmaydi — faqat ikkita bo'shliqni yopadi:
--
--   1) `TenantAddon` da MIQDOR yo'q edi. `@@unique([tenantId, addonId])`
--      sababli bitta paket loyihaga faqat BIR MARTA biriktirilardi:
--      "+5" ni ikkinchi marta sotib olish JIMGINA hech narsa qilmasdi
--      (upsert mavjud qatorni yangilardi). Endi qo'shimcha =
--      `addon.value * quantity`.
--
--   2) Chegara o'zgarishi HECH QAYERDA yozilmasdi. `branchLimitOverride`
--      faqat OXIRGI holatni bildiradi — "kim ko'targan, qachon va nega"
--      degan savolga javob yo'q edi. To'lov ulanganda `transactionId`
--      to'ldiriladi va zanjir yopiladi.
--
-- Uchala o'zgarish ham QO'SHIMCHA: hech narsa o'chirilmaydi, mavjud
-- loyihalarning chegarasi o'zgarmaydi.

-- 1) Bitta paketni nechta marta sotib olish mumkinligi (null = cheklanmagan)
ALTER TABLE "Addon" ADD COLUMN "maxQuantity" INTEGER;

-- 2) Sotib olingan birliklar soni.
--    DEFAULT 1 — mavjud yozuvlar (AI add-on'lari) aynan bitta birlik edi,
--    ya'ni bu migratsiya HECH KIMNING limitini o'zgartirmaydi.
ALTER TABLE "TenantAddon" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "TenantAddon" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 3) Audit
CREATE TYPE "CommercialChangeSource" AS ENUM ('DEVELOPER_ADMIN', 'BILLING', 'SYSTEM');
CREATE TYPE "CommercialChangeAction" AS ENUM ('LIMIT_OVERRIDE', 'BRANCH_MODE', 'ADDON_GRANT', 'ADDON_REVOKE');

CREATE TABLE "TenantCommercialChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "action" "CommercialChangeAction" NOT NULL,
    "addonKey" TEXT,
    "quantityBefore" INTEGER,
    "quantityAfter" INTEGER,
    "overrideBefore" INTEGER,
    "overrideAfter" INTEGER,
    "enabledBefore" BOOLEAN,
    "enabledAfter" BOOLEAN,
    "limitBefore" INTEGER NOT NULL,
    "limitAfter" INTEGER NOT NULL,
    "usedAtChange" INTEGER,
    "unitPrice" DECIMAL(12,2),
    "currency" TEXT,
    "amount" DECIMAL(12,2),
    "source" "CommercialChangeSource" NOT NULL DEFAULT 'DEVELOPER_ADMIN',
    "actor" TEXT,
    "reason" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantCommercialChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenantCommercialChange_tenantId_createdAt_idx" ON "TenantCommercialChange"("tenantId", "createdAt");
CREATE INDEX "TenantCommercialChange_featureKey_idx" ON "TenantCommercialChange"("featureKey");

ALTER TABLE "TenantCommercialChange" ADD CONSTRAINT "TenantCommercialChange_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ⚠ SET NULL, CASCADE EMAS: to'lov yozuvi o'chirilsa ham chegara
-- o'zgarganining TARIXI qolishi kerak.
ALTER TABLE "TenantCommercialChange" ADD CONSTRAINT "TenantCommercialChange_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
