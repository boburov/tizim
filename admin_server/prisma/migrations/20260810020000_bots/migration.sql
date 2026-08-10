-- CreateEnum
CREATE TYPE "BotRuntime" AS ENUM ('NODEJS', 'PHP');

-- CreateEnum
CREATE TYPE "BotMode" AS ENUM ('POLLING', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "BotSource" AS ENUM ('REPO', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "BotStatus" AS ENUM ('DRAFT', 'PROVISIONING', 'ACTIVE', 'FAILED', 'STOPPED', 'DEPROVISIONING', 'DELETED');

-- CreateTable
CREATE TABLE "BotTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "runtime" "BotRuntime" NOT NULL,
    "templateDir" TEXT NOT NULL,
    "entryFile" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "runtime" "BotRuntime" NOT NULL,
    "mode" "BotMode" NOT NULL,
    "source" "BotSource" NOT NULL,
    "repoUrl" TEXT,
    "repoBranch" TEXT NOT NULL DEFAULT 'main',
    "templateId" TEXT,
    "tokenEnc" TEXT NOT NULL,
    "botUsername" TEXT,
    "pm2Name" TEXT NOT NULL,
    "port" INTEGER,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT,
    "status" "BotStatus" NOT NULL DEFAULT 'DRAFT',
    "deployLog" TEXT,
    "failureReason" TEXT,
    "lastDeployedAt" TIMESTAMP(3),
    "tenantId" TEXT,
    "customerId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotEnvVar" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotEnvVar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BotTemplate_key_key" ON "BotTemplate"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Bot_slug_key" ON "Bot"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Bot_pm2Name_key" ON "Bot"("pm2Name");

-- CreateIndex
CREATE UNIQUE INDEX "Bot_port_key" ON "Bot"("port");

-- CreateIndex
CREATE INDEX "Bot_status_idx" ON "Bot"("status");

-- CreateIndex
CREATE INDEX "Bot_tenantId_idx" ON "Bot"("tenantId");

-- CreateIndex
CREATE INDEX "Bot_customerId_idx" ON "Bot"("customerId");

-- CreateIndex
CREATE INDEX "BotEnvVar_botId_idx" ON "BotEnvVar"("botId");

-- CreateIndex
CREATE UNIQUE INDEX "BotEnvVar_botId_key_key" ON "BotEnvVar"("botId", "key");

-- AddForeignKey
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BotTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotEnvVar" ADD CONSTRAINT "BotEnvVar_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

