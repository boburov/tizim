/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEZLIK CHEGARASI PARITETI — `authLimiter` KIMNI sanaydi.
 *
 * ── NEGA BU ALOHIDA TEST ──
 *
 * `authLimiter` ning sozlamalari (20 / 5 daqiqa) ko'chirilgan edi, LEKIN
 * uning KALITI ko'chmagan edi. Express `app.js` da:
 *
 *     app.set("trust proxy", 1);
 *
 * Bu `req.ip` ni soket manzili emas, `X-Forwarded-For` ning OXIRGI
 * yozuvidan oladi — nginx qo'shgan HAQIQIY mijoz IP'si. NestJS
 * `main.ts` da bu satr YO'Q edi.
 *
 * OQIBAT (nginx ortida): BARCHA foydalanuvchi bitta IP (proksi manzili)
 * bo'lib ko'rinardi, ya'ni 20/5daq byudjeti UMUMIY bo'lardi. Bitta odam
 * 20 marta noto'g'ri parol kiritsa — BUTUN MARKAZ 5 daqiqaga login qila
 * olmasdi. Himoya emas, XIZMATNI RAD ETISH.
 *
 * Sozlamalarni solishtiradigan test buni HECH QACHON tutmaydi: raqamlar
 * ikkala tomonda ham bir xil. Faqat XULQ-ATVOR tutadi.
 *
 * ── ⚠ BU TEST UMUMIY LOGIN BYUDJETINI YEMAYDI ──
 *
 * Har yurishda SOXTA, betakror `X-Forwarded-For` manzillari ishlatiladi,
 * ya'ni o'z hisoblagichlari alohida bo'ladi. Haqiqiy IP (127.0.0.1)
 * byudjeti — boshqa paritet to'plamlari tayanadigan resurs — TEGILMAYDI.
 *
 * ── B25: UMUMIY CHEGARA (`generalLimiter`) ──
 *
 * Ikkinchi bo'lim `generalLimiter` ni o'lchaydi (200 so'rov / 60s, BUTUN
 * API). U Express `app.js:50` da GLOBAL ulangan, NestJS'da esa
 * `rate-limit.ts` da E'LON QILINGAN, LEKIN ULANMAGAN edi — ya'ni NestJS
 * DoS himoyasisiz turardi va ko'p so'rovli paritet yurishida Express 429,
 * NestJS 200 qaytarib solishtiruvni ma'nosiz qilardi.
 *
 * ⚠ BU YERDA HAM SOXTA IP ISHLATILADI. 127.0.0.1 ning umumiy byudjeti
 * (200/daq) BOSHQA paritet to'plamlari tayanadigan resurs — uni yeb
 * qo'yish qo'shni testlarni 429 ga uchratardi.
 *
 * ISHLATISH:  node test/rate-limit-parity.test.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

const EXPRESS = process.env.EXPRESS_URL || 'http://127.0.0.1:5000';
const NEST = process.env.NEST_URL || 'http://127.0.0.1:5001';

/** `server/src/middleware/rateLimiter.js`: authLimiter max. */
const AUTH_MAX = 20;

/** `server/src/middleware/rateLimiter.js`: generalLimiter max (B25). */
const GENERAL_MAX = 200;

/** Express `generalLimiter.message` — tana AYNAN shu bo'lishi shart. */
const GENERAL_BODY = { success: false, message: "So'rovlar soni juda ko'p" };

const R = { pass: 0, fail: 0, unmeasured: 0 };
const ok = (n) => { R.pass += 1; console.log(`  ✅ ${n}`); };
const bad = (n, m) => { R.fail += 1; console.log(`  ❌ ${n}\n      ${m}`); };
const skip = (n, m) => { R.unmeasured += 1; console.log(`  ⚠️  ${n} — O'LCHANMADI: ${m}`); };

/**
 * Betakror sinov manzili.
 *
 * ⚠ HAR YURISHDA BOSHQACHA bo'lishi SHART: hisoblagich 5 daqiqa yashaydi,
 * ya'ni qat'iy manzil bilan ikkinchi yurish allaqachon to'lgan chelakdan
 * boshlanardi va "429 keldi" degan YOLG'ON muvaffaqiyat berardi.
 */
const nonce = process.hrtime.bigint() % 100000n;
const ipFor = (slot) => `203.0.113.${Number(nonce % 200n) + 1}`.replace(/\d+$/, () =>
  String((Number(nonce % 200n) + slot) % 254 + 1));

