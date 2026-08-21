/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BOT-AUTH — ISHLAYDI (invariant).
 *
 * ── NEGA BU FAYL ILGARI BOSHQACHA EDI ──
 *
 * O'rnida `bot-auth-blocker.probe.mjs` turardi va u "KO'CHIRIB BO'LMAYDI"
 * ni KUTILGAN HOLAT qilib yozgan edi: Express manbasi Mongoose davridan
 * qolgan maydon nomlarini ishlatardi (`user.password`, `where:{login}`,
 * `include:{role,branches}`) va ikkala marshrut ham 500
 * `PrismaClientValidationError` berardi.
 *
 * ⚠ O'SHA HOLAT ENDI YO'Q. NestJS tomonida `bot-auth.service.ts` MAQSADNI
 * ko'chirdi (nuqsonni emas) va ishlaydigan `modules/auth` login oqimiga
 * tayanadi. `:5000` endi NestJS — ya'ni zondning butun ramkasi
 * ("Express manbasining holati", `EXPRESS_URL`) MA'NOSIZ.
 *
 * Zond o'zi ham shuni aytardi: "XULOSA: holat o'zgargan —
 * MIGRATION-CHECKLIST.md yangilansin".
 *
 * ── SHUNING UCHUN NIMA QILINDI ──
 *
 * Tekshiruv YUMSHATILMADI, YO'NALISHI TESKARISIGA burildi — bu loyihada
 * beshinchi marta uchragan naqsh (§6, `MIGRATION-CHECKLIST.md`):
 *   ilgari — "ko'chirilmagan, 500 berishi SHART"
 *   endi   — "ko'chirilgan, ISHLASHI SHART"
 *
 * Eng muhimi asl nuqsonni qulflaydi: handler `{accessToken,...}` ni
 * kutardi, servis esa `{user, tokens}` qaytarardi — ya'ni `accessToken`
 * HAR DOIM `undefined` edi va `payload.sub` ham. Shuning uchun bu yerda
 * "200 qaytdi" YETARLI EMAS: token DEKODLANADI va `sub` HAQIQIY
 * foydalanuvchi ekani tekshiriladi.
 *
 * ── QOLDIQ ──
 *
 * ⚠ `login` HAQIQIY yon ta'sir qoldiradi: u Telegram hisobini
 * foydalanuvchiga BOG'LAYDI (`bot_users` qatori) va refresh token
 * yaratadi. Eski zond aynan shuni qoldirib ketgan edi — soxta Telegram
 * id OWNER hisobiga bog'langan holda.
 *
 * Uni `fixture-residue` ham TUTMAGAN, chunki zond `qa_probe` nomini
 * ishlatgan, reyestrdagi prefikslar esa `__parity_ / parity- / qa_lc_ /
 * __probe_`. Shuning uchun bu yerda nom ATAYLAB `__probe_` bilan
 * boshlanadi — qoldiq qolsa `fixture-residue` uni KO'RADI.
 *
 * Tozalash to'g'ridan-to'g'ri Prisma bilan bajariladi (sinaladigan
 * API orqali EMAS) va O'LCHANADI.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5000';
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Soxta Telegram identifikatori — `fixture-residue` ko'radigan nom bilan.
const TG_ID = 999000111;
const TG_USERNAME = '__probe_botauth';

const R = { pass: 0, fail: 0 };
const check = (name, fn) => {
  try { fn(); R.pass += 1; console.log(`  ✅ ${name}`); }
  catch (e) { R.fail += 1; console.log(`  ❌ ${name} — ${e.message.split('\n')[0]}`); }
};

if (!TOKEN) {
  console.log("\n  ⚠️  TELEGRAM_BOT_TOKEN yo'q — HMAC to'sig'idan o'tib bo'lmaydi.");
  console.log('     node --env-file=.env test/bot-auth.test.mjs\n');
  process.exit(0);
}

/** Telegram WebApp initData'ni HAQIQIY HMAC bilan quradi. */
const forgeInitData = ({ validHash = true } = {}) => {
  const user = JSON.stringify({
    id: TG_ID, first_name: 'QA', username: TG_USERNAME,
  });
  const pairs = [['auth_date', String(Math.floor(Date.now() / 1000))], ['user', user]];
  const check_ = pairs.slice()
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = validHash
    ? crypto.createHmac('sha256', secret).update(check_).digest('hex')
    : 'deadbeef'.repeat(8);
  return `${pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}&hash=${hash}`;
};

