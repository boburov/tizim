-- ═══════════════════════════════════════════════════════════════════════════
-- TANGA (COIN) VA MARKET — RAG'BATLANTIRISH TIZIMI
--
-- QAMROV
--   • 2 yangi enum: CoinTxKind, MarketOrderStatus.
--   • 5 yangi jadval: coin_settings, coin_accounts, coin_transactions,
--     market_products, market_orders.
--   • MAVJUD jadvalga BIRORTA ustun qo'shilmadi va o'zgartirilmadi.
--
-- XAVFSIZLIK
--   Hech qanday DROP / RENAME / ALTER yo'q. Migratsiya QAYTARIB
--   BO'LADIGAN: 5 ta jadvalni tashlash butun tizimni migratsiyadan
--   oldingi holatiga qaytaradi.
--
-- ⚠ PUL EMAS
--   Barcha tanga ustunlari INTEGER. Ular `numeric(18,2)` EMAS va bo'lmasligi
--   ham kerak: tanga kassaga tushmaydi, jurnalga yozilmaydi va moliyaviy
--   hisobotga kirmaydi. Ularni pul ustunlari bilan bir turga keltirish
--   kelajakda kimdir ularni SUM() ga qo'shib yuborishiga yo'l ochardi.
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "CoinTxKind" AS ENUM ('attendance', 'grade', 'purchase', 'refund', 'manual');

-- CreateEnum
CREATE TYPE "MarketOrderStatus" AS ENUM ('pending', 'approved', 'ready', 'delivered', 'rejected', 'canceled');

-- CreateTable
CREATE TABLE "coin_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "marketEnabled" BOOLEAN NOT NULL DEFAULT true,
    "coinLabel" TEXT NOT NULL DEFAULT 'tanga',
    "attendancePresentCoins" INTEGER NOT NULL DEFAULT 1,
    "attendanceExcusedCoins" INTEGER NOT NULL DEFAULT 0,
    "gradeMinValue" INTEGER NOT NULL DEFAULT 3,
    "gradeCoinsPerPoint" INTEGER NOT NULL DEFAULT 1,
    "dailyEarnLimit" INTEGER NOT NULL DEFAULT 0,
    "orderAutoApprove" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coin_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_accounts" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "userId" VARCHAR(24) NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "totalEarned" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" INTEGER NOT NULL DEFAULT 0,
    "lastEarnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coin_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_transactions" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "userId" VARCHAR(24) NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "kind" "CoinTxKind" NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "sourceKey" TEXT,
    "refId" VARCHAR(24),
    "branchId" VARCHAR(24),
    "createdById" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_products" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "price" INTEGER NOT NULL,
    "stock" INTEGER,
    "deliveryInfo" TEXT NOT NULL DEFAULT '',
    "deliveryDays" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "branchId" VARCHAR(24),
    "createdById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_orders" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "userId" VARCHAR(24) NOT NULL,
    "productId" VARCHAR(24) NOT NULL,
    "productName" TEXT NOT NULL,
    "priceCoins" INTEGER NOT NULL,
    "deliveryInfo" TEXT NOT NULL DEFAULT '',
    "deliveryDays" INTEGER NOT NULL DEFAULT 0,
    "expectedAt" TIMESTAMP(3),
    "status" "MarketOrderStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT NOT NULL DEFAULT '',
    "adminNote" TEXT NOT NULL DEFAULT '',
    "handledById" VARCHAR(24),
    "handledAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "branchId" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coin_accounts_userId_key" ON "coin_accounts"("userId");

-- CreateIndex
CREATE INDEX "coin_transactions_userId_createdAt_idx" ON "coin_transactions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "coin_transactions_kind_createdAt_idx" ON "coin_transactions"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "coin_transactions_refId_idx" ON "coin_transactions"("refId");

-- CreateIndex
CREATE INDEX "market_products_branchId_isActive_isDeleted_idx" ON "market_products"("branchId", "isActive", "isDeleted");

