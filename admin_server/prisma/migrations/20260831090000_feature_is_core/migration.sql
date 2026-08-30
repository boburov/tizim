-- Tizim o'zagi belgisi: bu kalitlar katalogda turadi (bog'liqlikni to'sish
-- uchun kerak), lekin panelda o'chirgich ko'rsatilmaydi.
-- Qo'shimcha ustun, standart qiymatli — mavjud qatorlar o'zgarmaydi.
ALTER TABLE "Feature" ADD COLUMN "isCore" BOOLEAN NOT NULL DEFAULT false;
