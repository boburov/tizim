/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAOLIYAT LOGLARI — PARITET (3/3 marshrut).
 *
 * Express: `server/src/modules/activityLogs/`
 * NestJS : `server_nest/src/modules/activity-logs/`
 *
 * ── NEGA BU MODUL PARITETI ODDIY ──
 * Modul FAQAT O'QIYDI va ikkala stek AYNI bazani o'qiydi. Ya'ni bir xil
 * so'rov bir xil javob berishi SHART — stekka xos ID almashtirish kerak
 * emas (yozuvlar oldindan, test tomonidan yaratiladi).
 *
 * ── O'LCHANADIGAN CHEGARA ──
 * `ActivityLog` da `branchId` YO'Q. Yozuv AKTYORGA (`userId`) tegishli,
 * aktyor esa filialga. Shuning uchun filial chegarasi `branchUserFilter`
 * orqali AYLANMA yo'l bilan qo'yiladi — eng oson buziladigan tur.
 *
 * ⚠ MUSBAT NAZORAT MAJBURIY: "B admini A ning logini ko'rmadi" degan
 * tekshiruv BO'SH bazada ham o'tadi. Shuning uchun avval "A admini O'Z
 * filialining logini KO'RADI" isbotlanadi; u bo'lmasa sizish testi
 * o'lchanmagan deb belgilanadi.
 *
 * ── BAZA GIGIYENASI ──
 * `__parity_al_` prefiksli rol/foydalanuvchi va ular yaratgan barcha
 * `ActivityLog` qatorlari yakunda O'CHIRILADI; qoldiq SANALADI.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, mintToken, waitForStacks, createReporter,
} from './_harness.mjs';

const ROLE_PREFIX = '__parity_alrole_';
const USER_PREFIX = '__parity_aluser_';
const T = createReporter('faoliyat loglari');
const prisma = new PrismaClient();

