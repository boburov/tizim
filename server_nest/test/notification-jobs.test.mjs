/**
 * FAZA 10 — BILDIRISHNOMA FON JOBLARI (`notification.deliver` / `.send`).
 *
 * ⚠ BU TESTNING MAQSADI BITTA: **DUBLIKAT TELEGRAM XABARI BO'LMASIN**.
 *
 * Telegram'ga HAQIQIY xabar YUBORILMAYDI — yetkazish qatlami o'rniga
 * chaqiruvlarni sanaydigan soxta (stub) qo'yiladi. Shunda "kimga necha
 * marta yozildi" ANIQ o'lchanadi; haqiqiy bot bilan buni faqat taxmin
 * qilish mumkin bo'lardi.
 *
 * Tekshiriladi:
 *   1. `deliverNotification` — faqat `botDeliveredAt IS NULL` oluvchilar;
 *      qayta yurish HECH KIMGA ikkinchi xabar yubormaydi;
 *   2. bog'lanmagan/bloklangan oluvchi → `no-bot-link`, urinish YO'Q;
 *   3. O'TKINCHI nosozlik terminal sifatida SAQLANMAYDI va keyingi
 *      yurishda QAYTA uriniladi;
 *   4. `deliveredViaBot` faqat haqiqiy yetkazish sonicha oshadi;
 *   5. `dispatchScheduled` — shartli atomik o'tish: ikkinchi yurish
 *      oluvchilarni QAYTA yaratmaydi, bekor qilingani YUBORILMAYDI.
 *
 * ⚠ BAZAGA YOZADI; hammasi `finally` da tozalanadi.
 *
 * ISHLATISH:  npm run build && npm run test:notification-jobs
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { NotificationsService } from '../dist/modules/notifications/notifications.service.js';
import { PersonalizeBodyService } from '../dist/modules/notifications/personalize-body.service.js';
import { SchedulerService } from '../dist/jobs/scheduler.service.js';
import { NotificationDeliverJob } from '../dist/jobs/notifications/notification-deliver.job.js';
import { NotificationSendJob } from '../dist/jobs/notifications/notification-send.job.js';
import { hashPassword } from '../dist/common/utils/password.js';

const R = { pass: 0, fail: 0 };
const ok = (n, x = '') => { R.pass += 1; console.log(`  ✅ ${n}${x ? ` — ${x}` : ''}`); };
const bad = (n, x = '') => { R.fail += 1; console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); };
const check = (n, cond, x = '') => (cond ? ok(n, x) : bad(n, x));

/** Telegram o'rniga: kimga necha marta yozilganini sanaydi. */
const makeStub = () => {
  const calls = [];
  let mode = 'ok';
  return {
    calls,
    setMode: (m) => { mode = m; },
    reset: () => { calls.length = 0; },
    service: {
      async deliverToChat({ chatId }, payload) {
        calls.push({ chatId: Number(chatId), body: payload.body });
        if (mode === 'blocked') return { ok: false, reason: 'blocked' };
        // ⚠ `transient` — bot yiqilgan/429. Terminal EMAS.
        if (mode === 'transient') return { ok: false, reason: 'bot-not-running', transient: true };
        return { ok: true };
      },
    },
  };
};

