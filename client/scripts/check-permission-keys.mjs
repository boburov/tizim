/**
 * RUXSAT KALITLARINI TEKSHIRISH.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA BU ALOHIDA TEKSHIRUV KERAK
 *
 * `PERMISSIONS.ROOMS_CREATE` degan MAVJUD BO'LMAGAN kalit yozilsa,
 * JavaScript hech narsa demaydi - u shunchaki `undefined` bo'ladi.
 * Keyin `usePermissions().has(undefined)` ishga tushadi va u:
 *
 *   • EGA uchun `true` qaytaradi (ega hamma narsani ko'radi)
 *   • boshqa HAMMA uchun `false`
 *
 * Ya'ni xato ishlab chiquvchida (odatda ega hisobida) UMUMAN
 * KO'RINMAYDI, lekin resepshin yoki direktor uchun tugma butunlay
 * yo'qoladi. Sabab esa hech qayerda yozilmaydi: na konsolda, na
 * tarmoqda - element shunchaki render qilinmaydi.
 *
 * Aynan shunday xato bir marta yuz berdi: xona yaratish yozuvi
 * `PERMISSIONS.ROOMS_CREATE` ga bog'langan edi, holbuki bu kodbazada
 * xona ruxsati `classes.create` deb ataladi (model va marshrut
 * keyinroq qo'shilgan, ruxsat guruhi esa avvaldan `classes.*` edi).
 * ═══════════════════════════════════════════════════════════════════
 *
 * TEKSHIRUV IKKI YO'NALISHLI EMAS: ishlatilmayotgan kalit XATO EMAS
 * (u serverda bor, kelajakda kerak bo'ladi), faqat MAVJUD BO'LMAGAN
 * kalitga murojaat xato.
 *
 * ISHLATISH:  npm run check:permission-keys
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname;
const CONST_FILE = join(ROOT, "shared/constants/permissions.js");

// ── 1) Mavjud kalitlar ──
const constSrc = readFileSync(CONST_FILE, "utf8");
const known = new Set(
  [...constSrc.matchAll(/^\s{2}([A-Z0-9_]+)\s*:/gm)].map((m) => m[1]),
);

if (known.size === 0) {
  console.error("❌ permissions.js dan birorta kalit o'qilmadi - regex eskirgan?");
  process.exit(1);
}

// ── 2) Butun `src/` bo'ylab murojaatlar ──
const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(entry)) out.push(p);
  }
  return out;
};

const problems = [];
for (const file of walk(ROOT)) {
  if (file === CONST_FILE) continue;
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/PERMISSIONS\.([A-Z0-9_]+)/g)) {
      if (!known.has(m[1])) {
        problems.push({
          file: relative(ROOT, file),
          line: i + 1,
          key: m[1],
          text: line.trim().slice(0, 80),
        });
      }
    }
  });
}

console.log(`\nRUXSAT KALITLARI — ${known.size} ta e'lon qilingan kalit\n`);

if (problems.length) {
  for (const p of problems) {
    console.log(`  ❌ ${p.file}:${p.line}  PERMISSIONS.${p.key}`);
    console.log(`     ${p.text}`);
  }
  console.log(
    `\n${problems.length} ta MAVJUD BO'LMAGAN kalit. Ular egadan boshqa ` +
      `hamma uchun elementni JIMGINA yashiradi.\n`,
  );
  process.exit(1);
}

console.log("✓ HAMMASI JOYIDA — mavjud bo'lmagan kalitga murojaat yo'q\n");
