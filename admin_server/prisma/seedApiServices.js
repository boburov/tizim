// API xizmatlar boshlang'ich ma'lumotlari: edu.pronauns + 3 tarif + o'z
// kompaniyamiz uchun obuna va birinchi kalit.
//
// Qayta ishga tushirsa xato bermaydi (upsert). Kalit esa FAQAT birinchi
// martada yaratiladi va konsolga bir marta chiqadi — bazada hash saqlanadi,
// keyin uni tiklab bo'lmaydi. Kalitni yo'qotsangiz paneldan yangisini oling.
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const SERVICE = {
  key: 'edu-pronauns',
  name: 'Talaffuz baholash (edu.pronauns)',
  description:
    "Aytilgan so'zni to'g'ri talaffuz bilan solishtirib 0-100 ball beradi. " +
    '8 til: en-us, ru, tr, es, fr-fr, de, ar, ko.',
  baseUrl: 'https://speech.sevenedu.org',
  docsUrl: 'https://github.com/boburov/edu.pronauns.api.service#api',
};

// NEGA aynan shu raqamlar: xizmat CPU'da ishlaydi, bitta so'rov ~100 ms,
// 10 yadroli qutida shift ~22 req/s. Bitta so'rovni tezlashtirib bo'lmaydi —
// shuning uchun tarif PARALLEL SLOT va NAVBAT USTUVORLIGINI sotadi. Yuklama
// ostida $120 tarif $40 tarifdan 4 barobar ko'p so'rov o'tkazadi.
const TIERS = [
  {
    key: 'basic',
    name: 'Basic',
    price: 40,
    concurrency: 1,
    rateLimitRpm: 60,
    priority: 3,
    monthlyQuota: -1,
    sortOrder: 1,
  },
  {
    key: 'pro',
    name: 'Pro (2x)',
    price: 80,
    concurrency: 2,
    rateLimitRpm: 120,
    priority: 2,
    monthlyQuota: -1,
    sortOrder: 2,
  },
  {
    key: 'max',
    name: 'Max (4x)',
    price: 120,
    concurrency: 4,
    rateLimitRpm: 240,
    priority: 1,
    monthlyQuota: -1,
    sortOrder: 3,
  },
];

/** O'z kompaniyamiz — basic tarifda. */
const OWN_CONSUMER_LABEL = "SevenEdu (o'zimiz)";
const OWN_TIER_KEY = 'basic';

function generateApiKey() {
  const prefix = `pk_${randomBytes(4).toString('hex')}`;
  const secret = randomBytes(32).toString('base64url');
  const plaintext = `${prefix}.${secret}`;
  const hash = createHash('sha256').update(plaintext).digest('hex');
  return { plaintext, prefix, hash };
}

function addMonths(from, months) {
  const d = new Date(from);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

async function main() {
  const service = await prisma.apiService.upsert({
    where: { key: SERVICE.key },
    update: {
      name: SERVICE.name,
      description: SERVICE.description,
      baseUrl: SERVICE.baseUrl,
      docsUrl: SERVICE.docsUrl,
    },
    create: SERVICE,
  });
  console.log(`✓ Xizmat: ${service.name}`);

  const tierByKey = {};
  for (const t of TIERS) {
    const tier = await prisma.apiTier.upsert({
      where: { serviceId_key: { serviceId: service.id, key: t.key } },
      update: t,
      create: { ...t, serviceId: service.id },
    });
    tierByKey[t.key] = tier;
    console.log(
      `  · ${tier.name.padEnd(10)} $${t.price}  ` +
        `${t.concurrency} slot · ${t.rateLimitRpm} req/min · ustuvorlik ${t.priority}`,
    );
  }

  // O'z kompaniyamiz uchun mijoz yozuvi (label bo'yicha qidiramiz — unique
  // emas, shuning uchun findFirst).
  let consumer = await prisma.apiConsumer.findFirst({
    where: { label: OWN_CONSUMER_LABEL },
  });
  if (!consumer) {
    consumer = await prisma.apiConsumer.create({
      data: {
        label: OWN_CONSUMER_LABEL,
        note: "Ichki foydalanish — sevenedu ilovalari",
      },
    });
    console.log(`✓ Mijoz: ${consumer.label}`);
  }

  const existing = await prisma.apiSubscription.findUnique({
    where: {
      consumerId_serviceId: { consumerId: consumer.id, serviceId: service.id },
    },
    include: { keys: true, tier: true },
  });

  if (existing) {
    console.log(
      `✓ Obuna allaqachon bor: ${existing.tier.name}, ` +
        `${existing.keys.length} ta kalit — tegilmadi`,
    );
    return;
  }

  const key = generateApiKey();
  const sub = await prisma.apiSubscription.create({
    data: {
      consumerId: consumer.id,
      serviceId: service.id,
      tierId: tierByKey[OWN_TIER_KEY].id,
      status: 'ACTIVE',
      expiresAt: addMonths(new Date(), 12),
      keys: {
        create: {
          prefix: key.prefix,
          hash: key.hash,
          label: 'Seed kaliti',
          createdBy: 'seed',
        },
      },
    },
  });

  console.log(`✓ Obuna: ${OWN_TIER_KEY}, muddat ${sub.expiresAt.toISOString().slice(0, 10)}`);
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────────');
  console.log('  │ API KALIT — bu yagona marta ko\'rsatiladi, saqlab qo\'ying:');
  console.log(`  │ ${key.plaintext}`);
  console.log('  └─────────────────────────────────────────────────────────');
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
