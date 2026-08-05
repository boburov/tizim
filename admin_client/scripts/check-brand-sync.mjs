/**
 * Brend token dvigateli nusxalari bir xilligini tekshiradi.
 *
 *   npm run check:brand-sync
 *
 * NEGA KERAK: admin paneldagi brend preview'i tenant saytiga AYNAN
 * o'xshashi kerak. Buning yagona ishonchli yo'li — ikkalasi ham bitta
 * token dvigatelidan foydalanishi. Ikki loyiha alohida build bo'lgani
 * uchun kod nusxalangan, nusxa esa vaqt o'tishi bilan asl fayldan
 * uzoqlashadi. Bu tekshiruv shu siljishni birinchi kunidayoq ushlaydi.
 *
 * Farq topilsa nima qilish kerak:
 *   cp ../client/src/shared/utils/color.js          src/lib/brand/color.js
 *   cp ../client/src/shared/lib/theme/brandTokens.js src/lib/brand/brandTokens.js
 * so'ng ikkala faylga MIRROR sarlavhasini qaytaring va brandTokens.js
 * ichidagi import yo'lini `./color.js` ga o'zgartiring.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ROOT, '..');

const PAIRS = [
  {
    name: 'color.js',
    source: path.join(REPO, 'client/src/shared/utils/color.js'),
    mirror: path.join(ROOT, 'src/lib/brand/color.js'),
  },
  {
    name: 'brandTokens.js',
    source: path.join(REPO, 'client/src/shared/lib/theme/brandTokens.js'),
    mirror: path.join(ROOT, 'src/lib/brand/brandTokens.js'),
  },
];

/**
 * Taqqoslashdan oldin ataylab e'tiborsiz qoldiriladigan farqlar:
 *   - MIRROR sarlavhasi (faqat nusxada bo'ladi);
 *   - color.js ga import yo'li (ikki loyihada papka tuzilishi boshqacha);
 *   - satr oxiridagi bo'shliqlar.
 */
const normalize = (text) =>
  text
    .split('\n')
    .filter((line) => !line.startsWith('// MIRROR:'))
    .map((line) =>
      line.replace(
        /from\s+"(\.\.\/\.\.\/utils\/color\.js|\.\/color\.js)"/,
        'from "<color>"',
      ),
    )
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

let failed = false;

for (const pair of PAIRS) {
  if (!fs.existsSync(pair.source)) {
    console.error(`⚠️  Asl fayl topilmadi: ${path.relative(REPO, pair.source)}`);
    console.error('    (tenant client shu repoda emasmi? tekshiruv o\'tkazib yuborildi)');
    continue;
  }
  if (!fs.existsSync(pair.mirror)) {
    console.error(`❌ Nusxa yo'q: ${path.relative(REPO, pair.mirror)}`);
    failed = true;
    continue;
  }

  const source = normalize(fs.readFileSync(pair.source, 'utf8'));
  const mirror = normalize(fs.readFileSync(pair.mirror, 'utf8'));

  if (source === mirror) {
    console.log(`✅ ${pair.name} — mos`);
    continue;
  }

  failed = true;
  console.error(`❌ ${pair.name} — nusxa asl fayldan farq qiladi`);

  // Qaysi satrda ajralganini ko'rsatamiz — butun faylni solishtirish shart emas
  const a = source.split('\n');
  const b = mirror.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      console.error(`   Birinchi farq — ${i + 1}-satr:`);
      console.error(`     asl:   ${a[i] ?? '(satr yo\'q)'}`);
      console.error(`     nusxa: ${b[i] ?? '(satr yo\'q)'}`);
      break;
    }
  }
}

if (failed) {
  console.error('\nBrend preview haqiqiy saytdan farq qilishi mumkin.');
  process.exit(1);
}

console.log('\nBrend token dvigateli ikkala loyihada bir xil.');
