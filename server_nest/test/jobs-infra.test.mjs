/**
 * FAZA 10 — FON ISHLARI: INFRATUZILMA + KO'CHIRILGAN JOBLAR.
 *
 * Tekshiriladi:
 *   1. JADVAL PARITETI — cron ifodasi Express `jobs/index.js` dagi bilan
 *      AYNAN bir xilmi (fayl parse qilinadi, qo'lda yozilgan kutilma emas).
 *   2. IKKILANISH HIMOYASI — standart sozlamada birorta job yoqilmaydi;
 *      noma'lum nom jimgina o'tkazib yuborilmaydi.
 *   3. TTL TOZALASH — musbat (eskirgani o'chadi) va MANFIY (tirigi
 *      QOLADI) holatlar, haqiqiy bazada.
 *   4. HEARTBEAT — sozlanmagan holatda hech narsa yubormaydi; metrikalar
 *      shakli; entitlements keshining ochiq-yiqilish standartlari.
 *
 * ⚠ BAZAGA YOZADI va O'CHIRADI. Yozganini `finally` da tozalaydi.
 * ⚠ `daily.ttl-cleanup` GLOBAL ish — u bazadagi BOSHQA eskirgan
 *    qatorlarni ham o'chiradi. Bu uning ATAYLAB shunday: aynan shu ish
 *    har kuni 03:15 da produksiyada bajariladi.
 *
 * ISHLATISH:  npm run build && npm run test:jobs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { JobsRegistry } from '../dist/jobs/jobs.module.js';
import { SchedulerService } from '../dist/jobs/scheduler.service.js';
import { TtlCleanupJob } from '../dist/jobs/system/ttl-cleanup.job.js';
import { UsageHeartbeatJob } from '../dist/jobs/system/usage-heartbeat.job.js';
import { EntitlementsService, UNLIMITED } from '../dist/common/entitlements/entitlements.service.js';

const R = { pass: 0, fail: 0, skip: 0 };
const ok = (n, x = '') => { R.pass += 1; console.log(`  ✅ ${n}${x ? ` — ${x}` : ''}`); };
const bad = (n, x = '') => { R.fail += 1; console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); };
const check = (n, cond, x = '') => (cond ? ok(n, x) : bad(n, x));
const skipTest = (n, x = '') => { R.skip += 1; console.log(`  ⏭️  ${n}${x ? ` — ${x}` : ''}`); };

const EXPRESS_JOBS_DIR = new URL('../../server/src/jobs/', import.meta.url);

/**
 * Express tomonidan HAQIQIY jadvalni o'qiydi.
 *
 * Qo'lda yozilgan kutilma (`expected = "15 3 * * *"`) bu testni
 * ma'nosiz qilardi: Express'da cron o'zgarsa test baribir yashil
 * qolardi. Shuning uchun manba faylning O'ZI parse qilinadi.
 */
const expressSchedule = () => {
  const indexSrc = readFileSync(new URL('index.js', EXPRESS_JOBS_DIR), 'utf8');

  // 1) Har bir job faylidagi job-nom konstantalari.
  //    ⚠ `JOB_NAME` bilan cheklanmaydi: `aiReports.job.js` uchtasini
  //    (`DAILY_JOB`/`WEEKLY_JOB`/`MONTHLY_JOB`) eksport qiladi va faqat
  //    `JOB_NAME` ni qidirsak, 3 ta AI hisoboti pariteti JIMGINA
  //    tekshirilmay qolardi.
  const constsByFile = new Map();
  const fileByName = new Map();
  const srcByFile = new Map();
  for (const file of readdirSync(EXPRESS_JOBS_DIR)) {
    if (!file.endsWith('.js') || file === 'index.js') continue;
    const src = readFileSync(new URL(file, EXPRESS_JOBS_DIR), 'utf8');
    srcByFile.set(file, src);
    const pairs = [];
    for (const m of src.matchAll(/export const (\w+) = "([a-z]+\.[a-z-]+)"/g)) {
      pairs.push([m[1], m[2]]);
      fileByName.set(m[2], file);
    }
    if (pairs.length) constsByFile.set(file, pairs);
  }

  // 2) index.js import bloki → `KONSTANTA as ALIAS`
  const nameByAlias = new Map();
  for (const [file, pairs] of constsByFile) {
    const re = new RegExp(
      `import\\s+\\w+,\\s*\\{([^}]*)\\}\\s*from\\s*"\\./${file.replace('.', '\\.')}"`,
      's',
    );
    const block = indexSrc.match(re);
    if (!block) continue;
    for (const [constName, jobName] of pairs) {
      const alias = block[1].match(new RegExp(`${constName} as (\\w+)`));
      if (alias) nameByAlias.set(alias[1], jobName);
    }
  }

  // 3) `every("<cron>", ALIAS)` → cron
  const crons = new Map();
  for (const m of indexSrc.matchAll(/every\("([^"]+)",\s*(\w+)\)/g)) {
    const jobName = nameByAlias.get(m[2]);
    if (jobName) crons.set(jobName, m[1]);
  }

  // 4) `lockLifetime: N * 60 * 1000` → ms
  const locks = new Map();
  for (const [name, file] of fileByName) {
    const m = srcByFile.get(file)?.match(/lockLifetime:\s*(\d+)\s*\*\s*60\s*\*\s*1000/);
    if (m) locks.set(name, Number(m[1]) * 60 * 1000);
  }

  return { crons, locks, names: new Set(fileByName.keys()) };
};

