/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 5a — GURUHLAR MODULI, O'QISH YO'LLARI PARITETI (9/24).
 *
 * ── NIMA O'LCHANADI ──
 *  1. Ro'yxat: sahifalash, `archived`, `teacherId`, qidiruv,
 *     `monthlyFee` (⚠ 0 va null FARQI), `studentsCount`.
 *  2. `GET /:id`: o'quvchilar, o'qituvchilar, `schedule`, `telegram` +
 *     `botStatus`.
 *  3. Marshrut TARTIBI: `/me/*` `/:id` dan OLDIN.
 *  4. Rol chegarasi: `/me/active` faqat o'quvchi, `/me/teach` faqat
 *     o'qituvchi (musbat nazorat bilan).
 *  5. Filial chegarasi: A filial aktyori B filial guruhini KO'RMAYDI.
 *  6. `history` — tugagan kursda 400 (Express xatti-harakati, B4).
 *  7. O'qituvchi davrlari va BO'SH o'qituvchilar (jadval to'qnashuvi).
 *
 * ── BAZA GIGIYENASI ──
 * Guruh, jadval, a'zolik va davrlar `__parity_g_` prefiksi bilan
 * yaratiladi va yakunda TO'LIQ o'chiriladi (FK tartibida).
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, mintToken, waitForStacks, createReporter, nowStamps,
} from './_harness.mjs';

const PREFIX = '__parity_g_';
const T = createReporter('guruhlar (o\'qish)');
const prisma = new PrismaClient();

