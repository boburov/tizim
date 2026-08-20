/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PARITET GARNIZONI — UMUMIY QISM.
 *
 * `auth-parity`, `roles-parity`, `users-parity`, `branches-parity` har biri
 * `req` / `normalize` / `login` / `both` ni O'ZIDA takrorlaydi. FAZA 3–6 da
 * yana o'nlab modul qo'shiladi, shuning uchun bu qism BIR JOYGA olindi.
 *
 * ⚠ MAVJUD TESTLAR O'ZGARTIRILMADI. Ular ishlab turibdi va ularni ko'chirish
 * paritetni o'lchaydigan kodni o'zgartirish demakdir — ya'ni tekshiruvchini
 * tekshirilayotgan narsa bilan birga tahrirlash. Yangi testlar shu
 * garnizondan foydalanadi.
 *
 * ── MUSBAT NAZORAT (`R.unmeasured`) ──
 *
 * Tekshiruv bajarilmasa u YASHIL emas, SARIQ bo'ladi va yakunda test
 * YIQILADI. Sabab: ikkala stek ham bir xil xato qaytarsa (masalan token
 * eskirgan → 401/401) `deepEqual` MUVAFFAQIYATLI bo'ladi va "paritet
 * saqlangan" degan YOLG'ON natija chiqadi. Shuning uchun har bir
 * to'plamda kamida bitta MUVAFFAQIYATLI (2xx) javob bo'lishi TALAB
 * QILINADI (`requireSuccess`).
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';

export const EXPRESS = process.env.EXPRESS_URL || 'http://127.0.0.1:5000';
export const NEST = process.env.NEST_URL || 'http://127.0.0.1:5001';

/** Har chaqiruvda o'zgaradigan maydonlar — solishtirilmaydi. */
const VOLATILE = new Set([
  'createdAt', 'updatedAt', 'deletedAt', 'archivedAt', 'stack',
  'accessToken', 'refreshToken', 'latencyMs', 'iat', 'exp',
]);

export const request = async (base, method, path, { token, body, headers: extra } = {}) => {
  const headers = { 'content-type': 'application/json', ...(extra || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
};

/** Stekka xos qiymatlarni belgiga almashtiradi (ID, nom, ...). */
export const normalize = (v, subs = []) => {
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
    for (const sub of subs) {
      // ── FUNKSIYA SHAKLI ──
      // Ba'zi qiymatlarni ro'yxat bilan sanab bo'lmaydi: masalan
      // `validFrom` server tomonda `new Date()` bilan qo'yiladi va
      // ikkala stekda MILLISEKUND farq qiladi. Funksiya shakli shunday
      // qiymatlarni QOIDA bo'yicha normallashtiradi.
      if (typeof sub === 'function') { s = sub(s); continue; }
      const [from, to] = sub;
      if (from) s = s.split(from).join(to);
    }
    return s;
  }
  return v;
};

/**
 * "HOZIR" atrofidagi vaqt tamg'asini `<NOW>` ga almashtiradigan qoida.
 *
 * ⚠ NEGA KALITNI BUTUNLAY TASHLAB YUBORMAYMIZ (`VOLATILE` kabi):
 * `validFrom` ning QIYMATI ba'zan tekshirilishi SHART — masalan
 * kelajakdagi narx (`2099-01-01`) `isPending` bayrog'ini belgilaydi.
 * Kalit tashlansa o'sha tekshiruv jimgina yo'qolardi.
 *
 * Shuning uchun faqat test YURISHI DAVOMIDAGI tamg'alar
 * normallashtiriladi; uzoq o'tmish va kelajak O'Z HOLICHA solishtiriladi.
 *
 * @param windowMs oyna kengligi (standart 10 daqiqa)
 */
export const nowStamps = (windowMs = 10 * 60 * 1000) => {
  const t0 = Date.now();
  return (s) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) return s;
    const t = Date.parse(s);
    if (Number.isNaN(t)) return s;
    return Math.abs(t - t0) <= windowMs ? '<NOW>' : s;
  };
};

