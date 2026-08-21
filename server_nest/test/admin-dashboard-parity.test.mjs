/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 9 — RAHBARIYAT PANELI PARITETI (6/6 marshrut).
 *
 * ── ⚠ HISOB-KITOBLAR AYNAN SOLISHTIRILADI ──
 *
 * Bu modul faqat O'QIYDI, lekin uning javoblari RAQAM: davomat foizi,
 * kirim/chiqim, kohortalar, o'rtacha va MEDIANA davomiylik. Shuning
 * uchun tanalar TO'LIQ (chuqur) solishtiriladi — bitta bucket
 * chegarasi siljisa ham test yiqiladi.
 *
 * ⚠ VAQTGA BOG'LIQ MAYDONLAR OLIB TASHLANMAYDI. `todayAttendanceRate`,
 * `weekdayActivity`, `enrollmentTrend` — hammasi "hozir" ga tayanadi,
 * lekin ikkala so'rov millisekundlar farqi bilan ketadi va BIR XIL
 * bazani o'qiydi. Ularni "beqaror" deb chiqarib tashlash aynan eng
 * qiziq hisobni o'lchovsiz qoldirardi.
 *
 * ── ⚠ B24: `/retention` VA `/churned-students` DA FILIAL KO'LAMI YO'Q ──
 *
 * Bu Express'dagi MAVJUD kamchilik (qo'shni servislarda ko'lam bor,
 * bu ikkitasida yo'q). Ko'chirishda TUZATILMADI — aks holda NestJS
 * Express'dan boshqa natija qaytarib, paritet ataylab buzilardi.
 *
 * Test uni "ko'lam ishlayapti" deb EMAS, "MA'LUM SIZISH" deb
 * belgilaydi va `overview` bilan YONMA-YON qo'yadi: birinchisi
 * ko'lamni qo'llaydi, ikkinchisi yo'q. Shunda farq o'lchangan bo'ladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import prisma from '../../server/src/config/prisma.js';

const EXPRESS = process.env.EXPRESS_URL || 'http://127.0.0.1:5000';
const NEST = process.env.NEST_URL || 'http://127.0.0.1:5001';
const PREFIX = '__parity_';

const ESC = String.fromCharCode(27);
const DIM = `${ESC}[2m`;
const BOLD = `${ESC}[1m`;
const OFF = `${ESC}[0m`;

const R = { pass: 0, fail: 0, unmeasured: 0 };
const ok = (n) => { R.pass += 1; console.log(`  ✅ ${n}`); };
const bad = (n, m) => { R.fail += 1; console.log(`  ❌ ${n}\n      ${m}`); };
const skip = (n, m) => { R.unmeasured += 1; console.log(`  ⚠️  ${n} — O'LCHANMADI: ${m}`); };
const note = (m) => console.log(`  ${DIM}ℹ  ${m}${OFF}`);
const head = (t) => console.log(`${DIM}  ── ${t} ──${OFF}`);

const req = async (base, method, path, { token, body } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method, headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
};

// ⚠ FAQAT `stack` chiqariladi. Hisob natijalari ATAYLAB qoldiriladi.
const VOLATILE = new Set(['stack']);

const normalize = (v) => {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (VOLATILE.has(k)) continue;
      out[k] = normalize(val);
    }
    return out;
  }
  return v;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ⚠ LOGIN CHEGARASIGA (429) CHIDAMLI. */
const login = async (base, l, p, { retries = 4 } = {}) => {
  for (let attempt = 0; ; attempt += 1) {
    const r = await req(base, 'POST', '/api/auth/login', { body: { login: l, password: p } });
    if (r.status === 200) return r.body.data.accessToken;
    if (r.status !== 429 || attempt >= retries) {
      throw new Error(`login ${l}: ${r.status} ${JSON.stringify(r.body)}`);
    }
    const waitMs = 30_000 * (attempt + 1);
    console.log(`  ${DIM}⏳ login chegarasi (429) — ${waitMs / 1000}s kutilyapti…${OFF}`);
    await sleep(waitMs);
  }
};

