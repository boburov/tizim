-- Tenantni to'xtatish (suspend) kuzatuvi.
-- Obuna tugaganda pm2 process to'xtaydi, status SUSPENDED bo'ladi.
ALTER TABLE "Tenant" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "suspendReason" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "suspendLog" TEXT;

-- Bepul sinov: faqat admin beradi, shuning uchun kim/qachon bergani yoziladi.
ALTER TABLE "Subscription" ADD COLUMN "trialDays" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "trialGrantedBy" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "trialGrantedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "trialNote" TEXT;

-- API obunasida oxirgi HAQIQIY so'rov vaqti — hisob tirikligini ko'rsatadi.
ALTER TABLE "ApiSubscription" ADD COLUMN "lastRequestAt" TIMESTAMP(3);

-- Muddati o'tgan obunalarni tez topish uchun (scheduler har 15 daqiqada so'raydi).
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");
