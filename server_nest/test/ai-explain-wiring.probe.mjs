/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B29 — `?explain=true` AI KO'PRIGI HAQIQATAN ULANGANMI.
 *
 * ── MUAMMO ──
 * Bu muhitda `GEMINI_API_KEY` BO'SH, ya'ni ikkala stek ham
 * `source: "deterministic"` qaytaradi va paritet testi "mos keldi"
 * deydi — LEKIN bu AI YO'LI ISHLADI degani EMAS. Aynan shu holat
 * `finance-analytics-parity` da "BLOKLANGAN" deb belgilangan edi.
 *
 * ── QANDAY O'LCHANADI ──
 * Ikkala stek ham SOXTA kalit bilan qayta ishga tushiriladi. Kalit
 * bor bo'lsa `isNarrationConfigured()` `true` bo'ladi va LLM shoxi
 * BAJARILADI; so'rov muvaffaqiyatsiz tugaydi (kalit yaroqsiz) va
 * `AiUsageLog` ga `ok = false` yozuvi tushadi.
 *
 * Ya'ni: YOZUV BOR = ko'prik ulangan. Yozuv YO'Q = shox umuman
 * bajarilmagan (port `null` bo'lgan holat).
 *
 * ⚠ TARMOQQA CHIQMAYDI degan da'vo yo'q: chaqiruv HAQIQATAN
 * yuboriladi va rad etiladi. Shuning uchun bu ALOHIDA PROBA —
 * muntazam paritet to'plamining bir qismi EMAS.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import { mintToken, request, EXPRESS, NEST } from './_harness.mjs';

const prisma = new PrismaClient();
const startedAt = new Date();
let fail = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => { fail += 1; console.log(`  ❌ ${m}`); };

const owner = await prisma.user.findFirst({
  where: { role: 'owner', isDeleted: false }, select: { id: true, role: true } });
const token = mintToken(owner);

const intel = await request(EXPRESS, 'GET', '/api/finance-analytics/intelligence', { token });
const alertId = intel.body?.data?.alerts?.[0]?.id;
if (!alertId) {
  console.log("  ⚠️  O'LCHANMADI: faol signal yo'q — chegaralar oshmagan");
  await prisma.$disconnect();
  process.exit(1);
}
console.log(`  faol signal: ${alertId}`);

// Kesh TOZALANADI — aks holda `ai_cached` qaytib, LLM shoxi
// bajarilmasdi va proba hech narsani o'lchamasdi.
await prisma.cache.deleteMany({ where: { key: { startsWith: 'fin-explain:' } } });

for (const [label, base] of [['express', EXPRESS], ['nest', NEST]]) {
  const before = await prisma.aiUsageLog.count();
  const res = await request(base, 'GET',
    `/api/finance-analytics/intelligence/alerts/${alertId}?explain=true`, { token });
  const after = await prisma.aiUsageLog.count();
  const src = res.body?.data?.explanation?.source;

  if (after > before) {
    const row = await prisma.aiUsageLog.findFirst({ orderBy: { createdAt: 'desc' } });
    ok(`${label}: LLM shoxi BAJARILDI — AiUsageLog yozuvi qo'shildi `
      + `(ok=${row?.ok}, kind=${row?.kind}, source="${src}")`);
  } else {
    bad(`${label}: LLM shoxi BAJARILMADI — AiUsageLog o'zgarmadi `
      + `(source="${src}"). Ko'prik ULANMAGAN.`);
  }
  await prisma.cache.deleteMany({ where: { key: { startsWith: 'fin-explain:' } } });
}

// ⚠ TOZALASH: proba HAQIQIY `AiUsageLog` yozuvlarini qoldiradi
// (muvaffaqiyatsiz chaqiruvlar). Ular oylik hisobga kirib, byudjet
// raqamini jimgina siljitardi.
const purged = await prisma.aiUsageLog.deleteMany({
  where: { ok: false, model: { contains: 'gemini' }, createdAt: { gte: startedAt } },
});
console.log(`  🧹 tozalandi: ${purged.count} ta AiUsageLog yozuvi`);
const left = await prisma.aiUsageLog.count({
  where: { ok: false, createdAt: { gte: startedAt } } });
if (left === 0) ok("tozalash — QOLDIQ YO'Q (o'lchandi)");
else bad(`tozalash — ${left} ta yozuv QOLDI`);

await prisma.$disconnect();
console.log(fail ? '\n  NATIJA: YIQILDI\n' : '\n  NATIJA: KO\'PRIK ULANGAN (ikkala stekda)\n');
process.exit(fail ? 1 : 0);
