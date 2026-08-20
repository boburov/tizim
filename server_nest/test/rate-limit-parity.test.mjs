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
 * ISHLATISH:  node test/rate-limit-parity.test.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

const EXPRESS = process.env.EXPRESS_URL || 'http://127.0.0.1:5000';
const NEST = process.env.NEST_URL || 'http://127.0.0.1:5001';

/** `server/src/middleware/rateLimiter.js`: authLimiter max. */
const AUTH_MAX = 20;

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

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
  process.exit(R.fail || R.unmeasured ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
