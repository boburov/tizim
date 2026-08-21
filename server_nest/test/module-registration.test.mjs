/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ROY'XATDAN O'TKAZISH QO'RIQCHISI — "modul bor, lekin marshrut yo'q".
 *
 * ── QANDAY XATONI TUTADI ──
 *
 * NestJS FAQAT ildiz moduldan (`AppModule`) ERISHILADIGAN modullarning
 * kontrollerlarini ro'yxatga oladi. Modul fayli yozilgan, commit qilingan
 * va testlari yashil bo'lishi mumkin — lekin `app.module.ts` ga
 * qo'shilmagan bo'lsa uning HAR BIR marshruti 404 qaytaradi.
 *
 * BU HAQIQATAN SODIR BO'LDI. `courses` (9 marshrut) va `attendance`
 * (11 marshrut) commit xabarlarida "ko'chirildi" deb belgilangan, paritet
 * testlari yashil edi — chunki ular ISHLAB TURGAN jarayonga (ish
 * daraxtidan qurilgan) qarshi ishlardi. HEAD'dan toza qurilgan nusxada
 * esa ikkalasi ham 404 berardi. Ya'ni 20 ta marshrut "ko'chirilgan" deb
 * sanalib, aslida yo'q edi.
 *
 * `groups` TASODIFAN ishlab turgandi: uni `AuthModule` o'qituvchi profili
 * uchun import qiladi. Bunday BILVOSITA bog'liqlik qo'lda ushlab
 * bo'lmaydigan tuzoq — shuning uchun tekshiruv avtomatlashtirildi.
 *
 * ── NEGA STATIK ──
 * HTTP ham, baza ham kerak emas: tezlik chegarasi (429), qo'shni agent
 * yoki bo'sh ma'lumot bu tekshiruvni BUZA OLMAYDI.
 *
 * ISHLATISH: npm run test:module-registration
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

const files = walk(SRC);
const read = (p) => readFileSync(p, 'utf8');

/** `key: [ ... ]` — qavslarni SANAB ajratadi (ichma-ich qavslar bor). */
const arrayAfter = (text, key) => {
  const m = new RegExp(`${key}\\s*:\\s*\\[`).exec(text);
  if (!m) return '';
  let depth = 0;
  const start = m.index + m[0].length - 1;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '[') depth += 1;
    else if (text[i] === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(start + 1, i);
    }
  }
  return '';
};

// ── modul sinfi → fayl ──
const moduleFile = new Map();
for (const f of files.filter((x) => x.endsWith('.module.ts'))) {
  for (const cls of read(f).matchAll(/export class (\w+)/g)) moduleFile.set(cls[1], f);
}

// ── AppModule dan erishiladigan modullar ──
const reachable = new Set();
const stack = ['AppModule'];
while (stack.length) {
  const cur = stack.pop();
  if (reachable.has(cur)) continue;
  const f = moduleFile.get(cur);
  if (!f) continue;
  reachable.add(cur);
  for (const m of arrayAfter(read(f), 'imports').matchAll(/\b([A-Z]\w*Module)\b/g)) {
    stack.push(m[1]);
  }
}

// ── erishiladigan modullarning kontrollerlari ──
const registered = new Set();
for (const mod of reachable) {
  const f = moduleFile.get(mod);
  if (!f) continue;
  for (const c of arrayAfter(read(f), 'controllers').matchAll(/\b([A-Z]\w*Controller)\b/g)) {
    registered.add(c[1]);
  }
}

// ── diskdagi BARCHA kontrollerlar ──
const onDisk = new Map(); // sinf → { file, mount, routes }
for (const f of files.filter((x) => x.endsWith('.controller.ts'))) {
  const t = read(f);
  const parts = t.split(/@Controller\(\s*(\[[^\]]*\]|'[^']*')\s*\)/);
  for (let i = 1; i < parts.length; i += 2) {
    const mounts = [...parts[i].matchAll(/'([^']*)'/g)].map((m) => m[1]);
    const tail = parts[i + 1] || '';
    const cls = /export class (\w+)/.exec(tail)?.[1];
    const routes = [...tail.matchAll(/@(?:Get|Post|Put|Patch|Delete)\(/g)].length;
    if (cls) onDisk.set(cls, { file: path.relative(SRC, f), mount: mounts[0] || '?', routes });
  }
}

const orphans = [...onDisk.entries()].filter(([cls]) => !registered.has(cls));

console.log(`\n\x1b[1mROY'XATDAN O'TKAZISH QO'RIQCHISI\x1b[0m\n`);
console.log(`  erishiladigan modul : ${reachable.size}`);
console.log(`  diskdagi kontroller : ${onDisk.size}`);
console.log(`  ro'yxatdan o'tgan   : ${onDisk.size - orphans.length}`);

if (!orphans.length) {
  console.log(`\n  ✅ HAR BIR kontroller \`AppModule\` dan erishiladi\n`);
  process.exit(0);
}

const lost = orphans.reduce((n, [, v]) => n + v.routes, 0);
console.log(`\n  ❌ ${orphans.length} ta kontroller RO'YXATDAN O'TMAGAN — ${lost} ta marshrut 404 qaytaradi:\n`);
for (const [cls, v] of orphans) {
  console.log(`     ${cls}  →  /api/${v.mount}  (${v.routes} marshrut)`);
  console.log(`        ${v.file}`);
}
console.log(`\n  Tuzatish: modulni \`src/app.module.ts\` dagi \`imports\` ga qo'shing.\n`);
process.exit(1);
