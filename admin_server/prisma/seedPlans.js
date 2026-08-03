// Standart imkoniyatlar (features) va tariflarni yaratadi.
// Qayta ishga tushirsa xato bermaydi (upsert).
//
// metricKey — tenant server heartbeat'da yuboradigan metrika nomi.
// Bular usageHeartbeat.job.js dagi collectMetrics() bilan MOS bo'lishi shart.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FEATURES = [
  {
    key: 'max_students',
    name: "O'quvchilar soni",
    description: "Tizimga qo'shish mumkin bo'lgan maksimal o'quvchi",
    type: 'LIMIT',
    unit: 'ta',
    metricKey: 'student_count',
  },
  {
    key: 'max_users',
    name: 'Xodimlar soni',
    description: "Owner, o'qituvchi va boshqa xodimlar",
    type: 'LIMIT',
    unit: 'ta',
    metricKey: 'user_count',
  },
  {
    key: 'max_groups',
    name: 'Guruhlar soni',
    description: 'Yaratish mumkin bo\'lgan maksimal guruh',
    type: 'LIMIT',
    unit: 'ta',
    metricKey: 'group_count',
  },
  {
    key: 'max_storage_mb',
    name: 'Xotira hajmi',
    description: "Ma'lumotlar bazasi hajmi",
    type: 'LIMIT',
    unit: 'MB',
    metricKey: 'storage_mb',
  },
  {
    key: 'telegram_bot',
    name: 'Telegram bot',
    description: 'Telegram bot orqali xabarnomalar',
    type: 'BOOLEAN',
    unit: null,
    metricKey: null,
  },
  // AI MASLAHATCHI — pullik qatlam.
  //
  // Ikki kalitga bo'lingani ataylab:
  //   ai_advisor     — KIRISH huquqi (paywall). /api/ai/* shu bilan yopiladi.
  //   ai_calls_month — XARAJAT chegarasi (LLM chaqiruvlari soni).
  //
  // Ular alohida, chunki xatti-harakati teskari: kirish tekshiruvi aloqa
  // yo'qolganda OCHIQ yiqilishi kerak (mijozni bloklamaymiz), xarajat
  // chegarasi esa YOPIQ (aks holda bitta uzilish hisobni bo'shatadi).
  {
    key: 'ai_advisor',
    name: 'AI maslahatchi',
    description: "Tahlil, Action Center, hisobotlar, prognoz va AI izohlar",
    type: 'BOOLEAN',
    unit: null,
    metricKey: null,
  },
  {
    key: 'ai_calls_month',
    name: 'AI izoh chaqiruvlari',
    description: "Oyiga yoziladigan AI matn izohlari soni",
    type: 'LIMIT',
    unit: 'ta/oy',
    metricKey: 'ai_calls_month',
  },
];

// value: -1 = cheksiz, BOOLEAN uchun 0/1
const PLANS = [
  {
    key: 'free',
    name: 'Bepul',
    description: 'Sinab ko\'rish uchun',
    price: 0,
    interval: 'MONTHLY',
    trialDays: 0,
    sortOrder: 1,
    features: {
      max_students: 50,
      max_users: 3,
      max_groups: 5,
      max_storage_mb: 200,
      telegram_bot: 0,
      // Bepul tarifda AI SOTILMAYDI. Sabab texnik, marketing emas:
      // 50 o'quvchi va bir necha haftalik tarixda confidence < 0.4
      // chiqadi va butun sahifa "Ma'lumot yetarli emas" bo'ladi.
      ai_advisor: 0,
      ai_calls_month: 0,
    },
  },
  {
    key: 'basic',
    name: 'Boshlang\'ich',
    description: 'Kichik o\'quv markazlar uchun',
    price: 300000,
    interval: 'MONTHLY',
    trialDays: 14,
    sortOrder: 2,
    features: {
      max_students: 300,
      max_users: 10,
      max_groups: 30,
      max_storage_mb: 2000,
      telegram_bot: 1,
      // Basic'da AI tarifga KIRMAYDI — "ai_advisor" add-on'i orqali sotiladi.
      // Chaqiruv byudjeti esa oldindan berilgan: add-on ai_advisor'ni 0→1
      // qiladi, lekin bitta add-on faqat bitta feature'ga bog'lanadi.
      // Byudjet bu yerda turmasa, add-on sotib olgan mijozda 0 ta chaqiruv
      // qolardi va izohlar umuman yozilmasdi.
      ai_advisor: 0,
      ai_calls_month: 4000,
    },
  },
  {
    key: 'pro',
    name: 'Professional',
    description: 'O\'rta va katta markazlar uchun',
    price: 700000,
    interval: 'MONTHLY',
    trialDays: 14,
    sortOrder: 3,
    features: {
      max_students: 1000,
      max_users: 30,
      max_groups: 100,
      max_storage_mb: 10000,
      telegram_bot: 1,
      // Pro'dan boshlab AI tarif ICHIDA. Bu pro narxini oqlaydi va
      // basic → pro ko'chishga sabab beradi.
      // 4000 chaqiruv ≈ $1.9 token xarajati — pro narxining ~3% i.
      ai_advisor: 1,
      ai_calls_month: 4000,
    },
  },
  {
    key: 'unlimited',
    name: 'Cheksiz',
    description: 'Katta tarmoqlar uchun — limitsiz',
    price: 1500000,
    interval: 'MONTHLY',
    trialDays: 0,
    sortOrder: 4,
    features: {
      max_students: -1,
      max_users: -1,
      max_groups: -1,
      max_storage_mb: -1,
      telegram_bot: 1,
      ai_advisor: 1,
      // ATAYLAB -1 EMAS. Qolgan limitlar bizga hech narsaga tushmaydi
      // (o'z serverimiz), AI chaqiruvi esa har biri uchun tashqi
      // provayderga pul to'laymiz. Bu yerda "cheksiz" yozish — narxi
      // oldindan noma'lum ochiq hisob demakdir.
      // 15000 ≈ $7/oy, ya'ni tarif narxining ~6% i.
      ai_calls_month: 15000,
    },
  },
];

