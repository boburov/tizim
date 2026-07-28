-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('DRAFT', 'PROVISIONING', 'ACTIVE', 'FAILED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "SystemTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "templateDir" TEXT NOT NULL DEFAULT '/root/templates/study-center',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "brandColor" TEXT NOT NULL DEFAULT '#4f46e5',
    "logoUrl" TEXT,
    "botToken" TEXT,
    "dbName" TEXT NOT NULL,
    "pm2Name" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "serverIp" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'DRAFT',
    "provisionLog" TEXT,
    "failureReason" TEXT,
    "systemTemplateId" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemTemplate_key_key" ON "SystemTemplate"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_domain_key" ON "Tenant"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_dbName_key" ON "Tenant"("dbName");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_pm2Name_key" ON "Tenant"("pm2Name");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_port_key" ON "Tenant"("port");

-- CreateIndex
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_systemTemplateId_fkey" FOREIGN KEY ("systemTemplateId") REFERENCES "SystemTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
