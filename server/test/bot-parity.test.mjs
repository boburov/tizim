/**
 * FAZA 10 / 2.6 — TELEGRAM BOT + BOT AUTENTIFIKATSIYASI.
 *
 * Tekshiriladi:
 *   1. IKKILANISH HIMOYASI — polling boshlanmaydi; `bot_locks` qulfi
 *      begona egani rad etadi (shart OLDINDAN o'lchanadi).
 *   2. XATO TASNIFI — 403 → terminal, 429 → bir marta qayta urinish,
 *      kutish vaqti chegarasi.
 *   2b. POLLING XATOSI — `EFATAL: read ECONNRESET` o'tkinchi deb tasniflanadi
 *      va TAKRORLARI BOSILADI; 401 → FATAL (polling to'xtaydi), 409 → ikkinchi
 *      poller ogohlantirishi.
 *   3. XABAR FORMATI — emoji jadvali va caption chegarasi Express
 *      MANBASIDAN o'qib solishtiriladi (qo'lda ko'chirilgan kutilma emas).
 *   4. `initData` HMAC — musbat, 4-variant bardoshliligi va manfiy
 *      holatlar (buzilgan imzo, eskirgan, foydalanuvchisiz).
 *   5. BOT-AUTH SERVISI — haqiqiy bazada: bog'lanmagan, noto'g'ri parol,
 *      to'g'ri parol, TAKRORIY bog'lash (dublikat YO'Q), ko'p-akkaunt,
 *      arxivlangan akkaunt.
 *
 * ⚠ BAZAGA YOZADI: vaqtinchalik foydalanuvchi(lar) va bog'lanishlar.
 *   Hammasi `finally` da o'chiriladi.
 *
 * ISHLATISH:  npm run build && npm run test:bot
 */
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { BotLifecycle } from '../dist/bot/bot.module.js';
import { TelegramBotService } from '../dist/bot/telegram-bot.service.js';
import { BotPollLockService } from '../dist/bot/bot-poll-lock.service.js';
import { NotificationDeliverService, formatNotification } from '../dist/bot/notification-deliver.service.js';
import { formatAssignmentText } from '../dist/bot/assignment-deliver.service.js';
import {
  isBlockedError, isRateLimited, retryAfterOf, retryWaitMs, reasonOf,
} from '../dist/bot/telegram-errors.js';
import {
  classifyPollingError, pollingErrorLine, PollingErrorReporter,
} from '../dist/bot/polling-error.js';
import { verifyInitData, parseInitDataUserUnsafe } from '../dist/bot/init-data.js';
import { BotAuthService } from '../dist/modules/bot-auth/bot-auth.service.js';
import { hashPassword } from '../dist/common/utils/password.js';

const R = { pass: 0, fail: 0, skip: 0 };
const ok = (n, x = '') => { R.pass += 1; console.log(`  ✅ ${n}${x ? ` — ${x}` : ''}`); };
const bad = (n, x = '') => { R.fail += 1; console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); };
const skip = (n, x = '') => { R.skip += 1; console.log(`  ⏭️  ${n}${x ? ` — ${x}` : ''}`); };
const check = (n, cond, x = '') => (cond ? ok(n, x) : bad(n, x));

/** Xato tashlashini kutadi va statusini tekshiradi. */
const expectStatus = async (name, status, fn) => {
  try {
    await fn();
    bad(name, `xato tashlanmadi (${status} kutilgandi)`);
  } catch (err) {
    check(name, err?.statusCode === status, `status=${err?.statusCode} "${err?.message}"`);
  }
};

// ⚠ ILGARI EXPRESS BOT SERVISLARINING MANBASI o'qilib, `CATEGORY_EMOJI`
//   jadvali va `CAPTION_LIMIT` regex bilan ajratib olinardi. Stek
//   o'chirilgach o'sha PARSE NATIJASI muzlatildi (11 emoji + 1024).
const BOT_ORACLE = new URL('fixtures/express-bot-format.json', import.meta.url);

