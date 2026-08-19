/**
 * VAKOLAT KATALOGI TO'LIQMI?
 *
 * Serverdagi HAR BIR ruxsat kaliti `shared/workspaces/capabilities.js`
 * da bo'lishi SHART.
 *
 * NEGA BU MUHIM: delegatsiya ekrani katalogdan quriladi. Kalit
 * katalogda bo'lmasa, ekranda ham ko'rinmaydi — ya'ni ega o'sha
 * huquqni BERAYOTGANINI yoki BERMAYOTGANINI umuman bilmaydi. Bu
 * "yashirin sozlama" ning eng yomon turi: xavfsizlikka taalluqli
 * va jimgina.
 *
 * Teskarisi ham xato: katalogda mavjud bo'lmagan kalit turgan bo'lsa,
 * ekran hech qachon yoqilmaydigan tugmani ko'rsatadi.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverPerms = resolve(here, "../../server/src/constants/permissions.js");
const catalogPath = resolve(here, "../src/shared/workspaces/capabilities.js");

const readKeys = (file, re) => {
  const src = readFileSync(file, "utf8");
  const out = new Set();
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
};

// Serverdagi PERMISSIONS obyekti: `KEY: "module.action",`
const serverKeys = readKeys(serverPerms, /^\s{2}[A-Z0-9_]+:\s*"([a-z0-9_]+\.[a-z0-9_]+)"/gm);
// Katalogdagi yozuvlar: `{ key: "module.action", ...`
const catalogKeys = readKeys(catalogPath, /\{\s*key:\s*"([a-z0-9_]+\.[a-z0-9_]+)"/g);

const missing = [...serverKeys].filter((k) => !catalogKeys.has(k)).sort();
const extra = [...catalogKeys].filter((k) => !serverKeys.has(k)).sort();

console.log(`Server: ${serverKeys.size} kalit · Katalog: ${catalogKeys.size} yozuv`);

if (missing.length) {
  console.error(`\n❌ KATALOGDA YO'Q (${missing.length}) — delegatsiya ekranida ko'rinmaydi:`);
  for (const k of missing) console.error(`   ${k}`);
}
if (extra.length) {
  console.error(`\n❌ SERVERDA YO'Q (${extra.length}) — hech qachon ishlamaydigan yozuv:`);
  for (const k of extra) console.error(`   ${k}`);
}

if (missing.length || extra.length) process.exit(1);
console.log("✅ Har bir ruxsat kaliti katalogda, ortiqchasi yo'q.");
