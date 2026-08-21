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
  // ⚠ `durationMs` — O'LCHOV, biznes qiymati EMAS. Import/eksport
  // javoblarida u har chaqiruvda millisekundlarga farq qiladi va uni
  // solishtirish HAR DOIM qizil berardi.
  'durationMs',
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
  const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
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
        // ⚠ 429 HAM "TIRIK" DEGANI. Umumiy chegara (200/daq) ketma-ket
        // yurgizilgan to'plamlarda `/api/health` ni ham rad etadi —
        // o'shanda bu funksiya "stek javob bermadi" deb BUTUN to'plamni
        // yiqitardi, holbuki server ISHLAB TURIBDI. Aynan shu holat
        // o'lchandi: 66 ta to'plam ketma-ket yurganda.
        if (r.ok || r.status === 429) { up = true; break; }
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
  /**
   * @param onEach `(base, res) => void` — javob KELGANDA, lekin
   *        solishtirishdan OLDIN chaqiriladi. Testga stekka xos
   *        qiymatlarni (bazada generatsiya qilingan ID'lar) yig'ib
   *        olish imkonini beradi — ular `subsOf()` da belgiga
   *        almashtiriladi. Usiz har bir chaqiruvni qo'lda o'rash
   *        kerak bo'lardi va bu qavslarni chalkashtirardi.
   */
  /**
   * ═══════════════════════════════════════════════════════════════════
   * INFRASTRUKTURA NOSOZLIGI — "PARITET" EMAS.
   *
   * Bu naqshlar ikkala stekda ham bir xil chiqadi va `deepEqual` ni
   * MUVAFFAQIYATLI qiladi — ya'ni "farq yo'q" degan YOLG'ON yashil.
   * Sabab kodda emas: ulanish hovuzi to'lgan, server ko'tarilmagan,
   * tranzaksiya kutishdan chiqib ketgan.
   *
   * ⚠ MEMORY: `pg-connections-look-like-regression` — ommaviy 500
   * ko'rilganda avval server logi o'qilishi kerak.
   * ═══════════════════════════════════════════════════════════════════
   */
  const INFRA_PATTERNS = [
    /too many clients/i,
    /Timed out fetching a new connection/i,
    /Can't reach database server/i,
    /ECONNREFUSED/i,
    /Transaction API error/i,
    /Transaction already closed/i,
  ];

  const infraReason = (res) => {
    const text = typeof res.body === 'string' ? res.body : JSON.stringify(res.body || '');
    const hit = INFRA_PATTERNS.find((re) => re.test(text));
    return hit ? hit.source : null;
  };

  /**
   * @param opts.allowServerError 5xx ni HAQIQIY tekshiruv deb sanaydi.
   *        ⚠ FAQAT ikkala stekda ATAYLAB saqlangan xato uchun (B4 kabi)
   *        va izoh bilan. Standart holda 5xx O'LCHANMADI deb belgilanadi:
   *        `500/500` `deepEqual` ni muvaffaqiyatli qiladi va "paritet
   *        saqlandi" degan yolg'on yashil beradi, holbuki hech narsa
   *        o'lchanmagan.
   */
  const both = async (name, fn, subsOf = () => [], onEach = null, opts = {}) => {
    let e, n;
    try {
      e = await fn(EXPRESS);
      if (onEach) onEach(EXPRESS, e);
      n = await fn(NEST);
      if (onEach) onEach(NEST, n);
    } catch (err) {
      skip(name, err.message);
      return {};
    }
    // ═══════════════════════════════════════════════════════════════════
    // ⚠ TEZLIK CHEGARASI (429) — BU TEKSHIRUV EMAS, O'LCHOVSIZLIK.
    //
    // Express'da umumiy chegara 200 so'rov/daqiqa (`generalLimiter`).
    // Paritet to'plamlari ketma-ket (yoki ikki agent bir vaqtda)
    // ishlaganda oyna tugaydi va IKKI XIL YOLG'ON tug'iladi:
    //
    //   • IKKALA stek ham 429 → `deepEqual` MUVAFFAQIYATLI bo'ladi va
    //     tekshiruv YASHIL chiqadi — hech narsa o'lchanmagan holda.
    //     (Yuqoridagi `mintToken` izohi aynan shu holatni tasvirlaydi,
    //     lekin faqat LOGIN yo'li uchun hal qilingan edi.)
    //
    //   • BITTASI 429 → soxta QIZIL. O'lchandi: `attendance-parity`
    //     37 ta "yiqildi" berdi va HAMMASIDA `express: 429` turardi —
    //     NestJS javoblari to'g'ri edi.
    //
    // Ikkalasi ham xato xulosa. Shuning uchun 429 ko'rinsa tekshiruv
    // O'LCHANMADI deb belgilanadi.
    //
    // ⚠ BU TEKSHIRUVNI SUSAYTIRMAYDI: `finish()` o'lchanmagan
    // tekshiruvda ham YIQILADI (`R.fail || R.unmeasured`). Ya'ni
    // natija baribir qizil — faqat SABABI to'g'ri ko'rsatiladi va
    // "429 ustida paritet saqlandi" degan yolg'on yashil YO'Q bo'ladi.
    // ═══════════════════════════════════════════════════════════════════
    if (e.status === 429 || n.status === 429) {
      skip(name, `tezlik chegarasi — express=${e.status}, nest=${n.status}`);
      return { e, n };
    }

    // ── INFRASTRUKTURA: sabab har doim ko'rsatiladi ──
    const infra = infraReason(e) || infraReason(n);
    if (infra) {
      skip(
        name,
        `INFRASTRUKTURA (kod emas): ${infra} — express=${e.status}, nest=${n.status}`,
      );
      return { e, n };
    }

    // ── 5xx: standart holda O'LCHANMADI (yuqoridagi izohga qarang) ──
    if (!opts.allowServerError && (e.status >= 500 || n.status >= 500)) {
      const msg = (r) =>
        (r.body && typeof r.body === 'object' && r.body.message) || '';
      skip(
        name,
        `server xatosi — express=${e.status} "${msg(e)}", nest=${n.status} "${msg(n)}". ` +
          "Ataylab saqlangan 5xx bo'lsa `{ allowServerError: true }` bilan belgilang.",
      );
      return { e, n };
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
