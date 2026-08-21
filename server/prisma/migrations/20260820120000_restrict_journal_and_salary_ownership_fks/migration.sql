-- ═══════════════════════════════════════════════════════════════════════════
-- EGALIK TASHQI KALITLARI: `SET NULL` → `RESTRICT`
--
-- MUAMMO (seed tekshiruvida O'LCHANGAN, taxmin emas):
--
--   Prisma ixtiyoriy (`?`) bog'lanishga standart holda `ON DELETE SET NULL`
--   qo'yadi. Bu ikki joyda invariantni buzardi:
--
--   1) `journal_entries` — O'ZGARMAS moliyaviy jurnal.
--      O'quvchi/o'qituvchi/xodim/guruh o'chirilganda yozuvning EGASI
--      jimgina null bo'lardi. Summalar (`journal_lines`) tegilmasdi, ya'ni
--      muvozanat tekshiruvi ham, `reconcile()` ham buni TOPMASDI — faqat
--      "bu pul KIMGA tegishli edi" degan javob qaytarib bo'lmaydigan
--      tarzda yo'qolardi.
--
--      O'LCHOV: demo ma'lumotni tozalash 48 yozuvning HAMMASIDA
--      `studentId`/`teacherId`/`groupId` ni null qildi (oldin 25/23/17).
--
--      MUHIM: bu `config/prisma.js` dagi jurnal o'zgarmasligi
--      kengaytmasini CHETLAB O'TARDI — kengaytma `update`/`upsert` ni
--      to'sadi, FK esa qatorni BAZA ICHIDA o'zgartiradi.
--
--   2) `teacher_salaries.groupId` — bazani O'ZINI ziddiyatga solardi.
--      Guruh o'chganda `groupId` null bo'ladi, lekin
--      `teacher_salaries_kind_group_check` `kind='group'` qatoridan
--      `groupId` NOT NULL bo'lishini talab qiladi. Natijada maosh tarixi
--      bor guruhni o'chirish 23514 bilan yiqilardi va xato butunlay
--      boshqa jadval nomi bilan chiqib, sababi ko'rinmasdi.
--
-- YECHIM: beshhala kalit `RESTRICT` ga o'tkaziladi. Tarixi bor yozuvga
-- ega odam yoki guruhni o'chirish endi 23503 (foreign key violation)
-- beradi — ya'ni xato AYNAN to'sayotgan jadvalni ko'rsatadi.
--
-- BU MIGRATSIYA MA'LUMOTGA TEGMAYDI:
--   • birorta qator o'chirilmaydi, qo'shilmaydi, yangilanmaydi;
--   • jurnal summalari va maosh yozuvlari o'zgarmaydi;
--   • ustun, jadval, indeks, enum va CHECK cheklovlari o'zgarmaydi;
--   • `ON UPDATE CASCADE` avvalgidek qoladi (faqat DELETE qoidasi o'zgardi).
--
-- KASKAD YO'Q — ATAYLAB. Jurnal yozuvi hech qachon avtomatik o'chmaydi.
-- Xato yozuvni tuzatishning yagona yo'li avvalgidek STORNO
-- (`journal.reverse()`).
--
-- QAYTARISH (kerak bo'lsa): `RESTRICT` o'rniga `SET NULL` yozib, shu
-- beshta cheklovni qayta yarating.
-- ═══════════════════════════════════════════════════════════════════════════

-- DropForeignKey
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_groupId_fkey";

-- DropForeignKey
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_staffId_fkey";

-- DropForeignKey
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_studentId_fkey";

-- DropForeignKey
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_teacherId_fkey";

-- DropForeignKey
ALTER TABLE "teacher_salaries" DROP CONSTRAINT "teacher_salaries_groupId_fkey";

-- AddForeignKey
ALTER TABLE "teacher_salaries" ADD CONSTRAINT "teacher_salaries_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
