/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ESM ↔ CJS NOMLI IMPORT — ISH VAQTIDA MAVJUDMI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── NEGA KERAK: `tsc` BU XATONI KO'RMAYDI ──
 *
 * Bu loyiha ESM (`"type": "module"`), lekin bog'liqliklarning ko'pi
 * CommonJS. Node bunday paketdan nomli eksportlarni STATIK tahlil bilan
 * topadi (`cjs-module-lexer`) va u HAMMASINI ko'ra olmaydi.
 *
 * TypeScript esa `@types/...` faylига qaraydi — u yerda eksport BOR,
 * shuning uchun `tsc --noEmit` XATOSIZ o'tadi va `nest build` ham
 * muvaffaqiyatli tugaydi. Xato faqat ISHGA TUSHIRISHDA chiqadi:
 *
 *   SyntaxError: The requested module 'ssh2' does not provide
 *                an export named 'utils'
 *
 * Aynan shu `src/vps/ssh.service.ts` da sodir bo'lgan: `Client` topilgan,
 * `utils` topilmagan. Yechim — modulni butunligicha olib, o'zi ajratish:
 *
 *   import ssh2 from 'ssh2';
 *   const { Client, utils } = ssh2;
 *
 * ── NEGA `dist/`, `src/` EMAS ──
 *
 * Manbada tip va qiymat importlari bitta qatorda aralash turishi mumkin
 * (`import { Injectable, type OnModuleInit } from '@nestjs/common'`).
 * Tiplar kompilyatsiyada O'CHIRILADI va ish vaqtiga yetib bormaydi —
 * ya'ni manbani tekshirish YOLG'ON OGOHLANTIRISH beradi. `dist/` esa
 * Node haqiqatan yuklaydigan narsa.
 *
 * ⚠ Shuning uchun bu testdan OLDIN `npm run build` yurgizilishi shart.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

assert.ok(existsSync(DIST), "dist/ yo'q — avval `npm run build` yurgizing");

const walk = (dir, acc = []) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (full.endsWith('.js')) acc.push(full);
  }
  return acc;
};

// `import { a, b } from 'paket'` — faqat TASHQI paketlar (nuqta bilan
// boshlanmaydigan va `node:` bo'lmagan).
const NAMED_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]([^.'"][^'"]*)['"]/g;

const wanted = new Map(); // paket -> Set(nom)
const where = new Map(); // `paket:nom` -> fayl

for (const file of walk(DIST)) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(NAMED_IMPORT)) {
    const pkg = m[2];
    if (pkg.startsWith('node:')) continue;
    const names = m[1]
      .split(',')
      .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    if (!names.length) continue;
    if (!wanted.has(pkg)) wanted.set(pkg, new Set());
    for (const n of names) {
      wanted.get(pkg).add(n);
      if (!where.has(`${pkg}:${n}`)) where.set(`${pkg}:${n}`, path.relative(ROOT, file));
    }
  }
}

let passed = 0;
const problems = [];

for (const [pkg, names] of [...wanted].sort()) {
  let ns;
  try {
    ns = await import(pkg);
  } catch (err) {
    problems.push(`  ${pkg} — umuman yuklanmadi: ${err.message}`);
    continue;
  }
  const available = new Set(Object.keys(ns));
  for (const name of [...names].sort()) {
    if (available.has(name)) {
      passed += 1;
      continue;
    }
    problems.push(
      `  ${where.get(`${pkg}:${name}`)}\n` +
        `    '${pkg}' → '${name}' ISH VAQTIDA YO'Q\n` +
        `    Tuzatish: import ${pkg.replace(/[^a-z]/gi, '')} from '${pkg}'; const { ${name} } = ...`,
    );
  }
}

console.log(`\n\x1b[1mESM ↔ CJS NOMLI IMPORT\x1b[0m`);
console.log(`  ${wanted.size} ta paket, ${passed} ta nom tekshirildi`);

if (problems.length) {
  console.error(`\n\x1b[31m${problems.length} ta muammo:\x1b[0m\n${problems.join('\n\n')}\n`);
  process.exit(1);
}
console.log(`\n\x1b[32mHammasi ish vaqtida mavjud\x1b[0m\n`);
