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
    },
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
