/**
 * ROLNI MUZLATISHDAN CHIQARISHNI TASDIQLAYDI (va kerak bo'lsa MAJBURLAYDI).
 *
 * ── NEGA ALOHIDA FAYL ──
 *
 * `frozen-role-check.sh` rolni API orqali muzlatishdan chiqarardi va
 * natijani FAQAT ekranga yozardi:
 *
 *     setfrozen '{"isFrozen":false}' | sed 's/^/  unfreeze HTTP /'
 *
 * Ya'ni 403/500 kelsa ham skript SHU HOLICHA davom etardi va 0 kod
 * bilan tugardi. Rol esa MUZLATILGAN qolardi — u holda `qa_staff_a`
 * bilan LOGIN 403 beradi va o'sha rolga tayanadigan HAR BIR paritet
 * to'plami o'lchovsiz bo'lib qoladi. Sabab esa butunlay boshqa joyda
 * qidirilardi.
 *
 * ⚠ TIKLASH API'GA TAYANMASLIGI SHART: skript aynan LOGIN/ROL yo'lini
 * sinaydi — o'sha yo'l buzilgan bo'lsa API orqali tiklash ham yiqiladi.
 * Shuning uchun bu yerda yakuniy holat BAZADAN o'qiladi va zarur bo'lsa
 * BAZADA majburan tuzatiladi.
 *
 * Chiqish kodi: 0 — rol muzlatilmagan; 1 — muzlatilgan qoldi.
 */
import { PrismaClient } from '@prisma/client';

const role = process.argv[2];
if (!role) {
  console.log('  ❌ rol qiymati berilmadi');
  process.exit(1);
}

const prisma = new PrismaClient();
const read = () =>
  prisma.role.findUnique({
    where: { value: role },
    select: { value: true, isFrozen: true, frozenReason: true },
  });

const before = await read();
if (!before) {
  console.log(`  ❌ rol topilmadi: ${role}`);
  await prisma.$disconnect();
  process.exit(1);
}

if (!before.isFrozen) {
  console.log(`  ✅ ${role}: muzlatilmagan (bazadan tasdiqlandi)`);
  await prisma.$disconnect();
  process.exit(0);
}

// ── API tiklashi ISHLAMADI — bazada MAJBURAN tuzatamiz ──
// Fixture'ni muzlatilgan holda qoldirish qabul qilinmaydi: u butun
// to'plamni bloklaydi. Lekin bu JIMGINA bo'lmaydi — chiqish kodi 1.
console.log(
  `  ❌ ${role}: API orqali muzlatishdan CHIQARILMADI ` +
    `(sabab: "${before.frozenReason || ''}") — bazada majburan tuzatilmoqda`,
);
// ⚠ MAYDONLAR EXPRESS BILAN AYNAN BIR XIL TOZALANADI
// (`roles.service.js:210-212`): `frozenReason` sxemada NOT NULL va
// standarti `""` — `null` yozilsa Prisma xato beradi va "tuzatdim"
// degan da'vo yolg'on chiqardi.
await prisma.role.update({
  where: { value: role },
  data: { isFrozen: false, frozenAt: null, frozenById: null, frozenReason: '' },
});
const after = await read();
console.log(
  after.isFrozen
    ? `  ❌ ${role}: BAZADA HAM tuzatilmadi — qo'lda aralashuv kerak`
    : `  ⚠️  ${role}: bazada majburan chiqarildi (API yo'li NUQSONLI)`,
);
await prisma.$disconnect();
process.exit(1);
