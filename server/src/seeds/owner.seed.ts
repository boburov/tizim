import { ROLES } from '../common/constants/permissions.js';
import { hashPassword } from '../common/utils/password.js';
import { runSeed } from './seed-runner.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BIRINCHI HISOB — `server_legacy/src/seeds/owner.seed.js` dan ko'chirilgan.
 *
 * ⚠ BUSIZ TOZA BAZAGA KIRIB BO'LMAYDI: ro'yxatdan o'tish yo'li yo'q,
 * foydalanuvchini faqat mavjud foydalanuvchi yarata oladi. Ya'ni bu seed
 * yurmasa yangi o'rnatma BOSHLANMAYDI.
 *
 * IDEMPOTENT: `username` bo'yicha tekshiradi va mavjud bo'lsa TEGMAYDI —
 * ataylab `upsert` emas, chunki upsert owner'ning ALMASHTIRILGAN parolini
 * default'ga qaytarib yuborardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const OWNER = {
  username: 'owner',
  firstName: 'Bosh',
  lastName: 'Ega',
};

/**
 * Production'da parol MAJBURIY ravishda env'dan olinadi — "owner123"
 * default'i bilan ishlab chiqarishga seed qilib bo'lmaydi (to'liq
 * super-admin huquqli hisob!).
 */
const resolvePassword = (): string => {
  const fromEnv = process.env.OWNER_PASSWORD;
  if (fromEnv && fromEnv.length >= 8) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      "Production'da OWNER_PASSWORD env (kamida 8 belgi) majburiy - default parol bilan seed qilinmaydi",
    );
  }
  return 'owner123'; // faqat development
};

void runSeed('owner', async ({ prisma, logger }) => {
  const exists = await prisma.user.findUnique({
    where: { username: OWNER.username },
  });

  if (exists) {
    logger.log("Owner mavjud, o'tkazib yuborildi");
    return;
  }

  const passwordHash = await hashPassword(resolvePassword());
  await prisma.user.create({
    data: {
      firstName: OWNER.firstName,
      lastName: OWNER.lastName,
      username: OWNER.username,
      passwordHash,
      role: ROLES.OWNER,
      isActive: true,
    },
  });
  logger.log(`Owner yaratildi (login: ${OWNER.username})`);
});
