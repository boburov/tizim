/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 10 — SAQLAGICH (FAYLLAR) MODULI PARITETI. 7 marshrut.
 *
 * ── ⚠ NEGA BU TEST BOSHQALARDAN XAVFLIROQ ──
 *
 * `POST /storage/cleanup` HAQIQIY fayllarni diskdan o'chiradi va ularni
 * QAYTARIB BO'LMAYDI. Shuning uchun:
 *
 *   1. Tozalash FAQAT O'Z FIXTURE'larimiz ustida ishlaydi. Nishon
 *      `olderThanDays` bilan tanlanadi va fixture'lar ATAYLAB o'tmishga
 *      surilgan (`createdAt`) — real fayllar esa yangi.
 *   2. ⚠ SHART OLDINDAN O'LCHANADI: tozalashdan OLDIN "shu filtrga
 *      tushadigan BEGONA fayl bormi" deb sanaladi. Bitta bo'lsa ham
 *      tozalash O'TKAZIB YUBORILADI — TAXMIN QILINMAYDI.
 *   3. `all: true` bilan tozalash HECH QACHON bajarilmaydi — faqat
 *      `preview` (u hech narsa o'chirmaydi).
 *
 * ── KVOTA HISOBI ──
 *
 * Fixture'lar diskka HAM yoziladi, `StorageUsage` hisoblagichi ham
 * qo'lda oshiriladi — ya'ni haqiqiy yuklashning holati taqlid qilinadi.
 * Shundagina o'chirish yo'li (`release`) haqiqatan o'lchanadi.
 *
 * ── ⚠ FAYL PAPKASI ──
 *
 * Ikki stek BIR XIL papkani ko'rsatishi SHART (`UPLOAD_DIR` mutlaq
 * yo'l). Aks holda NestJS o'chirgan fayl diskda QOLIB ketardi, hisoblagich
 * esa kamayardi — va test buni TUTADI (diskdagi fayl yo'qolganini ochiq
 * tekshiradi).
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../../server_legacy/src/config/prisma.js';

const EXPRESS = process.env.EXPRESS_URL || 'http://127.0.0.1:5000';
const NEST = process.env.NEST_URL || 'http://127.0.0.1:5001';
const PREFIX = '__parity_';
const UPLOAD_DIR = process.env.PARITY_UPLOAD_DIR
  || path.resolve(process.cwd(), 'uploads');

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

const req = async (base, method, path_, { token, body } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + path_, {
    method, headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
};

// `nextRunAt` HAR CHAQIRUVDA "hozir + N kun" — ikki stek orasida
// millisekundlarga farq qiladi. Uning SHAKLI alohida tekshiriladi.
const VOLATILE = new Set(['createdAt', 'updatedAt', 'deletedAt', 'stack', 'nextRunAt', 'reconciledAt']);

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

/** ⚠ LOGIN CHEGARASIGA (429) CHIDAMLI — `login-rate-limit` izohiga qarang. */
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

const usedBytesNow = async () => {
  const row = await prisma.storageUsage.findUnique({ where: { key: 'global' } });
  return row?.usedBytes ?? 0;
};

const main = async () => {
  console.log(`\n${BOLD}FAZA 10 — SAQLAGICH MODULI PARITETI${OFF}\n`);
  note(`fayl papkasi: ${UPLOAD_DIR}`);

  const ownerToken = await login(EXPRESS, 'owner', 'owner123');

  // ── BOSHLANG'ICH SURAT ──
  const settingsBefore = await prisma.storageSettings.findUnique({ where: { id: 'default' } });
  const before = {
    files: await prisma.storedFile.count(),
    activeFiles: await prisma.storedFile.count({ where: { isDeleted: false } }),
    usedBytes: await usedBytesNow(),
  };
  note(`boshlang'ich: fayl=${before.files} (faol ${before.activeFiles}), band=${before.usedBytes} bayt`);

  const qa = await prisma.user.findFirst({ where: { username: 'qa_staff_a' }, select: { id: true } });
  const owner = await prisma.user.findFirst({ where: { username: 'owner' }, select: { id: true } });
  if (!qa || !owner) { console.log('  ❌ fixture foydalanuvchi topilmadi'); process.exit(1); }

  const stamp = String(process.hrtime.bigint()).slice(-9);
  const madeFileIds = [];
  const madeAssignmentIds = [];
  const madeDiskPaths = [];
  const FIXTURE_SIZE = 1024; // 1 KB — kvota hisobida ko'rinadigan, lekin zararsiz

  const subsOf = () => [];

  const both = async (name, fn) => {
    let e, n;
    try { e = await fn(EXPRESS); n = await fn(NEST); }
    catch (err) { skip(name, err.message); return {}; }
    const en = { status: e.status, body: normalize(e.body, subsOf()) };
    const nn = { status: n.status, body: normalize(n.body, subsOf()) };
    try { assert.deepEqual(nn, en); ok(`${name} — ${e.status}`); }
    catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 700)}\n      nest   : ${JSON.stringify(nn).slice(0, 700)}`);
    }
    return { e, n };
  };

  /**
   * HAQIQIY YUKLASHNI TAQLID QILADI: diskka fayl, bazaga qator,
   * hisoblagichga bayt. Uchalasi ham bo'lmasa o'chirish yo'li
   * (`release` + `unlink`) haqiqatan o'lchanmasdi.
   */
  const makeFixtureFile = async ({ ageDays = 0, withAssignment = false } = {}) => {
    const rel = path.join(`${PREFIX}${stamp}`, `f${madeFileIds.length}.bin`);
    const abs = path.join(UPLOAD_DIR, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, Buffer.alloc(FIXTURE_SIZE, 7));
    madeDiskPaths.push(abs);

    const createdAt = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
    const file = await prisma.storedFile.create({
      data: {
        originalName: `${PREFIX}${stamp}.bin`,
        storedName: `${PREFIX}${stamp}-${madeFileIds.length}.bin`,
        relPath: rel,
        mimeType: 'application/octet-stream',
        size: FIXTURE_SIZE,
        purpose: 'assignment',
        uploadedById: owner.id,
        telegramFileId: 'PARITY_FAKE_TG_ID',
        createdAt,
      },
      select: { id: true },
    });
    madeFileIds.push(file.id);

    // Hisoblagichni ham oshiramiz — haqiqiy `saveBuffer` shunday qiladi.
    await prisma.storageUsage.updateMany({
      where: { key: 'global' },
      data: { usedBytes: { increment: FIXTURE_SIZE } },
    });

    let assignmentId = null;
    if (withAssignment) {
      const a = await prisma.assignment.create({
        data: { senderId: owner.id, title: `${PREFIX}${stamp}`, fileId: file.id },
        select: { id: true },
      });
      madeAssignmentIds.push(a.id);
      assignmentId = a.id;
    }
    return { id: file.id, abs, assignmentId };
  };

  try {
    // ═══════════════ O'QISH ═══════════════
    head("o'qish (kvota, sozlama, fayllar)");

    await both('GET /storage/usage', (b) => req(b, 'GET', '/api/storage/usage', { token: ownerToken }));
    await both('GET /storage/settings', (b) => req(b, 'GET', '/api/storage/settings', { token: ownerToken }));
    for (const q of ['', '?limit=5', '?sort=size&limit=5', '?sort=date&limit=5', '?page=2&limit=2']) {
      await both(`GET /storage/files${q}`, (b) =>
        req(b, 'GET', `/api/storage/files${q}`, { token: ownerToken }));
    }
    // ⚠ Chegara bu yerda 100 (umumiy 500 EMAS).
    await both('GET /storage/files?limit=101 → 400', (b) =>
      req(b, 'GET', '/api/storage/files?limit=101', { token: ownerToken }));
    await both('GET /storage/files?sort=__yoq__ → 400', (b) =>
      req(b, 'GET', '/api/storage/files?sort=__yoq__', { token: ownerToken }));
    await both("GET /storage/usage (token yo'q → 401)", (b) => req(b, 'GET', '/api/storage/usage'));

    // ═══════════════ TOZALASH PREVIEW (hech narsa o'chirmaydi) ═══════════════
    head("tozalash preview — HECH NARSA o'chirmaydi");

    await both('POST /cleanup/preview {all:true}', (b) =>
      req(b, 'POST', '/api/storage/cleanup/preview', { token: ownerToken, body: { all: true } }));
    await both('POST /cleanup/preview {olderThanDays:30}', (b) =>
      req(b, 'POST', '/api/storage/cleanup/preview', {
        token: ownerToken, body: { olderThanDays: 30 },
      }));

    // ⚠ ENG MUHIM VALIDATSIYA: bo'sh tana RAD ETILADI. Uni "hammasini
    // o'chir" deb talqin qilish bir bosishda butun markazni tozalardi.
    await both("POST /cleanup/preview (bo'sh tana → 400)", (b) =>
      req(b, 'POST', '/api/storage/cleanup/preview', { token: ownerToken, body: {} }));
    await both("POST /cleanup (bo'sh tana → 400)", (b) =>
      req(b, 'POST', '/api/storage/cleanup', { token: ownerToken, body: {} }));
    await both('POST /cleanup {olderThanDays:0} → 400', (b) =>
      req(b, 'POST', '/api/storage/cleanup', { token: ownerToken, body: { olderThanDays: 0 } }));
    await both('POST /cleanup {olderThanDays:99999} → 400', (b) =>
      req(b, 'POST', '/api/storage/cleanup', { token: ownerToken, body: { olderThanDays: 99999 } }));

    // ═══════════════ SOZLAMA YOZISH ═══════════════
    head('sozlama yozish');

    await both('PATCH /settings (olderThanDays)', (b) =>
      req(b, 'PATCH', '/api/storage/settings', {
        token: ownerToken, body: { olderThanDays: 200 },
      }));
    await both('PATCH /settings (frequency)', (b) =>
      req(b, 'PATCH', '/api/storage/settings', {
        token: ownerToken, body: { frequency: 'weekly' },
      }));
    await both('PATCH /settings (frequency __yoq__ → 400)', (b) =>
      req(b, 'PATCH', '/api/storage/settings', {
        token: ownerToken, body: { frequency: '__yoq__' },
      }));
    await both('PATCH /settings (olderThanDays 0 → 400)', (b) =>
      req(b, 'PATCH', '/api/storage/settings', {
        token: ownerToken, body: { olderThanDays: 0 },
      }));

    // ── `nextRunAt` SHAKLI (paritetda beqaror, shuning uchun alohida) ──
    const offRes = await req(EXPRESS, 'PATCH', '/api/storage/settings', {
      token: ownerToken, body: { autoCleanupEnabled: false },
    });
    const onRes = await req(EXPRESS, 'PATCH', '/api/storage/settings', {
      token: ownerToken, body: { autoCleanupEnabled: true, frequency: 'weekly' },
    });
    const onResN = await req(NEST, 'PATCH', '/api/storage/settings', {
      token: ownerToken, body: { autoCleanupEnabled: true, frequency: 'weekly' },
    });
    try {
      assert.equal(offRes.body?.data?.nextRunAt, null, "o'chiq holatda nextRunAt null bo'lishi kerak");
      const e = new Date(onRes.body.data.nextRunAt).getTime();
      const n = new Date(onResN.body.data.nextRunAt).getTime();
      // weekly = 7 kun. Ikki stek bir necha soniya farq bilan hisoblaydi.
      const expected = Date.now() + 7 * 24 * 60 * 60 * 1000;
      assert.ok(Math.abs(e - expected) < 60_000, `express nextRunAt kutilgandan uzoq: ${onRes.body.data.nextRunAt}`);
      assert.ok(Math.abs(n - expected) < 60_000, `nest nextRunAt kutilgandan uzoq: ${onResN.body.data.nextRunAt}`);
      ok('nextRunAt: yoqilmagan → null, weekly → ~7 kun (ikkala stekda)');
    } catch (err) { bad('nextRunAt', err.message); }

    // ═══════════════ RUXSAT CHEGARASI ═══════════════
    head('ruxsat chegarasi (`storage.manage`)');

    try {
      const pw = await req(EXPRESS, 'GET', `/api/users/${qa.id}/password`, { token: ownerToken });
      if (pw.status !== 200) throw new Error("parol o'qilmadi");
      const weak = await login(EXPRESS, pw.body.data.username, pw.body.data.password);

      // ⚠ MUSBAT NAZORAT: `/usage` RUXSATSIZ — har qanday auth'langan
      // foydalanuvchi o'qiy oladi. Bu bo'lmasa pastdagi 403 lar "token
      // yaroqsiz" degani bo'lardi.
      const uE = await req(EXPRESS, 'GET', '/api/storage/usage', { token: weak });
      const uN = await req(NEST, 'GET', '/api/storage/usage', { token: weak });
      if (uE.status !== 200 || uN.status !== 200) {
        throw new Error(`/usage 200 BERMADI (express=${uE.status}, nest=${uN.status})`);
      }
      await both("MUSBAT NAZORAT: `/usage` ruxsatsiz o'qiladi → 200", (b) =>
        req(b, 'GET', '/api/storage/usage', { token: weak }));

      for (const [label, call] of [
        ['GET /settings', (b) => req(b, 'GET', '/api/storage/settings', { token: weak })],
        ['PATCH /settings', (b) => req(b, 'PATCH', '/api/storage/settings', {
          token: weak, body: { olderThanDays: 10 } })],
        ['POST /cleanup/preview', (b) => req(b, 'POST', '/api/storage/cleanup/preview', {
          token: weak, body: { all: true } })],
        ['POST /cleanup', (b) => req(b, 'POST', '/api/storage/cleanup', {
          token: weak, body: { all: true } })],
        ['GET /files', (b) => req(b, 'GET', '/api/storage/files', { token: weak })],
        ['DELETE /files/:id', (b) => req(b, 'DELETE', `/api/storage/files/${'a'.repeat(24)}`, {
          token: weak })],
      ]) {
        await both(`\`storage.manage\` yo'q → ${label} 403`, call);
      }
    } catch (err) {
      skip('ruxsat chegarasi', err.message);
    }

    // ═══════════════ FAYL O'CHIRISH — KVOTA VA HAVOLA ═══════════════
    head("fayl o'chirish: disk + kvota + biriktirma havolasi");

    try {
      const fx = { [EXPRESS]: null, [NEST]: null };
      fx[EXPRESS] = await makeFixtureFile({ withAssignment: true });
      fx[NEST] = await makeFixtureFile({ withAssignment: true });

      // MUSBAT NAZORAT: hisoblagich fixture'larni HISOBGA OLDI.
      const usedWithFixtures = await usedBytesNow();
      try {
        assert.equal(usedWithFixtures, before.usedBytes + 2 * FIXTURE_SIZE);
        ok(`MUSBAT NAZORAT: kvota fixture'larni sanadi (+${2 * FIXTURE_SIZE} bayt)`);
      } catch (err) { bad('kvota fixture sanamadi', err.message); }

      // Ikkala stek ham ularni ro'yxatda ko'radi.
      const seen = await Promise.all([EXPRESS, NEST].map(async (b) => {
        const r = await req(b, 'GET', '/api/storage/files?limit=100&sort=date', { token: ownerToken });
        return (r.body?.data || []).filter((f) => String(f.originalName || '').startsWith(PREFIX)).length;
      }));
      try {
        assert.deepEqual(seen, [2, 2]);
        ok("ikkala stek ham fixture fayllarni ro'yxatda ko'radi");
      } catch (err) { bad("fayllar ro'yxati", `express=${seen[0]} nest=${seen[1]}`); }

      // ── HAR STEK O'ZINIKINI O'CHIRADI ──
      for (const b of [EXPRESS, NEST]) {
        const label = b === EXPRESS ? 'express' : 'nest';
        const usedBeforeDel = await usedBytesNow();
        const r = await req(b, 'DELETE', `/api/storage/files/${fx[b].id}`, { token: ownerToken });

        const row = await prisma.storedFile.findUnique({
          where: { id: fx[b].id },
          select: { isDeleted: true, deletedAt: true, telegramFileId: true },
        });
        const diskGone = await fs.access(fx[b].abs).then(() => false).catch(() => true);
        const usedAfterDel = await usedBytesNow();
        const asg = await prisma.assignment.findUnique({
          where: { id: fx[b].assignmentId },
          select: { fileId: true, fileRemovedAt: true },
        });

        try {
          assert.equal(r.status, 200, `javob ${r.status}`);
          assert.equal(row.isDeleted, true, 'qator arxivlanmadi');
          assert.ok(row.deletedAt, 'deletedAt qo\'yilmadi');
          // ⚠ BOTDAN MUSTAQIL: kesh nollanmasa o'chirilgan fayl
          // Telegram keshidan qayta yuborilishi mumkin edi.
          assert.equal(row.telegramFileId, null, 'telegramFileId nollanmadi');
          assert.equal(diskGone, true, "DISKDAGI FAYL O'CHMADI (UPLOAD_DIR mos emasmi?)");
          assert.equal(usedAfterDel, usedBeforeDel - FIXTURE_SIZE, 'kvota bo\'shatilmadi');
          assert.equal(asg.fileId, null, 'biriktirma havolasi uzilmadi');
          assert.ok(asg.fileRemovedAt, 'fileRemovedAt qo\'yilmadi');
          ok(`${label}: qator arxivlandi, disk tozalandi, kvota bo'shadi, havola uzildi`);
        } catch (err) { bad(`${label} o'chirish`, err.message); }
      }

      // ⚠ IKKI MARTA O'CHIRISH KVOTANI IKKI MARTA BO'SHATMASLIGI SHART.
      const usedBeforeDouble = await usedBytesNow();
      await both("DELETE takroriy → 404 (kvota ikki marta bo'shamaydi)", (b) =>
        req(b, 'DELETE', `/api/storage/files/${fx[b].id}`, { token: ownerToken }));
      const usedAfterDouble = await usedBytesNow();
      try {
        assert.equal(usedAfterDouble, usedBeforeDouble, 'takroriy o\'chirish kvotani o\'zgartirdi');
        ok("takroriy o'chirish kvotaga TEGMADI");
      } catch (err) { bad('takroriy o\'chirish kvotani buzdi', err.message); }

      await both('DELETE /files/:id (404)', (b) =>
        req(b, 'DELETE', `/api/storage/files/${'a'.repeat(24)}`, { token: ownerToken }));
      await both("DELETE /files/:id (noto'g'ri ID shakli → 400)", (b) =>
        req(b, 'DELETE', '/api/storage/files/__yoq__', { token: ownerToken }));
    } catch (err) {
      skip("fayl o'chirish", err.message);
    }

    // ═══════════════════════════════════════════════════════════════
    // ⚠⚠ BUZG'UNCHI: HAQIQIY TOZALASH — SHART OLDINDAN O'LCHANADI
    //
    // `runCleanup` HAQIQIY fayllarni o'chiradi. Shuning uchun nishon
    // filtri (`olderThanDays`) o'z fixture'larimizdan BOSHQA hech
    // narsani QAMRAB OLMASLIGI ochiq sanaladi. Bitta begona fayl
    // topilsa ham — O'TKAZIB YUBORAMIZ, TAXMIN QILMAYMIZ.
    // ═══════════════════════════════════════════════════════════════
    head("haqiqiy tozalash (buzg'unchi — shart o'lchangan holda)");

    try {
      const OLDER_THAN = 400; // kun
      const cutoff = new Date(Date.now() - OLDER_THAN * 24 * 60 * 60 * 1000);

      const foreign = await prisma.storedFile.count({
        where: {
          isDeleted: false,
          createdAt: { lt: cutoff },
          originalName: { not: { startsWith: PREFIX } },
        },
      });
      if (foreign > 0) {
        throw new Error(
          `filtrga ${foreign} ta BEGONA fayl tushadi — tozalash BAJARILMADI (TAXMIN QILINMADI)`,
        );
      }
      ok(`nishon toza: ${OLDER_THAN} kundan eski begona fayl YO'Q (o'lchandi)`);

      // Har stek uchun bittadan ESKI fixture.
      const oldE = await makeFixtureFile({ ageDays: 500, withAssignment: false });
      const oldN = await makeFixtureFile({ ageDays: 500, withAssignment: false });

      // MUSBAT NAZORAT: preview aynan 2 ta fayl ko'rsatadi — ya'ni
      // pastdagi natija "hech narsa topilmadi" dan kelib chiqmaydi.
      const pv = await req(EXPRESS, 'POST', '/api/storage/cleanup/preview', {
        token: ownerToken, body: { olderThanDays: OLDER_THAN },
      });
      try {
        assert.equal(pv.body?.data?.files, 2, `preview ${pv.body?.data?.files} ta ko'rsatdi`);
        ok('MUSBAT NAZORAT: preview aynan 2 ta fixture faylni ko\'rsatdi');
      } catch (err) { bad('preview noto\'g\'ri', err.message); }

      const usedBeforeCleanup = await usedBytesNow();
      const cE = await req(EXPRESS, 'POST', '/api/storage/cleanup', {
        token: ownerToken, body: { olderThanDays: OLDER_THAN },
      });
      // Express ikkalasini ham o'chiradi (filtr ikkalasini qamraydi),
      // shuning uchun Nest'ga hech narsa qolmaydi — javoblarni
      // solishtirish o'rniga HAR BIRINING TA'SIRI o'lchanadi.
      const cN = await req(NEST, 'POST', '/api/storage/cleanup', {
        token: ownerToken, body: { olderThanDays: OLDER_THAN },
      });
      const usedAfterCleanup = await usedBytesNow();

      const goneE = await fs.access(oldE.abs).then(() => false).catch(() => true);
      const goneN = await fs.access(oldN.abs).then(() => false).catch(() => true);

      try {
        assert.equal(cE.status, 200, `express ${cE.status}`);
        assert.equal(cN.status, 200, `nest ${cN.status}`);
        assert.equal(cE.body.data.deleted, 2, `express ${cE.body.data.deleted} ta o'chirdi`);
        // Express hammasini olib bo'lgan — Nest 0 ta topadi. Bu TO'G'RI
        // xulq va u ham tekshiriladi (ikki marta o'chirmaydi).
        assert.equal(cN.body.data.deleted, 0, `nest ${cN.body.data.deleted} ta o'chirdi (0 kutilgan)`);
        assert.equal(goneE && goneN, true, 'diskdagi fayllar o\'chmadi');
        assert.equal(usedAfterCleanup, usedBeforeCleanup - 2 * FIXTURE_SIZE, 'kvota bo\'shamadi');
        ok("tozalash: 2 ta fayl o'chdi, disk tozalandi, kvota bo'shadi, takror 0 ta");
      } catch (err) {
        bad('tozalash', `${err.message}\n      express=${JSON.stringify(cE.body?.data)} nest=${JSON.stringify(cN.body?.data)}`);
      }

      // MUSBAT NAZORAT: xabar matni ham to'g'ri shakllangan.
      try {
        assert.match(String(cE.body.message), /2 ta fayl o'chirildi/);
        assert.equal(cN.body.message, "O'chiriladigan fayl topilmadi");
        ok('tozalash xabarlari to\'g\'ri (topildi / topilmadi)');
      } catch (err) { bad('tozalash xabari', err.message); }
    } catch (err) {
      skip('haqiqiy tozalash', err.message);
    }
  } finally {
    // ═══════════════ TOZALASH ═══════════════
    let cleaned = 0;

    if (madeAssignmentIds.length) {
      const r = await prisma.assignment.deleteMany({ where: { id: { in: madeAssignmentIds } } });
      cleaned += r.count;
    }
    if (madeFileIds.length) {
      // Faqat HALI o'chirilmaganlar hisoblagichni band qilib turibdi.
      const alive = await prisma.storedFile.findMany({
        where: { id: { in: madeFileIds }, isDeleted: false },
        select: { size: true },
      });
      const aliveBytes = alive.reduce((a, f) => a + (f.size || 0), 0);
      if (aliveBytes) {
        await prisma.storageUsage.updateMany({
          where: { key: 'global' },
          data: { usedBytes: { decrement: aliveBytes } },
        });
      }
      const r = await prisma.storedFile.deleteMany({ where: { id: { in: madeFileIds } } });
      cleaned += r.count;
    }
    // Diskdagi qoldiq (o'chirilmagan fixture'lar) va papka.
    for (const p of madeDiskPaths) await fs.unlink(p).catch(() => null);
    await fs.rmdir(path.join(UPLOAD_DIR, `${PREFIX}${stamp}`)).catch(() => null);

    // ⚠ SOZLAMA TIKLANADI — u YAGONA qator va test uni o'zgartirdi.
    if (settingsBefore) {
      await prisma.storageSettings.update({
        where: { id: 'default' },
        data: {
          autoCleanupEnabled: settingsBefore.autoCleanupEnabled,
          frequency: settingsBefore.frequency,
          olderThanDays: settingsBefore.olderThanDays,
          lastRunAt: settingsBefore.lastRunAt,
          lastRunDeleted: settingsBefore.lastRunDeleted,
          lastRunFreedBytes: settingsBefore.lastRunFreedBytes,
        },
      });
      cleaned += 1;
    }

    console.log(`\n  🧹 tozalandi: ${cleaned} ta yozuv`);

    // ── SILJISH TEKSHIRUVI ──
    const after = {
      files: await prisma.storedFile.count(),
      activeFiles: await prisma.storedFile.count({ where: { isDeleted: false } }),
      usedBytes: await usedBytesNow(),
    };
    try {
      assert.deepEqual(after, before, `siljish: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
      ok(`baza siljimadi (fayl=${after.files}, band=${after.usedBytes} bayt)`);
    } catch (err) { bad('BAZA SILJIDI', err.message); }

    const settingsAfter = await prisma.storageSettings.findUnique({ where: { id: 'default' } });
    try {
      assert.equal(settingsAfter.autoCleanupEnabled, settingsBefore.autoCleanupEnabled);
      assert.equal(settingsAfter.frequency, settingsBefore.frequency);
      assert.equal(settingsAfter.olderThanDays, settingsBefore.olderThanDays);
      ok('saqlagich sozlamalari tiklandi');
    } catch (err) { bad('sozlama tiklanmadi', err.message); }

    await prisma.$disconnect();
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
  process.exit(R.fail || R.unmeasured ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
