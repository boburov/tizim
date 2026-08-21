/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 10 — BILDIRISHNOMALAR MODULI PARITETI (Express 5000 ↔ NestJS 5001).
 *
 * ⚠⚠ ENG MUHIM XAVFSIZLIK QOIDASI: HAQIQIY ODAMGA XABAR YUBORILMAYDI ⚠⚠
 *
 * Bu modul HAQIQIY o'quvchilarga Telegram xabar yuboradi. Shuning uchun:
 *
 *   1. YOZISH SINOVLARI FAQAT `channels: ["inapp"]` bilan. `telegram`
 *      tanlanmasa `materializeRecipients` bot yetkazishni NAVBATGA
 *      QO'YMAYDI — ya'ni Telegram'ga hech narsa ketmaydi. Bu taxmin
 *      emas: shart `channels.includes("telegram")` va u ochiq kodda.
 *   2. AUDITORIYA — FAQAT BITTA aniq QA foydalanuvchisi
 *      (`type: "individual"`). `all_students` bilan YOZISH sinalmaydi:
 *      u 818 ta o'quvchiga pochta yaratardi.
 *   3. `all_students` faqat `POST /preview` da sinaladi — u xabar ham,
 *      oluvchi ham YARATMAYDI (faqat sanaydi).
 *
 * ── BAZA GIGIYENASI ──
 *
 * Yaratilgan har bir xabar va uning oluvchilari `finally` da QATTIQ
 * o'chiriladi (yumshoq o'chirish bu modelda YO'Q). Yakunda jadval
 * hisoblari boshlang'ich holat bilan solishtiriladi — siljish bo'lsa
 * test YIQILADI.
 *
 * ── MUSBAT NAZORATLAR ──
 *
 * Har bir "403 bo'lishi kerak" tekshiruvining yonida AYNAN O'SHA aktyor
 * uchun 200 beradigan yo'l ham o'lchanadi. Aks holda aktyor umuman kira
 * olmasa hamma javob 403 bo'lardi, ikkala stek "bir xil" chiqardi va
 * test hech narsa o'lchamasdan YASHIL bo'lardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import prisma from '../../server_legacy/src/config/prisma.js';

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

const VOLATILE = new Set(['createdAt', 'updatedAt', 'sentAt', 'readAt', 'stack', 'scheduleAt']);

const normalize = (v, subs) => {
  if (Array.isArray(v)) return v.map((x) => normalize(x, subs));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (VOLATILE.has(k)) continue;
      out[k] = normalize(val, subs);
    }
    return out;
  }
  if (typeof v === 'string') {
    let s = v;
    for (const [from, to] of subs) if (from) s = s.split(from).join(to);
    return s;
  }
  return v;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ⚠ LOGIN CHEGARASIGA (429) CHIDAMLI.
 *
 * Express login limiteri 5 daqiqada 20 urinishga ruxsat beradi. Bu test
 * har yurishda bir nechta aktyor uchun token oladi, ya'ni ketma-ket
 * yurishlarda chegara MUQARRAR ravishda ishga tushadi. Chidamlilik
 * bo'lmasa 429 test YIQILISHI bo'lib ko'rinardi — aslida kod bilan
 * bog'liq emas, va bundan ham yomoni, yurish O'RTASIDA uzilib fixture
 * tozalanmay qolardi.
 *
 * Shuning uchun 429 da KUTAMIZ va qayta urinamiz. Boshqa xatolar
 * (401, 400) DARHOL yiqiladi — ular haqiqiy nosozlik.
 */
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

/** Fixture foydalanuvchi uchun token — parol owner huquqi bilan o'qiladi. */
const tokenFor = async (ownerToken, userId) => {
  const pw = await req(EXPRESS, 'GET', `/api/users/${userId}/password`, { token: ownerToken });
  if (pw.status !== 200) throw new Error(`parol o'qilmadi (${userId}): ${pw.status}`);
  return login(EXPRESS, pw.body.data.username, pw.body.data.password);
};

