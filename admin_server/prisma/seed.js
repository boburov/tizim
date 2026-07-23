// Boshlang'ich tizim shablonini yaratadi: "O'quv markaz tizimi".
// Keyinchalik boshqa tizimlar admin panel orqali qo'shiladi.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const template = await prisma.systemTemplate.upsert({
    where: { key: 'study-center' },
    update: {},
    create: {
      key: 'study-center',
      name: "O'quv markaz tizimi",
      description:
        "O'quv markazlar uchun CRM: o'quvchilar, guruhlar, davomat, moliya, Telegram bot.",
      templateDir: process.env.STUDY_CENTER_TEMPLATE_DIR || '/root/templates/study-center',
      isActive: true,
    },
  });
  console.log('✅ Tizim shabloni tayyor:', template.key, '-', template.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