-- CreateIndex
CREATE INDEX "market_products_isDeleted_sortOrder_idx" ON "market_products"("isDeleted", "sortOrder");

-- CreateIndex
CREATE INDEX "market_orders_userId_createdAt_idx" ON "market_orders"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "market_orders_status_createdAt_idx" ON "market_orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "market_orders_branchId_status_idx" ON "market_orders"("branchId", "status");

-- CreateIndex
CREATE INDEX "market_orders_productId_idx" ON "market_orders"("productId");

-- ═══════════════════════════════════════════════════════════════════════════
-- QISMAN UNIQUE INDEKS — IKKI MARTA TANGA BERISHNING OLDINI OLADI
--
-- Bu indeks bo'lmasa xato JIMGINA bo'lardi. Davomat qayta belgilanishi
-- ODATIY hodisa: o'qituvchi "absent" ni "present" ga tuzatadi, admin
-- kechikkan yozuvni kiritadi. Har chaqiruv yangi tanga yozsa, bitta
-- dars cheksiz marta to'lardi va buni faqat balans g'alati o'sganda
-- sezilardi — o'shanda esa qaysi yozuv soxta ekanini aniqlab bo'lmasdi.
--
-- `WHERE "sourceKey" IS NOT NULL` SHART: PostgreSQL'da NULL != NULL, ya'ni
-- qo'lda berilgan tangalar (sourceKey yo'q) bir-birini to'smaydi.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX "coin_transactions_sourceKey_key"
  ON "coin_transactions" ("sourceKey")
  WHERE "sourceKey" IS NOT NULL;

-- ─────────────────────────── TASHQI KALITLAR ───────────────────────────
--
-- `ON DELETE CASCADE` faqat FOYDALANUVCHI o'chirilganda: hamyon va uning
-- tarixi egasisiz qolmasligi kerak. Amalda foydalanuvchi SOFT-DELETE
-- qilinadi, ya'ni bu yo'l deyarli yurmaydi — lekin baza darajasidagi
-- kafolat kod xatosidan qat'i nazar ishlaydi.
--
-- Qolganlari `RESTRICT`: filial yoki mahsulot o'chirilganda buyurtma
-- tarixi YO'QOLMASLIGI kerak (u tanga sarflanganini isbotlaydi).

ALTER TABLE "coin_settings" ADD CONSTRAINT "coin_settings_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "coin_accounts" ADD CONSTRAINT "coin_accounts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "market_products" ADD CONSTRAINT "market_products_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "market_products" ADD CONSTRAINT "market_products_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "market_orders" ADD CONSTRAINT "market_orders_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "market_orders" ADD CONSTRAINT "market_orders_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "market_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "market_orders" ADD CONSTRAINT "market_orders_handledById_fkey"
  FOREIGN KEY ("handledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "market_orders" ADD CONSTRAINT "market_orders_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- INVARIANTLAR — kod xatosi bazaga yetib bormasin
-- ═══════════════════════════════════════════════════════════════════════════

-- Tanga harakati NOLGA teng bo'lmaydi: "0 tanga topdingiz" degan yozuv
-- tarixni ma'nosiz shovqin bilan to'ldiradi va "nega balans o'zgarmadi"
-- degan savol tug'diradi.
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_tx_delta_nonzero"
  CHECK ("delta" <> 0);

-- Balans MANFIY bo'lmaydi. Bu yagona haqiqiy himoya: tekshiruv faqat
-- kodda bo'lsa, ikkita bir vaqtli xarid ikkalasi ham "yetarli" deb
-- o'qib, balansni minusga tushirardi.
ALTER TABLE "coin_accounts" ADD CONSTRAINT "coin_balance_nonnegative"
  CHECK ("balance" >= 0);

-- Narx va zaxira manfiy bo'lmaydi.
ALTER TABLE "market_products" ADD CONSTRAINT "market_price_nonnegative"
  CHECK ("price" >= 0);
ALTER TABLE "market_products" ADD CONSTRAINT "market_stock_nonnegative"
  CHECK ("stock" IS NULL OR "stock" >= 0);
