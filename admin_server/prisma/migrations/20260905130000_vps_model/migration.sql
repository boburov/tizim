-- ═══════════════════════════════════════════════════════════════════════
-- VPS MODELI + Tenant.vpsId
-- ═══════════════════════════════════════════════════════════════════════
--
-- Ilgari hamma tenant admin_server bilan bitta mashinada turardi va
-- provisioning lokal `spawn('bash')` edi. Endi VPS haqiqiy obyekt.
--
-- ⚠ MA'LUMOT MIGRATSIYASI SHU FAYLDA: mavjud tenantlar `vps_local`
-- yozuviga bog'lanadi (isLocal = true). Shunda hozirgi xatti-harakat
-- O'ZGARMAYDI — lokal VPS uchun skriptlar avvalgidek lokal ishlaydi.
-- `host` — mavjud tenantlardagi `serverIp` (bo'lsa), aks holda
-- 127.0.0.1; admin keyin UI'dan tuzatadi.
--
-- `Tenant.serverIp` O'CHIRILMAYDI (3-fazagacha o'qiladi).

-- CreateEnum
CREATE TYPE "VpsAuthMethod" AS ENUM ('SSH_KEY', 'PASSWORD');

-- CreateEnum
CREATE TYPE "VpsStatus" AS ENUM ('UNKNOWN', 'ONLINE', 'OFFLINE', 'ERROR');

-- CreateTable
CREATE TABLE "Vps" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "sshPort" INTEGER NOT NULL DEFAULT 22,
    "sshUser" TEXT NOT NULL DEFAULT 'root',
    "authMethod" "VpsAuthMethod" NOT NULL DEFAULT 'SSH_KEY',
    "sshPrivateKey" TEXT,
    "sshPassword" TEXT,
    "sshKeyFingerprint" TEXT,
    "rootDir" TEXT NOT NULL DEFAULT '/root',
    "isLocal" BOOLEAN NOT NULL DEFAULT false,
    "status" "VpsStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckError" TEXT,
    "lastCheckLog" TEXT,
    "resources" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxTenants" INTEGER,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vps_status_idx" ON "Vps"("status");
CREATE INDEX "Vps_isActive_idx" ON "Vps"("isActive");

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "vpsId" TEXT;

-- CreateIndex
CREATE INDEX "Tenant_vpsId_idx" ON "Tenant"("vpsId");

-- AddForeignKey
-- ⚠ ON DELETE SET NULL: VPS yozuvi o'chirilsa tenant YO'QOLMAYDI, faqat
-- bog'lanishsiz qoladi. (Servis tenantlari bor VPS'ni o'chirishga
-- umuman yo'l qo'ymaydi — bu ikkinchi himoya.)
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_vpsId_fkey"
  FOREIGN KEY ("vpsId") REFERENCES "Vps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── MA'LUMOT: lokal VPS + mavjud tenantlarni bog'lash ───
INSERT INTO "Vps" ("id", "name", "host", "isLocal", "rootDir", "status", "notes", "createdBy", "createdAt", "updatedAt")
SELECT
  'vps_local',
  'Asosiy (lokal)',
  COALESCE(
    (SELECT "serverIp" FROM "Tenant" WHERE "serverIp" IS NOT NULL AND "serverIp" <> '' ORDER BY "createdAt" LIMIT 1),
    '127.0.0.1'
  ),
  true,
  '/root',
  'UNKNOWN',
  'Migratsiya yaratdi: admin_server turgan mashina. Host ni tekshiring.',
  'migration',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Vps" WHERE "id" = 'vps_local');

UPDATE "Tenant" SET "vpsId" = 'vps_local' WHERE "vpsId" IS NULL;