// ADD-ON'LAR — tarifdan alohida sotiladigan qo'shimchalar.
//
// Bitta add-on = bitta feature (schema shunday). Shuning uchun AI paketi
// ikkiga bo'lingan: kirish huquqi va byudjet to'ldirish.
const ADDONS = [
  {
    key: 'ai_advisor',
    name: 'AI maslahatchi',
    description:
      "Tahlil, Action Center, kunlik/haftalik/oylik hisobotlar, daromad prognozi va AI matn izohlari. Pro va Cheksiz tariflarda allaqachon mavjud.",
    price: 130000,
    currency: 'UZS',
    featureKey: 'ai_advisor',
    value: 1,
  },
  {
    key: 'ai_calls_5k',
    name: "AI izohlar +5000",
    description:
      "Oylik AI izoh chegarasi tugaganda qo'shimcha 5000 ta chaqiruv. Chegara har oy boshida tiklanadi.",
    price: 40000,
    currency: 'UZS',
    featureKey: 'ai_calls_month',
    value: 5000,
  },
];

async function main() {
  // 1) Imkoniyatlar
  const featureByKey = {};
  for (const f of FEATURES) {
    const row = await prisma.feature.upsert({
      where: { key: f.key },
      update: {
        name: f.name,
        description: f.description,
        unit: f.unit,
        metricKey: f.metricKey,
      },
      create: f,
    });
    featureByKey[f.key] = row;
  }
  console.log(`✅ ${FEATURES.length} ta imkoniyat tayyor`);

  // 2) Tariflar
  for (const p of PLANS) {
    const { features, ...planData } = p;

    const plan = await prisma.plan.upsert({
      where: { key: p.key },
      update: {
        name: planData.name,
        description: planData.description,
        price: planData.price,
        interval: planData.interval,
        trialDays: planData.trialDays,
        sortOrder: planData.sortOrder,
      },
      create: planData,
    });

    // Limitlarni qayta yozamiz (seed manba haqiqat)
    for (const [featureKey, value] of Object.entries(features)) {
      const feature = featureByKey[featureKey];
      if (!feature) continue;
      await prisma.planFeature.upsert({
        where: {
          planId_featureId: { planId: plan.id, featureId: feature.id },
        },
        update: { value },
        create: { planId: plan.id, featureId: feature.id, value },
      });
    }
    console.log(`✅ Tarif: ${plan.name} (${plan.key})`);
  }

  // 3) Add-on'lar
  //
  // isActive va narx qayta yoziladi (seed — manba haqiqat), lekin
  // TenantAddon yozuvlariga TEGILMAYDI: mijoz sotib olgan add-on
  // seed qayta ishga tushgani uchun o'chib qolmasligi kerak.
  for (const a of ADDONS) {
    const { featureKey, ...addonData } = a;
    const feature = featureByKey[featureKey];
    if (!feature) {
      console.warn(`⚠️  Add-on "${a.key}" uchun "${featureKey}" topilmadi`);
      continue;
    }

    await prisma.addon.upsert({
      where: { key: a.key },
      update: {
        name: addonData.name,
        description: addonData.description,
        price: addonData.price,
        currency: addonData.currency,
        featureId: feature.id,
        value: addonData.value,
        isActive: true,
      },
      create: { ...addonData, featureId: feature.id },
    });
    console.log(`✅ Add-on: ${a.name} (${a.key})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