/** Telegram `initData` ni HAQIQIY HMAC bilan quradi. */
const buildInitData = (token, { user, authDate, extra = {}, tamper = false }) => {
  const params = { auth_date: String(authDate), user: JSON.stringify(user), ...extra };
  // Imzo `signature` NI HISOBGA OLMAY quriladi — Telegram'ning yangi
  // versiyalari aynan shunday qiladi va `verifyInitData` buni
  // qo'llab-quvvatlashi SHART.
  const checkString = Object.keys(params)
    .filter((k) => k !== 'signature')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  let hash = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
  if (tamper) hash = hash.replace(/.$/, (c) => (c === '0' ? '1' : '0'));
  return new URLSearchParams({ ...params, hash }).toString();
};

const nowSec = () => Math.floor(Date.now() / 1000);

const run = async () => {
  console.log('\n\x1b[1mFaza 10 / 2.6 — Telegram bot va bot-auth\x1b[0m\n');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const lifecycle = app.get(BotLifecycle);
  const bots = app.get(TelegramBotService);
  const lock = app.get(BotPollLockService);
  const deliver = app.get(NotificationDeliverService);
  const botAuth = app.get(BotAuthService);

  const created = { userIds: [], seededLock: false };

  try {
    // ═══════════════════════════════════════════════════════════════════
    console.log('\x1b[1m1. Ikkilanish himoyasi (polling)\x1b[0m');

    check(
      'NestJS POLLING QILMAYDI (NEST_BOT_POLLING=false)',
      lifecycle.isPolling() === false,
      'buyruqlarni Express qabul qiladi',
    );
    check(
      "bot nusxasi baribir bor (YUBORISH uchun)",
      bots.isConfigured() ? bots.get() !== null : true,
      bots.isConfigured() ? 'nusxa yaratilgan' : 'bot sozlanmagan — o\'tkazildi',
    );

    // ── Qulf: SHARTNI OLDIN O'LCHAYMIZ ──
    // "Express ushlab turibdi" deb TAXMIN qilib bo'lmaydi: u ishlamayotgan
    // bo'lsa qulf bo'sh bo'ladi va test hech narsani isbotlamasdi.
    const LOCK_ID = 'poller';
    const existing = await prisma.botLock.findUnique({ where: { id: LOCK_ID } });
    const heldByOther =
      existing && existing.holder !== lock.holderId && existing.expiresAt > new Date();

    if (heldByOther) {
      check(
        'begona jarayon qulfni ushlab turibdi → acquire() FALSE',
        (await lock.acquire()) === false,
        `egasi: ${existing.holder}`,
      );
    } else {
      // Qulf bo'sh — begona egani O'ZIMIZ qo'yamiz, aks holda tekshiruv
      // hech narsani isbotlamasdi.
      await prisma.botLock.upsert({
        where: { id: LOCK_ID },
        create: { id: LOCK_ID, holder: 'test-foreign-holder', expiresAt: new Date(Date.now() + 60_000) },
        update: { holder: 'test-foreign-holder', expiresAt: new Date(Date.now() + 60_000) },
      });
      created.seededLock = true;
      check('tirik begona qulf → acquire() FALSE', (await lock.acquire()) === false);

      // Muddati o'tgan qulf esa QAYTA EGALLANADI (aks holda jarayon
      // yiqilganda bot boshqa hech qachon polling qilmasdi).
      await prisma.botLock.update({
        where: { id: LOCK_ID },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      check("muddati o'tgan qulf → acquire() TRUE", (await lock.acquire()) === true);
      const after = await prisma.botLock.findUnique({ where: { id: LOCK_ID } });
      check('qulf egasi yangilandi', after?.holder === lock.holderId);
      await lock.release();
      check(
        'release() FAQAT o\'z qulfini o\'chirdi',
        (await prisma.botLock.count({ where: { id: LOCK_ID } })) === 0,
      );
      created.seededLock = false;
    }

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n\x1b[1m2. Telegram xato tasnifi\x1b[0m');

    const err403 = { response: { statusCode: 403, body: { description: 'Forbidden: bot was blocked by the user' } } };
    const errDeactivated = { message: 'Forbidden: user is deactivated' };
    const errChatGone = { response: { statusCode: 400, body: { description: 'Bad Request: chat not found' } } };
    const err429 = { response: { statusCode: 429, body: { parameters: { retry_after: 2 } } } };
    const err429Big = { response: { statusCode: 429, body: { parameters: { retry_after: 100 } } } };
    const err429None = { response: { statusCode: 429, body: {} } };
    const err500 = { response: { statusCode: 500, body: { description: 'Internal' } } };

    check('403 → bloklangan (terminal)', isBlockedError(err403) === true);
    check('"user is deactivated" → bloklangan', isBlockedError(errDeactivated) === true);
    check('400 "chat not found" → bloklangan', isBlockedError(errChatGone) === true);
    check('500 → bloklangan EMAS (qayta uriniladi)', isBlockedError(err500) === false);
    check('429 → tezlik chegarasi', isRateLimited(err429) === true && isRateLimited(err500) === false);
    check('retry_after o\'qildi', retryAfterOf(err429) === 2);
    check('kutish = retry_after × 1000', retryWaitMs(err429) === 2000);
    check('kutish 5 soniyaga CHEGARALANGAN', retryWaitMs(err429Big) === 5000, '100s → 5s');
    check('retry_after yo\'q → 1 soniya', retryWaitMs(err429None) === 1000);
    check('sabab: description ustun', reasonOf(err403).includes('bot was blocked'));
    check('sabab: message zaxira', reasonOf({ message: 'boom' }) === 'boom');
    check('sabab: standart', reasonOf({}) === 'send-failed');

    // Bot yo'q bo'lsa — O'TKINCHI xato (terminal sifatida saqlanmaydi).
    const noBot = await new NotificationDeliverService(prisma, { get: () => null }, null)
      .deliverToChat({ chatId: 1 }, { body: 'x' });
    check(
      'bot ishlamasa → transient (terminal EMAS)',
      noBot.ok === false && noBot.reason === 'bot-not-running' && noBot.transient === true,
    );
    const noLink = await deliver.deliverToUser(null, { body: 'x' });
    check('userId yo\'q → no-bot-link', noLink.ok === false && noLink.reason === 'no-bot-link');

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n\x1b[1m2b. Polling xato tasnifi va log bosish\x1b[0m');

    // ⚠ AYNAN LOG'DA CHIQQAN XATO SHAKLI: kutubxona `FatalError` asl
    // syscall xatosini `cause` da saqlaydi, `message` esa kod bilan
    // prefikslanadi.
    const econnreset = Object.assign(new Error('EFATAL: Error: read ECONNRESET'), {
      code: 'EFATAL',
      cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
    });
    const dnsDown = Object.assign(new Error('EFATAL: Error: getaddrinfo EAI_AGAIN api.telegram.org'), {
      code: 'EFATAL',
    });
    const conflict = Object.assign(new Error('ETELEGRAM: 409 Conflict'), {
      code: 'ETELEGRAM',
      response: { statusCode: 409, body: { description: 'Conflict: terminated by other getUpdates request' } },
    });
    const unauthorized = Object.assign(new Error('ETELEGRAM: 401 Unauthorized'), {
      code: 'ETELEGRAM',
      response: { statusCode: 401, body: { description: 'Unauthorized' } },
    });
    const tgDown = { response: { statusCode: 502, body: { description: 'Bad Gateway' } } };
    const weird = Object.assign(new Error('EPARSE: Error parsing response'), { code: 'EPARSE' });

    check('ECONNRESET → o\'tkinchi', classifyPollingError(econnreset) === 'transient');
    check('EAI_AGAIN → o\'tkinchi (DNS tebranishi bot o\'chirmaydi)', classifyPollingError(dnsDown) === 'transient');
    check('5xx → o\'tkinchi', classifyPollingError(tgDown) === 'transient');
    check('409 → conflict (ikkinchi poller)', classifyPollingError(conflict) === 'conflict');
    check('401 → unauthorized (FATAL)', classifyPollingError(unauthorized) === 'unauthorized');
    check('notanish xato → unknown', classifyPollingError(weird) === 'unknown');
    check('bo\'sh xato → unknown', classifyPollingError(undefined) === 'unknown');
    check('log qatori stack\'siz va bir satr', !pollingErrorLine(econnreset).includes('\n'));

    // Soxta logger + soxta soat: taymerga tayanmaymiz.
    const mkReporter = (onFatal) => {
      const lines = { log: [], warn: [], error: [] };
      let clock = 0;
      const logger = {
        log: (m) => lines.log.push(String(m)),
        warn: (m) => lines.warn.push(String(m)),
        error: (m) => lines.error.push(String(m)),
      };
      const r = new PollingErrorReporter(logger, onFatal, () => clock);
      return { r, lines, tick: (ms) => { clock += ms; } };
    };

    {
      // ⚠ ASOSIY REGRESSIYA: 300 ms'da bir marta kelayotgan bir xil xato
      // log'ni to'ldirmasligi kerak.
      const { r, lines, tick } = mkReporter();
      for (let i = 0; i < 10; i += 1) { r.handle(econnreset); tick(300); }
      check(
        'takroriy ECONNRESET → BITTA warn (stack yo\'q)',
        lines.warn.length === 1 && lines.error.length === 0,
        `warn=${lines.warn.length} error=${lines.error.length}`,
      );
      check('o\'tkinchi xato ERROR sifatida yozilmaydi', lines.error.length === 0);

      // Seriya uzaysa — BIR marta ko'tariladi.
      for (let i = 0; i < 20; i += 1) { r.handle(econnreset); tick(300); }
      check(
        'uzoq seriya → bir marta ERROR ga ko\'tariladi',
        lines.error.length === 1,
        `error=${lines.error.length}`,
      );

      // Boshqa TURDAGI xato seriya ichida yashirinib qolmaydi + tiklanish yoziladi.
      r.handle(weird);
      check('yangi xato turi seriya ichida ham ko\'rinadi', lines.error.length === 2);
      check(
        'seriya tugaganda "tiklandi" yoziladi',
        lines.warn.some((l) => l.includes('tiklandi')) || lines.log.some((l) => l.includes('tiklandi')),
      );
      r.dispose();
    }

    {
      // 409 — ERROR emas, lekin ko'rinadi va daqiqada bir marta.
      const { r, lines, tick } = mkReporter();
      r.handle(conflict); tick(1000); r.handle(conflict);
      check('409 → warn, takrori bosiladi', lines.warn.length === 1 && lines.error.length === 0);
      tick(60_000);
      r.handle(conflict);
      check('409 daqiqadan keyin qayta eslatiladi', lines.warn.length === 2);
      r.dispose();
    }

    {
      // 401 — TUZALMAYDI: bir marta ERROR va polling to'xtatiladi.
      let fatal = 0;
      const { r, lines, tick } = mkReporter(() => { fatal += 1; });
      for (let i = 0; i < 5; i += 1) { r.handle(unauthorized); tick(300); }
      check('401 → BIR marta ERROR', lines.error.length === 1, `error=${lines.error.length}`);
      check('401 → onFatal BIR marta (polling to\'xtaydi)', fatal === 1, `fatal=${fatal}`);
      r.dispose();
    }

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n\x1b[1m3. Xabar formati (Express manbasidan solishtiriladi)\x1b[0m');

    const oracle = JSON.parse(readFileSync(BOT_ORACLE, 'utf8'));
    const expressEmoji = oracle.categoryEmoji;

    let emojiMismatch = [];
    for (const [key, emoji] of Object.entries(expressEmoji)) {
      const got = formatNotification({ body: 'b', category: key });
      if (!got.startsWith(emoji)) emojiMismatch.push(`${key}: kutilgan "${emoji}"`);
    }
    check(
      `emoji jadvali pariteti (${Object.keys(expressEmoji).length} turkum)`,
      emojiMismatch.length === 0,
      emojiMismatch.join('; '),
    );
    check(
      "noma'lum turkum → `other` emoji",
      formatNotification({ body: 'b', category: 'zzz' }).startsWith(expressEmoji.other),
    );
    check(
      'sarlavha bor → "emoji sarlavha\\n\\ntana"',
      formatNotification({ title: 'S', body: 'B', category: 'holiday' }) === `${expressEmoji.holiday} S\n\nB`,
    );
    check(
      "bo'sh sarlavha sarlavhasiz sanaladi",
      formatNotification({ title: '   ', body: 'B', category: 'other' }) === `${expressEmoji.other} B`,
    );

    const expressCaption = oracle.captionLimit;
    check('CAPTION_LIMIT pariteti', expressCaption === 1024, `Express=${expressCaption}`);

    check(
      'vazifa matni: faqat sarlavha',
      formatAssignmentText({ title: 'T' }) === '📝 Yangi vazifa: T',
    );
    check(
      'vazifa matni: sarlavha + tavsif',
      formatAssignmentText({ title: 'T', body: 'B' }) === '📝 Yangi vazifa: T\n\nB',
    );
    check(
      'vazifa matni: muddat DD.MM.YYYY',
      formatAssignmentText({ title: 'T', dueDate: new Date(2026, 7, 5) }).endsWith('⏳ Muddat: 05.08.2026'),
    );
    check(
      "buzuq sana muddatsiz chiqadi",
      formatAssignmentText({ title: 'T', dueDate: 'xyz' }) === '📝 Yangi vazifa: T',
    );

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n\x1b[1m4. initData HMAC tekshiruvi\x1b[0m');

    const FAKE = '123456:FAKE-TOKEN-FOR-TEST';
    const tgUser = { id: 777000111, first_name: 'Test', username: 'TeStUser', language_code: 'uz' };

    const good = buildInitData(FAKE, { user: tgUser, authDate: nowSec() });
    const v1 = verifyInitData(good, FAKE);
    check('to\'g\'ri imzo → ok', v1.ok === true && v1.user?.id === tgUser.id);

    const withSig = buildInitData(FAKE, {
      user: tgUser, authDate: nowSec(), extra: { signature: 'Ed25519-abc_def' },
    });
    check(
      "`signature` maydoni HMAC'dan chiqarilgan variant ham qabul qilinadi",
      verifyInitData(withSig, FAKE).ok === true,
    );
    check(
      'tokenlar ro\'yxati: ikkinchisi mos kelsa yetarli',
      verifyInitData(good, ['boshqa-token', FAKE]).ok === true,
    );
    check('boshqa token → bad-hash', verifyInitData(good, 'boshqa-token').reason === 'bad-hash');
    check(
      'buzilgan imzo → bad-hash',
      verifyInitData(buildInitData(FAKE, { user: tgUser, authDate: nowSec(), tamper: true }), FAKE).reason === 'bad-hash',
    );
    check(
      'eskirgan (24 soatdan oshgan) → expired',
      verifyInitData(buildInitData(FAKE, { user: tgUser, authDate: nowSec() - 86401 }), FAKE).reason === 'expired',
    );
    check(
      "auth_date yo'q → no-auth-date",
      verifyInitData(buildInitData(FAKE, { user: tgUser, authDate: 0 }), FAKE).reason === 'no-auth-date',
    );
    check('hash yo\'q → no-hash', verifyInitData('user=%7B%7D&auth_date=1', FAKE).reason === 'no-hash');
    check('token yo\'q → missing-input', verifyInitData(good, []).reason === 'missing-input');
    check('initData bo\'sh → missing-input', verifyInitData('', FAKE).reason === 'missing-input');
    check(
      'foydalanuvchisiz → no-user',
      verifyInitData(buildInitData(FAKE, { user: { name: 'x' }, authDate: nowSec() }), FAKE).reason === 'no-user',
    );
    check(
      'unsafe parser imzoni TEKSHIRMAYDI (faqat diagnostika)',
      parseInitDataUserUnsafe(buildInitData(FAKE, { user: tgUser, authDate: nowSec(), tamper: true }))?.id === tgUser.id,
    );

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n\x1b[1m5. bot-auth servisi (haqiqiy baza)\x1b[0m');

    const realToken = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!realToken) {
      skip('bot-auth servis testlari', 'TELEGRAM_BOT_TOKEN sozlanmagan');
    } else {
      const tag = `nest_bot_${process.pid}_${Date.now() % 100000}`;
      const PASSWORD = 'BotAuthTest#2026';
      const passwordHash = await hashPassword(PASSWORD);
      // Ikkala hisob ham BIR XIL telefon bilan — ko'p-akkaunt holati
      // (ona ikki farzandiga), aynan shuning uchun `/login` parol
      // bo'yicha nomzodlarni aylanib chiqadi.
      const sharedPhone = `99890${String(process.pid).padStart(7, '0').slice(-7)}`;

      const u1 = await prisma.user.create({
        data: { firstName: 'Bot', lastName: 'Test1', username: `${tag}_a`,
          phone: sharedPhone, passwordHash, role: 'student', isActive: true },
        select: { id: true },
      });
      const u2 = await prisma.user.create({
        data: { firstName: 'Bot', lastName: 'Test2', username: `${tag}_b`,
          phone: sharedPhone, passwordHash: await hashPassword(`${PASSWORD}-2`),
          role: 'student', isActive: true },
        select: { id: true },
      });
      const uOff = await prisma.user.create({
        data: { firstName: 'Bot', lastName: 'Off', username: `${tag}_off`,
          passwordHash, role: 'student', isActive: false },
        select: { id: true },
      });
      created.userIds.push(u1.id, u2.id, uOff.id);

      // Hech kimga bog'lanmagan Telegram ID.
      const tgId = 900000000 + (process.pid % 1000000);
      const tgTest = { id: tgId, first_name: 'Bot', username: 'BotTester', language_code: 'uz' };
      const initData = () => buildInitData(realToken, { user: tgTest, authDate: nowSec() });

      // ── /verify: bog'lanmagan ──
      const unlinked = await botAuth.verifyAndIssue({ initData: initData() });
      check(
        "/verify bog'lanmagan → { linked: false } (xato EMAS)",
        unlinked.linked === false && unlinked.accessToken === undefined,
      );

      // ── /verify: buzilgan imzo ──
      await expectStatus('/verify buzilgan imzo → 401', 401, () =>
        botAuth.verifyAndIssue({
          initData: buildInitData(realToken, { user: tgTest, authDate: nowSec(), tamper: true }),
        }),
      );
      await expectStatus('/verify eskirgan → 401', 401, () =>
        botAuth.verifyAndIssue({
          initData: buildInitData(realToken, { user: tgTest, authDate: nowSec() - 90000 }),
        }),
      );

      // ── /login: noto'g'ri parol ──
      await expectStatus("/login noto'g'ri parol → 401", 401, () =>
        botAuth.loginAndLink({ initData: initData(), login: `${tag}_a`, password: 'xxxx' }),
      );
      await expectStatus('/login mavjud bo\'lmagan login → 401', 401, () =>
        botAuth.loginAndLink({ initData: initData(), login: `${tag}_yoq`, password: PASSWORD }),
      );
      await expectStatus('/login arxivlangan akkaunt → 403', 403, () =>
        botAuth.loginAndLink({ initData: initData(), login: `${tag}_off`, password: PASSWORD }),
      );

      // ── /login: to'g'ri ──
      const r1 = await botAuth.loginAndLink({
        initData: initData(), login: `${tag}_a`, password: PASSWORD,
        userAgent: 'jest', ip: '127.0.0.1',
      });
      check(
        '/login token va roleMeta qaytardi',
        Boolean(r1.accessToken && r1.refreshToken && r1.roleMeta?.value),
        `role=${r1.roleMeta?.value}`,
      );
      check('/login parol xeshi javobda YO\'Q', r1.user?.passwordHash === undefined);
      check('/login javobda `_id` merosi bor', Boolean(r1.user?._id));

      const linksAfter1 = await prisma.botUser.count({ where: { telegramId: BigInt(tgId) } });
      check("/login bog'lanish yaratdi", linksAfter1 === 1);

      // ── TAKRORIY login: DUBLIKAT BO'LMASIN ──
      await botAuth.loginAndLink({ initData: initData(), login: `${tag}_a`, password: PASSWORD });
      check(
        "takroriy /login DUBLIKAT bog'lanish yaratmaydi",
        (await prisma.botUser.count({ where: { telegramId: BigInt(tgId) } })) === 1,
      );

      // ── KO'P-AKKAUNT: telefon bo'yicha ikkinchi hisobga kirish ──
      const r2 = await botAuth.loginAndLink({
        initData: initData(), login: sharedPhone, password: `${PASSWORD}-2`,
      });
      check(
        'telefon bo\'yicha KO\'P-AKKAUNT: parol mos kelgani tanlandi',
        String(r2.user?.id) === String(u2.id),
        `${r2.user?.username}`,
      );
      check(
        "ikkinchi bog'lanish QO'SHILDI (eskisi uzilmadi)",
        (await prisma.botUser.count({ where: { telegramId: BigInt(tgId) } })) === 2,
      );

      // ── /verify: endi bog'langan, ENG OXIRGISI qaytadi ──
      const linked = await botAuth.verifyAndIssue({ initData: initData() });
      check(
        '/verify endi kirgizadi',
        linked.linked === true && Boolean(linked.accessToken && linked.refreshToken),
      );
      check(
        '/verify ENG OXIRGI bog\'langan akkauntni qaytardi',
        String(linked.user?.id) === String(u2.id),
      );

      // ── Refresh token haqiqatan yozildi ──
      check(
        'refresh token bazaga yozildi',
        (await prisma.refreshToken.count({ where: { userId: u2.id, revokedAt: null } })) >= 1,
      );

      // ── Arxivlangan akkaunt /verify orqali ham kira olmaydi ──
      await prisma.user.update({ where: { id: u2.id }, data: { isActive: false } });
      await expectStatus('/verify arxivlangan akkaunt → 403', 403, () =>
        botAuth.verifyAndIssue({ initData: initData() }),
      );
      await prisma.user.update({ where: { id: u2.id }, data: { isActive: true } });
    }
  } finally {
    if (created.seededLock) {
      await prisma.botLock
        .deleteMany({ where: { id: 'poller', holder: 'test-foreign-holder' } })
        .catch(() => null);
    }
    if (created.userIds.length) {
      await prisma.botUser.deleteMany({ where: { userId: { in: created.userIds } } }).catch(() => null);
      await prisma.refreshToken.deleteMany({ where: { userId: { in: created.userIds } } }).catch(() => null);
      await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => null);
    }
    await app.close();
  }

  console.log(`\n  Jami: ${R.pass} ✅  ${R.fail} ❌  ${R.skip} ⏭️\n`);
  process.exitCode = R.fail === 0 ? 0 : 1;
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
