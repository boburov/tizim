/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CUTOVER'DAN KEYINGI TUTUN SINOVI — NestJS YAGONA SERVER.
 *
 * ⚠ NEGA PARITET EMAS: Express o'chirilgandan keyin solishtiradigan
 * ikkinchi stek YO'Q. Bu sinov "ikkalasi bir xilmi" degan savolga emas,
 * "yagona server tirikmi va asosiy yo'llar javob beryaptimi" degan
 * savolga javob beradi.
 *
 * ⚠ BU TO'LIQ QAMROV EMAS. Haqiqiy qamrov — `test/*.parity.test.mjs`
 * to'plamlari, lekin ular IKKI stekni talab qiladi va cutover'dan keyin
 * faqat TARIXIY dalil bo'lib qoladi (oxirgi to'liq yurish: 66 to'plam,
 * 3585+ tekshiruv, 0 yiqildi).
 *
 * ISHLATISH:  node --env-file=.env test/smoke.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import { mintToken } from './_harness.mjs';
const prisma = new PrismaClient();
const o = await prisma.user.findFirst({ where: { role: 'owner', isDeleted: false }, select: { id: true, role: true } });
const tok = mintToken(o);
const paths = [
  '/api/health', '/api/auth/me', '/api/users?limit=1', '/api/groups?limit=1',
  '/api/finance/student-payments?limit=1', '/api/ai/briefing',
  '/api/finance-analytics/summary', '/api/branch-analytics/pnl',
  '/api/journal/balances', '/api/attendance/dashboard?fromDate=2026-08-01&toDate=2026-08-22',
  '/api/notifications/inbox', '/api/teacher-salary/salaries?limit=1',
  '/api/staff-payroll?limit=1', '/api/leads?limit=1', '/api/exports/datasets',
  '/api/imports/importers', '/api/expenses?limit=1', '/api/deposits/report',
];
let bad = 0;
for (const p of paths) {
  const r = await fetch(`http://localhost:5000${p}`, { headers: { authorization: `Bearer ${tok}` } });
  const mark = r.status < 400 ? '✅' : '❌';
  if (r.status >= 400) bad += 1;
  console.log(`  ${mark} ${String(r.status).padEnd(4)} ${p}`);
}
await prisma.$disconnect();
console.log(bad ? `\n  ${bad} ta marshrut xato\n` : '\n  HAMMASI JAVOB BERDI\n');
process.exit(bad ? 1 : 0);
