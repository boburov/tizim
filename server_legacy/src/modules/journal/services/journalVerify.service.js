import prisma from "../../../config/prisma.js";

// JURNAL HAQIQAT BILAN MOS KELADIMI.
//
// ══════════════════════════════════════════════════════════════════
// NEGA BU TEKSHIRUV ENG MUHIM QISM
// ══════════════════════════════════════════════════════════════════
// Jurnalga yozish ANIQ chaqiruv orqali bo'ladi (hook emas - sabab
// helpers/journalPosting.helper.js da). Aniq chaqiruvning zaifligi
// bitta: uni UNUTISH mumkin. Yangi to'lov yo'li qo'shiladi, jurnalga
// ulanmaydi - va bu HECH QAYERDA bilinmaydi, chunki hech narsa
// yiqilmaydi. Kassa qoldig'i shunchaki jimgina noto'g'ri bo'lib boradi.
//
// Bu servis aynan shu bo'shliqni yopadi: har bir operatsion model
// bo'yicha "nechta hujjat bor" va "nechtasi jurnalga tushgan" ni
// solishtiradi. Farq bo'lsa - qaysi hujjatlar tushmagani ham
// ko'rsatiladi, ya'ni backfill ularni tuzatishi mumkin.
//
// KO'LAMSIZ ishlaydi (branchFilter YO'Q) - bu owner uchun butun tarmoq
// bo'yicha sog'liq tekshiruvi.

/**
 * Manba modellar va ularning jurnaldagi izlari.
 *
 * `filter` - jurnalga tushishi KERAK bo'lgan hujjatlar sharti.
 * Tushmasligi kerak bo'lganlar (filialsiz chiqim, o'chirilgan yozuv)
 * shu yerda chiqarib tashlanadi - aks holda tekshiruv doim "farq bor"
 * deb qichqirardi.
 */
const SOURCES = [
  {
    key: "payment",
    label: "O'quvchi to'lovi (naqd/terminal)",
    table: "paymentTransaction",
    refModel: "PaymentTransaction",
    // source: "deposit" ALOHIDA hisoblanadi (deposit_apply) - u pul
    // harakati emas. Filialsiz yozuv jurnalga tushmaydi.
    // `branchId: { $ne: null }` OLIB TASHLANDI.
    //
    // MIGRATION.md qoidasi: "Prisma modelda maydon YO'Q bo'lsa (yoki
    // shart ma'nosini yo'qotgan bo'lsa) filtr TARJIMA QILINMAYDI,
    // O'CHIRILADI". `PaymentTransaction.branchId` Postgres'da
    // NOT NULL - ya'ni "filialsiz to'lov" degan holat MUMKIN EMAS
    // va uni chiqarib tashlash shartsiz. Mongo'da esa maydon
    // bo'lmasligi mumkin edi, shuning uchun filtr kerak edi.
    //
    // Prisma bunday filtrni jimgina qabul ham qilmaydi -
    // `PrismaClientValidationError` beradi.
    where: {
      source: { not: "deposit" },
      isDeleted: false,
    },
  },
  {
    key: "deposit_apply",
    label: "Depozitdan qoplash",
    table: "paymentTransaction",
    refModel: "PaymentTransaction",
    entryKind: "deposit_apply",
    // `branchId` NOT NULL - filtr o'chirildi (yuqoridagi izoh).
    where: { source: "deposit", isDeleted: false },
  },
  {
    key: "deposit",
    label: "Depozit kirim/chiqim",
    table: "depositTransaction",
    refModel: "DepositTransaction",
    // `branchId` NULLABLE - filialsiz depozit harakati jurnalga
    // TUSHMAYDI (journal.post branchId talab qiladi), shuning uchun
    // uni tekshiruvdan chiqarish SHART. Aks holda verify doim
    // "yetishmayapti" deb qichqirardi.
    where: {
      type: { in: ["topup", "withdraw"] },
      isDeleted: false,
      branchId: { not: null },
    },
  },
  {
    key: "expense",
    label: "Chiqim",
    table: "expense",
    refModel: "Expense",
    // `branchId` NULLABLE: markaz umumiy chiqimi jurnalga tushmaydi
    // (`journalPosting.postExpense` `branchId` yo'q bo'lsa `null`
    // qaytaradi) - shuning uchun tekshiruvdan chiqariladi.
    where: { isDeleted: false, branchId: { not: null } },
  },
  {
    key: "teacher_salary",
    label: "O'qituvchi maoshi",
    table: "salaryTransaction",
    refModel: "SalaryTransaction",
    // `branchId` NOT NULL - filtr o'chirildi.
    where: { isDeleted: false },
  },
  {
    key: "staff_salary",
    label: "Xodim maoshi",
    table: "staffSalaryTransaction",
    refModel: "StaffSalaryTransaction",
    // `branchId` NULLABLE - yuqoridagi izoh.
    where: { isDeleted: false, branchId: { not: null } },
  },
];

/**
 * Bitta manba bo'yicha solishtirish.
 *
 * @returns {{key, label, sourceCount, postedCount, missing: number, missingIds: string[]}}
 */
const verifySource = async (src, { sampleLimit = 10 } = {}) => {
  // `select: { id: true }` - Mongo proyeksiyasi HAR DOIM `_id` ni
  // qaytarardi, Prisma esa qaytarmaydi. Uni ochiq so'rash SHART.
  const docs = await prisma[src.table].findMany({
    where: src.where,
    select: { id: true },
  });
  const ids = docs.map((d) => d.id);
  if (ids.length === 0) {
    return {
      key: src.key,
      label: src.label,
      sourceCount: 0,
      postedCount: 0,
      missing: 0,
      missingIds: [],
    };
  }

  const entryWhere = {
    refModel: src.refModel,
    refId: { in: ids },
    ...(src.entryKind ? { kind: src.entryKind } : {}),
  };
  // deposit_apply va oddiy to'lov BIR XIL refModel ishlatadi, shuning
  // uchun turi ko'rsatilmagan manbada deposit_apply chiqarib tashlanadi.
  if (!src.entryKind && src.refModel === "PaymentTransaction") {
    entryWhere.kind = { not: "deposit_apply" };
  }

  const posted = await prisma.journalEntry.findMany({
    where: entryWhere,
    select: { refId: true },
  });
  const postedSet = new Set(posted.map((e) => String(e.refId)));

  const missingIds = ids
    .filter((id) => !postedSet.has(String(id)))
    .map(String);

  return {
    key: src.key,
    label: src.label,
    sourceCount: ids.length,
    postedCount: postedSet.size,
    missing: missingIds.length,
    // Butun ro'yxat emas - namuna. Minglab ID javobni ishlatib
    // bo'lmaydigan qilardi; backfill baribir hammasini o'zi topadi.
    missingIds: missingIds.slice(0, sampleLimit),
  };
};

/**
 * TO'LIQ TEKSHIRUV - barcha manbalar bo'yicha.
 *
 * `ok: false` = jurnalda yetishmayotgan yozuv bor, ya'ni kassa qoldig'i
 * haqiqatdan kam ko'rsatadi. Tuzatish: npm run migrate:journal-backfill
 */
export const verify = async ({ sampleLimit = 10 } = {}) => {
  const sources = [];
  for (const src of SOURCES) {
    sources.push(await verifySource(src, { sampleLimit }));
  }

  const totalMissing = sources.reduce((sum, s) => sum + s.missing, 0);

  return {
    ok: totalMissing === 0,
    totalMissing,
    sources,
  };
};

export { SOURCES };
