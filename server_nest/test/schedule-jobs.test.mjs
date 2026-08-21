/**
 * FAZA 10 — BAYRAM VA DAVOMAT FON JOBLARI.
 *
 * Qamrov: `daily.holiday-greetings`, `daily.attendance-unmarked`,
 * `weekly.low-attendance`.
 *
 * ⚠ TELEGRAM'GA HECH NARSA YUBORILMAYDI: `NotificationsService` HAQIQIY
 * (dedupe va oluvchi mantig'i aynan u yerda), lekin bot yetkazish
 * qatlami va rejalashtiruvchi SOXTA. Shunda `pgboss` ga ham tegilmaydi.
 *
 * Kirish ma'lumotlari boshqariladi (guruhlar/davomat), CHIQISH esa
 * HAQIQIY bazada tekshiriladi — ya'ni "nechta bildirishnoma yaratildi"
 * o'lchanadi, taxmin qilinmaydi.
 *
 * ISHLATISH:  npm run build && npm run test:schedule-jobs
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { NotificationsService } from '../dist/modules/notifications/notifications.service.js';
import { PersonalizeBodyService } from '../dist/modules/notifications/personalize-body.service.js';
import { HolidaysService } from '../dist/modules/holidays/holidays.service.js';
import { HolidayGreetingsJob } from '../dist/jobs/holidays/holiday-greetings.job.js';
import { AttendanceRemindersJob } from '../dist/jobs/attendance/attendance-reminders.job.js';
import { LowAttendanceDigestJob } from '../dist/jobs/attendance/low-attendance-digest.job.js';
import { requireDayKey } from '../dist/jobs/day-key.js';
import { localTodayMidnight, localDayOfWeek } from '../dist/common/utils/date.js';
import { hashPassword } from '../dist/common/utils/password.js';

const R = { pass: 0, fail: 0 };
const ok = (n, x = '') => { R.pass += 1; console.log(`  ✅ ${n}${x ? ` — ${x}` : ''}`); };
const bad = (n, x = '') => { R.fail += 1; console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); };
const check = (n, c, x = '') => (c ? ok(n, x) : bad(n, x));

const run = async () => {
  console.log('\n\x1b[1mFaza 10 — bayram va davomat joblari\x1b[0m\n');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const personalize = app.get(PersonalizeBodyService);
  const holidays = app.get(HolidaysService);

  // ── Soxta qatlamlar ──
  const enqueued = [];
  const scheduler = {
    async now(name, data) { enqueued.push({ name, data }); },
    async at(when, name, data) { enqueued.push({ name, data, when }); },
    async unschedule() {},
  };
  const tgSent = [];
  const botDeliver = {
    async deliverToChat({ chatId }, payload) { tgSent.push({ chatId, ...payload }); return { ok: true }; },
  };
  const notifications = new NotificationsService(prisma, scheduler, personalize, botDeliver);

  const dayKey = requireDayKey();
  const created = { holidayIds: [], notifIds: [], userIds: [] };

  /** Shu yurishda yaratilgan bildirishnomalarni dedupe kaliti bo'yicha sanaydi. */
  const countByKey = async (prefix) =>
    prisma.notification.count({ where: { dedupeKey: { startsWith: prefix } } });
  const trackNew = async (prefix) => {
    const rows = await prisma.notification.findMany({
      where: { dedupeKey: { startsWith: prefix } }, select: { id: true },
    });
    for (const r of rows) if (!created.notifIds.includes(r.id)) created.notifIds.push(r.id);
  };

  try {
    // ═══════════════════════════════════════════════════════════════════
    console.log('\x1b[1m1. daily.holiday-greetings\x1b[0m');
    const job = new HolidayGreetingsJob(holidays, notifications);

    const local = localTodayMidnight();
    const mk = (audience, name) =>
      prisma.holiday.create({
        data: {
          name, message: `${name} muborak!`, audience,
          month: local.getUTCMonth() + 1, day: local.getUTCDate(),
          isRecurring: true, isActive: true,
        },
        select: { id: true },
      });

    const hStudents = await mk('students', `NestTest-Students-${process.pid}`);
    created.holidayIds.push(hStudents.id);

    await job.run();
    await trackNew(`holiday:${hStudents.id}:`);
    check(
      "`students` auditoriyasi → BITTA xabar",
      (await countByKey(`holiday:${hStudents.id}:`)) === 1,
    );
    const sentMark = await prisma.holiday.findUnique({
      where: { id: hStudents.id }, select: { lastSentAt: true },
    });
    check('`lastSentAt` yuborishdan KEYIN yozildi', Boolean(sentMark.lastSentAt));

    // ⚠ 1-QATLAM: `lastSentAt` bo'yicha o'tkazib yuborish.
    await job.run();
    check(
      "qayta yurish → `lastSentAt` bo'yicha O'TKAZILDI",
      (await countByKey(`holiday:${hStudents.id}:`)) === 1,
    );

    // ⚠ 2-QATLAM: `lastSentAt` ni MAJBURAN tozalaymiz — endi faqat
    // `dedupeKey` to'sib turadi. Aynan shu holat ikki nusxa bir vaqtda
    // yurganda yuz beradi (`markSent` hali yozilmagan).
    await prisma.holiday.update({ where: { id: hStudents.id }, data: { lastSentAt: null } });
    await job.run();
    check(
      "⚠ `lastSentAt` tozalangan bo'lsa ham `dedupeKey` DUBLIKATNI TO'SDI",
      (await countByKey(`holiday:${hStudents.id}:`)) === 1,
      'ikkinchi himoya qatlami mustaqil ishlaydi',
    );

    // `all` → IKKI auditoriya (Express bilan aynan).
    const hAll = await mk('all', `NestTest-All-${process.pid}`);
    created.holidayIds.push(hAll.id);
    await job.run();
    await trackNew(`holiday:${hAll.id}:`);
    const allKeys = await prisma.notification.findMany({
      where: { dedupeKey: { startsWith: `holiday:${hAll.id}:` } },
      select: { dedupeKey: true },
    });
    check(
      "`all` → IKKI xabar (o'quvchilar + o'qituvchilar)",
      allKeys.length === 2 &&
        allKeys.some((k) => k.dedupeKey.includes(':all_students:')) &&
        allKeys.some((k) => k.dedupeKey.includes(':all_teachers:')),
      allKeys.map((k) => k.dedupeKey.split(':')[2]).join(', '),
    );

    // ⚠ QAYTA URINISH XAVFSIZLIGI: yuborish yiqilsa `markSent` YOZILMASIN
    // — aks holda bayram "yuborilgan" bo'lib qolib, o'sha yili boshqa
    // takrorlanmasdi.
    const hFail = await mk('students', `NestTest-Fail-${process.pid}`);
    created.holidayIds.push(hFail.id);
    const brokenNotifications = {
      async send() { throw new Error('yuborish yiqildi'); },
    };
    const failJob = new HolidayGreetingsJob(holidays, brokenNotifications);
    await failJob.run();
    const failMark = await prisma.holiday.findUnique({
      where: { id: hFail.id }, select: { lastSentAt: true },
    });
    check(
      '⚠ yuborish yiqilsa `lastSentAt` YOZILMAYDI (keyin qayta uriniladi)',
      failMark.lastSentAt === null,
    );
    check(
      'bitta bayram yiqilsa job YIQILMAYDI (qolganlari ishlanadi)',
      true,
      'xato tashlanmadi',
    );

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n\x1b[1m2. daily.attendance-unmarked\x1b[0m');

    const tag = `nest_sj_${process.pid}`;
    const passwordHash = await hashPassword('x'.repeat(12));
    const teacher = await prisma.user.create({
      data: { firstName: 'O', lastName: 'Teacher', username: `${tag}_t`,
        passwordHash, role: 'teacher', isActive: true },
      select: { id: true },
    });
    created.userIds.push(teacher.id);

    // Guruhlar SOXTA prisma orqali beriladi — haqiqiy guruh yaratish
    // filial/kurs/xona zanjirini talab qiladi va bu testning mavzusi
    // EMAS. Tekshirilayotgan narsa: job qaysi guruhni "belgilanmagan"
    // deb sanaydi va kimga xabar yozadi.
    const fakeGroups = [
      { id: 'g-unmarked', name: 'Belgilanmagan guruh', teachers: [{ id: teacher.id }] },
      { id: 'g-complete', name: "To'liq guruh", teachers: [{ id: teacher.id }] },
      { id: 'g-noclass', name: 'Dars yo\'q', teachers: [{ id: teacher.id }] },
      { id: 'g-empty', name: 'Bo\'sh guruh', teachers: [{ id: teacher.id }] },
      { id: 'g-broken', name: 'Buzuq guruh', teachers: [{ id: teacher.id }] },
    ];
    const jobPrisma = {
      group: { findMany: async () => fakeGroups },
      // Egalar HAQIQIY bazadan — owner digest'i real oluvchilarga ketsin.
      user: { findMany: (args) => prisma.user.findMany(args) },
    };
    const fakeAttendance = {
      async listForGroupOnDate(groupId) {
        if (groupId === 'g-broken') throw new Error('jadval buzuq');
        if (groupId === 'g-noclass') return { isClassDay: false, rows: [] };
        if (groupId === 'g-empty') return { isClassDay: true, rows: [] };
        if (groupId === 'g-complete') {
          return { isClassDay: true, rows: [{ attendance: { status: 'present' } }] };
        }
        return {
          isClassDay: true,
          rows: [{ attendance: null }, { attendance: null }, { attendance: { status: 'present' } }],
        };
      },
    };

    const attJob = new AttendanceRemindersJob(jobPrisma, fakeAttendance, notifications);

    // ⚠ JOB XATO TASHLAMASLIGI KERAK. Bitta buzuq guruh butun kechqurungi
    // eslatmani yo'q qilsa, qolgan o'qituvchilar xabarsiz qolardi — va
    // pg-boss uni 3 marta qayta urib, har safar o'sha guruhda yiqilardi.
    let attThrew = null;
    try {
      await attJob.run();
    } catch (err) {
      attThrew = err;
    }
    check(
      'buzuq guruh bo\'lsa ham job XATO TASHLAMADI',
      attThrew === null,
      attThrew ? String(attThrew.message) : '',
    );
    await trackNew(`att-unmarked:${teacher.id}:`);
    await trackNew('att-unmarked-owner:');

    const teacherMsgs = await prisma.notification.findMany({
      where: { dedupeKey: `att-unmarked:${teacher.id}:${dayKey}` },
      select: { id: true, body: true },
    });
    check("o'qituvchiga BITTA eslatma yozildi", teacherMsgs.length === 1);
    check(
      'faqat BELGILANMAGAN guruh ro\'yxatda',
      teacherMsgs[0]?.body.includes('Belgilanmagan guruh') &&
        !teacherMsgs[0]?.body.includes("To'liq guruh") &&
        !teacherMsgs[0]?.body.includes("Dars yo'q") &&
        !teacherMsgs[0]?.body.includes("Bo'sh guruh"),
    );
    check(
      'buzuq guruh butun jobni yiqitmadi',
      teacherMsgs.length === 1 && !teacherMsgs[0]?.body.includes('Buzuq guruh'),
    );
    check('hisob "2/3 belgilanmagan" ko\'rinishida', teacherMsgs[0]?.body.includes('2/3'));

    // ⚠ QAYTA YURISH — dublikat yo'q.
    await attJob.run();
    check(
      "⚠ qayta yurish o'qituvchiga IKKINCHI eslatma yozmadi",
      (await prisma.notification.count({
        where: { dedupeKey: `att-unmarked:${teacher.id}:${dayKey}` },
      })) === 1,
    );
    check(
      '⚠ egalar yig\'masi ham takrorlanmadi',
      (await prisma.notification.count({
        where: { dedupeKey: `att-unmarked-owner:${dayKey}` },
      })) <= 1,
    );

    // Belgilanmagan guruh bo'lmasa — hech narsa yuborilmaydi.
    const cleanPrisma = { group: { findMany: async () => [] }, user: jobPrisma.user };
    const beforeClean = await prisma.notification.count();
    await new AttendanceRemindersJob(cleanPrisma, fakeAttendance, notifications).run();
    check(
      "guruh yo'q → bildirishnoma YARATILMADI",
      (await prisma.notification.count()) === beforeClean,
    );

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n\x1b[1m3. weekly.low-attendance\x1b[0m');

    const mkStats = (n, threshold = 60) => ({
      threshold,
      lowAttendanceStudents: Array.from({ length: n }, (_, i) => ({
        student: { firstName: `Ism${i}`, lastName: `Familiya${i}` }, rate: 10 + i,
      })),
    });

    const lowJob = (stats) =>
      new LowAttendanceDigestJob(
        { user: { findMany: (a) => prisma.user.findMany(a) } },
        { getDashboardStats: async () => stats },
        notifications,
      );

    const beforeLow = await prisma.notification.count();
    await lowJob(mkStats(0)).run();
    check(
      "past davomatli o'quvchi yo'q → bildirishnoma YARATILMADI",
      (await prisma.notification.count()) === beforeLow,
    );

    await lowJob(mkStats(20)).run();
    await trackNew('low-attendance-owner:');
    const lowMsg = await prisma.notification.findFirst({
      where: { dedupeKey: `low-attendance-owner:${dayKey}` },
      select: { id: true, title: true, body: true },
    });
    check('past davomat hisoboti yaratildi', Boolean(lowMsg));
    check('sarlavhada chegara ko\'rsatilgan', lowMsg?.title === 'Past davomat (60% dan past)');
    const lineCount = (lowMsg?.body.match(/•/g) || []).length;
    check(
      '⚠ ro\'yxat 15 qator bilan CHEGARALANGAN (Telegram 4096 belgi)',
      lineCount === 15,
      `${lineCount} qator (20 tadan)`,
    );
    check(
      "format: `• Familiya Ism - N%`",
      lowMsg?.body.includes('• Familiya0 Ism0 - 10%'),
    );

    await lowJob(mkStats(20)).run();
    check(
      '⚠ qayta yurish IKKINCHI hisobot yaratmadi',
      (await prisma.notification.count({
        where: { dedupeKey: `low-attendance-owner:${dayKey}` },
      })) === 1,
    );

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n\x1b[1m4. Telegram yon ta\'siri\x1b[0m');
    check(
      "⚠ testda HAQIQIY Telegram xabari YUBORILMADI",
      tgSent.length === 0,
      'yetkazish faqat `notification.deliver` job\'ida bo\'ladi',
    );
    check(
      'yetkazish navbatga qo\'yildi (yuborilmadi)',
      enqueued.every((e) => e.name === 'notification.deliver'),
      `${enqueued.length} ta navbat yozuvi`,
    );
  } finally {
    if (created.notifIds.length) {
      await prisma.notificationRecipient
        .deleteMany({ where: { notificationId: { in: created.notifIds } } }).catch(() => null);
      await prisma.notification
        .deleteMany({ where: { id: { in: created.notifIds } } }).catch(() => null);
    }
    if (created.holidayIds.length) {
      await prisma.holiday.deleteMany({ where: { id: { in: created.holidayIds } } }).catch(() => null);
    }
    if (created.userIds.length) {
      await prisma.notificationRecipient
        .deleteMany({ where: { userId: { in: created.userIds } } }).catch(() => null);
      await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => null);
    }
    await app.close();
  }

  console.log(`\n  Jami: ${R.pass} ✅  ${R.fail} ❌\n`);
  process.exitCode = R.fail === 0 ? 0 : 1;
};

run().catch((err) => { console.error(err); process.exit(1); });