const main = async () => {
  console.log(`\n${BOLD}FAZA 9 — RAHBARIYAT PANELI PARITETI${OFF}\n`);

  const ownerToken = await login(EXPRESS, 'owner', 'owner123');

  const before = {
    users: await prisma.user.count(),
    memberships: await prisma.groupMembership.count(),
    payments: await prisma.paymentTransaction.count(),
  };

  const qa = await prisma.user.findFirst({
    where: { username: 'qa_staff_a' }, select: { id: true, homeBranchId: true },
  });
  if (!qa) { console.log('  ❌ qa_staff_a topilmadi'); process.exit(1); }

  const stamp = String(process.hrtime.bigint()).slice(-9);
  const tempRoles = [];
  let qaRestore = null;

  const both = async (name, fn) => {
    let e, n;
    try { e = await fn(EXPRESS); n = await fn(NEST); }
    catch (err) { skip(name, err.message); return {}; }
    const en = { status: e.status, body: normalize(e.body) };
    const nn = { status: n.status, body: normalize(n.body) };
    try { assert.deepEqual(nn, en); ok(`${name} — ${e.status}`); }
    catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 700)}\n      nest   : ${JSON.stringify(nn).slice(0, 700)}`);
    }
    return { e, n };
  };

  const useRole = async (label, permissionKeys) => {
    const matrix = await req(EXPRESS, 'GET', '/api/roles/matrix', { token: ownerToken });
    const ids = [];
    for (const m of matrix.body.data.modules) {
      for (const cell of Object.values(m.cells)) {
        if (permissionKeys.includes(cell.key)) ids.push(cell.id);
      }
    }
    if (ids.length !== permissionKeys.length) {
      throw new Error(`ruxsat topilmadi (${ids.length}/${permissionKeys.length})`);
    }
    const r = await req(EXPRESS, 'POST', '/api/roles', {
      token: ownerToken, body: { label: `${PREFIX}${label}${stamp}`, permissionIds: ids },
    });
    if (r.status !== 201) throw new Error(`rol yaratilmadi: ${r.status}`);
    const value = r.body.data.value;
    tempRoles.push(value);

    if (!qaRestore) {
      const full = await req(EXPRESS, 'GET', `/api/users/${qa.id}`, { token: ownerToken });
      qaRestore = {
        role: full.body.data.role,
        homeBranchId: full.body.data.homeBranchId,
        branchAssignments: (full.body.data.branchAssignments || []).map((a) => ({
          branchId: a.branchId, role: a.role,
        })),
      };
    }
    await req(EXPRESS, 'PATCH', `/api/users/${qa.id}/role`, {
      token: ownerToken, body: { role: value },
    });
    await req(EXPRESS, 'PATCH', `/api/users/${qa.id}/branches`, {
      token: ownerToken,
      body: {
        homeBranchId: qaRestore.homeBranchId,
        branchAssignments: qaRestore.branchAssignments.map((a) => ({
          branchId: a.branchId, role: value,
        })),
      },
    });
    const pw = await req(EXPRESS, 'GET', `/api/users/${qa.id}/password`, { token: ownerToken });
    if (pw.status !== 200) throw new Error("parol o'qilmadi");
    return login(EXPRESS, pw.body.data.username, pw.body.data.password);
  };

  /** ⚠ TIKLASH API'GA TAYANMAYDI. */
  const restoreQa = async () => {
    if (!qaRestore) return;
    await prisma.user.update({
      where: { id: qa.id },
      data: { role: qaRestore.role, homeBranchId: qaRestore.homeBranchId },
    });
    for (const a of qaRestore.branchAssignments) {
      await prisma.userBranchAssignment.updateMany({
        where: { userId: qa.id, branchId: a.branchId },
        data: { role: a.role },
      });
    }
  };

  try {
    // ═══════════════ HISOB-KITOBLAR (owner) ═══════════════
    head('hisob-kitoblar — tanalar AYNAN solishtiriladi');

    const nowY = new Date().getUTCFullYear();
    const nowM = new Date().getUTCMonth() + 1;

    for (const q of [
      '', `?year=${nowY}&month=${nowM}`, `?year=${nowY}&month=1`,
      `?year=${nowY - 1}&month=12`,
    ]) {
      await both(`GET /overview${q}`, (b) =>
        req(b, 'GET', `/api/admin-dashboard/overview${q}`, { token: ownerToken }));
    }

    for (const q of ['', '?months=1', '?months=6', '?months=12', '?months=24']) {
      await both(`GET /student-flow${q}`, (b) =>
        req(b, 'GET', `/api/admin-dashboard/student-flow${q}`, { token: ownerToken }));
    }

    // ⚠ CASHFLOW — uchala diapazon + davr tanlash.
    for (const q of [
      '', '?range=week', '?range=month', '?range=year',
      `?range=month&year=${nowY}&month=1`,
      `?range=year&year=${nowY - 1}`,
      // ⚠ `range=week` da `year`/`month` ATAYLAB e'tiborsiz qoladi.
      `?range=week&year=${nowY - 1}&month=3`,
    ]) {
      await both(`GET /cashflow${q}`, (b) =>
        req(b, 'GET', `/api/admin-dashboard/cashflow${q}`, { token: ownerToken }));
    }

    for (const q of ['', '?months=1', '?months=24', '?recentLimit=1', '?recentLimit=50',
                     '?months=6&recentLimit=3']) {
      await both(`GET /student-stats${q}`, (b) =>
        req(b, 'GET', `/api/admin-dashboard/student-stats${q}`, { token: ownerToken }));
    }

    for (const q of ['', '?fromDate=2020-01-01', '?toDate=2030-01-01',
                     '?fromDate=2020-01-01&toDate=2030-01-01',
                     '?fromDate=2099-01-01']) {
      await both(`GET /retention${q}`, (b) =>
        req(b, 'GET', `/api/admin-dashboard/retention${q}`, { token: ownerToken }));
      await both(`GET /churned-students${q}`, (b) =>
        req(b, 'GET', `/api/admin-dashboard/churned-students${q}`, { token: ownerToken }));
    }

    // ⚠ MUSBAT NAZORAT: javoblar BO'SH EMAS — aks holda yuqoridagi
    // solishtiruvlar "ikkalasi ham nol qaytardi" bo'lardi.
    const ov = await req(EXPRESS, 'GET', '/api/admin-dashboard/overview', { token: ownerToken });
    const ret = await req(EXPRESS, 'GET', '/api/admin-dashboard/retention', { token: ownerToken });
    const ss = await req(EXPRESS, 'GET', '/api/admin-dashboard/student-stats', { token: ownerToken });
    try {
      assert.ok(ov.body.data.studentsCount > 0, "overview.studentsCount = 0");
      assert.ok(ret.body.data.totalChurned > 0, 'retention.totalChurned = 0');
      assert.ok(ss.body.data.activeCount > 0, 'studentStats.activeCount = 0');
      assert.ok(Array.isArray(ov.body.data.weekdayActivity) && ov.body.data.weekdayActivity.length === 7);
      ok(`MUSBAT NAZORAT: o'quvchi=${ov.body.data.studentsCount}, churn=${ret.body.data.totalChurned}, faol=${ss.body.data.activeCount}`);
    } catch (err) { bad("bo'sh javob", err.message); }

    // ⚠ DAVOMAT MAXRAJI TA'RIFI: present + late + absent
    // (`exempt`/`excused` TASHQARIDA). Bu yagona ta'rif va u
    // o'zgartirilsa butun tizim foizi siljirdi.
    const g = ov.body.data.attendanceGauge;
    try {
      assert.equal(g.total, g.present + g.late + g.absent, 'maxraj ta\'rifi buzilgan');
      if (g.total > 0) {
        assert.equal(g.rate, Math.round(((g.present + g.late) / g.total) * 100));
        ok(`davomat maxraji: ${g.present}+${g.late}+${g.absent} = ${g.total}, foiz=${g.rate}`);
      } else {
        // ⚠ HALOLLIK: bugun davomat yozuvi YO'Q, ya'ni FOIZ FORMULASI
        // o'lchanmadi — faqat "maxraj 0 → rate null" shoxi tekshirildi.
        // Buni "formula to'g'ri" deb ko'rsatish yolg'on bo'lardi.
        assert.equal(g.rate, null, "maxraj 0 bo'lsa rate null bo'lishi kerak");
        ok('davomat: maxraj 0 → foiz null (to\'g\'ri shox)');
        note(
          "bugun davomat yozuvi YO'Q — foiz FORMULASI o'lchanmadi. " +
            'Ikkala stek baribir bir xil javob berdi (yuqoridagi `GET /overview` solishtiruvi).',
        );
      }
    } catch (err) { bad('davomat maxraji', err.message); }

    // ⚠ SANA CHEGARASI: `?month=1` javobda AYNAN o'sha davrni
    // qaytarishi kerak (UTC oy chegarasi).
    const jan = await req(EXPRESS, 'GET',
      `/api/admin-dashboard/overview?year=${nowY}&month=1`, { token: ownerToken });
    try {
      assert.deepEqual(jan.body.data.period, { year: nowY, month: 1 });
      ok('davr tanlash: `period` so\'ralgan oyni AYNAN qaytardi');
    } catch (err) { bad('davr tanlash', err.message); }

    // ⚠ CASHFLOW BUCKET SONI: yil → 12, oy → o'sha oy kunlari soni.
    const cfYear = await req(EXPRESS, 'GET',
      `/api/admin-dashboard/cashflow?range=year&year=${nowY}`, { token: ownerToken });
    const cfJan = await req(EXPRESS, 'GET',
      `/api/admin-dashboard/cashflow?range=month&year=${nowY}&month=1`, { token: ownerToken });
    const cfWeek = await req(EXPRESS, 'GET',
      '/api/admin-dashboard/cashflow?range=week', { token: ownerToken });
    try {
      assert.equal(cfYear.body.data.buckets.length, 12, 'yil 12 ta bucket emas');
      assert.equal(cfJan.body.data.buckets.length, 31, 'yanvar 31 kun emas');
      assert.equal(cfWeek.body.data.buckets.length, 7, 'hafta 7 kun emas');
      ok('cashflow bucketlari: yil=12, yanvar=31, hafta=7');
    } catch (err) { bad('cashflow bucketlari', err.message); }

    // ── VALIDATSIYA ──
    await both('GET /overview?month=13 → 400', (b) =>
      req(b, 'GET', '/api/admin-dashboard/overview?month=13', { token: ownerToken }));
    await both('GET /overview?year=1999 → 400', (b) =>
      req(b, 'GET', '/api/admin-dashboard/overview?year=1999', { token: ownerToken }));
    await both('GET /student-flow?months=25 → 400', (b) =>
      req(b, 'GET', '/api/admin-dashboard/student-flow?months=25', { token: ownerToken }));
    await both('GET /student-flow?months=0 → 400', (b) =>
      req(b, 'GET', '/api/admin-dashboard/student-flow?months=0', { token: ownerToken }));
    await both('GET /cashflow?range=__yoq__ → 400', (b) =>
      req(b, 'GET', '/api/admin-dashboard/cashflow?range=__yoq__', { token: ownerToken }));
    await both('GET /student-stats?recentLimit=51 → 400', (b) =>
      req(b, 'GET', '/api/admin-dashboard/student-stats?recentLimit=51', { token: ownerToken }));
    await both("GET /overview (token yo'q → 401)", (b) =>
      req(b, 'GET', '/api/admin-dashboard/overview'));

    // ═══════════════ RUXSAT ═══════════════
    head('ruxsat chegarasi (`admin_dashboard.read`)');

    let scopedToken = null;
    try {
      // Avval RUXSATSIZ aktyor — 403 kutiladi.
      const pw = await req(EXPRESS, 'GET', `/api/users/${qa.id}/password`, { token: ownerToken });
      if (pw.status !== 200) throw new Error("parol o'qilmadi");
      const plain = await login(EXPRESS, pw.body.data.username, pw.body.data.password);

      // ⚠ MUSBAT NAZORAT: aktyor TIRIK — boshqa auth'langan manzilga
      // kiradi, ya'ni pastdagi 403 "token yaroqsiz" degani emas.
      const alive = await req(EXPRESS, 'GET', '/api/notifications/inbox', { token: plain });
      if (alive.status !== 200) throw new Error(`aktyor tirik emas: ${alive.status}`);
      await both("MUSBAT NAZORAT: aktyor boshqa manzilga KIRADI → 200", (b) =>
        req(b, 'GET', '/api/notifications/inbox', { token: plain }));

      for (const p of ['overview', 'student-flow', 'cashflow', 'student-stats',
                       'retention', 'churned-students']) {
        await both(`ruxsat yo'q → GET /${p} 403`, (b) =>
          req(b, 'GET', `/api/admin-dashboard/${p}`, { token: plain }));
      }

      // ── FILIAL KO'LAMI ──
      scopedToken = await useRole('dashread', ['admin_dashboard.read']);

      // MUSBAT NAZORAT: ruxsat berilgach 200.
      await both("MUSBAT NAZORAT: `admin_dashboard.read` bilan → 200", (b) =>
        req(b, 'GET', '/api/admin-dashboard/overview', { token: scopedToken }));

      const ownerOv = await req(EXPRESS, 'GET', '/api/admin-dashboard/overview', {
        token: ownerToken,
      });
      const scopedOvE = await req(EXPRESS, 'GET', '/api/admin-dashboard/overview', {
        token: scopedToken,
      });
      const scopedOvN = await req(NEST, 'GET', '/api/admin-dashboard/overview', {
        token: scopedToken,
      });

      // ⚠ KO'LAM HAQIQATAN KESYAPTIMI — HAR IKKALA STEKDA ALOHIDA
      // o'lchanadi. Faqat Express tekshirilsa, NestJS'dagi ko'lam
      // yo'qolishi faqat "tana farq qiladi" bo'lib ko'rinardi — ya'ni
      // XAVFSIZLIK xatosi oddiy nomuvofiqlik bo'lib o'qilardi.
      for (const [label, res] of [['express', scopedOvE], ['nest', scopedOvN]]) {
        try {
          assert.ok(
            res.body.data.activeGroupsCount < ownerOv.body.data.activeGroupsCount,
            `${label}: ko'lam KESMADI — scoped=${res.body.data.activeGroupsCount} ` +
              `owner=${ownerOv.body.data.activeGroupsCount}`,
          );
          ok(
            `${label}: overview KO'LAMNI QO'LLAYDI — guruh ` +
              `${res.body.data.activeGroupsCount} < ${ownerOv.body.data.activeGroupsCount}`,
          );
        } catch (err) { bad(`${label} overview ko'lami`, err.message); }
      }

      // Paritet: ko'lamli aktyor uchun ikkala stek bir xil.
      try {
        assert.deepEqual(normalize(scopedOvN.body), normalize(scopedOvE.body));
        ok("ko'lamli aktyor uchun overview IKKALA stekda bir xil");
      } catch {
        bad("ko'lamli overview pariteti",
          `express: ${JSON.stringify(normalize(scopedOvE.body)).slice(0, 500)}\n      nest   : ${JSON.stringify(normalize(scopedOvN.body)).slice(0, 500)}`);
      }

      for (const p of ['student-flow', 'cashflow', 'student-stats']) {
        await both(`ko'lamli aktyor: GET /${p}`, (b) =>
          req(b, 'GET', `/api/admin-dashboard/${p}`, { token: scopedToken }));
      }

      // ═══════════════════════════════════════════════════════════
      // ⚠⚠ B24 — MA'LUM SIZISH, "KO'LAM ISHLAYAPTI" EMAS
      //
      // `/retention` va `/churned-students` filial filtrini UMUMAN
      // qo'llamaydi. Bu Express'dagi mavjud kamchilik va u
      // ko'chirishda ATAYLAB tuzatilmadi (aks holda paritet buzilardi).
      //
      // Quyida ko'lamli aktyor va owner AYNAN BIR XIL natija olishi
      // TASDIQLANADI — ya'ni sizish HUJJATLASHTIRILGAN holatda.
      // Yuqoridagi `overview` esa ko'lamni QO'LLAYDI — farq shu.
      // ═══════════════════════════════════════════════════════════
      head('B24 — `/retention` va `/churned-students` da ko\'lam YO\'Q');

      for (const p of ['retention', 'churned-students']) {
        await both(`ko'lamli aktyor: GET /${p} (paritet)`, (b) =>
          req(b, 'GET', `/api/admin-dashboard/${p}`, { token: scopedToken }));

        const asOwner = await req(EXPRESS, 'GET', `/api/admin-dashboard/${p}`, {
          token: ownerToken,
        });
        const asScoped = await req(EXPRESS, 'GET', `/api/admin-dashboard/${p}`, {
          token: scopedToken,
        });
        try {
          assert.deepEqual(normalize(asScoped.body), normalize(asOwner.body));
          note(
            `B24 TASDIQLANDI: /${p} ko'lamli aktyorga ham OWNER bilan AYNAN ` +
              `bir xil ma'lumot qaytardi (filial filtri YO'Q)`,
          );
          ok(`/${p}: ma'lum sizish QULFLANDI (Express xulqi saqlangan)`);
        } catch (err) {
          // Agar farq chiqsa — demak Express o'zgargan yoki men
          // ko'lam qo'shib qo'yganman. Ikkalasi ham diqqat talab qiladi.
          bad(`/${p} B24 holati o'zgardi`, err.message);
        }
      }

      await restoreQa();
    } catch (err) {
      skip('ruxsat va ko\'lam', err.message);
      await restoreQa().catch(() => {});
    }
  } finally {
    // ═══════════════ TOZALASH ═══════════════
    let cleaned = 0;
    await restoreQa();
    for (const v of tempRoles) {
      const r = await req(EXPRESS, 'DELETE', `/api/roles/${v}`, { token: ownerToken });
      if (r.status === 200) cleaned += 1;
    }
    const forced = await prisma.role.deleteMany({ where: { label: { startsWith: PREFIX } } });
    cleaned += forced.count;
    console.log(`\n  🧹 tozalandi: ${cleaned} ta yozuv`);

    // ⚠ BU MODUL FAQAT O'QIYDI — siljish BO'LMASLIGI kerak.
    const after = {
      users: await prisma.user.count(),
      memberships: await prisma.groupMembership.count(),
      payments: await prisma.paymentTransaction.count(),
    };
    try {
      assert.deepEqual(after, before, `siljish: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
      ok(`baza siljimadi (faqat o'qish moduli)`);
    } catch (err) { bad('BAZA SILJIDI', err.message); }

    if (qaRestore) {
      const now = await prisma.user.findUnique({
        where: { id: qa.id },
        select: { role: true, branchAssignments: { select: { role: true } } },
      });
      try {
        assert.equal(now.role, qaRestore.role);
        assert.ok(now.branchAssignments.every((a) => !String(a.role || '').startsWith('parity-')));
        ok('fixture roli va birikmalari tiklandi (bazadan tasdiqlandi)');
      } catch (err) { bad('fixture tiklanmadi', err.message); }
    }

    await prisma.$disconnect();
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
  process.exit(R.fail || R.unmeasured ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
