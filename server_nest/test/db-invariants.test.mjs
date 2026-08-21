/**
 * BAZA INVARIANTLARI — CHIQARISH DARVOZASI TEKSHIRUVI (§11).
 *
 * Faqat O'QIYDI. Har bir band "0 bo'lishi SHART" degan invariant.
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
let fail = 0;
const chk = (n, v, extra = '') => {
  if (v === 0) console.log(`  ✅ ${n} — 0`);
  else { fail += 1; console.log(`  ❌ ${n} — ${v} ${extra}`); }
};

console.log('\n\x1b[1mBAZA INVARIANTLARI\x1b[0m\n');

// ── 1. FIKSTURA QOLDIG'I ────────────────────────────────────────────────
console.log('\x1b[2m  ── 1) FIKSTURA QOLDIG\'I ──\x1b[0m');
chk('__parity_* filiallar', await p.branch.count({ where: { name: { startsWith: '__parity' } } }));
chk('__parity_* rollar', await p.role.count({ where: { value: { startsWith: '__parity' } } }));
chk('__parity_* foydalanuvchilar',
  await p.user.count({ where: { OR: [
    { lastName: { startsWith: '__parity' } },
    { username: { contains: '__parity' } },
    { role: { startsWith: '__parity' } },
  ] } }));
chk('2099-yilgi maosh qatorlari (sinov)', await p.teacherSalary.count({ where: { year: 2099 } }));
chk('2099-yilgi o\'quvchi to\'lovlari', await p.studentPayment.count({ where: { year: 2099 } }));
chk('2034-yilgi chiqimlar (sinov)', await p.expense.count({ where: { accrualYear: 2034 } }));

// ── 2. JURNAL INVARIANTLARI ─────────────────────────────────────────────
console.log('\x1b[2m  ── 2) JURNAL ──\x1b[0m');
const unbalancedHead = await p.$queryRawUnsafe(
  'SELECT count(*)::int AS n FROM journal_entries WHERE "totalDebit" <> "totalCredit"');
chk('sarlavhada debet ≠ kredit', Number(unbalancedHead[0].n));

const unbalancedLines = await p.$queryRawUnsafe(`
  SELECT count(*)::int AS n FROM (
    SELECT e.id FROM journal_entries e
    JOIN journal_lines l ON l."entryId" = e.id
    GROUP BY e.id
    HAVING SUM(l.debit) <> SUM(l.credit)
  ) t`);
chk('qatorlar yig\'indisida debet ≠ kredit', Number(unbalancedLines[0].n));

const bothSides = await p.$queryRawUnsafe(
  'SELECT count(*)::int AS n FROM journal_lines WHERE debit > 0 AND credit > 0');
chk('bir qatorda ham debet ham kredit', Number(bothSides[0].n));

const negative = await p.$queryRawUnsafe(
  'SELECT count(*)::int AS n FROM journal_lines WHERE debit < 0 OR credit < 0');
chk('manfiy summa (jurnal qatori)', Number(negative[0].n));

const orphanLines = await p.$queryRawUnsafe(`
  SELECT count(*)::int AS n FROM journal_lines l
  LEFT JOIN journal_entries e ON e.id = l."entryId" WHERE e.id IS NULL`);
chk('yetim jurnal qatorlari', Number(orphanLines[0].n));

const dupKeys = await p.$queryRawUnsafe(`
  SELECT count(*)::int AS n FROM (
    SELECT "postingKey" FROM journal_entries
    WHERE "postingKey" IS NOT NULL GROUP BY "postingKey" HAVING count(*) > 1
  ) t`);
chk('takrorlangan postingKey', Number(dupKeys[0].n));

// ── 3. PUL INVARIANTLARI ────────────────────────────────────────────────
console.log('\x1b[2m  ── 3) PUL ──\x1b[0m');
chk('manfiy paidAmount (o\'qituvchi maoshi)',
  await p.teacherSalary.count({ where: { paidAmount: { lt: 0 } } }));
chk('manfiy paidAmount (xodim maoshi)',
  await p.staffPayroll.count({ where: { paidAmount: { lt: 0 } } }));
chk('manfiy paidAmount (o\'quvchi to\'lovi)',
  await p.studentPayment.count({ where: { paidAmount: { lt: 0 } } }));
chk('manfiy depozit balansi',
  await p.studentDeposit.count({ where: { balance: { lt: 0 } } }));

const overpaidTeacher = await p.$queryRawUnsafe(
  'SELECT count(*)::int AS n FROM teacher_salaries WHERE "paidAmount" > "expectedAmount" + "overpaidAmount"');
chk('o\'qituvchi maoshida ortiqcha to\'lov', Number(overpaidTeacher[0].n));

const overpaidStaff = await p.$queryRawUnsafe(
  'SELECT count(*)::int AS n FROM staff_payrolls WHERE "paidAmount" > "finalAmount"');
chk('xodim maoshida ortiqcha to\'lov', Number(overpaidStaff[0].n));

// ── 4. FILIAL KO'LAMI ───────────────────────────────────────────────────
console.log('\x1b[2m  ── 4) FILIAL KO\'LAMI ──\x1b[0m');
const nullBranch = await p.$queryRawUnsafe(
  'SELECT count(*)::int AS n FROM journal_entries WHERE "branchId" IS NULL');
chk('filialsiz jurnal yozuvi', Number(nullBranch[0].n));
const orphanBranch = await p.$queryRawUnsafe(`
  SELECT count(*)::int AS n FROM journal_entries e
  LEFT JOIN branches b ON b.id = e."branchId" WHERE b.id IS NULL`);
chk('mavjud bo\'lmagan filialga ishora', Number(orphanBranch[0].n));

// ── 5. SAQLAGICH ────────────────────────────────────────────────────────
console.log('\x1b[2m  ── 5) SAQLAGICH ──\x1b[0m');
const usage = await p.storageUsage.findFirst({ select: { usedBytes: true } });
const realSum = await p.storedFile.aggregate({
  _sum: { size: true }, where: { isDeleted: false } });
const used = Number(usage?.usedBytes || 0);
const real = Number(realSum._sum.size || 0);
if (used === real) console.log(`  ✅ StorageUsage = tirik fayllar yig'indisi — ${used}`);
else { fail += 1; console.log(`  ❌ StorageUsage DRIFTI — hisoblagich ${used}, haqiqiy ${real}, farq ${used - real}`); }

// ── 6. A'ZOLIK ──────────────────────────────────────────────────────────
console.log('\x1b[2m  ── 6) A\'ZOLIK ──\x1b[0m');
const dupMembership = await p.$queryRawUnsafe(`
  SELECT count(*)::int AS n FROM (
    SELECT "groupId", "studentId" FROM group_memberships
    WHERE "leftAt" IS NULL AND "isDeleted" = false
    GROUP BY "groupId", "studentId" HAVING count(*) > 1
  ) t`);
chk('takrorlangan FAOL a\'zolik', Number(dupMembership[0].n));

await p.$disconnect();
console.log(`\n  ${fail ? `\x1b[31m${fail} ta invariant BUZILGAN\x1b[0m` : '\x1b[32mBARCHA INVARIANTLAR SAQLANGAN\x1b[0m'}\n`);
process.exit(fail ? 1 : 0);
