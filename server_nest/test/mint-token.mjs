/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PARITET UCHUN ACCESS TOKEN QURADI (login qilmasdan).
 *
 * ── NEGA KERAK ──
 *
 * `test/parity.mjs` `--token` oladi, lekin uni olishning yagona yo'li
 * `/api/auth/login` edi — u esa `authLimiter` ostida: IP bo'yicha
 * 5 daqiqada 20 urinish (`server/src/middleware/rateLimiter.js`).
 *
 * Repoda bir vaqtda bir nechta agent/test to'plami ishlaganda bu byudjet
 * DOIMIY to'la bo'ladi va roster testi soatlab yurgizib bo'lmaydi —
 * "429" esa natija EMAS, o'lchov umuman bo'lmaydi.
 *
 * ── NIMANI AYLANIB O'TADI, NIMANI YO'Q ──
 *
 * FAQAT login tezlik chegarasini. Token oddiy `signAccess` bilan bir xil
 * shaklda (`{ sub, role }`) imzolanadi, ya'ni:
 *   • autentifikatsiya o'zgarmaydi — imzo baribir tekshiriladi;
 *   • ruxsatlar va filial ko'lami HAR SO'ROVDA serverda qayta
 *     hisoblanadi (`auth.middleware`), token ichidan OLINMAYDI;
 *   • hech qanday qo'riqchi chetlab o'tilmaydi.
 *
 * ⚠ `JWT_ACCESS_SECRET` KERAK. Sirni o'qiy oladigan odam allaqachon
 * shu tokenni qo'lda ham imzolay oladi — bu skript yangi imkoniyat
 * BERMAYDI, faqat qulaylik.
 *
 * ── ISHLATISH ──
 *   npm run mint-token
 *   node test/parity.mjs --token "$(npm run -s mint-token)"
 *
 * Standart nishon — owner. Boshqa rol kerak bo'lsa:
 *   node --env-file=../server/.env test/mint-token.mjs --username qa_admin_a
 * ═══════════════════════════════════════════════════════════════════════════
 */
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const argv = process.argv.slice(2);
const at = argv.indexOf('--username');
const username = at >= 0 ? argv[at + 1] : null;

const secret = process.env.JWT_ACCESS_SECRET;
if (!secret) {
  console.error(
    "JWT_ACCESS_SECRET yo'q. Ishga tushiring:\n" +
      '  node --env-file=../server/.env test/mint-token.mjs',
  );
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  // ⚠ `isActive` va `isDeleted` FILTRLANADI: arxivlangan hisobga token
  // berish real oqimda MUMKIN EMAS, shuning uchun bu yerda ham mumkin
  // bo'lmasin — aks holda testlar hech qachon uchramaydigan holatni
  // o'lchab, yolg'on ishonch berardi.
  const user = username
    ? await prisma.user.findFirst({
        where: { username, isDeleted: false, isActive: true },
        select: { id: true, role: true },
      })
    : await prisma.user.findFirst({
        where: { role: 'owner', isDeleted: false, isActive: true },
        select: { id: true, role: true },
      });

  if (!user) {
    console.error(`Foydalanuvchi topilmadi: ${username || 'owner'}`);
    process.exit(1);
  }

  console.log(
    jwt.sign({ sub: user.id, role: user.role }, secret, {
      expiresIn: process.env.JWT_ACCESS_TTL || '15m',
    }),
  );
} finally {
  await prisma.$disconnect();
}
