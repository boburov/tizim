-- ═══════════════════════════════════════════════════════════════════════════
-- MODUL O'CHIRGICHLARI — LOYIHA DARAJASIDAGI USTUN QAROR
--
-- QAMROV
--   • Feature ga 3 ta ustun: isModule, parentKey, requiresKeys.
--     Uchalasi ham tenant kodidagi reyestrdan SINXRONLANADI
--     (`scripts/sync-features.mjs`), qo'lda tahrirlanmaydi.
--   • 1 yangi jadval: TenantFeatureOverride.
--
-- XAVFSIZLIK
--   Hech qanday DROP / RENAME yo'q. Qo'shilgan ustunlarning hammasi
--   STANDART QIYMATLI, ya'ni mavjud qatorlar o'zgarmaydi va eski kod
--   ular haqida bilmasdan ishlashda davom etadi.
--
-- ⚠ BU MIGRATSIYA O'ZI HECH NARSANI O'CHIRMAYDI
--   Jadval bo'sh yaratiladi. Mavjud loyihalarga kalitlarni ochiq qilib
--   berish (grandfather) ALOHIDA qadam — `scripts/grandfather-features.mjs`.
--   Ikkisi qo'shib yuborilsa, migratsiya yurgan-u seed yurmagan holatda
--   hamma mijozning bo'limlari birdan o'chib qolardi.
-- ═══════════════════════════════════════════════════════════════════════════

-- Modul o'chirgichi audit tarixida o'z harakat turiga ega bo'lsin:
-- "nega bu bo'lim o'chirilgan" savoli filial chegarasi tarixi bilan
-- BIR jadvaldan o'qiladi, lekin aralashib ketmaydi.
ALTER TYPE "CommercialChangeAction" ADD VALUE IF NOT EXISTS 'MODULE_TOGGLE';

ALTER TABLE "Feature" ADD COLUMN "isModule" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Feature" ADD COLUMN "parentKey" TEXT;
ALTER TABLE "Feature" ADD COLUMN "requiresKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "TenantFeatureOverride" (
    "id"         TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "featureId"  TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "enabled"    BOOLEAN NOT NULL,
    "reason"     TEXT NOT NULL,
    "branchId"   TEXT NOT NULL DEFAULT '',
    "createdBy"  TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantFeatureOverride_pkey" PRIMARY KEY ("id")
);

-- ⚠ `branchId` NOT NULL DEFAULT '' — NULL EMAS.
-- PostgreSQL unique indeksda NULL'lar bir-biriga teng hisoblanmaydi, ya'ni
-- nullable ustun bilan bu indeks bir xil (tenant, kalit) juftligini
-- TO'SMASDI va upsert har safar yangi qator yaratib, eski ustun qaror
-- jimgina kuchda qolardi. Bo'sh satr = "loyiha darajasi".
CREATE UNIQUE INDEX "TenantFeatureOverride_tenantId_featureKey_branchId_key"
    ON "TenantFeatureOverride"("tenantId", "featureKey", "branchId");
CREATE INDEX "TenantFeatureOverride_tenantId_idx" ON "TenantFeatureOverride"("tenantId");
CREATE INDEX "TenantFeatureOverride_featureId_idx" ON "TenantFeatureOverride"("featureId");

ALTER TABLE "TenantFeatureOverride" ADD CONSTRAINT "TenantFeatureOverride_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantFeatureOverride" ADD CONSTRAINT "TenantFeatureOverride_featureId_fkey"
    FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