const main = async () => {
  console.log('\n\x1b[1mFAZA 2.7 — FAOLIYAT LOGLARI PARITETI\x1b[0m\n');
  await waitForStacks();

  const stamp = String(process.hrtime.bigint()).slice(-9);
  const made = { users: [], roles: [], logs: [] };

  const ownerRow = await prisma.user.findUnique({
    where: { username: 'owner' },
    select: { id: true, role: true, isActive: true, isDeleted: true },
  });
  if (!ownerRow) throw new Error('owner topilmadi');
  const ownerToken = mintToken(ownerRow);

  const branches = await prisma.branch.findMany({
    where: { isDeleted: false, isActive: true },
    select: { id: true, name: true, isMain: true },
    orderBy: { createdAt: 'asc' },
  });
  const A =
    branches.find((b) => String(b.name).startsWith('DEMO')) ||
    branches.find((b) => b.isMain) ||
    branches[0];
  const B = branches.find((b) => b.id !== A.id);
  if (!A || !B) { console.log('  ❌ IKKI FILIAL KERAK'); process.exit(1); }

  try {
    // ── ROLLAR: biri `activity_logs.read` BILAN, biri UNSIZ ──
    //
    // Ruxsatsiz rol NEGA KERAK: 403 tekshiruvi "ruxsat qo'riqchisi
    // ishlayaptimi" degan savolga javob beradi. Usiz qo'riqchini
    // olib tashlash testni YIQITMAS edi.
    const perm = await prisma.permission.findFirst({
      where: { key: 'activity_logs.read' }, select: { id: true },
    });
    if (!perm) throw new Error("`activity_logs.read` ruxsati bazada yo'q");

    const mkRole = async (suffix, label, perms) => {
      const r = await prisma.role.create({
        data: {
          value: `${ROLE_PREFIX}${suffix}${stamp}`,
          label, roleType: 'staff', defaultPath: '/', isSystem: false,
          ...(perms.length ? { permissions: { connect: perms } } : {}),
        },
        select: { id: true, value: true },
      });
      made.roles.push(r.id);
      return r;
    };
    const readerRole = await mkRole('r', 'Paritet: log o\'quvchi', [{ id: perm.id }]);
    const blindRole = await mkRole('b', 'Paritet: ruxsatsiz', []);

    const mkUser = async (suffix, role, branchId) => {
      const u = await prisma.user.create({
        data: {
          username: `${USER_PREFIX}${suffix}${stamp}`,
          firstName: 'Paritet', lastName: `AL${suffix}`,
          role: role.value, homeBranchId: branchId,
          passwordHash: 'parity-not-used',
          branchAssignments: { create: [{ branchId, role: role.value }] },
        },
        select: { id: true, role: true },
      });
      made.users.push(u.id);
      return u;
    };

    const adminA = await mkUser('aa', readerRole, A.id);
    const adminB = await mkUser('ab', readerRole, B.id);
    const blind = await mkUser('bl', blindRole, A.id);
    // Log EGALARI — aktyorlardan ALOHIDA, chunki aktyorning o'z logi
    // "o'zini ko'rish" bilan aralashib ketardi.
    const subjA = await mkUser('sa', readerRole, A.id);
    const subjB = await mkUser('sb', readerRole, B.id);

    const tokenA = mintToken(adminA);
    const tokenB = mintToken(adminB);
    const tokenBlind = mintToken(blind);

    // ── LOG QATORLARI ──
    // Turli metod / yo'l / resurs — filtrlar aynan shular ustida ishlaydi.
    const mkLog = async (userId, over) => {
      const row = await prisma.activityLog.create({
        data: {
          userId, userRole: 'staff', actorLabel: 'Paritet',
          method: 'POST', path: '/api/groups', status: 200,
          durationMs: 5, ip: '127.0.0.1', userAgent: 'parity',
          resourceType: 'group', resourceId: 'x',
          ...over,
        },
        select: { id: true },
      });
      made.logs.push(row.id);
      return row;
    };

    const logA1 = await mkLog(subjA.id, { method: 'POST', path: '/api/groups', resourceType: 'group' });
    await mkLog(subjA.id, { method: 'PATCH', path: '/api/users/aaaaaaaaaaaaaaaaaaaaaaaa', resourceType: 'user' });
    await mkLog(subjA.id, { method: 'POST', path: '/api/auth/login', resourceType: 'auth' });
    // ⚠ SHOVQIN: `/auth/refresh` javobdan CHIQARIB TASHLANISHI shart.
    await mkLog(subjA.id, { method: 'POST', path: '/api/auth/refresh', resourceType: 'auth' });
    // Xato yozuvi — `failed: true` hosila maydonini o'lchaydi.
    await mkLog(subjA.id, { method: 'DELETE', path: '/api/holidays/bbbbbbbbbbbbbbbbbbbbbbbb', resourceType: 'holiday', status: 403 });
    // B filialining yozuvi — A admini buni KO'RMASLIGI kerak.
    await mkLog(subjB.id, { method: 'POST', path: '/api/groups', resourceType: 'group' });

    const q = `?userId=${subjA.id}&limit=50`;

    // ═══════════════ 1) O'QISH PARITETI (owner) ═══════════════
    T.section("o'qish — owner");
    for (const suffix of [
      q,
      `${q}&method=POST`,
      `${q}&action=CREATE`,
      `${q}&action=LOGIN`,
      `${q}&action=UPDATE`,
      `${q}&action=DELETE`,
      `${q}&resourceType=group`,
      `${q}&page=2&limit=2`,
      '?limit=1',
      '?limit=9999',
      '?method=NOPE',
      '?action=NOPE',
    ]) {
      await T.both(`GET /activity-logs${suffix}`, (b) =>
        request(b, 'GET', `/api/activity-logs${suffix}`, { token: ownerToken }));
    }

    T.section('bitta yozuv va statistika');
    await T.both('GET /activity-logs/:id', (b) =>
      request(b, 'GET', `/api/activity-logs/${logA1.id}`, { token: ownerToken }));
    await T.both('GET /activity-logs/:id (404)', (b) =>
      request(b, 'GET', '/api/activity-logs/cccccccccccccccccccccccc', { token: ownerToken }));
    await T.both('GET /activity-logs/stats', (b) =>
      request(b, 'GET', '/api/activity-logs/stats', { token: ownerToken }));
    await T.both('GET /activity-logs/stats (sana oralig\'i)', (b) =>
      request(b, 'GET', '/api/activity-logs/stats?fromDate=2000-01-01&toDate=2099-01-01', { token: ownerToken }));
    // ⚠ `stats` `:id` DAN OLDIN e'lon qilinishi shart — aks holda
    // "stats" id sifatida o'qilib 404 qaytarardi.
    await T.both("MARSHRUT TARTIBI: /stats `:id` ga tushmaydi", (b) =>
      request(b, 'GET', '/api/activity-logs/stats', { token: ownerToken }));

    // ═══════════════ 2) AUTENTIFIKATSIYA ═══════════════
    T.section('autentifikatsiya');
    for (const p of ['', '/stats', `/${logA1.id}`]) {
      await T.both(`GET /activity-logs${p} (token yo'q → 401)`, (b) =>
        request(b, 'GET', `/api/activity-logs${p}`));
    }

    // ═══════════════ 3) RUXSAT — MANFIY NAZORAT ═══════════════
    //
    // MANFIY NAZORAT: `activity_logs.read` BO'LMAGAN rol uchta yo'lda
    // ham 403 olishi shart. Bu qo'riqchining O'ZI ishlayotganini
    // isbotlaydi — 401 dan farqli.
    T.section('ruxsat (manfiy nazorat)');
    for (const p of ['', '/stats', `/${logA1.id}`]) {
      await T.both(`ruxsatsiz rol GET /activity-logs${p} → 403`, (b) =>
        request(b, 'GET', `/api/activity-logs${p}`, { token: tokenBlind }));
    }

    // ═══════════════ 4) FILIAL KO'LAMI ═══════════════
    T.section("filial ko'lami");

    // ⚠ MUSBAT NAZORAT BIRINCHI: A admini O'Z filialining logini KO'RADI.
    // Bu bo'lmasa pastdagi "B ko'rmaydi" tekshiruvi bo'sh natijada ham
    // o'tib ketardi va HECH NARSANI isbotlamasdi.
    const posA = await T.both(
      "MUSBAT NAZORAT: A admini o'z filiali logini ko'radi",
      (b) => request(b, 'GET', `/api/activity-logs${q}`, { token: tokenA }),
    );
    const seenA = posA.e?.body?.data?.length || 0;

    if (posA.e?.status !== 200 || seenA === 0) {
      T.skip("filial ko'lami (loglar)", 'musbat nazorat bo\'sh — sizish testi ma\'nosiz');
    } else {
      T.ok(`musbat nazorat: A admini ${seenA} ta yozuv ko'rdi`);
      // B admini A ning yozuvlarini KO'RMAYDI.
      const leak = await T.both(
        "B admini A filialining logini KO'RMAYDI",
        (b) => request(b, 'GET', `/api/activity-logs${q}`, { token: tokenB }),
      );
      const seenB = leak.e?.body?.data?.length ?? -1;
      if (seenB === 0) T.ok('B admini 0 ta yozuv ko\'rdi (sizish yo\'q)');
      else T.bad('filial sizishi', `B admini ${seenB} ta begona yozuv ko'rdi`);

      // Statistika ham AYNI ko'lamda bo'lishi kerak.
      await T.both("B admini statistikasi ham cheklangan", (b) =>
        request(b, 'GET', '/api/activity-logs/stats', { token: tokenB }));
    }

    // ═══════════════ 5) SHOVQIN FILTRI ═══════════════
    //
    // `/auth/refresh` yozuvlari javobda BO'LMASLIGI kerak — ikkala
    // stekda ham. Bu `AND` yig'ilishining to'g'riligini o'lchaydi:
    // `path` sharti ikki marta uchraydi (shovqin + amal) va spread
    // qilinsa biri ikkinchisini bosib ketardi.
    T.section('shovqin filtri');
    const noise = await request(EXPRESS, 'GET', `/api/activity-logs${q}`, { token: ownerToken });
    const noiseNest = await request(NEST, 'GET', `/api/activity-logs${q}`, { token: ownerToken });
    const hasRefresh = (r) => (r.body?.data || []).some((x) => String(x.path).includes('/auth/refresh'));
    if (!hasRefresh(noise) && !hasRefresh(noiseNest)) T.ok('`/auth/refresh` ikkala stekda ham chiqarib tashlandi');
    else T.bad('shovqin filtri', `express: ${hasRefresh(noise)}, nest: ${hasRefresh(noiseNest)}`);

    // LOGIN filtri bilan birga ham shovqin ushlanib qolishi shart.
    const loginOnly = await request(NEST, 'GET', `${'/api/activity-logs' + q}&action=LOGIN`, { token: ownerToken });
    const onlyLogin = (loginOnly.body?.data || []).every((x) => String(x.path).endsWith('/login'));
    if (onlyLogin) T.ok('action=LOGIN faqat login yo\'llarini qaytardi');
    else T.bad('action=LOGIN', JSON.stringify(loginOnly.body?.data?.map((x) => x.path)));
  } finally {
    // ── TOZALASH: bolalardan otalarga ──
    console.log('\n\x1b[2m  ── tozalash ──\x1b[0m');
    if (made.logs.length) await prisma.activityLog.deleteMany({ where: { id: { in: made.logs } } });
    if (made.users.length) {
      // Aktyorlar yaratgan BOSHQA loglar ham bo'lishi mumkin emas
      // (token bilan faqat GET qilindi), lekin FK ni kafolatlash uchun
      // foydalanuvchi bo'yicha ham tozalaymiz.
      await prisma.activityLog.deleteMany({ where: { userId: { in: made.users } } });
      await prisma.userBranchAssignment.deleteMany({ where: { userId: { in: made.users } } });
      await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    }
    if (made.roles.length) await prisma.role.deleteMany({ where: { id: { in: made.roles } } });

    // ⚠ TOZALASH "TUGADIM" DEGANIGA ISHONMAYMIZ — O'LCHAYMIZ.
    const left =
      (await prisma.user.count({ where: { username: { startsWith: USER_PREFIX } } })) +
      (await prisma.role.count({ where: { value: { startsWith: ROLE_PREFIX } } }));
    if (left) { console.log(`  ❌ QOLDIQ: ${left} ta yozuv qoldi`); T.R.fail += 1; }
    else console.log('  🧹 qoldiq yo\'q');

    await prisma.$disconnect();
  }

  process.exit(T.finish());
};

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
