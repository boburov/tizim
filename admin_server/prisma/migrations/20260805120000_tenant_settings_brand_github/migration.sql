-- CreateEnum
CREATE TYPE "GitStatus" AS ENUM ('DISABLED', 'PENDING', 'CREATING', 'PUSHING', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApplyStatus" AS ENUM ('IDLE', 'PENDING', 'APPLYING', 'FAILED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "appliedConfig" JSONB,
ADD COLUMN     "applyError" TEXT,
ADD COLUMN     "applyLog" TEXT,
ADD COLUMN     "applyStatus" "ApplyStatus" NOT NULL DEFAULT 'IDLE',
ADD COLUMN     "brandBackground" TEXT,
ADD COLUMN     "brandBackgroundDark" TEXT,
ADD COLUMN     "brandColorDark" TEXT,
ADD COLUMN     "gitLog" TEXT,
ADD COLUMN     "gitStatus" "GitStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "lastAppliedAt" TIMESTAMP(3),
ADD COLUMN     "lastPushedAt" TIMESTAMP(3),
ADD COLUMN     "repoError" TEXT,
ADD COLUMN     "repoFullName" TEXT,
ADD COLUMN     "repoPrivate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "repoUrl" TEXT;

-- CreateTable
CREATE TABLE "TenantSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantSetting_tenantId_idx" ON "TenantSetting"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSetting_tenantId_key_key" ON "TenantSetting"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_repoFullName_key" ON "Tenant"("repoFullName");

-- AddForeignKey
ALTER TABLE "TenantSetting" ADD CONSTRAINT "TenantSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