const run = async () => {
  console.log('\n\x1b[1mFaza 10 — bildirishnoma fon joblari\x1b[0m\n');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const personalize = app.get(PersonalizeBodyService);
  const scheduler = app.get(SchedulerService);

  const stub = makeStub();
  // ⚠ HAQIQIY servis, SOXTA yetkazish qatlami. Idempotentlik mantig'i
  // `NotificationsService` ichida — aynan u sinaladi.
  const notifications = new NotificationsService(prisma, scheduler, personalize, stub.service);

  const deliverJob = new NotificationDeliverJob(notifications);
  const sendJob = new NotificationSendJob(notifications);

  const created = { userIds: [], notifIds: [] };

  try {
    const tag = `nest_nj_${process.pid}_${Date.now() % 100000}`;
    const passwordHash = await hashPassword('x'.repeat(12));
    const mkUser = (suffix) =>
      prisma.user.create({
        data: { firstName: 'N', lastName: suffix, username: `${tag}_${suffix}`,
          passwordHash, role: 'student', isActive: true },
        select: { id: true },
      });

    const [uDelivered, uFresh, uNoLink, uBlocked] = await Promise.all([
      mkUser('done'), mkUser('fresh'), mkUser('nolink'), mkUser('blocked'),
    ]);
    created.userIds.push(uDelivered.id, uFresh.id, uNoLink.id, uBlocked.id);

    // Telegram bog'lanishlari: `done` va `fresh` bog'langan,
    // `blocked` bloklangan, `nolink` da umuman yo'q.
    const baseTg = 950000000 + (process.pid % 1000000);
    await prisma.botUser.createMany({
      data: [
        { telegramId: BigInt(baseTg + 1), chatId: BigInt(baseTg + 1), userId: uDelivered.id },
        { telegramId: BigInt(baseTg + 2), chatId: BigInt(baseTg + 2), userId: uFresh.id },
        { telegramId: BigInt(baseTg + 3), chatId: BigInt(baseTg + 3), userId: uBlocked.id, isBlocked: true },
      ],
    });

    // ═══════════════════════════════════════════════════════════════════
    console.log('\x1b[1m1. notification.deliver — dublikat oldini olish\x1b[0m');

    const notif = await prisma.notification.create({
      data: {
        title: 'Test', body: 'Salom', category: 'other',
        audienceType: 'auto_system', channels: ['inapp', 'telegram'],
        status: 'sent', senderRole: 'system',
      },
      select: { id: true },
    });
    created.notifIds.push(notif.id);

    await prisma.notificationRecipient.createMany({
      data: [
        // ALLAQACHON yetkazilgan — qayta URILMASLIGI shart.
        { notificationId: notif.id, userId: uDelivered.id, botDeliveredAt: new Date() },
        { notificationId: notif.id, userId: uFresh.id },
        { notificationId: notif.id, userId: uNoLink.id },
        { notificationId: notif.id, userId: uBlocked.id },
      ],
    });

    stub.reset();
    await deliverJob.run({ notificationId: notif.id });

    check(
      'FAQAT yetkazilmagan va bog\'langan oluvchiga yozildi',
      stub.calls.length === 1 && stub.calls[0].chatId === baseTg + 2,
      `${stub.calls.length} ta urinish`,
    );

    const rows = async () =>
      Object.fromEntries(
        (await prisma.notificationRecipient.findMany({
          where: { notificationId: notif.id },
          select: { userId: true, botDeliveredAt: true, botFailedReason: true },
        })).map((r) => [String(r.userId), r]),
      );
    let byUser = await rows();

    check('yangi oluvchi yetkazilgan deb belgilandi', Boolean(byUser[uFresh.id].botDeliveredAt));
    check("bog'lanmagan → `no-bot-link`", byUser[uNoLink.id].botFailedReason === 'no-bot-link');
    check('bloklangan → `no-bot-link` (urinish YO\'Q)', byUser[uBlocked.id].botFailedReason === 'no-bot-link');

    const afterFirst = await prisma.notification.findUnique({
      where: { id: notif.id }, select: { deliveredViaBot: true },
    });
    check('`deliveredViaBot` +1', afterFirst.deliveredViaBot === 1);

    // ⚠ ENG MUHIM TEKSHIRUV: job qayta urinsa dublikat BO'LMASIN.
    stub.reset();
    await deliverJob.run({ notificationId: notif.id });
    check(
      '⚠ QAYTA yurish HECH KIMGA yozmadi (dublikat YO\'Q)',
      stub.calls.length === 0,
      `${stub.calls.length} ta urinish`,
    );
    const afterSecond = await prisma.notification.findUnique({
      where: { id: notif.id }, select: { deliveredViaBot: true },
    });
    check('`deliveredViaBot` OSHMADI', afterSecond.deliveredViaBot === 1);

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n\x1b[1m2. O\'tkinchi nosozlik → keyin QAYTA uriniladi\x1b[0m');

    const notif2 = await prisma.notification.create({
      data: { title: 'T2', body: 'B2', category: 'other', audienceType: 'auto_system',
        channels: ['inapp', 'telegram'], status: 'sent', senderRole: 'system' },
      select: { id: true },
    });
    created.notifIds.push(notif2.id);
    await prisma.notificationRecipient.create({
      data: { notificationId: notif2.id, userId: uFresh.id },
    });

    stub.reset();
    stub.setMode('transient');
    await deliverJob.run({ notificationId: notif2.id });
    const t1 = await prisma.notificationRecipient.findFirst({
      where: { notificationId: notif2.id },
      select: { botDeliveredAt: true, botFailedReason: true },
    });
    check(
      "o'tkinchi nosozlik TERMINAL sifatida saqlanmadi",
      t1.botDeliveredAt === null && t1.botFailedReason === '',
    );

    stub.reset();
    stub.setMode('ok');
    await deliverJob.run({ notificationId: notif2.id });
    check('keyingi yurish QAYTA urindi va yetkazdi', stub.calls.length === 1);
    const t2 = await prisma.notificationRecipient.findFirst({
      where: { notificationId: notif2.id }, select: { botDeliveredAt: true },
    });
    check('endi yetkazilgan deb belgilandi', Boolean(t2.botDeliveredAt));

    // Terminal nosozlik esa SAQLANADI.
    const notif3 = await prisma.notification.create({
      data: { title: 'T3', body: 'B3', category: 'other', audienceType: 'auto_system',
        channels: ['inapp', 'telegram'], status: 'sent', senderRole: 'system' },
      select: { id: true },
    });
    created.notifIds.push(notif3.id);
    await prisma.notificationRecipient.create({
      data: { notificationId: notif3.id, userId: uFresh.id },
    });
    stub.reset();
    stub.setMode('blocked');
    await deliverJob.run({ notificationId: notif3.id });
    const t3 = await prisma.notificationRecipient.findFirst({
      where: { notificationId: notif3.id }, select: { botFailedReason: true },
    });
    check('terminal nosozlik (blocked) SAQLANADI', t3.botFailedReason === 'blocked');
    stub.setMode('ok');

    // ── Telegram kanali tanlanmagan bo'lsa umuman urinilmaydi ──
    const notif4 = await prisma.notification.create({
      data: { title: 'T4', body: 'B4', category: 'other', audienceType: 'auto_system',
        channels: ['inapp'], status: 'sent', senderRole: 'system' },
      select: { id: true },
    });
    created.notifIds.push(notif4.id);
    await prisma.notificationRecipient.create({
      data: { notificationId: notif4.id, userId: uFresh.id },
    });
    stub.reset();
    await deliverJob.run({ notificationId: notif4.id });
    check("faqat in-app kanal → Telegram'ga UMUMAN yozilmadi", stub.calls.length === 0);

    // Yo'q bildirishnoma / bo'sh yuk — jimgina chiqadi (xato tashlamaydi).
    stub.reset();
    await deliverJob.run({});
    await deliverJob.run({ notificationId: 'a'.repeat(24) });
    check("bo'sh yuk va yo'q ID xato tashlamaydi", stub.calls.length === 0);

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n\x1b[1m3. notification.send — rejalashtirilgan xabar\x1b[0m');

    const scheduled = await prisma.notification.create({
      data: {
        title: 'Reja', body: 'Rejalashtirilgan', category: 'other',
        audienceType: 'auto_system', channels: ['inapp'], status: 'scheduled',
        senderRole: 'system', scheduleAt: new Date(Date.now() - 1000),
        audienceUsers: { connect: [{ id: uFresh.id }, { id: uNoLink.id }] },
      },
      select: { id: true },
    });
    created.notifIds.push(scheduled.id);

    await sendJob.run({ notificationId: scheduled.id });
    const sent = await prisma.notification.findUnique({
      where: { id: scheduled.id },
      select: { status: true, recipientsCount: true, sentAt: true },
    });
    const recips1 = await prisma.notificationRecipient.count({
      where: { notificationId: scheduled.id },
    });
    check('status `scheduled` → `sent`', sent.status === 'sent');
    check('oluvchilar yaratildi', recips1 === 2, `${recips1} ta`);
    check('`recipientsCount` yozildi', sent.recipientsCount === 2);

    // ⚠ IKKINCHI YURISH: oluvchilar QAYTA yaratilmasin.
    await sendJob.run({ notificationId: scheduled.id });
    const recips2 = await prisma.notificationRecipient.count({
      where: { notificationId: scheduled.id },
    });
    check(
      '⚠ QAYTA yurish oluvchilarni ko\'paytirmadi',
      recips2 === recips1,
      `${recips1} → ${recips2}`,
    );

    // ── BEKOR QILINGAN xabar YUBORILMAYDI ──
    const canceled = await prisma.notification.create({
      data: { title: 'Bekor', body: 'B', category: 'other', audienceType: 'auto_system',
        channels: ['inapp'], status: 'canceled', senderRole: 'system',
        audienceUsers: { connect: [{ id: uFresh.id }] } },
      select: { id: true },
    });
    created.notifIds.push(canceled.id);
    await sendJob.run({ notificationId: canceled.id });
    const canceledAfter = await prisma.notification.findUnique({
      where: { id: canceled.id }, select: { status: true },
    });
    check(
      "bekor qilingan xabar YUBORILMADI (status o'zgarmadi)",
      canceledAfter.status === 'canceled' &&
        (await prisma.notificationRecipient.count({ where: { notificationId: canceled.id } })) === 0,
    );
  } finally {
    if (created.notifIds.length) {
      await prisma.notificationRecipient
        .deleteMany({ where: { notificationId: { in: created.notifIds } } }).catch(() => null);
      await prisma.notification
        .deleteMany({ where: { id: { in: created.notifIds } } }).catch(() => null);
    }
    if (created.userIds.length) {
      await prisma.botUser.deleteMany({ where: { userId: { in: created.userIds } } }).catch(() => null);
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