export const login = async (base, l, p) => {
  const r = await request(base, 'POST', '/api/auth/login', {
    body: { login: l, password: p },
  });
  if (r.status !== 200) {
    throw new Error(`login ${l}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r.body.data.accessToken;
};

/**
 * ═══════════════════════════════════════════════════════════════════════
 * TOKENNI TO'G'RIDAN-TO'G'RI IMZOLASH — `POST /auth/login` O'RNIGA.
 *
 * ⚠ NEGA LOGIN CHAQIRILMAYDI: `authLimiter` 5 daqiqada 20 ta urinishga
 * ruxsat beradi. Paritet testlari bir necha aktyor bilan ishlaydi va
 * ketma-ket ishga tushirilganda kvota tugaydi — o'shanda IKKALA stek
 * ham bir xil 429 qaytaradi, `deepEqual` MUVAFFAQIYATLI bo'ladi va test
 * "paritet saqlangan" degan YOLG'ON yashil beradi. Aynan shu sodir
 * bo'lgan edi.
 *
 * Chegarani testda "o'chirib qo'yish" MUMKIN EMAS — u ishlab chiqarish
 * himoyasi. Shuning uchun login yo'li CHETLAB O'TILADI: `/auth/login`
 * ning O'ZI `test/auth-parity.test.mjs` da alohida sinaladi, bu yerda
 * esa faqat TOKEN kerak.
 *
 * Payload Express `issueTokens()` bilan AYNAN bir xil: `{ sub, role }`.
 * Boshqacha bo'lsa auth middleware uni rad etardi.
 * ═══════════════════════════════════════════════════════════════════════
 */
const readEnv = () => {
  // `.env` BITTA joyda — `server/.env` (NestJS ham o'shani o'qiydi).
  const raw = readFileSync(new URL('../../server/.env', import.meta.url), 'utf8');
  const out = {};
  for (const line of raw.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
};

let envCache = null;

/**
 * @param user `{ id, role }` — bazadan olingan foydalanuvchi
 */
export const mintToken = (user) => {
  envCache ||= readEnv();
  const secret = envCache.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET topilmadi (server/.env)');
  return jwt.sign(
    { sub: String(user.id), role: user.role },
    secret,
    { expiresIn: envCache.JWT_ACCESS_TTL || '15m' },
  );
};

/**
 * Ikkala stekni ham ishga tushishini KUTADI — ular alohida
 * jarayonlarda ko'tariladi va NestJS ulanishi bir necha soniya oladi.
 */
export const waitForStacks = async (timeoutMs = 30000) => {
  const t0 = Date.now();
  const down = [];
  for (const base of [EXPRESS, NEST]) {
    let up = false;
    while (Date.now() - t0 < timeoutMs) {
      try {
        const r = await fetch(`${base}/api/health`);
        if (r.ok) { up = true; break; }
      } catch { /* hali ko'tarilmadi */ }
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!up) down.push(base);
  }
  if (down.length) {
    throw new Error(
      `stek javob bermadi: ${down.join(', ')} — ikkalasi ham ishlashi SHART, ` +
      'aks holda test "farq yo\'q" deb yolg\'on yashil berardi',
    );
  }
};

export const createReporter = (title) => {
  const R = { pass: 0, fail: 0, unmeasured: 0, successes: 0 };

  const ok = (n) => { R.pass += 1; console.log(`  ✅ ${n}`); };
  const bad = (n, m) => { R.fail += 1; console.log(`  ❌ ${n}\n      ${m}`); };
  const skip = (n, m) => {
    R.unmeasured += 1;
    console.log(`  ⚠️  ${n} — O'LCHANMADI: ${m}`);
  };
  const section = (n) => console.log(`\x1b[2m  ── ${n} ──\x1b[0m`);

  /**
   * Bir xil so'rovni IKKALA stekka yuboradi va javoblarni solishtiradi.
   *
   * @param name    tekshiruv nomi
   * @param fn      `(base) => Promise<{status, body}>`
   * @param subsOf  `(base) => [[from, to], ...]` — stekka xos almashtirishlar
   */
  const both = async (name, fn, subsOf = () => []) => {
    let e, n;
    try {
      e = await fn(EXPRESS);
      n = await fn(NEST);
    } catch (err) {
      skip(name, err.message);
      return {};
    }
    const en = { status: e.status, body: normalize(e.body, subsOf(EXPRESS)) };
    const nn = { status: n.status, body: normalize(n.body, subsOf(NEST)) };
    if (e.status >= 200 && e.status < 300) R.successes += 1;
    try {
      assert.deepEqual(nn, en);
      ok(`${name} — ${e.status}`);
    } catch {
      bad(
        name,
        `express: ${JSON.stringify(en).slice(0, 800)}\n      ` +
        `nest   : ${JSON.stringify(nn).slice(0, 800)}`,
      );
    }
    return { e, n };
  };

  const finish = ({ requireSuccess = true } = {}) => {
    // ⚠ MUSBAT NAZORAT: birorta so'rov 2xx qaytarmagan bo'lsa, hamma
    // tekshiruv bir xil XATO ustida "bir xil" bo'lgan bo'lishi mumkin.
    if (requireSuccess && R.successes === 0) {
      R.fail += 1;
      console.log(
        "\n  ❌ O'LCHANMADI: birorta so'rov 2xx qaytarmadi.\n" +
        '     Token eskirgan yoki ma\'lumot yo\'q bo\'lishi mumkin — bu holda\n' +
        '     ikkala stek ham BIR XIL xato beradi va paritet YOLG\'ON yashil chiqadi.',
      );
    }
    console.log(
      `\n  Natija (${title}): ${R.pass} o'tdi, ${R.fail} yiqildi, ` +
      `${R.unmeasured} o'lchanmadi\n`,
    );
    return R.fail || R.unmeasured ? 1 : 0;
  };

  return { R, ok, bad, skip, section, both, finish };
};