const main = async () => {
  console.log(`\n${BOLD}FAZA 10 — BILDIRISHNOMALAR MODULI PARITETI${OFF}\n`);

  const ownerToken = await login(EXPRESS, 'owner', 'owner123');

  // ── BOSHLANG'ICH SURAT (siljishni o'lchash uchun) ──
  const before = {
    notifications: await prisma.notification.count(),
    recipients: await prisma.notificationRecipient.count(),
  };

  // ── AKTYORLAR ──
  const teacher = await prisma.user.findFirst({
    where: { role: 'teacher', isActive: true, isDeleted: false },
    select: { id: true, homeBranchId: true },
  });
  if (!teacher) { console.log("  ❌ o'qituvchi fixture topilmadi"); process.exit(1); }

  // ⚠ XABAR NISHONI — QA xodimi, HAQIQIY O'QUVCHI EMAS. Uning pochtasi
  // yakunda butunlay tozalanadi.
  const qaTarget = await prisma.user.findFirst({
    where: { username: 'qa_staff_a' },
    select: { id: true, homeBranchId: true },
  });
  if (!qaTarget) { console.log("  ❌ qa_staff_a topilmadi"); process.exit(1); }

  const stamp = String(process.hrtime.bigint()).slice(-9);
  const createdNotifIds = [];
  let scopedRoleValue = null;
  let qaRestore = null;

  /** `qa_staff_a` ning roli va filial birikmalarini TIKLAYDI (idempotent). */
  /**
   * ⚠ TIKLASH API'GA TAYANMAYDI — TO'G'RIDAN-TO'G'RI BAZAGA YOZADI.
   *
   * Tozalash yo'li test yiqilgan sabab bilan BIR XIL sababdan
   * yiqilmasligi kerak. API orqali tiklashda login chegarasi (429) yoki
   * token muddati fixture'ni ELEVATSIYADA qoldirardi — bu bir marta
   * haqiqatan sodir bo'ldi (`qa_staff_a` `roleType:"owner"` li
   * vaqtinchalik rolda qolib ketdi).
   */
  const restoreQa = async () => {
    if (!qaRestore) return;
    await prisma.user.update({
      where: { id: qaTarget.id },
      data: { role: qaRestore.role, homeBranchId: qaRestore.homeBranchId },
    });
    for (const a of qaRestore.branchAssignments) {
      await prisma.userBranchAssignment.updateMany({
        where: { userId: qaTarget.id, branchId: a.branchId },
        data: { role: a.role },
      });
    }
  };

  const both = async (name, fn, subsOf = () => []) => {
    let e, n;
    try { e = await fn(EXPRESS); n = await fn(NEST); }
    catch (err) { skip(name, err.message); return {}; }
    const en = { status: e.status, body: normalize(e.body, subsOf(EXPRESS)) };
    const nn = { status: n.status, body: normalize(n.body, subsOf(NEST)) };
    try { assert.deepEqual(nn, en); ok(`${name} — ${e.status}`); }
    catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 700)}\n      nest   : ${JSON.stringify(nn).slice(0, 700)}`);
    }
    return { e, n };
  };

  try {
    // ═══════════════ MARSHRUT TARTIBI ═══════════════
    //
    // ⚠ ENG NOZIK JOY: `/inbox` va `/stats` `/:id` DAN OLDIN turishi
    // SHART. Aks holda ular xabar ID'si deb o'qilardi va `/:id` ROL
    // to'sig'i ostida bo'lgani uchun O'QUVCHI o'z pochtasiga UMUMAN
    // kira olmasdi. Shuning uchun bu birinchi tekshiriladi.
    head('marshrut tartibi (`/inbox` va `/stats` `/:id` dan oldin)');

    await both('GET /notifications/inbox', (b) =>
      req(b, 'GET', '/api/notifications/inbox?limit=5', { token: ownerToken }));
    await both('GET /notifications/inbox/unread-count', (b) =>
      req(b, 'GET', '/api/notifications/inbox/unread-count', { token: ownerToken }));
    await both('GET /notifications/stats', (b) =>
      req(b, 'GET', '/api/notifications/stats', { token: ownerToken }));

    // ═══════════════ O'QISH ═══════════════
    head("o'qish (ro'yxat, filtr, sahifalash)");

    for (const q of [
      '',
      '?limit=5',
      '?status=sent&limit=5',
      '?status=scheduled&limit=5',
      '?status=canceled&limit=5',
      '?category=announcement&limit=5',
      '?channel=inapp&limit=5',
      '?channel=telegram&limit=5',
      '?search=__yoq__',
      '?page=2&limit=2',
    ]) {
      await both(`GET /notifications${q}`, (b) =>
        req(b, 'GET', `/api/notifications${q}`, { token: ownerToken }));
    }

    // ── VALIDATSIYA CHEGARALARI ──
    await both('GET /notifications?limit=9999 → 400', (b) =>
      req(b, 'GET', '/api/notifications?limit=9999', { token: ownerToken }));
    await both('GET /notifications?status=__yoq__ → 400', (b) =>
      req(b, 'GET', '/api/notifications?status=__yoq__', { token: ownerToken }));
    await both('GET /notifications?category=__yoq__ → 400', (b) =>
      req(b, 'GET', '/api/notifications?category=__yoq__', { token: ownerToken }));

    await both("GET /notifications (token yo'q → 401)", (b) =>
      req(b, 'GET', '/api/notifications'));
    await both("GET /notifications/inbox (token yo'q → 401)", (b) =>
      req(b, 'GET', '/api/notifications/inbox'));
    await both('GET /notifications/:id (404)', (b) =>
      req(b, 'GET', `/api/notifications/${'a'.repeat(24)}`, { token: ownerToken }));
    // ⚠ YORLIQ HAQIQATGA MOS: `getRecipientList` xabar BORLIGINI
    // tekshirmaydi — mavjud bo'lmagan ID uchun BO'SH ro'yxat (200)
    // qaytadi, 404 EMAS. Bu Express xulqi va u AYNAN saqlanadi.
    await both("GET /:id/recipients (mavjud emas → bo'sh ro'yxat, 404 EMAS)", (b) =>
      req(b, 'GET', `/api/notifications/${'a'.repeat(24)}/recipients`, { token: ownerToken }));

    // ═══════════════ PREVIEW — YOZMAYDI ═══════════════
    //
    // `all_students` FAQAT shu yerda sinaladi: preview xabar ham,
    // oluvchi ham yaratmaydi — u faqat sanaydi.
    head('preview (auditoriya qoidalari — hech narsa yozmaydi)');

    for (const [label, audience] of [
      ['all_students', { type: 'all_students' }],
      ['all_teachers', { type: 'all_teachers' }],
      ['individual (qa)', { type: 'individual', userIds: [qaTarget.id] }],
    ]) {
      await both(`POST /preview ${label}`, (b) =>
        req(b, 'POST', '/api/notifications/preview', {
          token: ownerToken, body: { audience },
        }));
    }

    // ⚠ DEDUPLIKATSIYA: bitta ID IKKI MARTA berilsa oluvchi BITTA bo'ladi.
    const dedupe = await both('POST /preview (takroriy ID → dedup)', (b) =>
      req(b, 'POST', '/api/notifications/preview', {
        token: ownerToken,
        body: { audience: { type: 'individual', userIds: [qaTarget.id, qaTarget.id] } },
      }));
    if (dedupe.e?.status === 200) {
      try {
        assert.equal(dedupe.e.body.data.count, 1, 'dublikat ID bitta oluvchiga qisqarishi kerak');
        assert.equal(dedupe.n.body.data.count, 1);
        ok('DEDUPLIKATSIYA: takroriy ID bitta oluvchi (ikkala stekda)');
      } catch (err) { bad('deduplikatsiya', err.message); }
    }

    // ── VALIDATSIYA: bo'sh auditoriya ──
    await both('POST /preview (groups bo\'sh → 400)', (b) =>
      req(b, 'POST', '/api/notifications/preview', {
        token: ownerToken, body: { audience: { type: 'groups', groupIds: [] } },
      }));
    await both("POST /preview (noma'lum tur → 400)", (b) =>
      req(b, 'POST', '/api/notifications/preview', {
        token: ownerToken, body: { audience: { type: '__yoq__' } },
      }));

    // ⚠ `auto_system` HTTP ORQALI QABUL QILINMASLIGI SHART.
    //
    // Bu tur filial ko'lamini ATAYLAB qo'llamaydi (tizim ichidan
    // chaqiriladi). Tashqaridan ochilsa istalgan filial foydalanuvchisiga
    // xabar yuborish yo'li ochilardi — validator uni 400 bilan to'sadi.
    await both("POST /preview (`auto_system` tashqaridan → 400)", (b) =>
      req(b, 'POST', '/api/notifications/preview', {
        token: ownerToken,
        body: { audience: { type: 'auto_system', userIds: [qaTarget.id] } },
      }));
    await both("POST /preview (`feedback_author` tashqaridan → 400)", (b) =>
      req(b, 'POST', '/api/notifications/preview', {
        token: ownerToken,
        body: { audience: { type: 'feedback_author', userIds: [qaTarget.id] } },
      }));

    // ═══════════════ FILIAL KO'LAMI ═══════════════
    //
    // ⚠ ID OCHIQ BERILGANI KO'LAMDAN OZOD QILMAYDI: begona filial
    // foydalanuvchisining ID'si qo'lda kiritilsa u oluvchilar ro'yxatiga
    // TUSHMASLIGI kerak — aks holda uning telefon raqami preview'da
    // ko'rinardi.
    //
    // ⚠ AKTYOR OWNER BO'LMASLIGI SHART: owner barcha filialni ko'radi,
    // ya'ni u bilan ko'lam UMUMAN o'lchanmasdi. `qa_staff_a` aynan
    // BITTA filialga biriktirilgan, lekin unda `notifications.send`
    // yo'q — shuning uchun vaqtincha rol beriladi va yakunda tiklanadi.
    head("filial ko'lami (ochiq ID ham kesiladi)");

    try {
      const sameBranchUser = await prisma.user.findFirst({
        where: {
          isActive: true, isDeleted: false,
          homeBranchId: qaTarget.homeBranchId,
          id: { not: qaTarget.id },
        },
        select: { id: true },
      });
      const foreignUser = await prisma.user.findFirst({
        where: {
          isActive: true, isDeleted: false,
          homeBranchId: { not: qaTarget.homeBranchId },
        },
        select: { id: true, homeBranchId: true },
      });
      if (!sameBranchUser || !foreignUser) {
        throw new Error("bir xil/boshqa filialda foydalanuvchi topilmadi — TAXMIN QILINMADI");
      }

      const matrix = await req(EXPRESS, 'GET', '/api/roles/matrix', { token: ownerToken });
      let sendPermId = null;
      for (const m of matrix.body.data.modules) {
        for (const cell of Object.values(m.cells)) {
          if (cell.key === 'notifications.send') sendPermId = cell.id;
        }
      }
      if (!sendPermId) throw new Error('notifications.send matritsada topilmadi');

      const roleRes = await req(EXPRESS, 'POST', '/api/roles', {
        token: ownerToken,
        body: { label: `${PREFIX}notifsend${stamp}`, permissionIds: [sendPermId] },
      });
      if (roleRes.status !== 201) throw new Error(`rol yaratilmadi: ${roleRes.status}`);
      scopedRoleValue = roleRes.body.data.value;

      // TIKLASH NUQTASI.
      const full = await req(EXPRESS, 'GET', `/api/users/${qaTarget.id}`, { token: ownerToken });
      qaRestore = {
        role: full.body.data.role,
        homeBranchId: full.body.data.homeBranchId,
        branchAssignments: (full.body.data.branchAssignments || []).map((a) => ({
          branchId: a.branchId, role: a.role,
        })),
      };

      // ⚠ ROL IKKALA JOYDA HAM BERILADI. Amaldagi rolni
      // `resolveRoleForBranch` FILIAL BIRIKMASIDAN oladi — faqat
      // `user.role` ni o'zgartirish JIMGINA e'tiborsiz qolardi.
      const a1 = await req(EXPRESS, 'PATCH', `/api/users/${qaTarget.id}/role`, {
        token: ownerToken, body: { role: scopedRoleValue },
      });
      if (a1.status !== 200) throw new Error(`rol biriktirilmadi: ${a1.status}`);
      const a2 = await req(EXPRESS, 'PATCH', `/api/users/${qaTarget.id}/branches`, {
        token: ownerToken,
        body: {
          homeBranchId: qaRestore.homeBranchId,
          branchAssignments: qaRestore.branchAssignments.map((a) => ({
            branchId: a.branchId, role: scopedRoleValue,
          })),
        },
      });
      if (a2.status !== 200) throw new Error(`birikma yangilanmadi: ${a2.status}`);

      const scopedToken = await tokenFor(ownerToken, qaTarget.id);

      // ⚠ MUSBAT NAZORAT O'LCHANADI: o'z filialidagi ID SANALADI (count=1).
      // Bu bo'lmasa pastdagi `count=0` "ko'lam ishladi" emas, "aktyor
      // umuman preview qila olmaydi" degani bo'lardi.
      const posE = await req(EXPRESS, 'POST', '/api/notifications/preview', {
        token: scopedToken,
        body: { audience: { type: 'individual', userIds: [sameBranchUser.id] } },
      });
      const posN = await req(NEST, 'POST', '/api/notifications/preview', {
        token: scopedToken,
        body: { audience: { type: 'individual', userIds: [sameBranchUser.id] } },
      });
      if (posE.status !== 200 || posE.body?.data?.count !== 1 ||
          posN.status !== 200 || posN.body?.data?.count !== 1) {
        throw new Error(
          `musbat nazorat o'tmadi (express=${posE.status}/${posE.body?.data?.count}, ` +
          `nest=${posN.status}/${posN.body?.data?.count})`,
        );
      }
      await both("MUSBAT NAZORAT: o'z filiali ID'si SANALADI (count=1)", (b) =>
        req(b, 'POST', '/api/notifications/preview', {
          token: scopedToken,
          body: { audience: { type: 'individual', userIds: [sameBranchUser.id] } },
        }));

      // ⚠ ASOSIY TEKSHIRUV: begona filial ID'si KESILADI (count=0).
      const negE = await req(EXPRESS, 'POST', '/api/notifications/preview', {
        token: scopedToken,
        body: { audience: { type: 'individual', userIds: [foreignUser.id] } },
      });
      await both("begona filial ID'si KESILADI (count=0)", (b) =>
        req(b, 'POST', '/api/notifications/preview', {
          token: scopedToken,
          body: { audience: { type: 'individual', userIds: [foreignUser.id] } },
        }));
      try {
        assert.equal(negE.body?.data?.count, 0, 'begona ID sanalmasligi kerak');
        assert.equal((negE.body?.data?.noBotStudents || []).length, 0, 'PII chiqmasligi kerak');
        ok("begona filial foydalanuvchisi ro'yxatga TUSHMADI (PII ham yo'q)");
      } catch (err) { bad("filial ko'lami sizdi", err.message); }

      // ARALASH SO'ROV: ikkalasi birga berilsa FAQAT o'ziniki qoladi.
      await both("aralash ro'yxat: faqat o'z filiali qoladi (count=1)", (b) =>
        req(b, 'POST', '/api/notifications/preview', {
          token: scopedToken,
          body: {
            audience: {
              type: 'individual',
              userIds: [sameBranchUser.id, foreignUser.id],
            },
          },
        }));
    } catch (err) {
      skip("filial ko'lami", err.message);
    }

    // ═══════════════ ROL CHEGARALARI ═══════════════
    //
    // ⚠ AKTYOR TANLOVI: seed'dagi o'quvchilarning paroli 4 belgidan
    // qisqa va login VALIDATORI uni rad etadi — ya'ni o'quvchi bilan
    // kirish MUMKIN EMAS (bu alohida qayd etilgan kamchilik). Uning
    // o'rniga `qa_staff_a` ishlatiladi: uning roli ham `owner` ham
    // `teacher` EMAS, ya'ni rol to'sig'i uchun aynan mos.
    head("rol chegaralari (owner/teacher bo'lmagan aktyor)");

    try {
      // ⚠ Bu blok ko'lam sinovidan KEYIN turadi va rol allaqachon
      // tiklangan bo'lishi kerak — aks holda aktyorda `notifications.send`
      // qolib, quyidagi 403 lar 200 ga aylanardi.
      if (scopedRoleValue && qaRestore) await restoreQa();

      const staffToken = await tokenFor(ownerToken, qaTarget.id);

      // MUSBAT NAZORAT: aktyor O'Z pochtasiga KIRA OLADI. Bu bo'lmasa
      // pastdagi 403 lar "umuman kira olmaydi" degani bo'lardi.
      const inboxE = await req(EXPRESS, 'GET', '/api/notifications/inbox', { token: staffToken });
      const inboxN = await req(NEST, 'GET', '/api/notifications/inbox', { token: staffToken });
      if (inboxE.status !== 200 || inboxN.status !== 200) {
        throw new Error(`inbox 200 BERMADI (express=${inboxE.status}, nest=${inboxN.status})`);
      }
      await both("MUSBAT NAZORAT: aktyor O'Z pochtasini o'qiydi → 200", (b) =>
        req(b, 'GET', '/api/notifications/inbox', { token: staffToken }));
      await both('MUSBAT NAZORAT: unread-count → 200', (b) =>
        req(b, 'GET', '/api/notifications/inbox/unread-count', { token: staffToken }));

      // ⚠ Boshqaruv yuzasi YOPIQ — u yerda oluvchilarning PII si bor.
      await both("ro'yxatni KO'RA olmaydi → 403 (rol to'sig'i)", (b) =>
        req(b, 'GET', '/api/notifications?limit=5', { token: staffToken }));
      await both('statistikani KO\'RA olmaydi → 403 (ruxsat)', (b) =>
        req(b, 'GET', '/api/notifications/stats', { token: staffToken }));
      await both('xabar YUBORA olmaydi → 403', (b) =>
        req(b, 'POST', '/api/notifications', {
          token: staffToken,
          body: {
            title: `${PREFIX}${stamp}`, body: 'x', channels: ['inapp'],
            audience: { type: 'individual', userIds: [qaTarget.id] },
          },
        }));
      await both('preview QILA olmaydi → 403', (b) =>
        req(b, 'POST', '/api/notifications/preview', {
          token: staffToken,
          body: { audience: { type: 'all_students' } },
        }));
      await both("xabar tafsilotini KO'RA olmaydi → 403", (b) =>
        req(b, 'GET', `/api/notifications/${'a'.repeat(24)}`, { token: staffToken }));
      await both("oluvchilarni KO'RA olmaydi → 403", (b) =>
        req(b, 'GET', `/api/notifications/${'a'.repeat(24)}/recipients`, { token: staffToken }));
    } catch (err) {
      skip('rol chegaralari', err.message);
    }

    // ═══════════════ YUBORISH — FAQAT IN-APP ═══════════════
    //
    // ⚠ `channels: ["inapp"]` — Telegram'ga HECH NARSA ketmaydi.
    head("yuborish (FAQAT in-app — Telegram'ga chiqmaydi)");

    const sent = {};
    await both('POST /notifications (individual, inapp)', async (b) => {
      const r = await req(b, 'POST', '/api/notifications', {
        token: ownerToken,
        body: {
          title: `${PREFIX}${b === EXPRESS ? 'e' : 'n'}${stamp}`,
          body: 'Paritet sinovi. Salom {ism}!',
          category: 'announcement',
          channels: ['inapp'],
          audience: { type: 'individual', userIds: [qaTarget.id] },
        },
      });
      if (r.status === 201) { sent[b] = r.body.data.id; createdNotifIds.push(r.body.data.id); }
      return r;
    }, (b) => [
      [`${PREFIX}${b === EXPRESS ? 'e' : 'n'}${stamp}`, '<TITLE>'],
      [sent[b] || ' ', '<ID>'],
    ]);

    // ⚠ TELEGRAM CHIQMAGANINI ISBOTLAYMIZ, TAXMIN QILMAYMIZ:
    // in-app xabarda bot yetkazish hisoblagichi 0 bo'lishi va
    // oluvchida `inapp: true` turishi shart.
    if (sent[EXPRESS] && sent[NEST]) {
      const rows = await prisma.notificationRecipient.findMany({
        where: { notificationId: { in: [sent[EXPRESS], sent[NEST]] } },
        select: { notificationId: true, inapp: true, botDeliveredAt: true },
      });
      try {
        assert.equal(rows.length, 2, 'har bir stekda bittadan oluvchi');
        assert.ok(rows.every((r) => r.inapp === true), 'inapp=true');
        assert.ok(rows.every((r) => r.botDeliveredAt === null), 'botDeliveredAt=null');
        ok("Telegram'ga chiqmadi: inapp=true, botDeliveredAt=null (ikkala stekda)");
      } catch (err) { bad("Telegram yetkazish holati", err.message); }

      await both('GET /notifications/:id (yangi xabar)', (b) =>
        req(b, 'GET', `/api/notifications/${sent[b]}`, { token: ownerToken }),
        (b) => [
          [`${PREFIX}${b === EXPRESS ? 'e' : 'n'}${stamp}`, '<TITLE>'],
          [sent[b], '<ID>'],
        ]);
      // ⚠ OLUVCHI QATORINING ID'si ham stekka xos — u ham belgiga
      // almashtiriladi, aks holda tanalar hech qachon teng chiqmasdi va
      // farq "regressiya" bo'lib ko'rinardi.
      const recipIdOf = new Map();
      for (const b of [EXPRESS, NEST]) {
        const rr = await prisma.notificationRecipient.findFirst({
          where: { notificationId: sent[b] }, select: { id: true },
        });
        if (rr) recipIdOf.set(b, rr.id);
      }
      await both('GET /notifications/:id/recipients', (b) =>
        req(b, 'GET', `/api/notifications/${sent[b]}/recipients`, { token: ownerToken }),
        (b) => [[sent[b], '<ID>'], [recipIdOf.get(b) || ' ', '<RECIP>']]);
    }

    // ── VALIDATSIYA ──
    await both("POST /notifications (matn bo'sh → 400)", (b) =>
      req(b, 'POST', '/api/notifications', {
        token: ownerToken,
        body: { channels: ['inapp'], audience: { type: 'individual', userIds: [qaTarget.id] } },
      }));
    await both("POST /notifications (kanal bo'sh massiv → 400)", (b) =>
      req(b, 'POST', '/api/notifications', {
        token: ownerToken,
        body: {
          body: 'x', channels: [],
          audience: { type: 'individual', userIds: [qaTarget.id] },
        },
      }));
    await both('POST /notifications (shablon topilmadi → 400)', (b) =>
      req(b, 'POST', '/api/notifications', {
        token: ownerToken,
        body: {
          body: 'x', channels: ['inapp'], templateId: 'a'.repeat(24),
          audience: { type: 'individual', userIds: [qaTarget.id] },
        },
      }));

    // ═══════════════ O'QILDI/O'QILMADI ═══════════════
    //
    // ⚠ IKKI MARTA BOSISH `readCount` NI IKKI MARTA OSHIRMASLIGI SHART.
    head("o'qildi/o'qilmadi semantikasi (ikki marta sanamaydi)");

    if (sent[EXPRESS] && sent[NEST]) {
      try {
        const qaToken = await tokenFor(ownerToken, qaTarget.id);

        // MUSBAT NAZORAT: xabar HAQIQATAN pochtada va O'QILMAGAN.
        const beforeCount = await req(EXPRESS, 'GET', '/api/notifications/inbox/unread-count', {
          token: qaToken,
        });
        if ((beforeCount.body?.data?.count || 0) < 2) {
          throw new Error(`kutilgan 2 ta o'qilmagan xabar yo'q (${beforeCount.body?.data?.count})`);
        }
        ok(`MUSBAT NAZORAT: qa pochtasida ${beforeCount.body.data.count} ta o'qilmagan xabar`);

        // Har bir stekning xabari uchun oluvchi yozuvini topamiz.
        const recips = await prisma.notificationRecipient.findMany({
          where: { notificationId: { in: [sent[EXPRESS], sent[NEST]] } },
          select: { id: true, notificationId: true },
        });
        const recipOf = (nid) => recips.find((r) => r.notificationId === nid)?.id;

        await both("POST /inbox/:id/read (birinchi marta)", (b) =>
          req(b, 'POST', `/api/notifications/inbox/${recipOf(sent[b])}/read`, { token: qaToken }));
        await both("POST /inbox/:id/read (IKKINCHI marta — takroriy)", (b) =>
          req(b, 'POST', `/api/notifications/inbox/${recipOf(sent[b])}/read`, { token: qaToken }));

        // ⚠ ASOSIY TASDIQ: ikki bosishdan keyin ham `readCount` = 1.
        const counts = await prisma.notification.findMany({
          where: { id: { in: [sent[EXPRESS], sent[NEST]] } },
          select: { id: true, readCount: true },
        });
        try {
          assert.ok(counts.every((c) => c.readCount === 1),
            `readCount 1 bo'lishi kerak: ${JSON.stringify(counts)}`);
          ok('readCount ikki marta bosishda ham 1 (ikkala stekda)');
        } catch (err) { bad('readCount takroriy sanadi', err.message); }

        // ═══════════════════════════════════════════════════════════
        // ⚠ IDOR — BOSHQA ODAMNING POCHTASINI O'QILDI QILIB BO'LMAYDI.
        //
        // ⚠ JAVOB KODIGA QARAB BO'LMAYDI: handler `markRead` NIMA
        // qaytarishidan qat'i nazar DOIM 200 beradi (Express xulqi).
        // Ya'ni 200 ni ko'rib "IDOR bor" yoki "IDOR yo'q" deb bo'lmaydi.
        // Shuning uchun HAQIQAT BAZADAN o'lchanadi.
        //
        // Nishon — ATAYLAB YANGI, HALI O'QILMAGAN xabar: yuqoridagi
        // xabarlar allaqachon o'qilgan va ularda `readAt: null` sharti
        // baribir mos kelmasdi — ya'ni test "himoya ishladi" deb
        // YOLG'ON yashil berardi.
        // ═══════════════════════════════════════════════════════════
        const idorNotif = await req(EXPRESS, 'POST', '/api/notifications', {
          token: ownerToken,
          body: {
            title: `${PREFIX}idor${stamp}`,
            body: 'IDOR sinovi',
            category: 'announcement',
            channels: ['inapp'],
            audience: { type: 'individual', userIds: [qaTarget.id] },
          },
        });
        if (idorNotif.status !== 201) throw new Error(`IDOR nishoni yaratilmadi: ${idorNotif.status}`);
        createdNotifIds.push(idorNotif.body.data.id);
        const idorRecip = await prisma.notificationRecipient.findFirst({
          where: { notificationId: idorNotif.body.data.id },
          select: { id: true },
        });
        if (!idorRecip) throw new Error('IDOR oluvchi yozuvi topilmadi');

        // MUSBAT NAZORAT: nishon HAQIQATAN o'qilmagan.
        const pre = await prisma.notificationRecipient.findUnique({
          where: { id: idorRecip.id }, select: { readAt: true },
        });
        if (pre.readAt !== null) throw new Error("nishon allaqachon o'qilgan");
        ok("MUSBAT NAZORAT: IDOR nishoni o'qilmagan holatda");

        // BEGONA aktyor (owner) uni o'qildi qilishga urinadi — IKKALA stekda.
        await both("IDOR: begona aktyor urinishi (javob kodi bir xil)", (b) =>
          req(b, 'POST', `/api/notifications/inbox/${idorRecip.id}/read`, { token: ownerToken }));

        // ⚠ HAQIQAT BAZADAN: yozuv HAMON o'qilmagan bo'lishi SHART.
        const post = await prisma.notificationRecipient.findUnique({
          where: { id: idorRecip.id }, select: { readAt: true },
        });
        const notifAfter = await prisma.notification.findUnique({
          where: { id: idorNotif.body.data.id }, select: { readCount: true },
        });
        try {
          assert.equal(post.readAt, null, "begona aktyor yozuvni o'qildi qildi — IDOR!");
          assert.equal(notifAfter.readCount, 0, 'readCount oshdi — IDOR!');
          ok("IDOR YOPIQ: begona urinishdan keyin readAt=null, readCount=0");
        } catch (err) { bad('IDOR OCHIQ', err.message); }

        // MUSBAT NAZORAT: EGASI o'qiganda O'ZGARADI — ya'ni yuqoridagi
        // "o'zgarmadi" natijasi "bu yo'l umuman ishlamaydi" degani emas.
        await req(EXPRESS, 'POST', `/api/notifications/inbox/${idorRecip.id}/read`, {
          token: qaToken,
        });
        const owned = await prisma.notificationRecipient.findUnique({
          where: { id: idorRecip.id }, select: { readAt: true },
        });
        try {
          assert.notEqual(owned.readAt, null, "egasi o'qiganda ham o'zgarmadi");
          ok("MUSBAT NAZORAT: EGASI o'qiganda readAt QO'YILDI");
        } catch (err) { bad("egalik yo'li ishlamadi", err.message); }

        await both('POST /inbox/read-all', (b) =>
          req(b, 'POST', '/api/notifications/inbox/read-all', { token: qaToken }));
      } catch (err) {
        skip("o'qildi semantikasi", err.message);
      }
    }

    // ═══════════════ BEKOR QILISH ═══════════════
    head('rejalashtirilgan xabarni bekor qilish');

    await both('POST /:id/cancel (404)', (b) =>
      req(b, 'POST', `/api/notifications/${'a'.repeat(24)}/cancel`, { token: ownerToken }));
    if (sent[EXPRESS] && sent[NEST]) {
      // ⚠ YUBORILGAN xabarni bekor qilib bo'lmaydi — 400.
      await both("yuborilgan xabarni bekor qilib bo'lmaydi → 400", (b) =>
        req(b, 'POST', `/api/notifications/${sent[b]}/cancel`, { token: ownerToken }),
        (b) => [[sent[b], '<ID>']]);
    }
  } finally {
    // ═══════════════ TOZALASH ═══════════════
    let cleaned = 0;

    // 1) `qa_staff_a` ning roli/birikmalari — vaqtinchalik rol berilgan
    //    bo'lsa TIKLANADI (blok o'rtasida yiqilsa ham).
    if (qaRestore) { await restoreQa(); cleaned += 1; }
    // ⚠ FAQAT SHU YURISHNIKI EMAS — BARCHA prefiksli rollar tozalanadi.
    // Yurish o'rtasida uzilsa (masalan login chegarasi 429 bersa) rol
    // bazada qolib ketardi va keyingi yurishlarda to'planardi.
    const strayRoles = await prisma.role.findMany({
      where: { label: { startsWith: PREFIX } }, select: { value: true },
    });
    for (const sr of strayRoles) {
      const r = await req(EXPRESS, 'DELETE', `/api/roles/${sr.value}`, { token: ownerToken });
      if (r.status === 200) cleaned += 1;
    }
    // ⚠ ZAXIRA YO'L: API rad etsa rol bazada qolib ketardi.
    const forcedRoles = await prisma.role.deleteMany({
      where: { label: { startsWith: PREFIX } },
    });
    cleaned += forcedRoles.count;

    // 2) Prefiksli xabarlar — shu yurishdagi va oldingi yurishlardan qolgani.
    const strays = await prisma.notification.findMany({
      where: { title: { startsWith: PREFIX } }, select: { id: true },
    });
    const ids = [...new Set([...createdNotifIds, ...strays.map((s) => s.id)])];
    if (ids.length) {
      // Oluvchilar AVVAL — FK cheklovi.
      const delR = await prisma.notificationRecipient.deleteMany({
        where: { notificationId: { in: ids } },
      });
      const delN = await prisma.notification.deleteMany({ where: { id: { in: ids } } });
      cleaned += delR.count + delN.count;
    }
    console.log(`\n  🧹 tozalandi: ${cleaned} ta yozuv`);

    // ── SILJISH TEKSHIRUVI ──
    const after = {
      notifications: await prisma.notification.count(),
      recipients: await prisma.notificationRecipient.count(),
    };
    try {
      assert.deepEqual(after, before, `siljish: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
      ok(`baza siljimadi (xabar=${after.notifications}, oluvchi=${after.recipients})`);
    } catch (err) {
      bad('BAZA SILJIDI', err.message);
    }

    // ── FIXTURE ROLI TIKLANDIMI ──
    if (qaRestore) {
      const now = await req(EXPRESS, 'GET', `/api/users/${qaTarget.id}`, { token: ownerToken });
      try {
        assert.equal(now.body?.data?.role, qaRestore.role, 'qa_staff_a roli');
        assert.deepEqual(
          (now.body?.data?.branchAssignments || []).map((a) => ({
            branchId: a.branchId, role: a.role,
          })),
          qaRestore.branchAssignments,
          'qa_staff_a filial birikmalari',
        );
        ok('fixture roli va filial birikmalari tiklandi');
      } catch (err) { bad('fixture tiklanmadi', err.message); }
    }

    await prisma.$disconnect();
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
  process.exit(R.fail || R.unmeasured ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
