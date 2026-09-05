-- Deploy jurnali + VPS Postgres URL'i (shifrlangan)

-- AlterTable
ALTER TABLE "Vps" ADD COLUMN "postgresBaseUrl" TEXT;

-- CreateEnum
CREATE TYPE "DeploymentKind" AS ENUM ('PROVISION', 'RESTART', 'REBUILD', 'DEPLOY', 'PUSH', 'SUSPEND', 'RESUME', 'DEPROVISION', 'MIGRATE', 'STOP_SOURCE', 'DECOMMISSION_SOURCE', 'BOOTSTRAP_VPS');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vpsId" TEXT,
    "kind" "DeploymentKind" NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'RUNNING',
    "log" TEXT NOT NULL DEFAULT '',
    "exitCode" INTEGER,
    "error" TEXT,
    "meta" JSONB,
    "startedBy" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deployment_tenantId_startedAt_idx" ON "Deployment"("tenantId", "startedAt");
CREATE INDEX "Deployment_status_idx" ON "Deployment"("status");

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_vpsId_fkey"
  FOREIGN KEY ("vpsId") REFERENCES "Vps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
