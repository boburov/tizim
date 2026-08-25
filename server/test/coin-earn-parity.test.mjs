/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TANGA TOPISH — DAVOMAT VA BAHO ILGAKLARI (jonli serverga qarshi).
 *
 * ── NEGA ALOHIDA TO'PLAM ──
 * `coin-market-parity` SARFLASHNI o'lchaydi (xarid, qaytarish,
 * o'chirgich). Bu esa TOPISHNI: tanga davomat va baho yozilganda
 * avtomatik hisoblanadimi.
 *
 * ── NIMANI O'LCHAYDI ──
 *   1. `present` davomat → tanga beriladi (stavka bo'yicha).
 *   2. ⚠ QAYTA BELGILASH IKKINCHI MARTA TO'LAMAYDI. Bu to'plamdagi
 *      ENG MUHIM tekshiruv: davomat tuzatilishi ODATIY hodisa
 *      (o'qituvchi xatosini to'g'irlaydi, admin kechikkan yozuvni
 *      kiritadi). Idempotentlik buzilsa bitta dars CHEKSIZ marta
 *      to'lardi va buni faqat balans g'alati o'sganda sezilardi.
 *   3. `absent` tanga BERMAYDI.
 *   4. Baho `gradeMinValue` dan past bo'lsa tanga bermaydi;
 *      yuqori bo'lsa `value × gradeCoinsPerPoint` beradi.
 *   5. ⚠ O'CHIRGICH TOPISHNI HAM TO'XTATADI. Ilgaklar HTTP
 *      qo'riqchisidan O'TMAYDI (ular davomat servisidan chaqiriladi),
 *      ya'ni ular sozlamani O'ZI tekshirishi kerak. Agar tekshirmasa,
 *      "o'chirilgan" bo'lim jimgina tanga chiqarishda davom etardi.
 *
 * ⚠ TALAB: server 5000-portda ishlab turishi kerak.
 * ⚠ TOZALASH API'GA TAYANMAYDI va oxirida O'LCHANADI.
 *
 * ISHLATISH:  node --env-file=.env test/coin-earn-parity.test.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const API = 'http://localhost:5000/api';
const PREFIX = '__parity_coin_earn_';
const prisma = new PrismaClient();

const R = { pass: 0, fail: 0 };
const ok = (n, x = '') => { R.pass++; console.log(`  ✅ ${n}${x ? ` — ${x}` : ''}`); };
const bad = (n, m) => { R.fail++; console.log(`  ❌ ${n}\n      ${m}`); };
const check = (n, cond, m = '') => (cond ? ok(n, m) : bad(n, m || 'shart bajarilmadi'));

const mint = (u) =>
  jwt.sign({ sub: String(u.id), role: u.role }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: '30m',
  });

const req = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

/** Eng yaqin O'TGAN dushanba (kelajak sana davomatda taqiqlangan). */
const mondayBefore = (d) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
};
const dateKey = (d) => d.toISOString().slice(0, 10);

/**
 * Tanga ILGAKLARI BLOKLAMAYDI (`void ... .catch()`), ya'ni HTTP javobi
 * qaytganda yozuv hali bo'lmasligi mumkin. Shuning uchun POLLING —
 * darhol o'qish testni jimgina qizil qilardi.
 */
const waitBalance = async (userId, want, tries = 20) => {
  let last = null;
  for (let i = 0; i < tries; i++) {
    const acc = await prisma.coinAccount.findUnique({ where: { userId } });
    last = acc?.balance ?? 0;
    if (last === want) return last;
    await new Promise((r) => setTimeout(r, 150));
  }
  return last;
};

console.log('\n\x1b[1mTANGA TOPISH — DAVOMAT VA BAHO\x1b[0m\n');

const made = { users: [], groups: [] };
let restoreSettings = null;

