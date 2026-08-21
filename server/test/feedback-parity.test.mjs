/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 10 — FIKR-MULOHAZA MODULI PARITETI (9 marshrut).
 *
 * ── ⚠ YON TA'SIR: HOLAT O'ZGARISHI XABAR YUBORADI ──
 *
 * `resolve` / `reject` / `review` — anonim BO'LMAGAN fikrda muallifga
 * bildirishnoma yaratadi (`notifyFeedbackStatusChange`). U standart
 * kanallar bilan ketadi (`inapp` + `telegram`), ya'ni Telegram
 * yetkazish navbatga tushishi MUMKIN.
 *
 * ⚠ SHART OLDINDAN O'LCHANADI: test boshida bazada BIRORTA bot
 * ulanishi bor-yo'qligi sanaladi. Bo'lsa — holat o'zgartiruvchi
 * tekshiruvlar ANONIM fikrda bajariladi (u xabar YARATMAYDI). Bu
 * "botga ulanmagan bo'lsa kerak" degan TAXMINNI yo'q qiladi.
 *
 * Yaratilgan bildirishnomalar yakunda o'chiriladi va siljish tekshiruvi
 * ularni ham qamrab oladi.
 *
 * ── ⚠ MARSHRUT TARTIBI ──
 * `/stats` va `/me` `GET /:id` DAN OLDIN turishi SHART. `/me` ayniqsa
 * muhim: u RUXSATSIZ, `/:id` esa egalik tekshiruvidan o'tadi — tartib
 * buzilsa foydalanuvchi o'z ro'yxati o'rniga 403/404 olardi.
 *
 * ── MAVJUD 80 TA FIKRGA TEGILMAYDI ──
 * Barcha holat o'zgarishlari FAQAT shu yurishda yaratilgan
 * `__parity_` yozuvlar ustida.
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

