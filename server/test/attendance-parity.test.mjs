/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 6 — DAVOMAT MODULI PARITETI (11/11 marshrut).
 *
 * ── NIMA O'LCHANADI ──
 *  1. O'qish: kunlik varaq, oylik matritsa, o'quvchi oylik/yillik/summary,
 *     guruh summary, dashboard, o'qituvchi hisoboti.
 *  2. YOZISH: `bulkRecord` (tranzaksiya, audit tarixi, slot ko'chirish),
 *     o'qituvchi davomati (toggle).
 *  3. Validatsiya: kelajak kun, dars kuni emas, bayram, kurs chegarasi,
 *     a'zo emas, takroriy o'quvchi, noto'g'ri slot, ISO sana rad etilishi.
 *  4. KO'LAM: o'qituvchi begona guruhga/o'quvchiga kira olmaydi;
 *     o'quvchi faqat O'ZINI ko'radi; xodim faqat O'Z filialini.
 *  5. `scopeGroupIds` — o'qituvchi o'quvchining BOSHQA guruhdagi
 *     davomatini KO'RMAYDI (A-1 cross-group disclosure).
 *  6. STATUS KODLARI: `bulk` → 201, `teacher` → 200.
 *
 * ── NEGATIV NAZORAT (majburiy) ──
 * Yakunda qo'riqchi ATAYLAB chetlab o'tiladi va test uni TUTISHI shart.
 * Tutmasa — yuqoridagi barcha yashil belgilar hech narsani anglatmaydi.
 *
 * ── BAZA GIGIYENASI ──
 * Butun fixture `__parity_a_` prefiksi bilan quriladi va yakunda FK
 * tartibida TO'LIQ o'chiriladi. Yakunda DRIFT tekshiruvi: `attendance`,
 * `teacher_absences` va `notifications` jadvallarida boshlang'ich
 * holatdan farq QOLMASLIGI shart.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, mintToken, waitForStacks, createReporter, nowStamps,
} from './_harness.mjs';

const PREFIX = '__parity_a_';
const T = createReporter('davomat');
const prisma = new PrismaClient();

/** Fixture darslari DUSHANBA kunlari — sanalar shunga qarab tanlanadi. */
const mondayBefore = (d) => {
  const x = new Date(d);
  const shift = (x.getUTCDay() + 6) % 7; // dushanba = 0
  x.setUTCDate(x.getUTCDate() - shift);
  return x;
};
const iso = (d) => d.toISOString().slice(0, 10);

