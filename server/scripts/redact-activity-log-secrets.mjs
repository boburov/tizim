#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ESKI AUDIT YOZUVLARIDAGI SIRLARNI TOZALASH (bir martalik).
 *
 * ── MUAMMO ──
 * Express davridagi tozalagich (`server_legacy/src/helpers/auditLog.helper.js`)
 * kalitlarni ANIQ MOSLIK bilan tekshirardi: `password` ro'yxatda bor edi,
 * lekin `currentPassword` va `newPassword` YO'Q edi — ular kichik harfga
 * o'tkazilganda ham to'plamga tushmasdi. Aynan o'sha ikkitasi
 * `POST /auth/change-password` tanasining maydon nomlari, ya'ni parol
 * o'zgartirgan HAR BIR so'rov ochiq matnda `activity_logs.body` ga yozilgan.
 *
 * Kod tomoni tuzatildi (`common/audit/audit-log.helper.ts` — endi QISM SATR
 * bo'yicha moslik), lekin u ESKI QATORLARNI o'zgartirmaydi. Bu skript
 * o'shalarni tozalaydi.
 *
 * ── NEGA AYNAN `sanitize()` QAYTA ISHLATILADI ──
 * Tozalash qoidasi ish vaqtidagi qoida bilan AYNAN bir xil bo'lishi kerak.
 * Ikkinchi nusxa yozilsa ular vaqt o'tib ajralib ketardi va skript
 * "tozaladim" deb hisobot berib, aslida yangi kalitni qoldirib ketardi.
 *
 * ── ISHLATISH ──
 *   node scripts/redact-activity-log-secrets.mjs            # DRY-RUN (standart)
 *   node scripts/redact-activity-log-secrets.mjs --apply    # haqiqatda yozadi
 *
 * ⚠ `--apply` siz HECH NARSA o'zgarmaydi. Avval dry-run natijasini o'qing.
 * ⚠ Ishlatishdan oldin bazadan zaxira oling — yozuv QAYTARIB BO'LMAYDI
 *   (ochiq matn o'chiriladi, bu esa maqsadning O'ZI).
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import { sanitize } from '../dist/common/audit/audit-log.helper.js';

const APPLY = process.argv.includes('--apply');
const BATCH = 500;

const prisma = new PrismaClient();

const changed = (before, after) => JSON.stringify(before) !== JSON.stringify(after);

let scanned = 0;
let dirty = 0;
let updated = 0;
const byKey = new Map();

/** Qaysi kalitlar haqiqatda o'zgarganini sanaydi (hisobot uchun). */
const diffKeys = (before, after, prefix = '') => {
  if (before === after) return;
  if (Array.isArray(before) && Array.isArray(after)) {
    before.forEach((b, i) => diffKeys(b, after[i], `${prefix}[${i}]`));
    return;
  }
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    for (const k of Object.keys(before)) {
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
        if (after[k] === '[REDACTED]') byKey.set(k, (byKey.get(k) || 0) + 1);
        else diffKeys(before[k], after[k], `${prefix}${k}.`);
      }
    }
  }
};

console.log(`\n\x1b[1mAUDIT YOZUVLARIDAGI SIRLARNI TOZALASH\x1b[0m`);
console.log(APPLY ? '\x1b[31mREJIM: --apply (BAZAGA YOZILADI)\x1b[0m\n' : '\x1b[32mREJIM: dry-run (hech narsa yozilmaydi)\x1b[0m\n');

let cursor = null;
for (;;) {
  const rows = await prisma.activityLog.findMany({
    where: { body: { not: null } },
    select: { id: true, body: true },
    orderBy: { id: 'asc' },
    take: BATCH,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  if (!rows.length) break;
  cursor = rows[rows.length - 1].id;

  for (const row of rows) {
    scanned += 1;
    if (row.body === null || typeof row.body !== 'object') continue;
    const cleaned = sanitize(row.body);
    if (!changed(row.body, cleaned)) continue;

    dirty += 1;
    diffKeys(row.body, cleaned);

    if (APPLY) {
      await prisma.activityLog.update({
        where: { id: row.id },
        data: { body: cleaned },
      });
      updated += 1;
    }
  }
  process.stdout.write(`\r  ko'rildi: ${scanned}  tozalanishi kerak: ${dirty}   `);
}

console.log('\n');
console.log(`  Jami ko'rilgan qator : ${scanned}`);
console.log(`  Sir topilgan qator   : ${dirty}`);
console.log(`  Yozilgan qator       : ${APPLY ? updated : 0}`);
if (byKey.size) {
  console.log('\n  Kalit bo\'yicha:');
  for (const [k, n] of [...byKey.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(24)} ${n}`);
  }
}
if (!APPLY && dirty) {
  console.log('\n\x1b[33m  Yozish uchun: node scripts/redact-activity-log-secrets.mjs --apply\x1b[0m');
}
console.log('');

await prisma.$disconnect();