try {
  const owner = await prisma.user.findFirst({ where: { role: 'owner', isDeleted: false } });
  if (!owner) throw new Error("owner topilmadi — `npm run seed:owner`");
  const ownerToken = mint(owner);

  const branch = await prisma.branch.findFirst({ where: { isDeleted: false, isActive: true } });
  if (!branch) throw new Error('filial topilmadi');

  // ── SOZLAMA: aniq stavkalar (keyin TIKLANADI) ──
  const before = await prisma.coinSettings.findUnique({ where: { id: 'default' } });
  restoreSettings = {
    isEnabled: before.isEnabled,
    marketEnabled: before.marketEnabled,
    attendancePresentCoins: before.attendancePresentCoins,
    attendanceExcusedCoins: before.attendanceExcusedCoins,
    gradeMinValue: before.gradeMinValue,
    gradeCoinsPerPoint: before.gradeCoinsPerPoint,
    dailyEarnLimit: before.dailyEarnLimit,
  };
  await req('PATCH', '/coins/settings', {
    token: ownerToken,
    body: {
      isEnabled: true, attendancePresentCoins: 7, attendanceExcusedCoins: 0,
      gradeMinValue: 4, gradeCoinsPerPoint: 3, dailyEarnLimit: 0,
    },
  });

  // ── FIXTURE ──
  const stamp = Date.now();
  const mkUser = async (suffix, role) => {
    const u = await prisma.user.create({
      data: {
        firstName: `${PREFIX}${suffix}`, lastName: 'test',
        username: `${PREFIX}${suffix}${stamp}`, passwordHash: 'x',
        role, homeBranchId: branch.id,
      },
    });
    made.users.push(u.id);
    return u;
  };
  const s1 = await mkUser('s1', 'student');
  const s2 = await mkUser('s2', 'student');

  const monday = mondayBefore(new Date(Date.now() - 7 * 864e5));
  const groupStart = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth() - 1, 1));

  const group = await prisma.group.create({
    data: {
      branchId: branch.id, name: `${PREFIX}g${stamp}`, isActive: true,
      startDate: groupStart,
      schedule: { create: [{ day: 'mon', startTime: '10:00', endTime: '12:00' }] },
    },
    select: { id: true },
  });
  made.groups.push(group.id);
  await prisma.groupMembership.createMany({
    data: [
      { groupId: group.id, studentId: s1.id, joinedAt: groupStart },
      { groupId: group.id, studentId: s2.id, joinedAt: groupStart },
    ],
  });
  ok('fixture: 1 guruh, 2 o`quvchi (dushanba 10:00)');

  // ═══ 1) DAVOMAT → TANGA ═══
  const mark = (items, date) =>
    req('POST', `/attendance/groups/${group.id}/bulk`, {
      token: ownerToken, body: { date: dateKey(date), items },
    });

  const a1 = await mark(
    [{ studentId: s1.id, status: 'present' }, { studentId: s2.id, status: 'absent' }],
    monday,
  );
  check('davomat saqlandi', a1.status === 201, `${a1.status} · ${a1.json?.message}`);

  check('`present` → 7 tanga', (await waitBalance(s1.id, 7)) === 7,
    `balans=${(await prisma.coinAccount.findUnique({ where: { userId: s1.id } }))?.balance}`);
  const s2acc = await prisma.coinAccount.findUnique({ where: { userId: s2.id } });
  check('`absent` → tanga YO`Q', !s2acc || s2acc.balance === 0, `balans=${s2acc?.balance ?? 0}`);

  // ═══ 2) ⚠ QAYTA BELGILASH IKKI MARTA TO'LAMAYDI ═══
  await mark([{ studentId: s1.id, status: 'present' }], monday);
  await mark([{ studentId: s1.id, status: 'present' }], monday);
  const afterRemark = await waitBalance(s1.id, 7);
  check('qayta belgilash IKKINCHI marta to`lamaydi', afterRemark === 7,
    `balans=${afterRemark} (7 bo'lishi kerak edi)`);

  // `absent` → `present` tuzatish esa TO'LAYDI (hali to'lanmagan).
  await mark([{ studentId: s2.id, status: 'present' }], monday);
  check('`absent` → `present` tuzatilsa TO`LANADI', (await waitBalance(s2.id, 7)) === 7,
    `balans=${(await prisma.coinAccount.findUnique({ where: { userId: s2.id } }))?.balance}`);

  // ═══ 3) BAHO → TANGA ═══
  const grade = (items) =>
    req('POST', `/grades/groups/${group.id}/bulk`, {
      token: ownerToken, body: { date: dateKey(monday), items },
    });

  const g1 = await grade([
    { studentId: s1.id, value: 5 },  // 5 × 3 = 15
    { studentId: s2.id, value: 3 },  // min = 4 → tanga YO'Q
  ]);
  check('baholar saqlandi', g1.status === 201, `${g1.status} · ${g1.json?.message}`);

  check('baho 5 → +15 tanga (jami 22)', (await waitBalance(s1.id, 22)) === 22,
    `balans=${(await prisma.coinAccount.findUnique({ where: { userId: s1.id } }))?.balance}`);
  check('baho 3 (< min 4) → tanga YO`Q (jami 7)', (await waitBalance(s2.id, 7)) === 7,
    `balans=${(await prisma.coinAccount.findUnique({ where: { userId: s2.id } }))?.balance}`);

  // ═══ 4) ⚠ O'CHIRGICH TOPISHNI HAM TO'XTATADI ═══
  //
  // Ilgaklar HTTP qo'riqchisidan O'TMAYDI — ular davomat servisidan
  // chaqiriladi. Ya'ni ular sozlamani O'ZI tekshirishi shart.
  await req('PATCH', '/coins/settings', { token: ownerToken, body: { isEnabled: false } });
  await new Promise((r) => setTimeout(r, 150));

  const nextMonday = new Date(monday.getTime() + 7 * 864e5);
  const past = nextMonday.getTime() <= Date.now() ? nextMonday : monday;
  if (past !== monday) {
    await mark([{ studentId: s1.id, status: 'present' }], past);
    const off = await waitBalance(s1.id, 29, 8); // 29 = agar TO'LAGAN bo'lsa
    check('O`CHIQ: davomat tanga BERMAYDI', off === 22, `balans=${off} (22 bo'lishi kerak)`);
  } else {
    ok("o'chirgich shoxi o'tkazib yuborildi (ikkinchi dars kuni hali kelmagan)");
  }

  await req('PATCH', '/coins/settings', { token: ownerToken, body: { isEnabled: true } });

  // ═══ 5) TARIX O'QILADI ═══
  const hist = await prisma.coinTransaction.findMany({
    where: { userId: s1.id }, orderBy: { createdAt: 'asc' },
  });
  check('ledger yozuvlari: davomat + baho', hist.length === 2, `${hist.length} ta`);
  check('har bir yozuvda `sourceKey` bor (idempotentlik kaliti)',
    hist.every((t) => Boolean(t.sourceKey)),
    hist.map((t) => t.sourceKey).join(' · '));
} catch (err) {
  bad('kutilmagan xato', err.message);
} finally {
  // ── TOZALASH ──
  //
  // ⚠ TARTIB: bola yozuvlar → guruh → foydalanuvchi. Teskari tartibda
  // FK `RESTRICT` xatosi chiqardi va u YUTILSA qoldiq to'planardi.
  for (const gid of made.groups) {
    await prisma.attendance.deleteMany({ where: { groupId: gid } });
    await prisma.grade.deleteMany({ where: { groupId: gid } });
    await prisma.groupMembership.deleteMany({ where: { groupId: gid } });
    await prisma.groupScheduleItem.deleteMany({ where: { groupId: gid } });
    await prisma.group.deleteMany({ where: { id: gid } });
  }
  for (const uid of made.users) {
    await prisma.coinTransaction.deleteMany({ where: { userId: uid } });
    await prisma.coinAccount.deleteMany({ where: { userId: uid } });
    await prisma.notificationRecipient.deleteMany({ where: { userId: uid } });
  }
  await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });

  // Sozlama HAR DOIM tiklanadi — aks holda keyingi to'plamlar
  // o'zgargan stavkalar bilan ishlab, sababini topa olmasdi.
  if (restoreSettings) {
    await prisma.coinSettings.update({ where: { id: 'default' }, data: restoreSettings });
  }

  const residue =
    (await prisma.user.count({ where: { username: { startsWith: PREFIX } } })) +
    (await prisma.group.count({ where: { name: { startsWith: PREFIX } } }));
  if (residue === 0) ok('qoldiq yo`q (bazadan qayta o`qildi)');
  else bad('QOLDIQ BOR', `${residue} ta yozuv — prefiks: ${PREFIX}`);

  await prisma.$disconnect();
  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi\n`);
  process.exit(R.fail ? 1 : 0);
}