const attempt = async (base, ip) => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    // ATAYLAB NOTO'G'RI PAROL: hech qanday sessiya ochilmaydi, hech
    // narsa yozilmaydi — o'lchanadigan yagona narsa CHEGARA.
    body: JSON.stringify({ login: 'owner', password: 'ataylab-notogri' }),
  });
  return res.status;
};

const run = async () => {
  console.log('\n\x1b[1mTEZLIK CHEGARASI PARITETI — authLimiter kaliti\x1b[0m\n');

  for (const [name, base] of [['express', EXPRESS], ['nest', NEST]]) {
    const hot = ipFor(1);
    const cold = ipFor(2);
    // ⚠ TARMOQ XATOSI va TEKSHIRUV XATOSI AJRATILGAN.
    //
    // Ilgari ikkalasi bitta `try/catch` da edi va yiqilgan `assert`
    // "O'LCHANMADI" deb belgilanardi — ya'ni HAQIQIY nuqson
    // "o'lchanmadi" niqobi ostida ko'rinardi. Sabotaj tekshiruvi aynan
    // shuni ochdi. Endi `catch` FAQAT yetib bo'lmaslikni qamraydi.
    let hitLimit = false;
    let other = null;
    try {
      // ── 1. MUSBAT NAZORAT: chegara umuman ISHLAYDIMI ──
      // Bu bo'lmasa quyidagi "boshqa IP o'tdi" natijasi hech nimani
      // isbotlamasdi — chegara O'CHIQ bo'lsa ham bir xil ko'rinardi.
      for (let i = 0; i < AUTH_MAX + 3; i += 1) {
        if ((await attempt(base, hot)) === 429) { hitLimit = true; break; }
      }
      if (hitLimit) other = await attempt(base, cold);
    } catch (err) {
      skip(`${name} tezlik chegarasi`, err.message);
      continue;
    }

    if (!hitLimit) {
      bad(`${name}: chegara ishlamadi`, `${AUTH_MAX + 3} urinishdan keyin ham 429 kelmadi`);
      continue;
    }
    ok(`${name}: bitta IP ${AUTH_MAX} urinishdan keyin 429 oladi`);

    // ── 2. ASOSIY TEKSHIRUV: BOSHQA mijoz ta'sirlanmaydi ──
    // `trust proxy` bo'lmasa ikkala IP ham bitta chelakka tushardi va
    // bu yerda 429 kelardi — ya'ni bitta odam hammani qulflab qo'yardi.
    if (other === 429) {
      bad(
        `${name}: chegara UMUMIY, mijozga xos emas`,
        "boshqa mijoz ham qulflandi — bitta odam butun markazni login'dan " +
          "mahrum qila oladi. `trust proxy` sozlamasini tekshiring.",
      );
    } else {
      ok(`${name}: BOSHQA IP ta'sirlanmaydi — ${other} (chelak mijozga xos)`);
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // B25 — UMUMIY CHEGARA (`generalLimiter`, 200 / 60s, BUTUN API).
  //
  // Bu bo'lim `authLimiter` dan MUSTAQIL: u `/api/health` ni uradi
  // (auth ham, baza ham kerak emas), ya'ni login byudjetiga TEGMAYDI.
  //
  // ⚠ IKKALA SHOX HAM O'LCHANADI:
  //   MUSBAT — 200 ta so'rovdan KEYINGISI 429 (chegara ULANGAN);
  //   MANFIY — o'sha paytda BOSHQA IP hamon 200 (chelak MIJOZGA XOS).
  //
  // Manfiysiz musbat yetarli emas: chegarani `app.use()` bilan emas,
  // hamma so'rovni bloklaydigan qo'pol narsa bilan ham "ishlatib"
  // bo'lardi. Musbatsiz manfiy ham yetarli emas: chegara UMUMAN
  // o'chiq bo'lsa ham "boshqa IP o'tdi" degan natija chiqardi —
  // aynan shu yolg'on B25 ni shu paytgacha yashirib turgan edi.
  // ═════════════════════════════════════════════════════════════════════
  console.log('\n\x1b[2m  ── B25: umumiy chegara (generalLimiter) ──\x1b[0m');

  /** Betakror /24 — har yurish TOZA chelakdan boshlanishi SHART. */
  const genNonce = Number(process.hrtime.bigint() % 200n) + 20;
  const genIp = (slot) => `198.18.${genNonce}.${slot}`;

  const hit = async (base, ip) => {
    const res = await fetch(`${base}/api/health`, {
      headers: { 'x-forwarded-for': ip },
    });
    let body;
    try { body = JSON.parse(await res.text()); } catch { body = null; }
    return { status: res.status, body, limit: res.headers.get('ratelimit-limit') };
  };

  /** Stek → 429 javobi (paritet solishtiruvi uchun). */
  const blocked = {};

  for (const [name, base] of [['express', EXPRESS], ['nest', NEST]]) {
    const hot = genIp(1);
    const cold = genIp(2);
    let last = null;
    let other = null;
    let leaked = 0;
    try {
      // ── Byudjetni AYNAN to'ldiramiz: 200 ta so'rov 200 qaytarishi shart ──
      // Ular BIRIN-KETIN kutiladi, ya'ni 201-so'rov yuborilganda
      // hisoblagich aniq 200 da turadi (poyga yo'q).
      for (let i = 0; i < GENERAL_MAX; i += 1) {
        const r = await hit(base, hot);
        if (r.status === 429) { leaked = i + 1; break; }
      }
      if (!leaked) {
        last = await hit(base, hot);          // 201-so'rov → 429 KUTILADI
        other = await hit(base, cold);        // BOSHQA mijoz → 200 KUTILADI
      }
    } catch (err) {
      skip(`${name} umumiy chegara`, err.message);
      continue;
    }

    // Chegara BELGILANGANDAN OLDIN yopilsa — bu ham nuqson (sozlama farqi).
    if (leaked) {
      bad(
        `${name}: umumiy chegara ERTA yopildi`,
        `${leaked}-so'rovda 429 keldi, ${GENERAL_MAX} tagacha ochiq bo'lishi kerak edi ` +
          '(chelak oldingi yurishdan qolgan yoki `max` boshqacha)',
      );
      continue;
    }

    if (last.status !== 429) {
      bad(
        `${name}: UMUMIY CHEGARA ULANMAGAN (B25)`,
        `${GENERAL_MAX + 1}-so'rov ${last.status} qaytardi, 429 emas — ` +
          "ya'ni butun API chegarasiz (DoS yuzasi) va paritet o'lchovsiz qoladi",
      );
      continue;
    }
    ok(`${name}: ${GENERAL_MAX} so'rovdan keyin 429 (limit=${last.limit})`);
    blocked[name] = { body: last.body, limit: last.limit };

    if (other.status === 429) {
      bad(
        `${name}: umumiy chegara UMUMIY, mijozga xos emas`,
        "boshqa mijoz ham qulflandi — bitta mijoz butun API'ni o'chira oladi. " +
          '`trust proxy` sozlamasini tekshiring.',
      );
    } else {
      ok(`${name}: BOSHQA IP ta'sirlanmaydi — ${other.status}`);
    }
  }

  // ── 429 JAVOBINING O'ZI HAM PARITET OB'YEKTI ──
  // Status bir xil bo'lib, tana boshqacha bo'lsa klient xato xabarini
  // ko'rsata olmasdi. Shuning uchun tana va sarlavha ham solishtiriladi.
  if (blocked.express && blocked.nest) {
    const same =
      JSON.stringify(blocked.express.body) === JSON.stringify(blocked.nest.body) &&
      blocked.express.limit === blocked.nest.limit;
    if (!same) {
      bad(
        '429 javobi paritet',
        `express: ${JSON.stringify(blocked.express)}\n      ` +
          `nest   : ${JSON.stringify(blocked.nest)}`,
      );
    } else if (JSON.stringify(blocked.express.body) !== JSON.stringify(GENERAL_BODY)) {
      bad(
        '429 tanasi Express shartnomasidan chetlashdi',
        `kutilgan: ${JSON.stringify(GENERAL_BODY)}\n      ` +
          `keldi   : ${JSON.stringify(blocked.express.body)}`,
      );
    } else {
      ok('429 tanasi + `ratelimit-limit` IKKALA stekda AYNAN bir xil');
    }
  } else {
    skip('429 javobi paritet', "steklardan biri 429 bermadi — solishtirib bo'lmadi");
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
  process.exit(R.fail || R.unmeasured ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