const post = async (path, body) => {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: r.status, body: parsed };
};

/** JWT'ning payload qismini imzoni tekshirmasdan o'qiydi. */
const decodePayload = (jwt) =>
  JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8'));

const prisma = new PrismaClient();

console.log('\n\x1b[1mBOT-AUTH — ishlaydi (invariant)\x1b[0m\n');

try {
  // ── 0) MANFIY NAZORAT ──
  // Buzuq HMAC 401 bermasa, quyidagi hamma tekshiruv MA'NOSIZ: demak
  // to'siq umuman ishlamayapti va "200" hech narsani isbotlamaydi.
  const bad = await post('/api/bot-auth/verify', {
    initData: forgeInitData({ validHash: false }),
  });
  check(`MANFIY NAZORAT: buzuq HMAC rad etiladi (${bad.status})`, () => {
    assert.equal(bad.status, 401);
  });

  // ── 1) verify — bog'lanmagan hisob ──
  const verify = await post('/api/bot-auth/verify', { initData: forgeInitData() });
  check(`verify → 200 (${verify.status})`, () => {
    assert.equal(verify.status, 200);
    assert.equal(verify.body?.success, true);
  });
  check("bog'lanmagan hisob uchun linked=false", () => {
    assert.equal(verify.body?.data?.linked, false);
  });

  // ── 2) login ──
  const login = await post('/api/bot-auth/login', {
    login: 'owner', password: 'owner123', initData: forgeInitData(),
  });
  check(`login → 200 (${login.status})`, () => {
    assert.equal(login.status, 200);
  });

  // ⚠ ASL NUQSONNI QULFLAYDI: ilgari handler `{accessToken}` ni kutardi,
  // servis esa `{user, tokens}` qaytarardi — token HAR DOIM `undefined`.
  check('accessToken HAQIQATAN qaytadi (undefined emas)', () => {
    const t = login.body?.data?.accessToken;
    assert.ok(typeof t === 'string' && t.length > 40, `accessToken = ${t}`);
  });

  check('token `sub` HAQIQIY foydalanuvchi (payload.sub undefined emas)', () => {
    const payload = decodePayload(login.body.data.accessToken);
    assert.ok(payload.sub, `payload.sub = ${payload.sub}`);
    assert.equal(payload.role, 'owner');
  });

  // ── 3) noto'g'ri parol o'tmaydi ──
  const wrong = await post('/api/bot-auth/login', {
    login: 'owner', password: 'notthepassword', initData: forgeInitData(),
  });
  check(`noto'g'ri parol rad etiladi (${wrong.status})`, () => {
    assert.notEqual(wrong.status, 200);
  });

  // ── 4) login HAQIQATAN bog'ladimi ──
  const linked = await prisma.botUser.findFirst({
    where: { telegramId: BigInt(TG_ID) },
    select: { userId: true },
  });
  check("login Telegram hisobini foydalanuvchiga BOG'LADI", () => {
    assert.ok(linked?.userId, 'bot_users qatori yaratilmadi yoki userId bo\'sh');
  });
} finally {
  // ── TOZALASH ──
  // To'g'ridan-to'g'ri Prisma bilan — sinaladigan API orqali EMAS
  // (test yiqilsa, API orqali tozalash ham yiqilardi va soxta Telegram
  // id OWNER hisobiga bog'langan holda QOLIB KETARDI).
  const bu = await prisma.botUser.findFirst({
    where: { telegramId: BigInt(TG_ID) }, select: { id: true, userId: true },
  });
  if (bu?.userId) {
    await prisma.refreshToken.deleteMany({ where: { userId: bu.userId, userAgent: 'node' } });
  }
  await prisma.botUser.deleteMany({ where: { telegramId: BigInt(TG_ID) } });

  // Tozalash O'LCHANADI — yutilgan xato tufayli qoldiq qolmasin.
  const leftBot = await prisma.botUser.count({ where: { telegramId: BigInt(TG_ID) } });
  check(`tozalash o'lchandi: bot_users qoldig'i yo'q (${leftBot})`, () => {
    assert.equal(leftBot, 0, 'soxta Telegram id hisobga BOG\'LANGAN holda qoldi');
  });
  await prisma.$disconnect();
}

console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi\n`);
process.exit(R.fail ? 1 : 0);