const VOLATILE = new Set([
  'createdAt', 'updatedAt', 'stack',
  'reviewedAt', 'repliedAt', 'resolvedAt',
]);

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
    if (NAME_RX) s = s.replace(NAME_RX, '<PMSG>');
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
  console.log(`\n${BOLD}FAZA 10 — FIKR-MULOHAZA MODULI PARITETI${OFF}\n`);

  const ownerToken = await login(EXPRESS, 'owner', 'owner123');

  // ── BOSHLANG'ICH SURAT ──
  const before = {
    feedback: await prisma.feedback.count(),
    notifications: await prisma.notification.count(),
    recipients: await prisma.notificationRecipient.count(),
  };

  // ⚠ SHART O'LCHANADI, TAXMIN QILINMAYDI: bot ulanishi bo'lsa holat
  // o'zgarishi HAQIQIY Telegram yetkazishni navbatga qo'yardi.
  const botLinks = await prisma.botUser.count();
  const notifySafe = botLinks === 0;
  note(`boshlang'ich: feedback=${before.feedback}, xabar=${before.notifications}, bot ulanishi=${botLinks}`);
  if (notifySafe) {
    ok("bot ulanishi YO'Q — holat o'zgarishi Telegram'ga chiqmaydi (o'lchandi)");
  } else {
    note("bot ulanishi BOR — holat o'zgarishlari ANONIM fikrda sinaladi");
  }

  const type = await prisma.feedbackType.findFirst({
    where: { isActive: true }, select: { id: true },
  });
  if (!type) { console.log("  ❌ faol feedback turi yo'q"); process.exit(1); }

  const qa = await prisma.user.findFirst({
    where: { username: 'qa_staff_a' }, select: { id: true },
  });
  if (!qa) { console.log('  ❌ qa_staff_a topilmadi'); process.exit(1); }

  const stamp = String(process.hrtime.bigint()).slice(-9);
  NAME_RX = new RegExp(`${PREFIX}[a-z]*[en]?${stamp}`, 'g');
  const madeFeedbackIds = [];
  let qaToken = null;

  const msgOf = (b, tag = '') => `${PREFIX}${tag}${b === EXPRESS ? 'e' : 'n'}${stamp}`;
  const subs = () => madeFeedbackIds.filter(Boolean).map((id) => [id, '<FID>']);

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

  /** Fikr yaratadi (API orqali) va tozalash uchun eslab qoladi. */
  const submitOne = async (base, token, { tag = '', isAnonymous = false, group = null }) => {
    const r = await req(base, 'POST', '/api/feedback', {
      token,
      body: {
        type: type.id,
        message: `${msgOf(base, tag)} — paritet sinovi matni`,
        isAnonymous,
        ...(group ? { group } : {}),
      },
    });
    if (r.status === 201) madeFeedbackIds.push(r.body.data.id);
    return r;
  };

  try {
    // ═══════════════ MARSHRUT TARTIBI ═══════════════
    head('marshrut tartibi (`/stats` va `/me` `/:id` dan oldin)');

    const meE = await req(EXPRESS, 'GET', '/api/feedback/me', { token: ownerToken });
    const meN = await req(NEST, 'GET', '/api/feedback/me', { token: ownerToken });
    try {
      assert.equal(meE.status, 200, `express /me ${meE.status}`);
      assert.equal(meN.status, 200, `nest /me ${meN.status}`);
      assert.ok(Array.isArray(meE.body.data) && Array.isArray(meN.body.data));
      ok("`/me` ro'yxat qaytardi (fikr ID deb O'QILMADI)");
    } catch (err) { bad('/me marshrut tartibi', err.message); }

    await both('GET /feedback/me', (b) => req(b, 'GET', '/api/feedback/me?limit=5', { token: ownerToken }));
    await both('GET /feedback/stats', (b) => req(b, 'GET', '/api/feedback/stats', { token: ownerToken }));

    // ═══════════════ O'QISH ═══════════════
    head("o'qish (ro'yxat, filtr, statistika)");

    for (const q of [
      '', '?limit=5', '?status=new&limit=5', '?status=resolved&limit=5',
      '?status=rejected&limit=5', '?status=in_review&limit=5',
      '?search=__yoq__', '?page=2&limit=2',
      `?type=${type.id}&limit=5`,
      '?fromDate=2020-01-01&toDate=2030-01-01&limit=5',
    ]) {
      await both(`GET /feedback${q}`, (b) => req(b, 'GET', `/api/feedback${q}`, { token: ownerToken }));
    }
    await both('GET /feedback?status=__yoq__ → 400', (b) =>
      req(b, 'GET', '/api/feedback?status=__yoq__', { token: ownerToken }));
    await both('GET /feedback?limit=9999 → 400', (b) =>
      req(b, 'GET', '/api/feedback?limit=9999', { token: ownerToken }));
    await both('GET /feedback/stats?fromDate=2020-01-01', (b) =>
      req(b, 'GET', '/api/feedback/stats?fromDate=2020-01-01', { token: ownerToken }));
    await both('GET /feedback/:id (404)', (b) =>
      req(b, 'GET', `/api/feedback/${'a'.repeat(24)}`, { token: ownerToken }));
    await both("GET /feedback (token yo'q → 401)", (b) => req(b, 'GET', '/api/feedback'));

    // ═══════════════ YOZISH ═══════════════
    head('fikr yozish (validatsiya)');

    const created = { [EXPRESS]: null, [NEST]: null };
    await both('POST /feedback', async (b) => {
      const r = await submitOne(b, ownerToken, {});
      if (r.status === 201) created[b] = r.body.data.id;
      return r;
    });

    await both('POST /feedback (matn 5 belgidan qisqa → 400)', (b) =>
      req(b, 'POST', '/api/feedback', {
        token: ownerToken, body: { type: type.id, message: 'qisq' },
      }));
    await both("POST /feedback (tur yo'q → 400)", (b) =>
      req(b, 'POST', '/api/feedback', {
        token: ownerToken, body: { message: 'yetarlicha uzun matn' },
      }));
    await both("POST /feedback (noma'lum tur → 400)", (b) =>
      req(b, 'POST', '/api/feedback', {
        token: ownerToken,
        body: { type: 'a'.repeat(24), message: 'yetarlicha uzun matn' },
      }));
    await both("POST /feedback (noma'lum guruh → 400)", (b) =>
      req(b, 'POST', '/api/feedback', {
        token: ownerToken,
        body: { type: type.id, group: 'a'.repeat(24), message: 'yetarlicha uzun matn' },
      }));

    // ═══════════════ ANONIMLIK ═══════════════
    head('anonimlik (muallif SAQLANMAYDI)');

    const anon = { [EXPRESS]: null, [NEST]: null };
    await both('POST /feedback (anonim)', async (b) => {
      const r = await submitOne(b, ownerToken, { tag: 'anon', isAnonymous: true });
      if (r.status === 201) anon[b] = r.body.data.id;
      return r;
    });

    if (anon[EXPRESS] && anon[NEST]) {
      // ⚠ ASOSIY TASDIQ: anonim fikrda `authorId` BAZADA ham `null`.
      const rows = await prisma.feedback.findMany({
        where: { id: { in: [anon[EXPRESS], anon[NEST]] } },
        select: { id: true, authorId: true, isAnonymous: true },
      });
      try {
        assert.equal(rows.length, 2);
        assert.ok(rows.every((r) => r.isAnonymous === true), 'isAnonymous=true emas');
        assert.ok(rows.every((r) => r.authorId === null), 'ANONIM FIKRDA MUALLIF SAQLANDI!');
        ok('anonim fikrda `authorId` BAZADA ham null (ikkala stekda)');
      } catch (err) { bad('anonimlik buzildi', err.message); }

      // ⚠ ANONIM FIKR `/me` DA KO'RINMAYDI — u `authorId` bo'yicha
      // qidiradi va anonimda u yo'q.
      const meAfter = await req(EXPRESS, 'GET', '/api/feedback/me?limit=500', { token: ownerToken });
      const anonInMe = (meAfter.body?.data || []).some((f) => f.id === anon[EXPRESS]);
      try {
        assert.equal(anonInMe, false, "anonim fikr `/me` da ko'rindi");
        ok("anonim fikr `/me` ro'yxatida YO'Q");
      } catch (err) { bad('anonim fikr /me da', err.message); }
    }

    // ═══════════════ HOLAT O'TISHLARI ═══════════════
    //
    // ⚠ Bot ulanishi bo'lsa ANONIM yozuvda ishlaymiz (xabar
    // yaratilmaydi); bo'lmasa oddiy yozuvda — xabar yo'li ham
    // o'lchanadi.
    head("holat o'tishlari (yopilganini qayta ochib bo'lmaydi)");

    const flow = notifySafe ? created : anon;
    if (flow[EXPRESS] && flow[NEST]) {
      await both('POST /:id/review (new → in_review)', (b) =>
        req(b, 'POST', `/api/feedback/${flow[b]}/review`, { token: ownerToken }));

      // ⚠ IKKINCHI MARTA `review` — endi holat `new` emas, 409.
      await both('POST /:id/review (takroriy → 409)', (b) =>
        req(b, 'POST', `/api/feedback/${flow[b]}/review`, { token: ownerToken }));

      // ⚠ JAVOB HOLATNI O'ZGARTIRMAYDI — alohida amal.
      await both('POST /:id/reply', (b) =>
        req(b, 'POST', `/api/feedback/${flow[b]}/reply`, {
          token: ownerToken, body: { message: 'Paritet javobi' },
        }));
      const afterReply = await prisma.feedback.findUnique({
        where: { id: flow[EXPRESS] }, select: { status: true, adminReply: true },
      });
      try {
        assert.equal(afterReply.status, 'in_review', 'javob holatni o\'zgartirdi');
        assert.equal(afterReply.adminReply, 'Paritet javobi');
        ok("javob HOLATNI o'zgartirmadi (in_review saqlandi)");
      } catch (err) { bad('javob holatni o\'zgartirdi', err.message); }

      await both("POST /:id/reply (bo'sh matn → 400)", (b) =>
        req(b, 'POST', `/api/feedback/${flow[b]}/reply`, {
          token: ownerToken, body: { message: '   ' },
        }));

      await both('POST /:id/resolve', (b) =>
        req(b, 'POST', `/api/feedback/${flow[b]}/resolve`, {
          token: ownerToken, body: { adminReply: 'Hal qilindi izohi' },
        }));

      // ⚠⚠ ASOSIY QOIDA: YOPILGANNI QAYTA OCHIB BO'LMAYDI.
      await both("POST /:id/review (yopilganni qayta ochish → 409)", (b) =>
        req(b, 'POST', `/api/feedback/${flow[b]}/review`, { token: ownerToken }));

      // ⚠ MUSBAT NAZORAT: `resolved` → `rejected` MUMKIN (bu taqiqlangan
      // o'tish EMAS) — ya'ni yuqoridagi 409 "hamma narsa bloklangan"
      // degani emas.
      await both('MUSBAT NAZORAT: resolved → rejected MUMKIN', (b) =>
        req(b, 'POST', `/api/feedback/${flow[b]}/reject`, {
          token: ownerToken, body: { rejectionReason: 'Paritet sababi' },
        }));

      await both("POST /:id/reject (sabab yo'q → 400)", (b) =>
        req(b, 'POST', `/api/feedback/${flow[b]}/reject`, {
          token: ownerToken, body: {},
        }));

      await both('POST /:id/resolve (404)', (b) =>
        req(b, 'POST', `/api/feedback/${'a'.repeat(24)}/resolve`, {
          token: ownerToken, body: {},
        }));
    } else {
      skip("holat o'tishlari", 'fikr yaratilmadi');
    }

    // ═══════════════ RUXSAT VA EGALIK ═══════════════
    head('ruxsat va egalik chegaralari');

    try {
      const pw = await req(EXPRESS, 'GET', `/api/users/${qa.id}/password`, { token: ownerToken });
      if (pw.status !== 200) throw new Error("parol o'qilmadi");
      qaToken = await login(EXPRESS, pw.body.data.username, pw.body.data.password);

      // ⚠ MUSBAT NAZORAT: aktyor fikr YOZA oladi va O'ZINIKINI ko'radi
      // (bu marshrutlar ruxsatsiz). Bu bo'lmasa pastdagi 403 lar
      // "umuman kira olmaydi" degani bo'lardi.
      const mineE = await req(EXPRESS, 'GET', '/api/feedback/me', { token: qaToken });
      const mineN = await req(NEST, 'GET', '/api/feedback/me', { token: qaToken });
      if (mineE.status !== 200 || mineN.status !== 200) {
        throw new Error(`/me 200 BERMADI (${mineE.status}/${mineN.status})`);
      }
      await both("MUSBAT NAZORAT: `/me` ruxsatsiz ishlaydi → 200", (b) =>
        req(b, 'GET', '/api/feedback/me', { token: qaToken }));

      const own = { [EXPRESS]: null, [NEST]: null };
      await both('MUSBAT NAZORAT: fikr yozish ruxsatsiz ishlaydi → 201', async (b) => {
        const r = await submitOne(b, qaToken, { tag: 'own' });
        if (r.status === 201) own[b] = r.body.data.id;
        return r;
      });

      // ⚠ MUALLIF O'Z FIKRINI KO'RA OLADI (`ensureOwnerOrAuthor`).
      if (own[EXPRESS] && own[NEST]) {
        await both("MUSBAT NAZORAT: muallif O'Z fikrini ko'radi → 200", (b) =>
          req(b, 'GET', `/api/feedback/${own[b]}`, { token: qaToken }));
      }

      // ⚠ BEGONA FIKRNI KO'RA OLMAYDI → 403.
      if (created[EXPRESS] && created[NEST]) {
        await both("begona fikrni KO'RA olmaydi → 403", (b) =>
          req(b, 'GET', `/api/feedback/${created[b]}`, { token: qaToken }));
      }
      // ⚠ ANONIM FIKR MUALLIFIGA HAM KO'RINMAYDI.
      if (anon[EXPRESS] && anon[NEST]) {
        await both("anonim fikr (owner yozgan) qa uchun → 403", (b) =>
          req(b, 'GET', `/api/feedback/${anon[b]}`, { token: qaToken }));
      }

      // `feedback.read` / `feedback.respond` YO'Q → 403.
      for (const [label, call] of [
        ['GET /feedback', (b) => req(b, 'GET', '/api/feedback', { token: qaToken })],
        ['GET /feedback/stats', (b) => req(b, 'GET', '/api/feedback/stats', { token: qaToken })],
        ['POST /:id/review', (b) => req(b, 'POST', `/api/feedback/${own[b] || 'a'.repeat(24)}/review`, { token: qaToken })],
        ['POST /:id/reply', (b) => req(b, 'POST', `/api/feedback/${own[b] || 'a'.repeat(24)}/reply`, { token: qaToken, body: { message: 'x' } })],
        ['POST /:id/resolve', (b) => req(b, 'POST', `/api/feedback/${own[b] || 'a'.repeat(24)}/resolve`, { token: qaToken, body: {} })],
        ['POST /:id/reject', (b) => req(b, 'POST', `/api/feedback/${own[b] || 'a'.repeat(24)}/reject`, { token: qaToken, body: { rejectionReason: 'x' } })],
      ]) {
        await both(`ruxsat yo'q → ${label} 403`, call);
      }
    } catch (err) {
      skip('ruxsat va egalik', err.message);
    }
  } finally {
    // ═══════════════ TOZALASH ═══════════════
    let cleaned = 0;

    // Holat o'zgarishi yaratgan bildirishnomalar (mening fikrlarimga
    // bog'langan) — AVVAL oluvchilar, keyin xabar (FK).
    if (madeFeedbackIds.length) {
      const notifs = await prisma.notification.findMany({
        where: { relatedFeedbackId: { in: madeFeedbackIds } },
        select: { id: true },
      });
      if (notifs.length) {
        const nids = notifs.map((n) => n.id);
        const r1 = await prisma.notificationRecipient.deleteMany({
          where: { notificationId: { in: nids } },
        });
        const r2 = await prisma.notification.deleteMany({ where: { id: { in: nids } } });
        cleaned += r1.count + r2.count;
      }
    }

    // Prefiksli fikrlar — shu yurishdagi va oldingi yurishlardan qolgani.
    const strays = await prisma.feedback.findMany({
      where: { message: { startsWith: PREFIX } }, select: { id: true },
    });
    const ids = [...new Set([...madeFeedbackIds, ...strays.map((s) => s.id)])];
    if (ids.length) {
      // Bog'liq bildirishnomalar qolmasin (FK).
      const leftNotifs = await prisma.notification.findMany({
        where: { relatedFeedbackId: { in: ids } }, select: { id: true },
      });
      if (leftNotifs.length) {
        const lids = leftNotifs.map((n) => n.id);
        await prisma.notificationRecipient.deleteMany({ where: { notificationId: { in: lids } } });
        await prisma.notification.deleteMany({ where: { id: { in: lids } } });
        cleaned += lids.length;
      }
      const r = await prisma.feedback.deleteMany({ where: { id: { in: ids } } });
      cleaned += r.count;
    }

    console.log(`\n  🧹 tozalandi: ${cleaned} ta yozuv`);

    // ── SILJISH TEKSHIRUVI ──
    const after = {
      feedback: await prisma.feedback.count(),
      notifications: await prisma.notification.count(),
      recipients: await prisma.notificationRecipient.count(),
    };
    try {
      assert.deepEqual(after, before, `siljish: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
      ok(`baza siljimadi (fikr=${after.feedback}, xabar=${after.notifications})`);
    } catch (err) { bad('BAZA SILJIDI', err.message); }

    await prisma.$disconnect();
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
  process.exit(R.fail || R.unmeasured ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
