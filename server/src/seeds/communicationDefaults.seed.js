import "dotenv/config";
import prisma, { connectDB, disconnectDB } from "../config/prisma.js";
import logger from "../config/logger.js";

// Markaz nomi matnga QATTIQ yozilmaydi - `{markaz}` tokeni ishlatiladi.
// Token xabar YUBORISH paytida env.APP_NAME bilan almashtiriladi
// (notifications/services/personalizeBody.helper.js), shuning uchun brend
// nomi o'zgarsa bazadagi eski shablonlar ham yangi nom bilan chiqadi.
const TEMPLATES = [
  {
    name: "Bayram tabrigi",
    body: "Hurmatli mijoz, sizni bayram bilan qutlaymiz! {markaz} jamoasi.",
    category: "holiday",
  },
  {
    name: "Dars bekor qilindi",
    body: "Hurmatli o'quvchi, bugungi darsimiz bekor qilindi. Murojaat uchun raqam: ...",
    category: "class_cancel",
  },
  {
    name: "Yangi e'lon",
    body: "{markaz} ta'lim markazidan e'lon: ...",
    category: "announcement",
  },
  {
    name: "Shaxsiy xabar",
    body: "Sizga shaxsiy xabar: ...",
    category: "personal",
  },
  {
    name: "Qarz ogohlantirish",
    body: "Sizda to'lanmagan qarz mavjud. Iltimos, eng qisqa muddatda hal qiling.",
    category: "debt",
  },
  {
    name: "Tabrik",
    body: "Sizni {markaz} jamoasi tabriklaydi!",
    category: "custom",
  },
];

const FEEDBACK_TYPES = [
  "O'qituvchi haqida",
  "Dars sifati",
  "Markaz haqida",
  "Taklif",
  "Shikoyat",
  "Guruh almashtirish so'rovi",
  "To'lov muddati uzaytirish",
  "Boshqa",
];

const HOLIDAYS = [
  {
    name: "Yangi yil",
    isRecurring: true,
    month: 1,
    day: 1,
    audience: "all",
    message:
      "Yangi yilingiz muborak bo'lsin! Sog'lik, baxt va omad tilaymiz! {markaz} jamoasi.",
  },
  {
    name: "Xotin-qizlar bayrami",
    isRecurring: true,
    month: 3,
    day: 8,
    audience: "all",
    message:
      "8-mart - Xalqaro xotin-qizlar kuni muborak bo'lsin! {markaz} jamoasi.",
  },
  {
    name: "Navro'z",
    isRecurring: true,
    month: 3,
    day: 21,
    audience: "all",
    message: "Navro'z bayrami muborak bo'lsin! {markaz} jamoasi.",
  },
  {
    name: "Xotira va qadrlash kuni",
    isRecurring: true,
    month: 5,
    day: 9,
    audience: "all",
    message:
      "9-may - Xotira va qadrlash kuni muborak. {markaz} jamoasi.",
  },
  {
    name: "Mustaqillik kuni",
    isRecurring: true,
    month: 9,
    day: 1,
    audience: "all",
    message:
      "Mustaqillik bayrami muborak bo'lsin! {markaz} jamoasi.",
  },
  {
    name: "O'qituvchilar va murabbiylar kuni",
    isRecurring: true,
    month: 10,
    day: 1,
    audience: "teachers",
    message:
      "Hurmatli o'qituvchimiz, kasb bayramingiz muborak! {markaz} jamoasi.",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// `$setOnInsert` SEMANTIKASI: MAVJUD QATOR HECH QACHON O'ZGARTIRILMAYDI.
//
// Mongo'da bu `findOneAndUpdate(filter, { $setOnInsert }, { upsert: true })`
// edi. Prisma'ning `upsert` i BU YERDA ISHLAMAYDI: `notification_templates`
// va `feedback_types` dagi yagonalik QISMAN unique indeks
// (`(name) WHERE isActive = true`, qarang
// `migrations/20260815200910_partial_unique_indexes`), Prisma esa qisman
// indeksni bilmaydi va uni `where` da nishonga ola olmaydi. `Holiday` da
// esa `name` bo'yicha unique umuman yo'q.
//
// Shuning uchun tekshiruv ochiq yoziladi: bor bo'lsa TEGILMAYDI. Bu aynan
// eski xatti-harakat - owner qo'lda tahrirlagan shablon keyingi seed'da
// TIKLANMASLIGI kerak.
// ═══════════════════════════════════════════════════════════════════════════
const insertIfMissing = async (model, where, data) => {
  const found = await prisma[model].findFirst({ where, select: { id: true } });
  if (found) return false;
  await prisma[model].create({ data });
  return true;
};

const seed = async () => {
  await connectDB();

  let created = 0;
  for (const t of TEMPLATES) {
    if (await insertIfMissing("notificationTemplate", { name: t.name, isActive: true }, { ...t, isActive: true })) created += 1;
  }
  logger.info(`Notification shablonlari seed qilindi: ${TEMPLATES.length} (yangi: ${created})`);

  created = 0;
  for (const name of FEEDBACK_TYPES) {
    if (await insertIfMissing("feedbackType", { name, isActive: true }, { name, isActive: true })) created += 1;
  }
  logger.info(`Feedback turlari seed qilindi: ${FEEDBACK_TYPES.length} (yangi: ${created})`);

  created = 0;
  for (const h of HOLIDAYS) {
    // Bayramda filtr FAQAT `name` bo'yicha - eski Mongo filtri ham shunday edi.
    if (await insertIfMissing("holiday", { name: h.name }, { ...h, isActive: true })) created += 1;
  }
  logger.info(`Bayramlar seed qilindi: ${HOLIDAYS.length} (yangi: ${created})`);

  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "Communication defaults seed xato");
  process.exit(1);
});
