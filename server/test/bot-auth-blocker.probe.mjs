/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BOT-AUTH — KO'CHIRISH BLOKLANGANINING ISBOTI (test emas, ZOND).
 *
 * `MIGRATION-CHECKLIST.md` `botAuth` ni FAZA 2.6 deb belgilagan. Bu zond
 * ko'rsatadiki, uni HOZIR ko'chirib BO'LMAYDI — chunki Express'dagi
 * MANBA IMPLEMENTATSIYASINING O'ZI ISHLAMAYDI.
 *
 * ── NIMA ANIQLANDI ──
 *
 * `modules/botAuth/services/botAuth.service.js` MONGOOSE davridan
 * qolgan maydon nomlarini ishlatadi va ular Prisma sxemasida YO'Q:
 *
 *   user.password              → sxemada `passwordHash`
 *   where: { login: ... }      → sxemada `username`
 *   include: { role: true }    → `role` — SKALYAR (String), relation emas
 *   include: { branches: true }→ bunday relation yo'q (`branchAssignments`)
 *
 * Bundan tashqari handler `{ accessToken, refreshToken, user, roleMeta }`
 * ni destrukturizatsiya qiladi, servis esa `{ user, tokens }` qaytaradi —
 * ya'ni `accessToken` HAR DOIM `undefined` bo'lardi.
 *
 * ── NEGA BU ODDIY "XATO" EMAS, BALKI TO'SIQ ──
 *
 * Ko'chirish qoidasi: "Express — etalon, parity isbotlanmaguncha".
 * Bu yerda etalon 500 qaytaradi, ya'ni SAQLANADIGAN XULQ-ATVOR YO'Q.
 * Ikki yo'ldan biri kerak, va IKKALASI HAM ko'chirish doirasidan
 * TASHQARIDA:
 *   a) avval Express'dagi `botAuth` tuzatilsin (= yangi xulq-atvor
 *      loyihalash, "redesign qilmang" qoidasiga zid);
 *   b) yoki `botAuth` umuman keraksiz deb e'lon qilinsin.
 * Qaror mahsulot egasiniki, agent qaroriga qoldirilmaydi.
 *
 * ── ISHLATISH ──
 *   node --env-file=.env test/bot-auth-blocker.probe.mjs
 *
 * ⚠ HAQIQIY `TELEGRAM_BOT_TOKEN` KERAK: HMAC to'sig'idan o'tmasdan
 * Prisma yo'liga umuman yetib borilmaydi (aynan shu sababli nuqson
 * ilgari ko'rinmagan — har qanday tekshiruv 401 da to'xtardi).
 * ═══════════════════════════════════════════════════════════════════════════
 */
import crypto from 'node:crypto';

const EXPRESS = process.env.EXPRESS_URL || 'http://127.0.0.1:5000';
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
  console.log('\n  ⚠️  TELEGRAM_BOT_TOKEN yo\'q — zond o\'tkazib yuborildi.');
  console.log('     node --env-file=.env test/bot-auth-blocker.probe.mjs\n');
  process.exit(0);
}

/** Telegram WebApp initData'ni HAQIQIY HMAC bilan quradi. */
const forgeInitData = () => {
  const user = JSON.stringify({ id: 999000111, first_name: 'QA', username: 'qa_probe' });
  const pairs = [['auth_date', String(Math.floor(Date.now() / 1000))], ['user', user]];
  const check = pairs
    .slice()
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex');
  return `${pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}&hash=${hash}`;
};

const post = async (path, body) => {
  const r = await fetch(EXPRESS + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: r.status, body: parsed };
};

const run = async () => {
  console.log('\n\x1b[1mBOT-AUTH — Express manbasining holati\x1b[0m\n');
  const initData = forgeInitData();
  let broken = 0;

  for (const [name, path, body] of [
    ['POST /api/bot-auth/verify', '/api/bot-auth/verify', { initData }],
    ['POST /api/bot-auth/login', '/api/bot-auth/login',
      { login: 'owner', password: 'owner123', initData }],
  ]) {
    const r = await post(path, body);
    const stack = String(r.body?.stack || '');
    const isPrismaBug = /PrismaClientValidationError/.test(stack);

    if (r.status === 401) {
      console.log(`  ⚠️  ${name} — HMAC to'sig'idan o'tmadi (401). Token mos emas;`);
      console.log('      zond Prisma yo\'lini O\'LCHAMADI — bu "soz" degani EMAS.');
    } else if (isPrismaBug) {
      broken += 1;
      const line = stack.split('\n').find((l) => /Invalid (scalar field|`)/.test(l)) || '';
      console.log(`  🛑 ${name} — ${r.status} ISHLAMAYDI: ${line.trim()}`);
    } else {
      console.log(`  ❓ ${name} — ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
      console.log('      Kutilmagan natija. Express tuzatilgan bo\'lishi mumkin —');
      console.log('      shunday bo\'lsa, botAuth ko\'chirish uchun OCHILADI.');
    }
  }

  if (broken === 2) {
    console.log('\n  XULOSA: `botAuth` Express\'da ISHLAMAYDI (2/2 marshrut 500).');
    console.log('  Ko\'chirish BLOKLANGAN — saqlanadigan xulq-atvor yo\'q.\n');
  } else {
    console.log('\n  XULOSA: holat o\'zgargan — `MIGRATION-CHECKLIST.md` yangilansin.\n');
  }
  // ⚠ Bu ZOND, test emas: aniqlangan nuqson uchun CI ni QIZIL qilmaydi.
  // Uning vazifasi — to'siq hamon o'z joyidami yoki yo'qmi, KO'RSATISH.
  process.exit(0);
};

run().catch((e) => { console.error(e); process.exit(1); });
