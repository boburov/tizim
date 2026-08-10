// Bot shablonlari — VPS'da tayyor turgan papkalarga ishora.
//
// MUHIM: bu skript faqat BAZADAGI yozuvni yaratadi. Shablonning O'ZI
// (kod papkasi) VPS'da `templateDir` yo'lida bo'lishi kerak, aks holda
// deploy "Shablon papkasi topilmadi" xatosi bilan tugaydi.
//
// Qayta ishga tushirsa xato bermaydi (upsert).
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEMPLATES = [
  {
    key: 'node-starter',
    name: 'Node.js — boshlang\'ich bot',
    description:
      "node-telegram-bot-api asosidagi polling bot. BOT_TOKEN .env dan olinadi. " +
      "Yangi bot yozishni shundan boshlash qulay.",
    runtime: 'NODEJS',
    templateDir: '/root/bot-templates/node-starter',
    entryFile: 'index.js',
  },
  {
    key: 'php-webhook',
    name: 'PHP — webhook bot',
    description:
      "index.php webhook'ni qabul qiladi. nginx + php-fpm ortida ishlaydi, " +
      "X-Telegram-Bot-Api-Secret-Token sarlavhasini tekshiradi.",
    runtime: 'PHP',
    templateDir: '/root/bot-templates/php-webhook',
    entryFile: null,
  },
];

async function main() {
  for (const t of TEMPLATES) {
    const saved = await prisma.botTemplate.upsert({
      where: { key: t.key },
      update: {
        name: t.name,
        description: t.description,
        runtime: t.runtime,
        templateDir: t.templateDir,
        entryFile: t.entryFile,
      },
      create: t,
    });
    console.log(`✓ ${saved.runtime.padEnd(6)} ${saved.name}`);
    console.log(`    ${saved.templateDir}`);
  }

  console.log('');
  console.log('Eslatma: papkalarning o\'zi VPS\'da bo\'lishi kerak —');
  console.log('  mkdir -p /root/bot-templates/node-starter');
  console.log('  mkdir -p /root/bot-templates/php-webhook');
  console.log('Aks holda deploy "Shablon papkasi topilmadi" bilan tugaydi.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
