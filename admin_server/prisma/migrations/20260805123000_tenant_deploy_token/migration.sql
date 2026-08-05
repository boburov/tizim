-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "deployToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_deployToken_key" ON "Tenant"("deployToken");