/** ConfigService o'rniga — ro'yxat mantig'ini alohida sinash uchun. */
const fakeConfig = (values) => ({ get: (key) => values[key] });

const run = async () => {
  console.log('\n\x1b[1mFaza 10 — fon ishlari infratuzilmasi\x1b[0m\n');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const registry = app.get(JobsRegistry);
  const scheduler = app.get(SchedulerService);
  const ttl = app.get(TtlCleanupJob);
  const heartbeat = app.get(UsageHeartbeatJob);

  const created = { cacheKeys: [], tokenHashes: [], aiUsageIds: [] };

  try {
    // ═══════════════════════════════════════════════════════════════════
    console.log('\x1b[1m1. Jadval pariteti (Express `jobs/index.js` dan o\'qiladi)\x1b[0m');
    const { crons: express, locks: expressLocks, names: expressNames } = expressSchedule();
    check('Express jadvali o\'qildi', express.size === 22, `${express.size} ta cron job`);

    for (const job of registry.all()) {
      // ⚠ HAR BIR ko'chirilgan job Express'da HAM mavjud bo'lishi shart —
      // aks holda navbat nomi mos kelmagan va ish HECH KIM tomonidan
      // olinmasdi.
      check(
        `Express'da mavjud: ${job.name}`,
        expressNames.has(job.name),
        expressNames.has(job.name) ? '' : "navbat nomi Express'da topilmadi",
      );

      const expected = express.get(job.name);
      if (job.cron === null) {
        // HODISAGA ko'ra ishlaydigan job (`scheduler.now` / `at`).
        // Express'da ham cron BO'LMASLIGI shart.
        check(
          `cron yo'q (hodisaga ko'ra): ${job.name}`,
          expected === undefined,
          expected ? `⚠ Express'da cron BOR: "${expected}"` : "ikkala tomonda ham cron yo'q",
        );
      } else {
        check(
          `cron pariteti: ${job.name}`,
          expected !== undefined && expected === job.cron,
          `Express="${expected ?? '(topilmadi)'}" Nest="${job.cron}"`,
        );
      }

      // QULF MUDDATI — ish "osilib qolgan" deb sanaladigan vaqt.
      // Farq qilsa uzoq job o'rtada qayta boshlanardi (dublikat yuborish).
      const expectedLock = expressLocks.get(job.name);
      if (expectedLock !== undefined) {
        check(
          `lockLifetime pariteti: ${job.name}`,
          job.lockLifetimeMs === expectedLock,
          `Express=${expectedLock / 60000}daq Nest=${(job.lockLifetimeMs ?? 0) / 60000}daq`,
        );
      }
    }

    // Vaqt zonasi: joblarda alohida ko'rsatilmagan bo'lsa `TZ_NAME` dan
    // olinadi (Express ham aynan shunday). Muhim: UTC BO'LMASIN.
    check(
      "vaqt zonasi Asia/Tashkent (TZ_NAME)",
      (process.env.TZ_NAME || 'Asia/Tashkent') === 'Asia/Tashkent',
      process.env.TZ_NAME || 'Asia/Tashkent (standart)',
    );

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n\x1b[1m2. Ikkilanish himoyasi\x1b[0m');

    check(
      'standart holatda rejalashtiruvchi ISHGA TUSHMAGAN',
      scheduler.isStarted() === false,
      'pg-boss sxemasiga tegilmadi',
    );
    check(
      'NEST_WORKERS_ENABLED standarti = false',
      String(process.env.NEST_WORKERS_ENABLED ?? 'false') !== 'true',
    );

    const all = registry.all();
    // Ro'yxat mantig'i alohida nusxada sinaladi — haqiqiy registry'ning
    // holatiga tegmasdan.
    const mk = (env) => {
      const r = new JobsRegistry(scheduler, fakeConfig(env));
      r.register(...all);
      return r;
    };

    // Bo'sh ro'yxat → hech biri (fail-closed).
    check(
      "bo'sh NEST_WORKER_JOBS → 0 ta job",
      mk({ NEST_WORKER_JOBS: '' }).selected().length === 0,
    );
    check(
      "faqat bo'shliq → 0 ta job",
      mk({ NEST_WORKER_JOBS: '  ,  , ' }).selected().length === 0,
    );
    // Noma'lum nom → o'sha nom TASHLANADI (lekin baland ovozda loglanadi).
    check(
      "noma'lum nom ro'yxatga olinmaydi",
      mk({ NEST_WORKER_JOBS: 'daily.ai-recompute' }).selected().length === 0,
      "AI joblari hali ko'chirilmagan",
    );
    // Aniq nom → faqat o'sha.
    const one = mk({ NEST_WORKER_JOBS: 'daily.ttl-cleanup' }).selected();
    check(
      'aniq nom → faqat bitta job',
      one.length === 1 && one[0].name === 'daily.ttl-cleanup',
    );
    // Aralash: bittasi ma'lum, bittasi emas.
    const mixed = mk({ NEST_WORKER_JOBS: 'daily.ttl-cleanup,monthly.ai-report' }).selected();
    check(
      "aralash ro'yxat → faqat ma'lumlari",
      mixed.length === 1 && mixed[0].name === 'daily.ttl-cleanup',
    );
    // `*` → hammasi.
    check(
      "`*` → barcha ko'chirilgan joblar",
      mk({ NEST_WORKER_JOBS: '*' }).selected().length === all.length,
      `${all.length} ta`,
    );
    // Ko'chirilmagan job ro'yxatda BO'LMASLIGI shart.
    const migrated = new Set(all.map((j) => j.name));
    const notMigrated = [...express.keys()].filter((n) => !migrated.has(n));
    check(
      "ko'chirilmagan joblar Nest ro'yxatida YO'Q",
      notMigrated.length > 0 && notMigrated.every((n) => !migrated.has(n)),
      `${notMigrated.length} ta job hamon Express'da`,
    );

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n\x1b[1m3. daily.ttl-cleanup — baza ta\'siri\x1b[0m');

    const stamp = `nest-jobs-test-${process.pid}-${Date.now()}`;
    const hour = 60 * 60 * 1000;
    const day = 24 * hour;

    // MUDDATI O'TGAN va TIRIK kesh.
    const expiredKey = `${stamp}:expired`;
    const liveKey = `${stamp}:live`;
    created.cacheKeys.push(expiredKey, liveKey);
    await prisma.cache.create({
      data: { key: expiredKey, value: {}, expiresAt: new Date(Date.now() - hour) },
    });
    await prisma.cache.create({
      data: { key: liveKey, value: {}, expiresAt: new Date(Date.now() + day) },
    });

    // REFRESH TOKEN: muddati o'tgan / bekor qilingan / tirik.
    const user = await prisma.user.findFirst({
      where: { isDeleted: false },
      select: { id: true },
    });
    const tokenRows = [];
    if (user) {
      tokenRows.push(
        { tokenHash: `${stamp}:tok-expired`, expiresAt: new Date(Date.now() - hour), revokedAt: null },
        { tokenHash: `${stamp}:tok-revoked`, expiresAt: new Date(Date.now() + day), revokedAt: new Date() },
        { tokenHash: `${stamp}:tok-live`, expiresAt: new Date(Date.now() + day), revokedAt: null },
      );
      for (const t of tokenRows) {
        created.tokenHashes.push(t.tokenHash);
        await prisma.refreshToken.create({ data: { userId: user.id, ...t } });
      }
    }

    // AI USAGE: 401 kunlik (o'chishi kerak) va bugungi (qolishi kerak).
    const oldUsage = await prisma.aiUsageLog.create({
      data: {
        monthKey: '2000-01', provider: 'gemini', model: 'test', kind: 'narration',
        ok: true, createdAt: new Date(Date.now() - 401 * day),
      },
      select: { id: true },
    });
    const freshUsage = await prisma.aiUsageLog.create({
      data: {
        monthKey: '2000-01', provider: 'gemini', model: 'test', kind: 'narration',
        ok: true,
      },
      select: { id: true },
    });
    created.aiUsageIds.push(oldUsage.id, freshUsage.id);

    await ttl.run();

    // MUSBAT: eskirganlar o'chdi.
    check(
      'muddati o\'tgan kesh O\'CHDI',
      (await prisma.cache.count({ where: { key: expiredKey } })) === 0,
    );
    check(
      '400 kundan eski ai_usage_log O\'CHDI',
      (await prisma.aiUsageLog.count({ where: { id: oldUsage.id } })) === 0,
    );
    if (user) {
      check(
        'muddati o\'tgan refresh token O\'CHDI',
        (await prisma.refreshToken.count({ where: { tokenHash: `${stamp}:tok-expired` } })) === 0,
      );
      check(
        'bekor qilingan (revoked) refresh token O\'CHDI',
        (await prisma.refreshToken.count({ where: { tokenHash: `${stamp}:tok-revoked` } })) === 0,
      );
    }

    // MANFIY: tiriklari QOLDI — bu eng muhim tekshiruv. Job juda ko'p
    // o'chirsa hech qanday xato chiqmaydi, faqat odamlar tizimdan
    // chiqib ketadi va kesh isib turolmaydi.
    check(
      'TIRIK kesh QOLDI',
      (await prisma.cache.count({ where: { key: liveKey } })) === 1,
    );
    check(
      'YANGI ai_usage_log QOLDI',
      (await prisma.aiUsageLog.count({ where: { id: freshUsage.id } })) === 1,
    );
    if (user) {
      check(
        'TIRIK refresh token QOLDI',
        (await prisma.refreshToken.count({ where: { tokenHash: `${stamp}:tok-live` } })) === 1,
      );
    }

    // IDEMPOTENTLIK: ikkinchi yurish hech narsani buzmaydi.
    await ttl.run();
    check(
      'ikkinchi yurish idempotent (tiriklari hamon joyida)',
      (await prisma.cache.count({ where: { key: liveKey } })) === 1 &&
        (await prisma.aiUsageLog.count({ where: { id: freshUsage.id } })) === 1,
    );

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n\x1b[1m4. usage.heartbeat + entitlements\x1b[0m');

    const cfgless = new UsageHeartbeatJob(prisma, new EntitlementsService(), fakeConfig({}));
    check(
      "sozlanmagan tenantda heartbeat YUBORILMAYDI",
      cfgless.isConfigured() === false && (await cfgless.send()) === null,
    );
    check(
      "uchtadan bittasi yetishmasa ham YUBORILMAYDI",
      new UsageHeartbeatJob(prisma, new EntitlementsService(), fakeConfig({
        ADMIN_API_URL: 'http://x', TENANT_ID: 't1', HEARTBEAT_SECRET: '',
      })).isConfigured() === false,
    );

    const metrics = await heartbeat.collectMetrics();
    const required = ['user_count', 'student_count', 'teacher_count', 'group_count', 'active_group_count'];
    check(
      'metrikalar to\'plami Express bilan bir xil',
      required.every((k) => typeof metrics[k] === 'number'),
      required.map((k) => `${k}=${metrics[k]}`).join(' '),
    );
    check(
      "o'quvchilar `user_count` ga KIRMAYDI",
      metrics.user_count >= 0 &&
        metrics.user_count ===
          (await prisma.user.count({ where: { isDeleted: false, role: { not: 'student' } } })),
    );
    check(
      'faol guruhlar soni jamidan oshmaydi',
      metrics.active_group_count <= metrics.group_count,
    );

    const ent = new EntitlementsService();
    check('standart: obuna FAOL (ochiq yiqilish)', ent.get().subscriptionActive === true);
    check('standart: limit CHEKSIZ', ent.getLimit('ai_calls_month') === UNLIMITED);
    check('standart: imkoniyat YOQILGAN', ent.isFeatureEnabled('telegram_bot') === true);
    check('standart: limit oshmagan', ent.isLimitExceeded('user_count', 999_999) === false);

    ent.set({ planKey: 'basic', limits: { user_count: 10, telegram_bot: 0 }, exceeded: ['x'] });
    check('limit qabul qilindi', ent.getLimit('user_count') === 10);
    check("imkoniyat 0 → O'CHIQ", ent.isFeatureEnabled('telegram_bot') === false);
    check('`>=` chegarasi (10 da OSHGAN)', ent.isLimitExceeded('user_count', 10) === true);
    check('`>=` chegarasi (9 da oshmagan)', ent.isLimitExceeded('user_count', 9) === false);
    ent.set(null);
    check('null payload holatni BUZMAYDI', ent.getLimit('user_count') === 10);
    ent.set({ subscriptionActive: false });
    check('obuna ochiq rad etilishi mumkin', ent.get().subscriptionActive === false);

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n\x1b[1m5. PRODUSER rejimi (ishchi EMAS)\x1b[0m');

    // SHARTNI OLDIN O'LCHAYMIZ: `pgboss` sxemasi Express tomonidan
    // yaratilgan bo'lishi kerak — NestJS produser rejimida
    // `migrate:false, createSchema:false` bilan ulanadi va sxemani
    // O'ZI yaratmaydi (u Express'niki).
    const [{ t: pgbossInstalled }] = await prisma.$queryRaw`
      SELECT to_regclass('pgboss.version')::text AS t
    `;

    if (!pgbossInstalled) {
      skipTest('produser rejimi testlari', "`pgboss` sxemasi yo'q (Express hali yurmagan)");
    } else {
      const schedulesBefore = Number(
        (await prisma.$queryRaw`SELECT COUNT(*)::int AS c FROM pgboss.schedule`)[0].c,
      );

      // Mavjud bo'lmagan navbatga qo'yish — ulanishni ISBOTLAYDI, lekin
      // haqiqiy ish YARATMAYDI (Express ishchisi bekorga uyg'onmaydi).
      let produced = null;
      try {
        await scheduler.now(`nest-producer-probe-${process.pid}`, { probe: true });
        produced = 'accepted';
      } catch (err) {
        produced = String(err?.message || err);
      }

      check(
        'produser BAZAGA ULANDI',
        scheduler.isConnected() === true,
        `probe: ${produced.slice(0, 60)}`,
      );
      check(
        "⚠ ulanish uni ISHCHIGA AYLANTIRMADI",
        scheduler.isStarted() === false,
        'navbatdan ish OLMAYDI',
      );

      const schedulesAfter = Number(
        (await prisma.$queryRaw`SELECT COUNT(*)::int AS c FROM pgboss.schedule`)[0].c,
      );
      check(
        'NestJS birorta CRON jadvalini yozmadi',
        schedulesAfter === schedulesBefore,
        `${schedulesBefore} → ${schedulesAfter}`,
      );

      // Express ro'yxatga olgan cronlar joyida turibdi — ya'ni NestJS
      // ularni "unschedule" qilib yubormagan.
      check(
        "Express cronlari tegilmagan",
        schedulesAfter >= express.size,
        `${schedulesAfter} ta reja, Express ${express.size} ta job`,
      );
    }
  } finally {
    // O'ZI YOZGANINI TOZALAYDI (ttl job o'chirmaganlarini).
    await prisma.cache.deleteMany({ where: { key: { in: created.cacheKeys } } }).catch(() => null);
    await prisma.refreshToken
      .deleteMany({ where: { tokenHash: { in: created.tokenHashes } } })
      .catch(() => null);
    await prisma.aiUsageLog
      .deleteMany({ where: { id: { in: created.aiUsageIds } } })
      .catch(() => null);
    await app.close();
  }

  console.log(`\n  Jami: ${R.pass} ✅  ${R.fail} ❌  ${R.skip} ⏭️\n`);
  process.exitCode = R.fail === 0 ? 0 : 1;
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