const main = async () => {
  console.log('\n\x1b[1mFAZA 5a — GURUHLAR (O\'QISH) PARITETI\x1b[0m\n');
  await waitForStacks();

  const actor = async (username) => {
    const u = await prisma.user.findUnique({
      where: { username },
      select: { id: true, role: true, isActive: true, isDeleted: true },
    });
    if (!u) throw new Error(`${username} topilmadi`);
    if (!u.isActive || u.isDeleted) throw new Error(`${username} faol emas`);
    return mintToken(u);
  };

  const ownerToken = await actor('owner');

  const branches = await prisma.branch.findMany({
    where: { isDeleted: false, isActive: true },
    select: { id: true, name: true, isMain: true },
    orderBy: { createdAt: 'asc' },
  });
  const A = branches.find((b) => String(b.name).startsWith('DEMO'))
    || branches.find((b) => b.isMain) || branches[0];
  const B = branches.find((b) => b.id !== A.id);
  if (!A || !B) { console.log('  ❌ IKKI FILIAL KERAK'); process.exit(1); }

  const stamp = String(process.hrtime.bigint()).slice(-9);
  const made = { groups: [], users: [], periods: [], memberships: [] };
  const stampRule = nowStamps();

  // Fixture ID'lari solishtirishda belgiga almashtiriladi.
  const idSubs = [];
  const subs = () => [...idSubs, stampRule];

  try {
    // ═════════════ FIXTURE ═════════════
    //
    // ⚠ MAVJUD MA'LUMOTGA TAYANMAYMIZ. Bazadagi guruhlar tasodifiy:
    // jadvalsiz, o'quvchisiz yoki o'qituvchisiz bo'lishi mumkin va
    // o'shanda tekshiruvlar BO'SH natijada "bir xil" bo'lardi.
    // Shuning uchun to'liq holat O'ZIMIZ quriladi.
    T.section('fixture');

    const mkUser = async (suffix, role) => {
      const u = await prisma.user.create({
        data: {
          username: `${PREFIX}${suffix}${stamp}`,
          firstName: 'Paritet',
          lastName: suffix,
          role,
          homeBranchId: A.id,
          passwordHash: 'parity-not-used',
          branchAssignments: { create: [{ branchId: A.id, role }] },
        },
        select: { id: true, role: true },
      });
      made.users.push(u.id);
      idSubs.push([u.id, `<USER_${suffix}>`]);
      return u;
    };

    const teacher = await mkUser('teacher', 'teacher');
    const student = await mkUser('student', 'student');
    const studentB = await mkUser('studentb', 'student');

    // A filialida — jadvali, o'qituvchisi va o'quvchisi BOR guruh.
    const gA = await prisma.group.create({
      data: {
        branchId: A.id,
        name: `${PREFIX}A${stamp}`,
        isActive: true,
        startDate: new Date(Date.UTC(2026, 0, 1)),
        schedule: {
          create: [
            { day: 'mon', startTime: '10:00', endTime: '12:00', effectiveFrom: null },
            { day: 'wed', startTime: '10:00', endTime: '12:00', effectiveFrom: null },
          ],
        },
        teachers: { connect: [{ id: teacher.id }] },
      },
      select: { id: true },
    });
    made.groups.push(gA.id);
    idSubs.push([gA.id, '<GROUP_A>']);

    // B filialida — filial chegarasini o'lchash uchun.
    const gB = await prisma.group.create({
      data: { branchId: B.id, name: `${PREFIX}B${stamp}`, isActive: true },
      select: { id: true },
    });
    made.groups.push(gB.id);
    idSubs.push([gB.id, '<GROUP_B>']);

    // ARXIVLANGAN guruh — `archived=1` va `history` 400 uchun.
    const gArch = await prisma.group.create({
      data: {
        branchId: A.id,
        name: `${PREFIX}ARCH${stamp}`,
        isActive: false,
        endDate: new Date(Date.UTC(2026, 0, 31)),
      },
      select: { id: true },
    });
    made.groups.push(gArch.id);
    idSubs.push([gArch.id, '<GROUP_ARCH>']);

    // O'qituvchi davri (ochiq) — `teacher-periods` va `available-teachers`.
    const period = await prisma.teacherGroupPeriod.create({
      data: {
        groupId: gA.id,
        teacherId: teacher.id,
        startDate: new Date(Date.UTC(2026, 0, 1)),
        endDate: null,
      },
      select: { id: true },
    });
    made.periods.push(period.id);
    idSubs.push([period.id, '<PERIOD>']);

    // A'zoliklar: biri FAOL, biri CHIQARILGAN (tarix + removal notice).
    const mActive = await prisma.groupMembership.create({
      data: {
        groupId: gA.id,
        studentId: student.id,
        joinedAt: new Date(Date.UTC(2026, 0, 5)),
        leftAt: null,
      },
      select: { id: true },
    });
    made.memberships.push(mActive.id);
    idSubs.push([mActive.id, '<MEMBERSHIP_ACTIVE>']);

    const mLeft = await prisma.groupMembership.create({
      data: {
        groupId: gA.id,
        studentId: studentB.id,
        joinedAt: new Date(Date.UTC(2026, 0, 2)),
        leftAt: new Date(Date.UTC(2026, 1, 1)),
        leftReason: 'removed',
        leftReasonTitle: 'Paritet sinovi',
      },
      select: { id: true },
    });
    made.memberships.push(mLeft.id);
    idSubs.push([mLeft.id, '<MEMBERSHIP_LEFT>']);

    // ⚠ `monthlyFee` NING 0 VA null FARQI. Ataylab 0 qo'yamiz:
    // `feeByGroup.has()` o'rniga `|| null` yozilsa, tarifi 0 qilingan
    // guruh "belgilanmagan" bo'lib ko'rinardi.
    const today = new Date();
    const feeYear = today.getUTCFullYear();
    const feeMonth = today.getUTCMonth() + 1;
    await prisma.groupFee.create({
      data: { groupId: gA.id, year: feeYear, month: feeMonth, amount: 0, source: 'manual' },
    });

    T.ok(`fixture: 3 guruh, 3 foydalanuvchi, 2 a'zolik, 1 davr, tarif=0`);

    const teacherToken = mintToken(teacher);
    const studentToken = mintToken(student);
    const studentBToken = mintToken(studentB);

    // ═════════════ RO'YXAT ═════════════
    T.section("ro'yxat");

    for (const q of [
      `?search=${PREFIX}`,
      `?search=${PREFIX}&limit=5`,
      `?search=${PREFIX}&archived=1`,
      `?search=${PREFIX}&archived=true`,
      `?search=${PREFIX}&archived=0`,
      `?teacherId=${teacher.id}`,
      `?search=${PREFIX}&page=2&limit=1`,
      '?search=__yoq__',
    ]) {
      await T.both(`GET /groups${q}`, (b) =>
        request(b, 'GET', `/api/groups${q}`, { token: ownerToken }), subs);
    }
    await T.both("GET /groups?archived=xato → 400", (b) =>
      request(b, 'GET', '/api/groups?archived=xato', { token: ownerToken }), subs);
    await T.both('GET /groups?limit=9999 → 400', (b) =>
      request(b, 'GET', '/api/groups?limit=9999', { token: ownerToken }), subs);
    await T.both("GET /groups (token yo'q → 401)", (b) =>
      request(b, 'GET', '/api/groups'), subs);

    // ═════════════ BITTA GURUH ═════════════
    T.section('bitta guruh');

    await T.both('GET /groups/:id (to\'liq)', (b) =>
      request(b, 'GET', `/api/groups/${gA.id}`, { token: ownerToken }), subs);
    await T.both('GET /groups/:id (arxivlangan → 200)', (b) =>
      request(b, 'GET', `/api/groups/${gArch.id}`, { token: ownerToken }), subs);
    await T.both('GET /groups/:id (404)', (b) =>
      request(b, 'GET', `/api/groups/${'a'.repeat(24)}`, { token: ownerToken }), subs);

    // ═════════════ A'ZOLIK VA TARIX ═════════════
    T.section("a'zolik va tarix");

    await T.both('GET /:id/students/:studentId/memberships', (b) =>
      request(b, 'GET', `/api/groups/${gA.id}/students/${student.id}/memberships`,
        { token: ownerToken }), subs);
    await T.both("GET memberships (chiqarilgan o'quvchi)", (b) =>
      request(b, 'GET', `/api/groups/${gA.id}/students/${studentB.id}/memberships`,
        { token: ownerToken }), subs);
    await T.both("GET memberships (begona o'quvchi → bo'sh)", (b) =>
      request(b, 'GET', `/api/groups/${gA.id}/students/${'a'.repeat(24)}/memberships`,
        { token: ownerToken }), subs);

    await T.both('GET /:id/history', (b) =>
      request(b, 'GET', `/api/groups/${gA.id}/history`, { token: ownerToken }), subs);
    await T.both('GET /:id/history?limit=1', (b) =>
      request(b, 'GET', `/api/groups/${gA.id}/history?limit=1`, { token: ownerToken }), subs);

    // ⚠ EXPRESS XATTI-HARAKATI (B4): `history` `ensureGroup` dan o'tadi,
    // ya'ni TUGAGAN kurs tarixi 400 beradi — 200 emas. G'alati, lekin
    // KLIENT SHARTNOMASI va ATAYLAB saqlangan.
    await T.both('GET /:id/history (arxivlangan → 400, hujjatlangan)', (b) =>
      request(b, 'GET', `/api/groups/${gArch.id}/history`, { token: ownerToken }), subs);
    await T.both('GET /:id/history (404)', (b) =>
      request(b, 'GET', `/api/groups/${'a'.repeat(24)}/history`, { token: ownerToken }), subs);

    // ═════════════ O'QITUVCHILAR ═════════════
    T.section("o'qituvchi davrlari");

    await T.both('GET /:id/teacher-periods', (b) =>
      request(b, 'GET', `/api/groups/${gA.id}/teacher-periods`, { token: ownerToken }), subs);
    await T.both("GET /:id/teacher-periods (bo'sh)", (b) =>
      request(b, 'GET', `/api/groups/${gB.id}/teacher-periods`, { token: ownerToken }), subs);

    // ⚠ JADVAL TO'QNASHUVI: `gA` jadvalida dushanba 10:00–12:00 bor va
    // `teacher` shu guruhda OCHIQ davrda. Demak u BOSHQA, xuddi shu
    // vaqtdagi guruh uchun BAND bo'lishi kerak.
    const gConflict = await prisma.group.create({
      data: {
        branchId: A.id,
        name: `${PREFIX}CONF${stamp}`,
        isActive: true,
        schedule: {
          create: [{ day: 'mon', startTime: '11:00', endTime: '13:00', effectiveFrom: null }],
        },
      },
      select: { id: true },
    });
    made.groups.push(gConflict.id);
    idSubs.push([gConflict.id, '<GROUP_CONF>']);

    // Ketma-ket (to'qnashmaydigan) guruh: 12:00–13:00 — YOPIQ-OCHIQ
    // qoida bo'yicha 10:00–12:00 bilan KESISHMAYDI.
    const gAdjacent = await prisma.group.create({
      data: {
        branchId: A.id,
        name: `${PREFIX}ADJ${stamp}`,
        isActive: true,
        schedule: {
          create: [{ day: 'mon', startTime: '12:00', endTime: '13:00', effectiveFrom: null }],
        },
      },
      select: { id: true },
    });
    made.groups.push(gAdjacent.id);
    idSubs.push([gAdjacent.id, '<GROUP_ADJ>']);

    const availConf = await T.both("GET /:id/available-teachers (to'qnashadi)", (b) =>
      request(b, 'GET', `/api/groups/${gConflict.id}/available-teachers`,
        { token: ownerToken }), subs);
    const availAdj = await T.both("GET /:id/available-teachers (ketma-ket, to'qnashmaydi)", (b) =>
      request(b, 'GET', `/api/groups/${gAdjacent.id}/available-teachers`,
        { token: ownerToken }), subs);

    // ⚠ MUSBAT NAZORAT: paritet "ikkalasi bir xil ro'yxat berdi" dan
    // KO'RA ko'proq narsani isbotlashi kerak — to'qnashuv mantig'i
    // HAQIQATAN ishlaganini tekshiramiz.
    const inList = (res, id) =>
      (res?.body?.data || []).some((t) => String(t.id) === String(id));
    const busyOk = availConf.e && !inList(availConf.e, teacher.id);
    const freeOk = availAdj.e && inList(availAdj.e, teacher.id);
    if (busyOk && freeOk) {
      T.ok("to'qnashuv mantig'i O'LCHANDI: band guruhda YO'Q, ketma-ketda BOR");
    } else {
      T.bad(
        "to'qnashuv mantig'i o'lchanmadi",
        `band-guruhda-yo'q=${busyOk}, ketma-ketda-bor=${freeOk} — ` +
        "ro'yxat paritetli bo'lsa ham qoida sinalmadi",
      );
    }

    await T.both('GET /:id/available-teachers (404)', (b) =>
      request(b, 'GET', `/api/groups/${'a'.repeat(24)}/available-teachers`,
        { token: ownerToken }), subs);

    // ═════════════ MARSHRUT TARTIBI + ROL ═════════════
    //
    // ⚠ `/me/*` `/:id` DAN OLDIN e'lon qilinganini QULFLAYDI.
    // Tartib buzilsa "me" guruh ID'si deb o'qilib 404 chiqardi.
    T.section("marshrut tartibi va rol chegarasi (/me/*)");

    await T.both("GET /me/active (o'quvchi)", (b) =>
      request(b, 'GET', '/api/groups/me/active', { token: studentToken }), subs);
    await T.both("GET /me/active (guruhsiz o'quvchi → null)", (b) =>
      request(b, 'GET', '/api/groups/me/active', { token: studentBToken }), subs);
    await T.both("GET /me/active (o'qituvchi → 403)", (b) =>
      request(b, 'GET', '/api/groups/me/active', { token: teacherToken }), subs);
    await T.both("GET /me/active (owner → 403)", (b) =>
      request(b, 'GET', '/api/groups/me/active', { token: ownerToken }), subs);

    await T.both("GET /me/teach (o'qituvchi)", (b) =>
      request(b, 'GET', '/api/groups/me/teach', { token: teacherToken }), subs);
    await T.both("GET /me/teach (o'quvchi → 403)", (b) =>
      request(b, 'GET', '/api/groups/me/teach', { token: studentToken }), subs);

    await T.both("POST /me/removal-notice/seen (o'qituvchi → 403)", (b) =>
      request(b, 'POST', '/api/groups/me/removal-notice/seen', { token: teacherToken }), subs);

    // ═════════════ RUXSAT CHEGARASI ═════════════
    T.section('ruxsat chegarasi');

    // ⚠ MUSBAT NAZORAT: o'quvchi TIRIK va `/me/active` da 200 oldi
    // (yuqorida). Demak pastdagi 403 `groups.read` yo'qligidan.
    await T.both("o'quvchida `groups.read` yo'q → GET /groups 403", (b) =>
      request(b, 'GET', '/api/groups', { token: studentToken }), subs);
    await T.both("o'quvchida `groups.read` yo'q → GET /groups/:id 403", (b) =>
      request(b, 'GET', `/api/groups/${gA.id}`, { token: studentToken }), subs);

    // ═════════════ FILIAL CHEGARASI ═════════════
    T.section("filial chegarasi");

    try {
      const adminAToken = await actor('qa_admin_a');
      const positive = await T.both(
        "MUSBAT NAZORAT: qa_admin_a A filial guruhini KO'RADI",
        (b) => request(b, 'GET', `/api/groups/${gA.id}`, { token: adminAToken }), subs);

      if (positive.e?.status !== 200) {
        T.skip("filial chegarasi", 'musbat nazorat 200 bermadi');
      } else {
        // ⚠ 404, 403 EMAS: mavjudligini ham oshkor qilmaymiz.
        await T.both("qa_admin_a B filial guruhini KO'RMAYDI → 404", (b) =>
          request(b, 'GET', `/api/groups/${gB.id}`, { token: adminAToken }), subs);
        await T.both("qa_admin_a ro'yxatida B filial guruhi YO'Q", (b) =>
          request(b, 'GET', `/api/groups?search=${PREFIX}&limit=50`,
            { token: adminAToken }), subs);
        await T.both("qa_admin_a B guruhining tarixini KO'RMAYDI → 404", (b) =>
          request(b, 'GET', `/api/groups/${gB.id}/history`, { token: adminAToken }), subs);

        // ── SIZISH TEKSHIRUVI: javobda B guruhi UMUMAN yo'qmi ──
        const leak = await request(
          EXPRESS, 'GET', `/api/groups?search=${PREFIX}&limit=50`,
          { token: adminAToken },
        );
        const names = (leak.body?.data || []).map((g) => g.name);
        const sawA = names.some((n) => n.includes(`${PREFIX}A`));
        const sawB = names.some((n) => n.includes(`${PREFIX}B`));
        if (sawA && !sawB) {
          T.ok(`sizish yo'q: A ko'rindi, B ko'rinmadi (${names.length} guruh)`);
        } else {
          T.bad('filial sizishi', `A ko'rindi=${sawA}, B ko'rindi=${sawB}`);
        }
      }
    } catch (err) {
      T.skip('filial chegarasi', err.message);
    }

    // ═════════════ REMOVAL NOTICE (yozish) ═════════════
    //
    // ⚠ SHART OLDINDAN O'LCHANADI: `studentB` da ko'rilmagan
    // "removed" a'zolik BOR (fixture'da shunday yaratilgan). Amaldan
    // KEYIN u `removalNoticeSeenAt` bilan yopilishi kerak.
    T.section("removal notice (yagona yozish amali)");

    const before = await prisma.groupMembership.count({
      where: { studentId: studentB.id, leftReason: 'removed', removalNoticeSeenAt: null },
    });
    if (before > 0) {
      console.log(`      (shart o'lchandi: ${before} ta ko'rilmagan xabar)`);
      await T.both("POST /me/removal-notice/seen (o'quvchi)", (b) =>
        request(b, 'POST', '/api/groups/me/removal-notice/seen',
          { token: studentBToken }), subs);
      const after = await prisma.groupMembership.count({
        where: { studentId: studentB.id, leftReason: 'removed', removalNoticeSeenAt: null },
      });
      if (after === 0) T.ok('xabar HAQIQATAN ko\'rilgan deb belgilandi');
      else T.bad('removal notice', `${after} ta xabar hali ham ko'rilmagan`);
    } else {
      T.skip('removal notice', "ko'rilmagan xabar yo'q — TAXMIN QILINMADI");
    }
  } catch (err) {
    T.bad('kutilmagan xato', err.stack || err.message);
  } finally {
    // ═════════════ TOZALASH (FK tartibida) ═════════════
    const c1 = await prisma.groupFee.deleteMany({
      where: { groupId: { in: made.groups } },
    });
    const c2 = await prisma.groupMembership.deleteMany({
      where: { id: { in: made.memberships } },
    });
    const c3 = await prisma.teacherGroupPeriod.deleteMany({
      where: { id: { in: made.periods } },
    });
    const c4 = await prisma.groupScheduleItem.deleteMany({
      where: { groupId: { in: made.groups } },
    });
    // Ko'p-ko'pga bog'lanish avval uziladi, aks holda `delete` yiqiladi.
    for (const gid of made.groups) {
      await prisma.group.update({
        where: { id: gid },
        data: { teachers: { set: [] } },
      }).catch(() => {});
    }
    const c5 = await prisma.group.deleteMany({ where: { id: { in: made.groups } } });
    await prisma.userBranchAssignment.deleteMany({
      where: { userId: { in: made.users } },
    });
    const c6 = await prisma.user.deleteMany({ where: { id: { in: made.users } } });

    console.log(
      `\n  🧹 tozalandi: ${c5.count} guruh, ${c6.count} foydalanuvchi, ` +
      `${c2.count} a'zolik, ${c3.count} davr, ${c4.count} jadval, ${c1.count} tarif`,
    );

    const left =
      (await prisma.group.count({ where: { name: { startsWith: PREFIX } } })) +
      (await prisma.user.count({ where: { username: { startsWith: PREFIX } } }));
    if (left === 0) T.ok('sinov obyektlari qolmadi');
    else T.bad("tozalash to'liq bo'lmadi", `${left} ta obyekt qoldi`);

    await prisma.$disconnect();
  }

  process.exit(T.finish());
};

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
