-- CreateEnum
CREATE TYPE "ApiSubscriptionStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELED');

-- CreateTable
CREATE TABLE "ApiService" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseUrl" TEXT,
    "docsUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiTier" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "interval" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "rateLimitRpm" INTEGER NOT NULL DEFAULT 60,
    "priority" INTEGER NOT NULL DEFAULT 3,
    "monthlyQuota" INTEGER NOT NULL DEFAULT -1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiConsumer" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "email" TEXT,
    "note" TEXT,
    "customerId" TEXT,
    "tenantId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiConsumer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiSubscription" (
    "id" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "status" "ApiSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "label" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsageDaily" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "endpoint" TEXT NOT NULL DEFAULT 'assess',
    "ok" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "totalMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ApiUsageDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiService_key_key" ON "ApiService"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ApiTier_serviceId_key_key" ON "ApiTier"("serviceId", "key");

-- CreateIndex
CREATE INDEX "ApiConsumer_customerId_idx" ON "ApiConsumer"("customerId");

-- CreateIndex
CREATE INDEX "ApiConsumer_tenantId_idx" ON "ApiConsumer"("tenantId");

-- CreateIndex
CREATE INDEX "ApiSubscription_status_idx" ON "ApiSubscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ApiSubscription_consumerId_serviceId_key" ON "ApiSubscription"("consumerId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");

-- CreateIndex
CREATE INDEX "ApiKey_subscriptionId_idx" ON "ApiKey"("subscriptionId");

-- CreateIndex
CREATE INDEX "ApiUsageDaily_subscriptionId_day_idx" ON "ApiUsageDaily"("subscriptionId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ApiUsageDaily_subscriptionId_day_endpoint_key" ON "ApiUsageDaily"("subscriptionId", "day", "endpoint");

-- AddForeignKey
ALTER TABLE "ApiTier" ADD CONSTRAINT "ApiTier_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ApiService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiConsumer" ADD CONSTRAINT "ApiConsumer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiConsumer" ADD CONSTRAINT "ApiConsumer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiSubscription" ADD CONSTRAINT "ApiSubscription_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "ApiConsumer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiSubscription" ADD CONSTRAINT "ApiSubscription_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ApiService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiSubscription" ADD CONSTRAINT "ApiSubscription_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "ApiTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "ApiSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiUsageDaily" ADD CONSTRAINT "ApiUsageDaily_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "ApiSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
