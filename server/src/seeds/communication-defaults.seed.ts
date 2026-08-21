import type { TemplateCategory, HolidayAudience } from '@prisma/client';
import { runSeed } from './seed-runner.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ALOQA STANDARTLARI (shablon / fikr turi / bayram) —
 * `server_legacy/src/seeds/communicationDefaults.seed.js` dan ko'chirilgan.
 *
 * Markaz nomi matnga QATTIQ yozilmaydi — `{markaz}` tokeni ishlatiladi.
 * Token xabar YUBORISH paytida `APP_NAME` bilan almashtiriladi
 * (`modules/notifications/.../personalize-body`), shuning uchun brend nomi
 * o'zgarsa bazadagi eski shablonlar ham yangi nom bilan chiqadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
// `category` va `audience` — Prisma ENUMLARI, satr emas. Express versiyasida
// ular oddiy string edi va noto'g'ri qiymat faqat ISHGA TUSHGANDA, Postgres
// tomonidan rad etilardi; bu yerda kompilyatsiya to'xtaydi.
const TEMPLATES: { name: string; body: string; category: TemplateCategory }[] = [
  {
    name: 'Bayram tabrigi',
    body: "Hurmatli mijoz, sizni bayram bilan qutlaymiz! {markaz} jamoasi.",
    category: 'holiday',
  },
  {
    name: 'Dars bekor qilindi',
    body: "Hurmatli o'quvchi, bugungi darsimiz bekor qilindi. Murojaat uchun raqam: ...",
    category: 'class_cancel',
  },
  {
    name: "Yangi e'lon",
    body: "{markaz} ta'lim markazidan e'lon: ...",
    category: 'announcement',
  },
  {
    name: 'Shaxsiy xabar',
    body: 'Sizga shaxsiy xabar: ...',
    category: 'personal',
  },
  {
    name: 'Qarz ogohlantirish',
    body: 'Sizda to\'lanmagan qarz mavjud. Iltimos, eng qisqa muddatda hal qiling.',
    category: 'debt',
  },
  {
    name: 'Tabrik',
    body: 'Sizni {markaz} jamoasi tabriklaydi!',
    category: 'custom',
  },
];

const FEEDBACK_TYPES = [
  "O'qituvchi haqida",
  'Dars sifati',
  'Markaz haqida',
  'Taklif',
  'Shikoyat',
  "Guruh almashtirish so'rovi",
  "To'lov muddati uzaytirish",
  'Boshqa',
];

const HOLIDAYS: {
  name: string;
  isRecurring: boolean;
  month: number;
  day: number;
  audience: HolidayAudience;
  message: string;
}[] = [
  {
    name: 'Yangi yil',
    isRecurring: true,
    month: 1,
    day: 1,
    audience: 'all',
    message:
      "Yangi yilingiz muborak bo'lsin! Sog'lik, baxt va omad tilaymiz! {markaz} jamoasi.",
  },
  {
    name: 'Xotin-qizlar bayrami',
    isRecurring: true,
    month: 3,
    day: 8,
    audience: 'all',
    message: "8-mart - Xalqaro xotin-qizlar kuni muborak bo'lsin! {markaz} jamoasi.",
  },
  {
    name: "Navro'z",
    isRecurring: true,
    month: 3,
    day: 21,
    audience: 'all',
    message: "Navro'z bayrami muborak bo'lsin! {markaz} jamoasi.",
  },
  {
    name: 'Xotira va qadrlash kuni',
    isRecurring: true,
    month: 5,
    day: 9,
    audience: 'all',
    message: '9-may - Xotira va qadrlash kuni muborak. {markaz} jamoasi.',
  },
  {
    name: 'Mustaqillik kuni',
    isRecurring: true,
    month: 9,
    day: 1,
    audience: 'all',
    message: "Mustaqillik bayrami muborak bo'lsin! {markaz} jamoasi.",
  },
  {
    name: "O'qituvchilar va murabbiylar kuni",
    isRecurring: true,
    month: 10,
    day: 1,
    audience: 'teachers',
    message: "Hurmatli o'qituvchimiz, kasb bayramingiz muborak! {markaz} jamoasi.",
  },
];

void runSeed('communication-defaults', async ({ prisma, logger }) => {
  // ═══════════════════════════════════════════════════════════════════════
  // `$setOnInsert` SEMANTIKASI: MAVJUD QATOR HECH QACHON O'ZGARTIRILMAYDI.
  //
  // Prisma'ning `upsert` i BU YERDA ISHLAMAYDI: `notification_templates`
  // va `feedback_types` dagi yagonalik QISMAN unique indeks
  // (`(name) WHERE isActive = true`, qarang
  // `migrations/20260815200910_partial_unique_indexes`), Prisma esa qisman
  // indeksni bilmaydi va uni `where` da nishonga ola olmaydi. `Holiday` da
  // esa `name` bo'yicha unique umuman yo'q.
  //
  // Shuning uchun tekshiruv OCHIQ yoziladi: bor bo'lsa TEGILMAYDI — owner
  // qo'lda tahrirlagan shablon keyingi seed'da TIKLANMASLIGI kerak.
  // ═══════════════════════════════════════════════════════════════════════
  let created = 0;
  for (const t of TEMPLATES) {
    const found = await prisma.notificationTemplate.findFirst({
      where: { name: t.name, isActive: true },
      select: { id: true },
    });
    if (found) continue;
    await prisma.notificationTemplate.create({ data: { ...t, isActive: true } });
    created += 1;
  }
  logger.log(`Bildirishnoma shablonlari: ${TEMPLATES.length} (yangi: ${created})`);

  created = 0;
  for (const name of FEEDBACK_TYPES) {
    const found = await prisma.feedbackType.findFirst({
      where: { name, isActive: true },
      select: { id: true },
    });
    if (found) continue;
    await prisma.feedbackType.create({ data: { name, isActive: true } });
    created += 1;
  }
  logger.log(`Fikr turlari: ${FEEDBACK_TYPES.length} (yangi: ${created})`);

  created = 0;
  for (const h of HOLIDAYS) {
    // Bayramda filtr FAQAT `name` bo'yicha — Express versiyasi ham shunday.
    const found = await prisma.holiday.findFirst({
      where: { name: h.name },
      select: { id: true },
    });
    if (found) continue;
    await prisma.holiday.create({ data: { ...h, isActive: true } });
    created += 1;
  }
  logger.log(`Bayramlar: ${HOLIDAYS.length} (yangi: ${created})`);
});
