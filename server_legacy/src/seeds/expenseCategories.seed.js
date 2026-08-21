import "dotenv/config";
import prisma, { connectDB, disconnectDB } from "../config/prisma.js";
import logger from "../config/logger.js";

// STANDART CHIQIM KATEGORIYALARI.
//
// branchId = null → barcha filiallar uchun umumiy. Filialga xos kategoriya
// kerak bo'lsa owner UI orqali qo'shadi.
//
// isSystem = true → o'chirib bo'lmaydi. Faqat "Maosh" tizim kategoriyasi:
// maosh chiqimi SalaryTransaction'dan keladi va hisobotda "payroll" turiga
// bog'lanadi - uni o'chirish hisobot mantiqini buzardi.
//
// IDEMPOTENT: code bo'yicha upsert - qayta ishga tushirilsa dublikat
// yaratilmaydi va owner qilgan o'zgarishlar (nom, tartib) SAQLANADI.
const CATEGORIES = [
  { code: "rent", name: "Ijara", kind: "operating", sortOrder: 10 },
  { code: "utilities", name: "Kommunal (svet, suv, gaz)", kind: "operating", sortOrder: 20 },
  { code: "internet", name: "Internet va aloqa", kind: "operating", sortOrder: 30 },
  { code: "salary", name: "Maosh", kind: "payroll", sortOrder: 40, isSystem: true },
  { code: "marketing", name: "Reklama va marketing", kind: "operating", sortOrder: 50 },
  { code: "supplies", name: "Kanselyariya va sarf materiallar", kind: "operating", sortOrder: 60 },
  { code: "repair", name: "Ta'mir va xo'jalik", kind: "operating", sortOrder: 70 },
  { code: "equipment", name: "Jihoz va texnika", kind: "capital", sortOrder: 80 },
  { code: "tax", name: "Soliq va yig'imlar", kind: "tax", sortOrder: 90 },
  { code: "transport", name: "Transport", kind: "operating", sortOrder: 100 },
  { code: "other", name: "Boshqa", kind: "operating", sortOrder: 999 },
];

const seed = async () => {
  await connectDB();

  // MONGO → PRISMA
  //   ExpenseCategory.findOne({ isDeleted: { $ne: true } })
  //     → prisma.expenseCategory.findFirst({ where: { isDeleted: false } })
  //       (`isDeleted` ustuni NOT NULL/default false, ya'ni `$ne: true`
  //        oddiy `false` ga aylanadi)
  //   ExpenseCategory.create(...) → prisma.expenseCategory.create({ data })
  //
  // `code` bo'yicha UNIQUE INDEKS YO'Q (qarang schema.prisma) — qisman
  // unique (branchId, name) bo'yicha. Shuning uchun `upsert` emas,
  // ochiq "bormi?" tekshiruvi: idempotentlik shu yerda ta'minlanadi.
  let created = 0;
  let skipped = 0;
  for (const c of CATEGORIES) {
    const existing = await prisma.expenseCategory.findFirst({
      where: { code: c.code, branchId: null, isDeleted: false },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.expenseCategory.create({
      data: {
        ...c,
        branchId: null,
        isSystem: Boolean(c.isSystem),
        isActive: true,
      },
    });
    created += 1;
  }

  logger.info({ created, skipped }, "Chiqim kategoriyalari seed qilindi");
  await disconnectDB();
};

seed().catch(async (err) => {
  logger.error({ err }, "Chiqim kategoriyalari seed xatosi");
  await disconnectDB();
  process.exit(1);
});