const main = async () => {
  console.log('\n\x1b[1mFAZA 6 — DAVOMAT MODULI PARITETI\x1b[0m\n');
  await waitForStacks();

  const actor = async (username) => {
    const u = await prisma.user.findUnique({
      where: { username },
      select: { id: true, role: true, isActive: true, isDeleted: true },
    });
    if (!u) throw new Error(`${username} topilmadi`);
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
  const made = { groups: [], users: [], memberships: [] };
  const idSubs = [];
  const stampRule = nowStamps();

  /**
   * ── STEKKA XOS ID'LARNI AVTOMATIK NORMALLASHTIRISH ──
   *
   * `Attendance` / `TeacherAbsence` qatorlari bazada generatsiya
   * qilinadi, ya'ni har stekda BOSHQACHA va oldindan MA'LUM EMAS.
   * Ularni javoblardan yig'amiz: ikkala stek ham AYNI so'rovlarni
   * AYNI tartibda oladi, demak `i`-chi ID lar bir-biriga mos keladi.
   *
   * ⚠ FAQAT `id` / `_id` KALITLARI yig'iladi va FAQAT shu test
   * yaratgan qatorlar uchun ishlaydi — haqiqiy farq YASHIRILMAYDI.
   */
  const dyn = { [EXPRESS]: [], [NEST]: [] };
  const collectIds = (base, v) => {
    if (Array.isArray(v)) { v.forEach((x) => collectIds(base, x)); return; }
    if (!v || typeof v !== 'object') return;
    for (const [k, val] of Object.entries(v)) {
      if ((k === 'id' || k === '_id') && typeof val === 'string') {
        if (!dyn[base].includes(val)) dyn[base].push(val);
      } else collectIds(base, val);
    }
  };
  /** `both()` ga beriladigan o'ram: javobni yig'ib, o'zini qaytaradi. */
  const seen = (base, r) => { collectIds(base, r?.body); return r; };

  const subs = () => [
    ...idSubs,
    ...dyn[EXPRESS].map((id, i) => [id, `<DYN${i}>`]),
    ...dyn[NEST].map((id, i) => [id, `<DYN${i}>`]),
    stampRule,
  ];

  // ── DRIFT O'LCHOVI: boshlang'ich holat ──
  const baseline = {
    attendance: await prisma.attendance.count(),
    teacherAbsence: await prisma.teacherAbsence.count(),
    notifications: await prisma.notification.count(),
  };

  try {
    // ═════════════════════ FIXTURE ═════════════════════
    T.section('fixture');

    const mkUser = async (suffix, role, branchId = A.id) => {
      const u = await prisma.user.create({
        data: {
          username: `${PREFIX}${suffix}${stamp}`,
          firstName: 'Par', lastName: suffix, role,
          homeBranchId: branchId, passwordHash: 'parity-not-used',
          branchAssignments: { create: [{ branchId, role }] },
        },
        select: { id: true, role: true },
      });
      made.users.push(u.id);
      idSubs.push([u.id, `<U_${suffix}>`]);
      return u;
    };

    const teacher = await mkUser('teacher', 'teacher');
    const teacher2 = await mkUser('teacher2', 'teacher');
    const s1 = await mkUser('s1', 'student');
    const s2 = await mkUser('s2', 'student');

    // Dars kunlari: DUSHANBA 10:00–12:00. Guruh o'tgan oy boshlangan.
    const today = new Date();
    const lastMonday = mondayBefore(new Date(today.getTime() - 7 * 864e5));
    const groupStart = new Date(Date.UTC(
      today.getUTCFullYear(), today.getUTCMonth() - 1, 1));

    const mkGroup = async (suffix, branchId, teacherId, token = null) => {
      const g = await prisma.group.create({
        data: {
          branchId, name: `${PREFIX}${suffix}${stamp}`, isActive: true,
          startDate: groupStart,
          schedule: {
            create: [{ day: 'mon', startTime: '10:00', endTime: '12:00', effectiveFrom: null }],
          },
          ...(teacherId ? { teachers: { connect: [{ id: teacherId }] } } : {}),
        },
        select: { id: true },
      });
      made.groups.push(g.id);
      // ⚠ NOM ham, ID ham almashtiriladi: yozish guruhlari ikkala
      // stekda BOSHQA (bir guruhga ikkalasi yozsa `history` aralashib
      // ketardi), lekin solishtirishda BIR XIL belgiga tushishi kerak.
      const tok = token || `<G_${suffix}>`;
      idSubs.push([g.id, tok]);
      idSubs.push([`${PREFIX}${suffix}${stamp}`, `${tok}_NAME`]);
      if (teacherId) {
        await prisma.teacherGroupPeriod.create({
          data: { groupId: g.id, teacherId, startDate: groupStart, endDate: null },
        });
      }
      return g;
    };

    const gMain = await mkGroup('main', A.id, teacher.id);       // teacher o'qitadi
    const gOther = await mkGroup('other', A.id, teacher2.id);    // BEGONA guruh
    const gB = await mkGroup('bbranch', B.id, null);             // B filiali

    const mkMember = async (groupId, studentId, joinedAt = groupStart) => {
      const m = await prisma.groupMembership.create({
        data: { groupId, studentId, joinedAt, leftAt: null },
        select: { id: true },
      });
      made.memberships.push(m.id);
      idSubs.push([m.id, '<M>']);
      return m;
    };
    await mkMember(gMain.id, s1.id);
    await mkMember(gMain.id, s2.id);
    // ⚠ s1 BOSHQA guruhda ham a'zo — `scopeGroupIds` (A-1) shu bilan
    // o'lchanadi: `teacher` uni KO'RMASLIGI kerak.
    await mkMember(gOther.id, s1.id);

    T.ok('fixture: 3 guruh, 4 foydalanuvchi, 3 a\'zolik (dushanba 10:00)');

    const teacherToken = mintToken(teacher);
    const s1Token = mintToken(s1);
    const s2Token = mintToken(s2);

    const D = iso(lastMonday);                 // o'tgan dushanba (dars kuni)
    const tuesday = iso(new Date(lastMonday.getTime() + 864e5)); // dars kuni EMAS
    const future = iso(new Date(today.getTime() + 30 * 864e5));
    const year = lastMonday.getUTCFullYear();
    const month = lastMonday.getUTCMonth() + 1;
    const rangeFrom = iso(new Date(lastMonday.getTime() - 30 * 864e5));
    const rangeTo = iso(new Date(lastMonday.getTime() + 7 * 864e5));

    // ═════════════════════ O'QISH ═════════════════════
    T.section("o'qish");

    await T.both(`GET /groups/:id?date=${D}`, (b) =>
        request(b, 'GET', `/api/attendance/groups/${gMain.id}?date=${D}`,
        { token: ownerToken }), subs, seen);
    await T.both('GET /groups/:id (dars kuni EMAS)', (b) =>
        request(b, 'GET', `/api/attendance/groups/${gMain.id}?date=${tuesday}`,
        { token: ownerToken }), subs, seen);
    await T.both('GET /groups/:id (404)', (b) =>
        request(b, 'GET', `/api/attendance/groups/${'a'.repeat(24)}?date=${D}`,
        { token: ownerToken }), subs, seen);
    await T.both("GET /groups/:id (sanasiz → 400)", (b) =>
        request(b, 'GET', `/api/attendance/groups/${gMain.id}`, { token: ownerToken }), subs, seen);
    await T.both("GET /groups/:id (noto'g'ri slot → 400)", (b) =>
        request(b, 'GET', `/api/attendance/groups/${gMain.id}?date=${D}&slot=25:99`,
        { token: ownerToken }), subs, seen);

    await T.both('GET /groups/:id/monthly', (b) =>
        request(b, 'GET',
        `/api/attendance/groups/${gMain.id}/monthly?year=${year}&month=${month}`,
        { token: ownerToken }), subs, seen);
    await T.both('GET /groups/:id/monthly (month=13 → 400)', (b) =>
        request(b, 'GET',
        `/api/attendance/groups/${gMain.id}/monthly?year=${year}&month=13`,
        { token: ownerToken }), subs, seen);
    await T.both('GET /groups/:id/summary', (b) =>
        request(b, 'GET',
        `/api/attendance/groups/${gMain.id}/summary?fromDate=${rangeFrom}&toDate=${rangeTo}`,
        { token: ownerToken }), subs, seen);

    await T.both('GET /students/:id/monthly', (b) =>
        request(b, 'GET',
        `/api/attendance/students/${s1.id}/monthly?year=${year}&month=${month}`,
        { token: ownerToken }), subs, seen);
    await T.both('GET /students/:id/yearly', (b) =>
        request(b, 'GET', `/api/attendance/students/${s1.id}/yearly?year=${year}`,
        { token: ownerToken }), subs, seen);
    await T.both('GET /students/:id/summary', (b) =>
        request(b, 'GET',
        `/api/attendance/students/${s1.id}/summary?fromDate=${rangeFrom}&toDate=${rangeTo}`,
        { token: ownerToken }), subs, seen);

    await T.both('GET /dashboard', (b) =>
        request(b, 'GET',
        `/api/attendance/dashboard?fromDate=${rangeFrom}&toDate=${rangeTo}&limit=5`,
        { token: ownerToken }), subs, seen);
    await T.both('GET /dashboard (sanasiz → 400)', (b) =>
        request(b, 'GET', '/api/attendance/dashboard', { token: ownerToken }), subs, seen);

    await T.both("GET /teacher/me/summary (o'qituvchi)", (b) =>
        request(b, 'GET',
        `/api/attendance/teacher/me/summary?fromDate=${rangeFrom}&toDate=${rangeTo}`,
        { token: teacherToken }), subs, seen);
    await T.both("GET /teacher/me/summary (owner → 403)", (b) =>
        request(b, 'GET',
        `/api/attendance/teacher/me/summary?fromDate=${rangeFrom}&toDate=${rangeTo}`,
        { token: ownerToken }), subs, seen);

    await T.both("GET /groups/:id/teacher (o'qituvchi holati)", (b) =>
        request(b, 'GET', `/api/attendance/groups/${gMain.id}/teacher?date=${D}`,
        { token: ownerToken }), subs, seen);

    // ═════════════════════ YOZISH ═════════════════════
    //
    // ⚠ HAR STEK O'Z GURUHIGA YOZADI — bir guruhga ikkalasi yozsa
    // ikkinchisi birinchisining yozuvini KO'RIB, `history` boshqacha
    // bo'lardi va paritet SOXTA farq ko'rsatardi.
    T.section('yozish (bulkRecord)');

    // ⚠ IKKALASI HAM `<G_WRITE>` belgisiga tushadi.
    const gWriteE = await mkGroup('we', A.id, null, '<G_WRITE>');
    const gWriteN = await mkGroup('wn', A.id, null, '<G_WRITE>');
    await mkMember(gWriteE.id, s1.id);
    await mkMember(gWriteE.id, s2.id);
    await mkMember(gWriteN.id, s1.id);
    await mkMember(gWriteN.id, s2.id);
    const gWrite = (b) => (b === EXPRESS ? gWriteE.id : gWriteN.id);

    await T.both('POST /groups/:id/bulk → 201', (b) =>
        request(b, 'POST', `/api/attendance/groups/${gWrite(b)}/bulk`, {
        token: ownerToken,
        body: {
          date: D,
          items: [
            { studentId: s1.id, status: 'present', lateMinutes: 5 },
            { studentId: s2.id, status: 'absent', reason: 'kasal' },
          ],
        },
      }), subs, seen);

    // Qayta belgilash — audit tarixiga yangi qator qo'shiladi.
    await T.both('POST /bulk (qayta belgilash — status o\'zgardi)', (b) =>
        request(b, 'POST', `/api/attendance/groups/${gWrite(b)}/bulk`, {
        token: ownerToken,
        body: { date: D, items: [{ studentId: s2.id, status: 'excused' }] },
      }), subs, seen);

    // ⚠ AYNI status — tarixga YANGI qator QO'SHILMASLIGI kerak.
    await T.both("POST /bulk (ayni status — tarix o'smaydi)", (b) =>
        request(b, 'POST', `/api/attendance/groups/${gWrite(b)}/bulk`, {
        token: ownerToken,
        body: { date: D, items: [{ studentId: s2.id, status: 'excused' }] },
      }), subs, seen);

    await T.both('GET /groups/:id (yozgandan keyin)', (b) =>
        request(b, 'GET', `/api/attendance/groups/${gWrite(b)}?date=${D}`,
        { token: ownerToken }), subs, seen);
    await T.both('GET /groups/:id/summary (yozgandan keyin)', (b) =>
        request(b, 'GET',
        `/api/attendance/groups/${gWrite(b)}/summary?fromDate=${rangeFrom}&toDate=${rangeTo}`,
        { token: ownerToken }), subs, seen);

    // ── VALIDATSIYA SHOXLARI ──
    T.section('yozish validatsiyasi');

    for (const [name, body] of [
      ['kelajak kun → 400', { date: future, items: [{ studentId: s1.id, status: 'present' }] }],
      ['dars kuni emas → 400', { date: tuesday, items: [{ studentId: s1.id, status: 'present' }] }],
      ["bo'sh items → 400", { date: D, items: [] }],
      ['takroriy studentId → 400', { date: D, items: [
        { studentId: s1.id, status: 'present' }, { studentId: s1.id, status: 'absent' }] }],
      ["noto'g'ri status → 400", { date: D, items: [{ studentId: s1.id, status: 'xato' }] }],
      // ⚠ A-2: ISO instant YOZUVDA rad etiladi (o'qishda qabul qilinadi).
      ['ISO sana → 400 (A-2 himoyasi)', {
        date: '2026-07-13T20:30:00.000Z',
        items: [{ studentId: s1.id, status: 'present' }] }],
      ['lateMinutes > 600 → 400', { date: D, items: [
        { studentId: s1.id, status: 'present', lateMinutes: 999 }] }],
    ]) {
      await T.both(`POST /bulk (${name})`, (b) =>
        request(b, 'POST', `/api/attendance/groups/${gWrite(b)}/bulk`,
          { token: ownerToken, body }), subs, seen);
    }

    // A'zo BO'LMAGAN o'quvchi.
    const stranger = await mkUser('stranger', 'student');
    await T.both("POST /bulk (a'zo emas → 400)", (b) =>
        request(b, 'POST', `/api/attendance/groups/${gWrite(b)}/bulk`, {
        token: ownerToken,
        body: { date: D, items: [{ studentId: stranger.id, status: 'present' }] },
      }), subs, seen);

    // ═════════════════ O'QITUVCHI DAVOMATI ═════════════════
    T.section("o'qituvchi davomati");

    await T.both('POST /groups/:id/teacher (kelmadi) → 200', (b) =>
        request(b, 'POST', `/api/attendance/groups/${gWrite(b)}/teacher`,
        { token: ownerToken, body: { date: D, present: false } }), subs, seen);
    await T.both('GET /groups/:id/teacher (kelmadi ko\'rinadi)', (b) =>
        request(b, 'GET', `/api/attendance/groups/${gWrite(b)}/teacher?date=${D}`,
        { token: ownerToken }), subs, seen);
    await T.both('POST /groups/:id/teacher (keldi) → 200', (b) =>
        request(b, 'POST', `/api/attendance/groups/${gWrite(b)}/teacher`,
        { token: ownerToken, body: { date: D, present: true } }), subs, seen);
    await T.both('POST /teacher (kelajak → 400)', (b) =>
        request(b, 'POST', `/api/attendance/groups/${gWrite(b)}/teacher`,
        { token: ownerToken, body: { date: future, present: false } }), subs, seen);
    await T.both('POST /teacher (dars kuni emas → 400)', (b) =>
        request(b, 'POST', `/api/attendance/groups/${gWrite(b)}/teacher`,
        { token: ownerToken, body: { date: tuesday, present: false } }), subs, seen);

    // ═════════════════ KO'LAM (attendanceScope) ═════════════════
    T.section("ko'lam: o'qituvchi");

    // ⚠ MUSBAT NAZORAT avval: o'qituvchi O'Z guruhini KO'RADI.
    const posT = await T.both("MUSBAT NAZORAT: o'qituvchi O'Z guruhini ko'radi", (b) =>
        request(b, 'GET', `/api/attendance/groups/${gMain.id}?date=${D}`,
        { token: teacherToken }), subs, seen);

    if (posT.e?.status !== 200) {
      T.skip("o'qituvchi ko'lami", 'musbat nazorat 200 bermadi');
    } else {
      await T.both("o'qituvchi BEGONA guruhni ko'ra olmaydi → 403", (b) =>
        request(b, 'GET', `/api/attendance/groups/${gOther.id}?date=${D}`,
          { token: teacherToken }), subs, seen);
      await T.both("o'qituvchi BEGONA guruhga yoza olmaydi → 403", (b) =>
        request(b, 'POST', `/api/attendance/groups/${gOther.id}/bulk`, {
          token: teacherToken,
          body: { date: D, items: [{ studentId: s1.id, status: 'present' }] },
        }), subs, seen);
      await T.both("o'qituvchida `attendance.manage` yo'q → dashboard 403", (b) =>
        request(b, 'GET',
          `/api/attendance/dashboard?fromDate=${rangeFrom}&toDate=${rangeTo}`,
          { token: teacherToken }), subs, seen);
      await T.both("o'qituvchi `teacher` belgisini o'zgartira olmaydi → 403", (b) =>
        request(b, 'POST', `/api/attendance/groups/${gMain.id}/teacher`,
          { token: teacherToken, body: { date: D, present: false } }), subs, seen);
    }

    // ═══ A-1: CROSS-GROUP DISCLOSURE (scopeGroupIds) ═══
    //
    // ⚠ ENG NOZIK TEKSHIRUV. `s1` IKKI guruhda: `gMain` (teacher
    // o'qitadi) va `gOther` (BEGONA). O'qituvchi `s1` ning oylik
    // davomatini so'rasa, javobda FAQAT `gMain` bo'lishi shart.
    T.section('A-1: cross-group disclosure (scopeGroupIds)');

    const sm = await T.both("o'qituvchi s1 ning oylik davomatini ko'radi", (b) =>
        request(b, 'GET',
        `/api/attendance/students/${s1.id}/monthly?year=${year}&month=${month}`,
        { token: teacherToken }), subs, seen);

    if (sm.e?.status === 200) {
      const namesOf = (r) => (r.body?.data?.groups || []).map((g) => g.group?.name || '');
      const eNames = namesOf(sm.e);
      const nNames = namesOf(sm.n);
      const okE = eNames.some((n) => n.includes(`${PREFIX}main`))
        && !eNames.some((n) => n.includes(`${PREFIX}other`));
      const okN = nNames.some((n) => n.includes(`${PREFIX}main`))
        && !nNames.some((n) => n.includes(`${PREFIX}other`));
      if (okE && okN) {
        T.ok(`scopeGroupIds ISHLADI: faqat o'z guruhi ko'rindi (${eNames.length} guruh)`);
      } else {
        T.bad('A-1 cross-group disclosure',
          `express=[${eNames}] nest=[${nNames}] — BEGONA guruh ko'rinmasligi kerak`);
      }
    } else {
      T.skip('A-1 tekshiruvi', `oylik so'rov ${sm.e?.status} qaytardi`);
    }

    T.section("ko'lam: o'quvchi");

    const posS = await T.both("MUSBAT NAZORAT: o'quvchi O'ZINI ko'radi", (b) =>
        request(b, 'GET',
        `/api/attendance/students/${s1.id}/summary?fromDate=${rangeFrom}&toDate=${rangeTo}`,
        { token: s1Token }), subs, seen);
    if (posS.e?.status !== 200) {
      T.skip("o'quvchi ko'lami", 'musbat nazorat 200 bermadi');
    } else {
      await T.both("o'quvchi BOSHQANI ko'ra olmaydi → 403", (b) =>
        request(b, 'GET',
          `/api/attendance/students/${s2.id}/summary?fromDate=${rangeFrom}&toDate=${rangeTo}`,
          { token: s1Token }), subs, seen);
      await T.both("o'quvchi guruh varag'ini ko'ra olmaydi → 403", (b) =>
        request(b, 'GET', `/api/attendance/groups/${gMain.id}?date=${D}`,
          { token: s1Token }), subs, seen);
      await T.both("o'quvchi davomat yoza olmaydi → 403", (b) =>
        request(b, 'POST', `/api/attendance/groups/${gMain.id}/bulk`, {
          token: s2Token,
          body: { date: D, items: [{ studentId: s2.id, status: 'present' }] },
        }), subs, seen);
    }

    T.section("ko'lam: filial (xodim)");

    try {
      const adminA = await actor('qa_admin_a');
      const posA = await T.both("MUSBAT NAZORAT: qa_admin_a A guruhini ko'radi", (b) =>
        request(b, 'GET', `/api/attendance/groups/${gMain.id}?date=${D}`,
          { token: adminA }), subs, seen);
      if (posA.e?.status !== 200) {
        T.skip("filial ko'lami", 'musbat nazorat 200 bermadi');
      } else {
        await T.both("qa_admin_a B filial guruhini ko'ra olmaydi → 403", (b) =>
        request(b, 'GET', `/api/attendance/groups/${gB.id}?date=${D}`,
            { token: adminA }), subs, seen);
      }
    } catch (err) {
      T.skip("filial ko'lami", err.message);
    }

    // ═══════════ KETMA-KET QOLDIRISH: XABAR YUBORILMAYDI ═══════════
    //
    // ⚠ EXPRESS'DA `consecutiveAbsences()` HAR DOIM YIQILADI (Prisma'ga
    // Mongo filtri uzatiladi) — ya'ni ogohlantirish HECH QACHON
    // yuborilmaydi. NestJS ham AYNAN shunday xatti-harakat qiladi.
    // Bu yerda AYNAN shuni o'lchaymiz: 3 marta ketma-ket "absent"
    // dan keyin ham `notifications` jadvali O'SMAYDI.
    T.section('ketma-ket qoldirish → xabar YUBORILMAYDI (hujjatlangan xato)');

    const notifBefore = await prisma.notification.count();
    for (let w = 3; w >= 1; w -= 1) {
      const d = iso(new Date(lastMonday.getTime() - w * 7 * 864e5));
      for (const b of [EXPRESS, NEST]) {
        await request(b, 'POST', `/api/attendance/groups/${gWrite(b)}/bulk`, {
          token: ownerToken,
          body: { date: d, items: [{ studentId: s1.id, status: 'absent' }] },
        });
      }
    }
    await new Promise((r) => setTimeout(r, 600)); // fon amali uchun
    const notifAfter = await prisma.notification.count();
    if (notifAfter === notifBefore) {
      T.ok(`ogohlantirish yuborilmadi (ikkala stekda ham) — ${notifBefore} → ${notifAfter}`);
    } else {
      T.bad('ketma-ket qoldirish xabari',
        `notifications ${notifBefore} → ${notifAfter}: bir stek xabar yubordi, ` +
        'ya\'ni xatti-harakat AJRALDI');
    }

    // ═══════════════════════════════════════════════════════════════
    // ⚠⚠ NEGATIV NAZORAT — QO'RIQCHINI ATAYLAB CHETLAB O'TAMIZ ⚠⚠
    //
    // Yuqoridagi 403 lar "qo'riqchi ishlayapti" deb ko'rsatadi. Lekin
    // agar TESTNING O'ZI noto'g'ri yozilgan bo'lsa (masalan token
    // yaroqsiz), ular ham 403 berardi va biz farqni sezmasdik.
    //
    // Shuning uchun: o'qituvchini BEGONA guruhga BIRIKTIRAMIZ va
    // o'sha so'rov endi 200 berishini talab qilamiz. Bermasa — 403
    // ruxsatdan emas, BOSHQA sababdan kelgan va yuqoridagi
    // tekshiruvlar hech narsani isbotlamagan.
    // ═══════════════════════════════════════════════════════════════
    T.section("NEGATIV NAZORAT: qo'riqchini chetlab o'tish");

    const before = await request(EXPRESS, 'GET',
      `/api/attendance/groups/${gOther.id}?date=${D}`, { token: teacherToken });

    // Qo'riqchi shartini O'ZGARTIRAMIZ: teacher endi gOther da ham bor.
    await prisma.group.update({
      where: { id: gOther.id },
      data: { teachers: { connect: [{ id: teacher.id }] } },
    });

    const afterE = await request(EXPRESS, 'GET',
      `/api/attendance/groups/${gOther.id}?date=${D}`, { token: teacherToken });
    const afterN = await request(NEST, 'GET',
      `/api/attendance/groups/${gOther.id}?date=${D}`, { token: teacherToken });

    if (before.status === 403 && afterE.status === 200 && afterN.status === 200) {
      T.ok(
        "qo'riqchi HAQIQATAN o'lchandi: biriktirilmagan → 403, " +
        'biriktirilgan → 200 (ikkala stekda ham)',
      );
    } else {
      T.bad(
        "negativ nazorat",
        `403→200 o'tishi kuzatilmadi (oldin=${before.status}, ` +
        `express=${afterE.status}, nest=${afterN.status}). ` +
        "Yuqoridagi barcha 403 tekshiruvlari SHUBHALI.",
      );
    }

    // Qo'riqchi shartini QAYTA TIKLAYMIZ.
    await prisma.group.update({
      where: { id: gOther.id },
      data: { teachers: { disconnect: [{ id: teacher.id }] } },
    });
    const restored = await request(EXPRESS, 'GET',
      `/api/attendance/groups/${gOther.id}?date=${D}`, { token: teacherToken });
    if (restored.status === 403) T.ok("qo'riqchi sharti qayta tiklandi (403)");
    else T.bad("qo'riqchi tiklanmadi", `status=${restored.status}`);
  } catch (err) {
    T.bad('kutilmagan xato', err.stack || err.message);
  } finally {
    // ═════════════════════ TOZALASH (FK tartibida) ═════════════════════
    const gid = { in: made.groups };
    await prisma.attendance.deleteMany({ where: { groupId: gid } });
    await prisma.teacherAbsence.deleteMany({ where: { groupId: gid } });
    await prisma.groupMembership.deleteMany({ where: { groupId: gid } });
    await prisma.teacherGroupPeriod.deleteMany({ where: { groupId: gid } });
    await prisma.groupScheduleItem.deleteMany({ where: { groupId: gid } });
    for (const g of made.groups) {
      await prisma.group.update({
        where: { id: g }, data: { teachers: { set: [] } },
      }).catch(() => {});
    }
    const gone = await prisma.group.deleteMany({ where: { id: gid } });
    await prisma.userBranchAssignment.deleteMany({ where: { userId: { in: made.users } } });
    const goneU = await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    console.log(`\n  🧹 tozalandi: ${gone.count} guruh, ${goneU.count} foydalanuvchi`);

    // ── BAZA DRIFTI: boshlang'ich holatga qaytdikmi ──
    const after = {
      attendance: await prisma.attendance.count(),
      teacherAbsence: await prisma.teacherAbsence.count(),
      notifications: await prisma.notification.count(),
    };
    const drift = Object.keys(baseline)
      .filter((k) => baseline[k] !== after[k])
      .map((k) => `${k}: ${baseline[k]} → ${after[k]}`);
    if (drift.length === 0) T.ok('baza drifti YO\'Q (attendance, teacherAbsence, notifications)');
    else T.bad('BAZA DRIFTI', drift.join(', '));

    await prisma.$disconnect();
  }

  process.exit(T.finish());
};

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
