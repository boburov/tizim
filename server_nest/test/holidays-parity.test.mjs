/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 3 — BAYRAMLAR MODULI PARITETI (7 marshrut + PUL YO'LI funksiyasi).
 *
 * ── ⚠ NEGA BU MODUL ALOHIDA E'TIBOR TALAB QILADI ──
 *
 * `holidayKeySetForRange()` DAVOMAT, o'quvchi TO'LOVI (proratsiya) va
 * o'qituvchi MAOSHI hisobida ishlatiladi: bayram kuni dars kuni
 * SANALMAYDI. Ya'ni bu funksiyadagi bir kunlik farq hisoblangan
 * SUMMANI o'zgartiradi.
 *
 * Uning HTTP marshruti YO'Q, shuning uchun u TO'G'RIDAN-TO'G'RI
 * solishtiriladi: Express servisi va kompilyatsiya qilingan NestJS
 * servisi bir xil bazada, bir xil oraliqda yurgiziladi va natija
 * to'plamlari taqqoslanadi.
 *
 * ── ⚠ TABRIK HAQIQIY XABAR YUBORADI ──
 *
 * `POST /teacher-birthdays/:id/congratulate` bildirishnoma yaratadi.
 * Test uni FAQAT `channels: ["inapp"]` bilan chaqiradi (Telegram
 * navbatga tushmaydi) va bazada bot ulanishi bor-yo'qligini OLDINDAN
 * sanaydi. Yaratilgan xabarlar yakunda o'chiriladi.
 *
 * ── MARSHRUT TARTIBI ──
 * `/teacher-birthdays` `GET /:id` DAN OLDIN turishi SHART — aks holda u
 * bayram ID'si deb o'qilardi.
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

const VOLATILE = new Set(['createdAt', 'updatedAt', 'stack', 'lastSentAt', 'sentAt']);
let NAME_RX = null;

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
    if (NAME_RX) s = s.replace(NAME_RX, '<PNAME>');
    return s;
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
  console.log(`\n${BOLD}FAZA 3 — BAYRAMLAR MODULI PARITETI${OFF}\n`);

  const ownerToken = await login(EXPRESS, 'owner', 'owner123');

  const before = {
    holidays: await prisma.holiday.count(),
    notifications: await prisma.notification.count(),
    recipients: await prisma.notificationRecipient.count(),
  };
  const botLinks = await prisma.botUser.count();
  note(`boshlang'ich: bayram=${before.holidays}, xabar=${before.notifications}, bot ulanishi=${botLinks}`);

  const stamp = String(process.hrtime.bigint()).slice(-9);
  NAME_RX = new RegExp(`${PREFIX}[a-z]*[en]?${stamp}`, 'g');
  const madeHolidayIds = [];
  const madeNotifIds = [];

  const nameOf = (b, tag = '') => `${PREFIX}${tag}${b === EXPRESS ? 'e' : 'n'}${stamp}`;
  // ⚠ HAR IKKALA STEK YARATGAN ID'lar — bayram ham, tabrik xabari ham.
  // Xabar ID'si ro'yxatga tushmasa "farq bor" deb yiqilardi, aslida
  // ikkala stek ham to'g'ri javob qaytargan bo'lardi.
  const subs = () => [
    ...madeHolidayIds.map((id) => [id, '<HID>']),
    ...madeNotifIds.map((id) => [id, '<NID>']),
  ].filter(([f]) => Boolean(f));

  const stabilize = (body) => {
    if (!body || typeof body !== 'object' || !Array.isArray(body.data)) return body;
    const sorted = [...body.data].sort((x, y) =>
      String(x?.id ?? '').localeCompare(String(y?.id ?? '')));
    return { ...body, data: sorted };
  };

  const both = async (name, fn) => {
    let e, n;
    try { e = await fn(EXPRESS); n = await fn(NEST); }
    catch (err) { skip(name, err.message); return {}; }
    const en = { status: e.status, body: normalize(stabilize(e.body), subs()) };
    const nn = { status: n.status, body: normalize(stabilize(n.body), subs()) };
    try { assert.deepEqual(nn, en); ok(`${name} — ${e.status}`); }
    catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 600)}\n      nest   : ${JSON.stringify(nn).slice(0, 600)}`);
    }
    return { e, n };
  };

  try {
    // ═══════════════ MARSHRUT TARTIBI ═══════════════
    head('marshrut tartibi (`/teacher-birthdays` `/:id` dan oldin)');

    const tbE = await req(EXPRESS, 'GET', '/api/holidays/teacher-birthdays', { token: ownerToken });
    const tbN = await req(NEST, 'GET', '/api/holidays/teacher-birthdays', { token: ownerToken });
    try {
      assert.equal(tbE.status, 200, `express ${tbE.status}`);
      assert.equal(tbN.status, 200, `nest ${tbN.status}`);
      assert.ok(Array.isArray(tbE.body.data) && Array.isArray(tbN.body.data));
      ok("`/teacher-birthdays` ro'yxat qaytardi (bayram ID deb O'QILMADI)");
    } catch (err) { bad('marshrut tartibi', err.message); }

    await both('GET /holidays/teacher-birthdays', (b) =>
      req(b, 'GET', '/api/holidays/teacher-birthdays', { token: ownerToken }));

    // ⚠ TUG'ILGAN KUN RO'YXATI TARTIBI VA HISOBI — musbat nazorat.
    if (tbE.body.data.length) {
      const first = tbE.body.data[0];
      const sortedOk = tbE.body.data.every((x, i, arr) =>
        i === 0 || arr[i - 1].daysUntil <= x.daysUntil);
      try {
        assert.ok(sortedOk, "ro'yxat `daysUntil` bo'yicha saralanmagan");
        assert.ok(first.daysUntil >= 0, 'daysUntil manfiy');
        assert.equal(typeof first.turningAge, 'number');
        assert.equal(first._id, first.id, "`_id` klient uchun shart");
        ok(`tug'ilgan kunlar: ${tbE.body.data.length} ta, saralangan, \`_id\` bor`);
      } catch (err) { bad("tug'ilgan kunlar ro'yxati", err.message); }
    } else {
      skip("tug'ilgan kunlar ro'yxati", "birorta o'qituvchida `birthDate` yo'q");
    }

    // ═══════════════ O'QISH ═══════════════
    head("o'qish (ro'yxat, filtr)");

    for (const q of [
      '', '?limit=5', '?includeInactive=true&limit=5', '?includePast=true&limit=5',
      '?audience=all', '?audience=students', '?audience=teachers',
      '?search=__yoq__', '?page=2&limit=2',
    ]) {
      await both(`GET /holidays${q}`, (b) => req(b, 'GET', `/api/holidays${q}`, { token: ownerToken }));
    }
    await both('GET /holidays?audience=__yoq__ → 400', (b) =>
      req(b, 'GET', '/api/holidays?audience=__yoq__', { token: ownerToken }));
    await both('GET /holidays/:id (404)', (b) =>
      req(b, 'GET', `/api/holidays/${'a'.repeat(24)}`, { token: ownerToken }));
    await both("GET /holidays (token yo'q → 401)", (b) => req(b, 'GET', '/api/holidays'));

    // ═══════════════ YARATISH / VALIDATSIYA ═══════════════
    head('yaratish va sana validatsiyasi');

    const created = { [EXPRESS]: null, [NEST]: null };
    await both('POST /holidays (har yilgi)', async (b) => {
      const r = await req(b, 'POST', '/api/holidays', {
        token: ownerToken,
        body: {
          name: nameOf(b), month: 3, day: 21,
          message: 'Navro\'z muborak', audience: 'all',
        },
      });
      if (r.status === 201) { created[b] = r.body.data.id; madeHolidayIds.push(r.body.data.id); }
      return r;
    });

    // ⚠ BIR MARTALIK BAYRAMDA YIL MAJBURIY — aks holda yozuv hech qachon
    // kelmaydigan bayram bo'lib qolardi.
    await both("POST /holidays (bir martalik, yil yo'q → 400)", (b) =>
      req(b, 'POST', '/api/holidays', {
        token: ownerToken,
        body: { name: `${nameOf(b)}x`, isRecurring: false, month: 5, day: 9, message: 'x' },
      }));
    await both('POST /holidays (bir martalik, yil bilan → 201)', async (b) => {
      const r = await req(b, 'POST', '/api/holidays', {
        token: ownerToken,
        body: {
          name: `${nameOf(b, 'once')}`, isRecurring: false,
          month: 5, day: 9, year: 2030, message: 'Xotira kuni',
        },
      });
      if (r.status === 201) madeHolidayIds.push(r.body.data.id);
      return r;
    });

    // ⚠ OYGA MOS KUN CHEGARASI.
    await both('POST /holidays (2-oy 30-kun → 400)', (b) =>
      req(b, 'POST', '/api/holidays', {
        token: ownerToken,
        body: { name: `${nameOf(b)}y`, month: 2, day: 30, message: 'x' },
      }));
    await both('POST /holidays (4-oy 31-kun → 400)', (b) =>
      req(b, 'POST', '/api/holidays', {
        token: ownerToken,
        body: { name: `${nameOf(b)}z`, month: 4, day: 31, message: 'x' },
      }));
    // MUSBAT NAZORAT: 29-fevral har yilgi bayram uchun RUXSAT (kabisa yil).
    await both('MUSBAT NAZORAT: 2-oy 29-kun (har yilgi) → 201', async (b) => {
      const r = await req(b, 'POST', '/api/holidays', {
        token: ownerToken,
        body: { name: `${nameOf(b, 'feb')}`, month: 2, day: 29, message: 'Kabisa kuni' },
      });
      if (r.status === 201) madeHolidayIds.push(r.body.data.id);
      return r;
    });
    await both('POST /holidays (13-oy → 400)', (b) =>
      req(b, 'POST', '/api/holidays', {
        token: ownerToken,
        body: { name: `${nameOf(b)}w`, month: 13, day: 1, message: 'x' },
      }));
    await both("POST /holidays (matn yo'q → 400)", (b) =>
      req(b, 'POST', '/api/holidays', {
        token: ownerToken, body: { name: `${nameOf(b)}v`, month: 1, day: 1 },
      }));

    // ═══════════════ YANGILASH ═══════════════
    head('yangilash (har yilgi ↔ bir martalik)');

    if (created[EXPRESS] && created[NEST]) {
      await both('GET /holidays/:id', (b) =>
        req(b, 'GET', `/api/holidays/${created[b]}`, { token: ownerToken }));
      await both('PATCH /holidays/:id (matn)', (b) =>
        req(b, 'PATCH', `/api/holidays/${created[b]}`, {
          token: ownerToken, body: { message: 'Yangilangan tabrik' },
        }));

      // ⚠ HAR YILGI → BIR MARTALIK: yil BERILISHI kerak.
      await both('PATCH (har yilgi → bir martalik, yil bilan)', (b) =>
        req(b, 'PATCH', `/api/holidays/${created[b]}`, {
          token: ownerToken, body: { isRecurring: false, year: 2031 },
        }));
      const afterOnce = await prisma.holiday.findUnique({
        where: { id: created[EXPRESS] }, select: { isRecurring: true, year: true },
      });
      try {
        assert.equal(afterOnce.isRecurring, false);
        assert.equal(afterOnce.year, 2031);
        ok('bir martalikka o\'tganda yil SAQLANDI');
      } catch (err) { bad('bir martalikka o\'tish', err.message); }

      // ⚠ BIR MARTALIK → HAR YILGI: yil TOZALANADI (aks holda eski yil
      // qolib, hisobda noto'g'ri kun bayram bo'lib ko'rinardi).
      await both('PATCH (bir martalik → har yilgi)', (b) =>
        req(b, 'PATCH', `/api/holidays/${created[b]}`, {
          token: ownerToken, body: { isRecurring: true },
        }));
      const afterRec = await prisma.holiday.findUnique({
        where: { id: created[EXPRESS] }, select: { isRecurring: true, year: true },
      });
      try {
        assert.equal(afterRec.isRecurring, true);
        assert.equal(afterRec.year, null, 'har yilgiga o\'tganda yil TOZALANMADI');
        ok('har yilgiga o\'tganda yil TOZALANDI (null)');
      } catch (err) { bad('yil tozalanmadi', err.message); }

      await both("PATCH (bo'sh tana → 400)", (b) =>
        req(b, 'PATCH', `/api/holidays/${created[b]}`, { token: ownerToken, body: {} }));
      await both('PATCH (404)', (b) =>
        req(b, 'PATCH', `/api/holidays/${'a'.repeat(24)}`, {
          token: ownerToken, body: { message: 'x' },
        }));
      await both('DELETE /holidays/:id', (b) =>
        req(b, 'DELETE', `/api/holidays/${created[b]}`, { token: ownerToken }));
      await both('DELETE /holidays/:id (404)', (b) =>
        req(b, 'DELETE', `/api/holidays/${'a'.repeat(24)}`, { token: ownerToken }));
    }

    // ═══════════════════════════════════════════════════════════════
    // ⚠⚠ PUL YO'LI: `holidayKeySetForRange` TO'G'RIDAN-TO'G'RI
    //
    // HTTP marshruti YO'Q, shuning uchun ikkala IMPLEMENTATSIYA bir
    // xil bazada yurgizilib, natija to'plamlari solishtiriladi.
    // ═══════════════════════════════════════════════════════════════
    head("PUL YO'LI: `holidayKeySetForRange` (davomat/to'lov/maosh)");

    try {
      const expressSvc = await import('../../server/src/modules/holidays/services/holidays.service.js');
      const { HolidaysService } = await import('../dist/modules/holidays/holidays.service.js');

      // ⚠ Faqat `prisma` kerak — qolgan bog'liqliklar bu funksiyada
      // ISHLATILMAYDI, shuning uchun ular `null` uzatiladi.
      const nestSvc = new HolidaysService(prisma, { get: () => 'Bayyina' }, null);

      const ranges = [
        ['2026-01-01', '2026-12-31'],
        ['2024-01-01', '2024-12-31'],   // kabisa yil (29-fev BOR)
        ['2025-01-01', '2025-12-31'],   // kabisa EMAS (29-fev YO'Q)
        ['2026-03-01', '2026-03-31'],
        ['2026-12-31', '2026-01-01'],   // teskari oraliq → bo'sh
      ];
      const audienceSets = [['all', 'students'], ['all', 'teachers'], ['all']];

      let compared = 0;
      let mismatched = 0;
      for (const [from, to] of ranges) {
        for (const aud of audienceSets) {
          // ⚠ Keshni tozalaymiz — aks holda birinchi chaqiruv natijasi
          // keyingi auditoriya uchun qayta ishlatilardi.
          expressSvc.invalidateHolidayCache();
          nestSvc.invalidateHolidayCache();

          const e = await expressSvc.holidayKeySetForRange(from, to, aud);
          const n = await nestSvc.holidayKeySetForRange(from, to, aud);
          compared += 1;
          const eArr = [...e].sort();
          const nArr = [...n].sort();
          if (JSON.stringify(eArr) !== JSON.stringify(nArr)) {
            mismatched += 1;
            bad(`holidayKeySetForRange ${from}..${to} [${aud}]`,
              `express: ${JSON.stringify(eArr)}\n      nest   : ${JSON.stringify(nArr)}`);
          }
        }
      }
      if (!mismatched) {
        ok(`holidayKeySetForRange: ${compared} ta oraliq/auditoriya — natijalar AYNAN bir xil`);
      }

      // ⚠ MUSBAT NAZORAT: solishtiruv BO'SH to'plamlar ustida
      // bo'lmaganini isbotlaymiz. Aks holda "ikkalasi ham hech narsa
      // qaytarmadi" YASHIL bo'lib chiqardi.
      expressSvc.invalidateHolidayCache();
      const sample = await expressSvc.holidayKeySetForRange('2026-01-01', '2026-12-31', ['all', 'students']);
      try {
        assert.ok(sample.size > 0, "2026 yil uchun birorta bayram kuni topilmadi — solishtiruv BO'SH edi");
        ok(`MUSBAT NAZORAT: 2026 yilda ${sample.size} ta bayram kuni topildi (bo'sh solishtiruv EMAS)`);
      } catch (err) { bad('bo\'sh solishtiruv', err.message); }

      // ⚠ 29-FEVRAL OSHIB KETISH QO'RIQLOVI: kabisa BO'LMAGAN yilda
      // 29-fev bayrami 1-MARTGA ko'chib ketmasligi kerak.
      expressSvc.invalidateHolidayCache();
      nestSvc.invalidateHolidayCache();
      const e2025 = await expressSvc.holidayKeySetForRange('2025-02-25', '2025-03-05', ['all', 'students']);
      const n2025 = await nestSvc.holidayKeySetForRange('2025-02-25', '2025-03-05', ['all', 'students']);
      try {
        assert.equal(e2025.has('2025-03-01'), false, 'express: 29-fev 1-martga ko\'chdi');
        assert.equal(n2025.has('2025-03-01'), false, 'nest: 29-fev 1-martga ko\'chdi');
        assert.deepEqual([...n2025].sort(), [...e2025].sort());
        ok("29-fevral kabisa bo'lmagan yilda 1-martga KO'CHMADI (ikkala stekda)");
      } catch (err) { bad('sana oshib ketish qo\'riqlovi', err.message); }
    } catch (err) {
      skip("PUL YO'LI funksiyasi", err.message);
    }

    // ═══════════════ TABRIK (HAQIQIY XABAR) ═══════════════
    head("tabrik — FAQAT in-app (Telegram'ga chiqmaydi)");

    if (tbE.body.data.length) {
      const teacherId = tbE.body.data[0].id;
      const notifBefore = await prisma.notification.count();

      const cE = await req(EXPRESS, 'POST', `/api/holidays/teacher-birthdays/${teacherId}/congratulate`, {
        token: ownerToken, body: { channels: ['inapp'], message: `${PREFIX}tabrik${stamp}` },
      });
      const cN = await req(NEST, 'POST', `/api/holidays/teacher-birthdays/${teacherId}/congratulate`, {
        token: ownerToken, body: { channels: ['inapp'], message: `${PREFIX}tabrik${stamp}` },
      });
      // ⚠ HAR IKKALA STEKNING yozuvi eslab qolinadi (status qanday
      // bo'lishidan qat'i nazar) — aks holda biri tozalanmay qolardi.
      for (const r of [cE, cN]) {
        if (r.body?.data?.id) madeNotifIds.push(r.body.data.id);
      }
      try {
        // ⚠ KUTILGAN KOD HANDLER'DAN: `congratulate.handler.js`
        // `res.status(201)` yozadi. Uni "200 bo'lsa kerak" deb TAXMIN
        // qilish aynan shu farqni yashirardi.
        assert.equal(cE.status, cN.status, `status ${cE.status} ≠ ${cN.status}`);
        assert.equal(cE.status, 201, `kutilgan 201, olindi ${cE.status}`);
        assert.deepEqual(
          normalize(cN.body, subs()), normalize(cE.body, subs()),
        );
        ok(`tabrik yuborildi — ikkala stekda ${cE.status}, tana bir xil`);
      } catch (err) { bad('tabrik', err.message); }

      // ⚠ TELEGRAM'GA CHIQMAGANI BAZADAN O'LCHANADI.
      const rows = await prisma.notificationRecipient.findMany({
        where: { notificationId: { in: madeNotifIds } },
        select: { inapp: true, botDeliveredAt: true },
      });
      try {
        assert.ok(rows.length >= 2, `oluvchi yozuvlari yetarli emas (${rows.length})`);
        assert.ok(rows.every((r) => r.inapp === true), 'inapp=true emas');
        assert.ok(rows.every((r) => r.botDeliveredAt === null), 'Telegram yetkazildi!');
        ok("Telegram'ga chiqmadi: inapp=true, botDeliveredAt=null");
      } catch (err) { bad("Telegram holati", err.message); }

      await both("congratulate (kanal bo'sh massiv → 400)", (b) =>
        req(b, 'POST', `/api/holidays/teacher-birthdays/${teacherId}/congratulate`, {
          token: ownerToken, body: { channels: [] },
        }));
      await both("congratulate (o'qituvchi emas → 404)", (b) =>
        req(b, 'POST', `/api/holidays/teacher-birthdays/${'a'.repeat(24)}/congratulate`, {
          token: ownerToken, body: { channels: ['inapp'] },
        }));
      void notifBefore;
    } else {
      skip('tabrik', "tug'ilgan kuni bor o'qituvchi yo'q — TAXMIN QILINMADI");
    }

    // ═══════════════ RUXSAT CHEGARASI ═══════════════
    head('ruxsat chegarasi (owner roli VA modul ruxsati)');

    try {
      const qa = await prisma.user.findFirst({ where: { username: 'qa_staff_a' }, select: { id: true } });
      const pw = await req(EXPRESS, 'GET', `/api/users/${qa.id}/password`, { token: ownerToken });
      if (pw.status !== 200) throw new Error("parol o'qilmadi");
      const weak = await login(EXPRESS, pw.body.data.username, pw.body.data.password);

      // ⚠ MUSBAT NAZORAT: o'qish RUXSATSIZ — kalendarni har kim ko'radi.
      const rE = await req(EXPRESS, 'GET', '/api/holidays?limit=3', { token: weak });
      const rN = await req(NEST, 'GET', '/api/holidays?limit=3', { token: weak });
      if (rE.status !== 200 || rN.status !== 200) {
        throw new Error(`o'qish 200 BERMADI (${rE.status}/${rN.status})`);
      }
      await both("MUSBAT NAZORAT: bayram kalendari ruxsatsiz o'qiladi → 200", (b) =>
        req(b, 'GET', '/api/holidays?limit=3', { token: weak }));

      for (const [label, call] of [
        ['POST /holidays', (b) => req(b, 'POST', '/api/holidays', {
          token: weak, body: { name: `${PREFIX}w${stamp}`, month: 1, day: 1, message: 'x' } })],
        ['PATCH /holidays/:id', (b) => req(b, 'PATCH', `/api/holidays/${'a'.repeat(24)}`, {
          token: weak, body: { message: 'x' } })],
        ['DELETE /holidays/:id', (b) => req(b, 'DELETE', `/api/holidays/${'a'.repeat(24)}`, {
          token: weak })],
        ['GET /teacher-birthdays', (b) => req(b, 'GET', '/api/holidays/teacher-birthdays', {
          token: weak })],
        ['POST /congratulate', (b) => req(b, 'POST', `/api/holidays/teacher-birthdays/${'a'.repeat(24)}/congratulate`, {
          token: weak, body: { channels: ['inapp'] } })],
      ]) {
        await both(`ruxsat yo'q → ${label} 403`, call);
      }
    } catch (err) {
      skip('ruxsat chegarasi', err.message);
    }
  } finally {
    // ═══════════════ TOZALASH ═══════════════
    let cleaned = 0;

    // Tabrik bildirishnomalari (oluvchilar AVVAL — FK).
    const notifs = await prisma.notification.findMany({
      where: { body: { startsWith: PREFIX } }, select: { id: true },
    });
    const nids = [...new Set([...madeNotifIds, ...notifs.map((n) => n.id)])];
    if (nids.length) {
      const r1 = await prisma.notificationRecipient.deleteMany({
        where: { notificationId: { in: nids } },
      });
      const r2 = await prisma.notification.deleteMany({ where: { id: { in: nids } } });
      cleaned += r1.count + r2.count;
    }

    // ⚠ QATTIQ O'CHIRISH: API yumshoq o'chiradi (`isActive:false`),
    // ya'ni qatorlar to'planib borardi.
    const hDel = await prisma.holiday.deleteMany({ where: { name: { startsWith: PREFIX } } });
    cleaned += hDel.count;

    console.log(`\n  🧹 tozalandi: ${cleaned} ta yozuv`);

    const after = {
      holidays: await prisma.holiday.count(),
      notifications: await prisma.notification.count(),
      recipients: await prisma.notificationRecipient.count(),
    };
    try {
      assert.deepEqual(after, before, `siljish: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
      ok(`baza siljimadi (bayram=${after.holidays}, xabar=${after.notifications})`);
    } catch (err) { bad('BAZA SILJIDI', err.message); }

    await prisma.$disconnect();
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
  process.exit(R.fail || R.unmeasured ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
