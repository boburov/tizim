-- ═══════════════════════════════════════════════════════════════════════════
-- TARIF KESHINING DOIMIY NUSXASI
--
-- QAMROV
--   • 1 yangi jadval: entitlement_cache (yagona qator).
--   • MAVJUD jadvallarga TEGILMADI: birorta ustun qo'shilmadi,
--     o'zgartirilmadi va o'chirilmadi.
--
-- XAVFSIZLIK
--   Hech qanday DROP / RENAME / ALTER yo'q. Migratsiya QAYTARIB BO'LADIGAN:
--   jadvalni tashlash tizimni migratsiyadan oldingi holatiga qaytaradi.
--
-- NEGA KERAK
--   Modul darvozalari (`imports` kabi tarif bo'limlari) YOPIQ yiqiladi:
--   limitlar keshi bo'sh bo'lsa bo'lim O'CHIQ hisoblanadi. Kesh esa
--   xotirada turadi va PM2 qayta ishga tushganda bo'shaydi — ya'ni har
--   deploy mijoz ilovasini birinchi heartbeat'gacha (15 daqiqagacha)
--   qorong'i qilardi. Shu qator o'sha bo'shliqni yopadi.
--
-- ⚠ `receivedAt` — `updatedAt` DAN ALOHIDA
--   Javob ASLIDA qachon kelgani saqlanadi. 72 soatlik muhlat shundan
--   hisoblanadi. Agar tiklashda vaqt "hozir" deb qo'yilsa, uzoq aloqasiz
--   turgan server har qayta ishga tushganda muhlatni QAYTA BOSHLAB,
--   pullik modullarni cheksiz bepul qoldirardi.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "entitlement_cache" (
    "id"         TEXT NOT NULL DEFAULT 'singleton',
    "payload"    JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entitlement_cache_pkey" PRIMARY KEY ("id")
);
