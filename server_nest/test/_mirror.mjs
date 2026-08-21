/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KO'ZGU FIKSTURA GARNIZONI — MUTATSIYA PARITETI UCHUN.
 *
 * ── NEGA KERAK ──
 *
 * Mutatsiyani bir xil so'rovni ikki stekka yuborib sinab bo'lmaydi:
 * ikkinchi chaqiruv birinchisining natijasini ko'radi (balans allaqachon
 * o'zgargan, qator allaqachon yaratilgan) va HECH NARSA o'lchanmaydi.
 * Shuning uchun HAR STEKKA O'Z FIKSTURASI beriladi va javoblar
 * stekka xos qiymatlar belgiga almashtirilgandan KEYIN solishtiriladi.
 *
 * ⚠ MAVJUD TESTLAR TEGILMADI: `finance-core-parity` va
 * `groups-write-parity` bu naqshni o'z ichida yozgan va ular ishlab
 * turibdi. Bu fayl KEYINGI to'plamlar uchun — nusxa ko'chirish o'rniga.
 *
 * ── QAT'IY QOIDALAR ──
 *
 *  1. 429 → O'LCHANMADI (paritet EMAS). Ikkala stek ham 429 bo'lsa
 *     `deepEqual` muvaffaqiyatli bo'lardi va "farq yo'q" degan YOLG'ON
 *     yashil chiqardi.
 *  2. 5xx → O'LCHANMADI. Ataylab saqlangan xato uchun
 *     `{ allowServerError: true }` OCHIQ berilishi kerak.
 *  3. `expectStatus()` — paritetning O'ZI yetarli emas: ikkala stek ham
 *     400 qaytarsa mutatsiya UMUMAN bo'lmagan bo'ladi va undan keyingi
 *     baza tekshiruvlari BO'SH jadval ustida "hammasi joyida" deb
 *     yolg'on tasdiq berardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { EXPRESS, NEST, normalize } from './_harness.mjs';

/**
 * @param R        `createReporter()` natijasi
 * @param fx       `{ [EXPRESS]: fixture, [NEST]: fixture }`
 * @param subsOf   `(base) => [[from, to] | fn, ...]`
 */
export const makeMirror = (T, fx, subsOf) => {
  const { R, ok, bad, skip } = T;

  const rateLimited = (r) =>
    r?.status === 429 ||
    /so'rovlar soni juda ko'p/i.test(String(r?.body?.message || ''));

  const mirror = async (name, fn, { onEach = null, allowServerError = false } = {}) => {
    let e;
    let n;
    try {
      e = await fn(EXPRESS, fx[EXPRESS]);
      if (onEach) onEach(EXPRESS, e);
      n = await fn(NEST, fx[NEST]);
      if (onEach) onEach(NEST, n);
    } catch (err) { skip(name, err.message); return {}; }

    if (rateLimited(e) || rateLimited(n)) {
      skip(name, `429 — tezlik chegarasi (express=${e?.status}, nest=${n?.status})`);
      return {};
    }
    if (!allowServerError && (e.status >= 500 || n.status >= 500)) {
      skip(
        name,
        `server xatosi — express=${e.status} ${JSON.stringify(e.body).slice(0, 250)}, ` +
          `nest=${n.status} ${JSON.stringify(n.body).slice(0, 250)}`,
      );
      return {};
    }
    if (e.status >= 200 && e.status < 300) R.successes += 1;

    const en = { status: e.status, body: normalize(e.body, subsOf(EXPRESS)) };
    const nn = { status: n.status, body: normalize(n.body, subsOf(NEST)) };
    try { assert.deepEqual(nn, en); ok(`${name} — ${e.status}`); } catch {
      bad(
        name,
        `express: ${JSON.stringify(en).slice(0, 900)}\n      ` +
          `nest   : ${JSON.stringify(nn).slice(0, 900)}`,
      );
    }
    return { e, n };
  };

  const ranOk = (m) => Boolean(m && m.e && m.n);

  const expectStatus = (m, code, name) => {
    if (!ranOk(m)) { skip(`${name} (status)`, "so'rov o'lchanmadi"); return false; }
    if (m.e.status !== code) {
      bad(
        `${name} — KUTILGAN STATUS`,
        `kutilgan ${code}, keldi ${m.e.status}: ${JSON.stringify(m.e.body).slice(0, 300)}`,
      );
      return false;
    }
    ok(`${name} — kutilgan status ${code} tasdiqlandi`);
    return true;
  };

  /** Ikkala stekdagi AYNI BAZA o'lchovini solishtiradi. */
  const bothDb = async (name, fn) => {
    let e;
    let n;
    try { e = await fn(fx[EXPRESS]); n = await fn(fx[NEST]); }
    catch (err) { skip(name, err.message); return null; }
    if (JSON.stringify(e) === JSON.stringify(n)) {
      ok(`${name} — ${JSON.stringify(e)}`);
      return e;
    }
    bad(name, `express: ${JSON.stringify(e)}\n      nest   : ${JSON.stringify(n)}`);
    return null;
  };

  return { mirror, expectStatus, bothDb, ranOk };
};

/** Shu yurishga xos mijoz manzili — umumiy chegara byudjetini yemaydi. */
export const runIp = () =>
  `198.51.100.${(Number(process.hrtime.bigint() % 200n) + 20)}`;
