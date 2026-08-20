import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { ROLES } from '../../common/constants/permissions.js';
import { BOT_STATUS, botStatusOf } from '../../common/rbac/bot-status.js';
import { userBranchCondition } from '../../common/als/branch-context.js';
import { SchedulerService } from '../../jobs/scheduler.service.js';
import { PersonalizeBodyService } from './personalize-body.service.js';
import { NotificationDeliverService } from '../../bot/notification-deliver.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BILDIRISHNOMALAR — `services/notifications.service.js` EKVIVALENTI.
 *
 * ── SAQLANISHI SHART BO'LGAN TO'RT XULQ ──
 *
 *  1. AUDITORIYA QOIDALARI — kim kimga yubora oladi (`resolveAudience`).
 *  2. DEDUPLIKATSIYA — ikki darajada:
 *       • oluvchilar ro'yxati `Set` bilan (bitta odam ikki guruhda bo'lsa
 *         ham BITTA xabar oladi);
 *       • `dedupeKey` bilan butun XABAR darajasida (job qayta urinsa
 *         ikkinchi xabar YARATILMAYDI).
 *  3. FILIAL KO'LAMI — `userBranchCondition()` orqali, `auto_system` dan
 *     tashqari (sababi o'sha shoxda batafsil yozilgan).
 *  4. O'QILDI/O'QILMADI — `readCount` shartli atomik yangilanish bilan
 *     oshiriladi, ya'ni ikki marta bosish ikki marta sanamaydi.
 *
 * ── FON QISMI (`deliverNotification` / `dispatchScheduled`) ──
 *
 * Ikkalasi HTTP marshrutlaridan CHAQIRILMAYDI — faqat fon joblaridan
 * (`notification.deliver`, `notification.send`). Ular Telegram bot
 * yetkazish qatlamiga tayanadi va u ko'chirilgach shu yerga qo'shildi.
 *
 * ⚠ HTTP SHARTNOMASIGA TA'SIRI YO'Q: `send` ularni faqat "navbatga
 * qo'yish" orqali chaqiradi (fire-and-forget) va navbat holati javobni
 * o'zgartirmaydi. pg-boss navbati IKKALA stek uchun BITTA (bir xil
 * Postgres, bir xil job nomi) — ya'ni NestJS qo'ygan ishni mavjud
 * Express ishchisi ham, NestJS ishchisi ham (yoqilgan bo'lsa) oladi;
 * ikkalasi BIR VAQTDA ishchi bo'lmasligi kerak.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * OLUVCHILARNI FILIAL BO'YICHA KESISH.
 *
 * ⚠ `AND` ISHLATILADI, `$and` EMAS. Prisma `$and` ni NOMA'LUM KALIT deb
 * JIMGINA e'tiborsiz qoldiradi — filtr umuman qo'llanmaydi va filial
 * sizishi bo'ladi, hech qanday xato bermasdan.
 *
 * FON VAZIFALARI ta'sirlanmaydi: ular request konteksti tashqarisida
 * ishlaydi, u yerda helper `null` qaytaradi va filtr o'zgarishsiz qoladi.
 */
const withBranchScope = (filter: Record<string, unknown>): Record<string, unknown> => {
  const condition = userBranchCondition();
  return condition ? { AND: [filter, condition] } : filter;
};

const SENDER_SELECT = { id: true, firstName: true, lastName: true, role: true };

/** O'qituvchi uchun ruxsat etilgan auditoriya turlari. */
const TEACHER_ALLOWED_AUDIENCE = new Set(['groups', 'users', 'individual']);

export interface Audience {
  type: string;
  groupIds?: string[];
  userIds?: string[];
}

interface ActorLike {
  _id?: string;
  id?: string;
  role?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SchedulerService) private readonly scheduler: SchedulerService,
    @Inject(PersonalizeBodyService) private readonly personalize: PersonalizeBodyService,
    @Inject(NotificationDeliverService)
    private readonly botDeliver: NotificationDeliverService,
  ) {}

  /** Bitta o'qituvchining barcha faol guruhlari ID'lari. */
  private async getTeacherGroupIds(teacherId: string): Promise<string[]> {
    const groups = await this.prisma.group.findMany({
      where: {
        // `teachers` — M2M relation (GroupTeachers), shuning uchun `some`.
        teachers: { some: { id: String(teacherId) } },
        isActive: true,
        isDeleted: false,
      },
      select: { id: true },
    });
    return groups.map((g) => g.id);
  }

  /** Bitta o'qituvchining barcha faol o'quvchilari ID'lari. */
  private async getTeacherStudentIds(teacherId: string): Promise<string[]> {
    const groupIds = await this.getTeacherGroupIds(teacherId);
    if (!groupIds.length) return [];
    const memberships = await this.prisma.groupMembership.findMany({
      where: { groupId: { in: groupIds }, leftAt: null, isDeleted: false },
      select: { studentId: true },
    });
    return [...new Set(memberships.map((m) => String(m.studentId)))];
  }

  /**
   * AUDITORIYANI oluvchi `userIds[]` ga aylantiradi (deduplikatsiya
   * qilingan, faqat faol foydalanuvchilar).
   */
  async resolveAudience(audience: Audience, currentUser?: ActorLike | null): Promise<string[]> {
    const isOwner = currentUser?.role === ROLES.OWNER;
    const isTeacher = currentUser?.role === ROLES.TEACHER;
    const isSystem = !currentUser; // Avto job

    if (isTeacher && !TEACHER_ALLOWED_AUDIENCE.has(audience.type)) {
      throw new ApiError(
        403,
        "O'qituvchi faqat o'z guruhlari yoki o'quvchilariga xabar yubora oladi",
      );
    }

    let recipientIds: string[] = [];

    switch (audience.type) {
      case 'all_students': {
        if (!isOwner && !isSystem) throw new ApiError(403, "Ruxsat yo'q");
        const users = await this.prisma.user.findMany({
          where: withBranchScope({
            role: ROLES.STUDENT,
            isActive: true,
            isDeleted: false,
          }) as never,
          select: { id: true },
        });
        recipientIds = users.map((u) => u.id);
        break;
      }
      case 'all_teachers': {
        if (!isOwner && !isSystem) throw new ApiError(403, "Ruxsat yo'q");
        const users = await this.prisma.user.findMany({
          where: withBranchScope({
            role: ROLES.TEACHER,
            isActive: true,
            isDeleted: false,
          }) as never,
          select: { id: true },
        });
        recipientIds = users.map((u) => u.id);
        break;
      }
      case 'groups': {
        const groupIds = (audience.groupIds || []).map(String);
        if (groupIds.length === 0) {
          throw new ApiError(400, 'Kamida bitta guruh tanlanishi kerak');
        }
        if (isTeacher) {
          const myGroupIds = (
            await this.getTeacherGroupIds(String(currentUser!._id || currentUser!.id))
          ).map(String);
          const allMine = groupIds.every((id) => myGroupIds.includes(id));
          if (!allMine) {
            throw new ApiError(403, "Faqat o'z guruhlaringizga yubora olasiz");
          }
        }
        const memberships = await this.prisma.groupMembership.findMany({
          where: { groupId: { in: groupIds }, leftAt: null, isDeleted: false },
          select: { studentId: true },
        });
        const studentIds = [...new Set(memberships.map((m) => String(m.studentId)))];
        // Boshqa shoxlar kabi — faqat faol, o'chirilmagan o'quvchilar.
        const activeStudents = await this.prisma.user.findMany({
          where: withBranchScope({
            id: { in: studentIds },
            isActive: true,
            isDeleted: false,
          }) as never,
          select: { id: true },
        });
        recipientIds = activeStudents.map((u) => u.id);
        break;
      }
      case 'users':
      case 'individual':
      case 'feedback_author': {
        const userIds = (audience.userIds || []).map(String);
        if (userIds.length === 0) {
          throw new ApiError(400, 'Kamida bitta foydalanuvchi tanlanishi kerak');
        }
        if (isTeacher) {
          const myStudents = new Set(
            await this.getTeacherStudentIds(String(currentUser!._id || currentUser!.id)),
          );
          const allMine = userIds.every((id) => myStudents.has(id));
          if (!allMine) {
            throw new ApiError(403, "Faqat o'z guruh o'quvchilaringizga yubora olasiz");
          }
        }
        // ⚠ ID'lar OCHIQ berilgani KO'LAMDAN OZOD QILMAYDI: aks holda
        // direktor boshqa filial o'quvchisining ID'sini qo'lda kiritib
        // xabar yuborardi (va `preview` orqali telefon raqamini olardi).
        const users = await this.prisma.user.findMany({
          where: withBranchScope({
            id: { in: userIds },
            isActive: true,
            isDeleted: false,
          }) as never,
          select: { id: true },
        });
        recipientIds = users.map((u) => u.id);
        break;
      }
      case 'auto_system': {
        // ⚠ FILIAL KO'LAMI ATAYLAB QO'LLANMAYDI.
        //
        // Bu tur foydalanuvchi kiritmasidan EMAS, TIZIM kodidan keladi
        // va oluvchilar ro'yxatini server o'zi hisoblaydi. Ular orasida
        // odatda OWNER bo'ladi, owner'ning `homeBranchId` si esa joriy
        // filialdan boshqa bo'lishi mumkin — ko'lam qo'yilsa u ro'yxatdan
        // tushib qolardi va lid eslatmasi/davomat ogohlantirishi unga
        // umuman yetmasdi. Ya'ni bu yerda ko'lam sizishni emas, XABARNI
        // to'sardi.
        //
        // Bu tur HTTP validatorida YO'Q — tashqaridan chaqirib bo'lmaydi.
        const ids = (audience.userIds || []).map(String);
        if (ids.length === 0) {
          recipientIds = [];
          break;
        }
        const users = await this.prisma.user.findMany({
          where: { id: { in: ids }, isActive: true, isDeleted: false },
          select: { id: true },
        });
        recipientIds = users.map((u) => u.id);
        break;
      }
      default:
        throw new ApiError(400, "Noto'g'ri audience turi");
    }

    // DEDUPLIKATSIYA — bitta odam ikki guruhda bo'lsa ham BITTA xabar.
    return [...new Set(recipientIds.map(String))];
  }

  /**
   * JONLI PREVIEW: tanlangan auditoriya bo'yicha nechta oluvchi
   * chiqishini hisoblaydi (xabar YARATMASDAN).
   */
  async previewAudience(audience: Audience, currentUser?: ActorLike | null) {
    const recipientIds = await this.resolveAudience(audience, currentUser);

    // Telegram yetkazish holati bo'yicha taqsimot.
    //
    // NEGA shu yerda: yuboruvchi "N kishiga boradi" degan raqamga ishonib
    // yuborardi, lekin botni bloklaganlarga xabar UMUMAN yetmasdi va buni
    // faqat keyin, oluvchilar jadvalidan bilib olardi. Endi ogohlantirish
    // yuborishdan OLDIN chiqadi.
    const users = await this.prisma.user.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    const botMap = await this.fetchBotStatusMap(recipientIds);

    const buckets: Record<string, typeof users> = { linked: [], blocked: [], not_linked: [] };
    for (const u of users) {
      const status = botMap.get(String(u.id))?.status || BOT_STATUS.NOT_LINKED;
      buckets[status].push(u);
    }

    const brief = (list: typeof users) =>
      list.map((u) => ({
        _id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
      }));

    return {
      // `count` ESKI NOM — klient shunga tayanadi, o'zgartirilmaydi.
      count: recipientIds.length,
      total: recipientIds.length,
      deliverable: buckets.linked.length,
      blocked: buckets.blocked.length,
      noBot: buckets.not_linked.length,
      // Raqamdan ko'ra ISM foydaliroq: xodim ularga qo'ng'iroq qila oladi.
      blockedStudents: brief(buckets.blocked),
      noBotStudents: brief(buckets.not_linked),
    };
  }

  /** `helpers/botStatus.helper.js` dagi `fetchBotStatusMap` ning ko'chirmasi. */
  private async fetchBotStatusMap(userIds: string[]) {
    const ids = [...new Set((userIds || []).map(String))].filter(Boolean);
    if (!ids.length) return new Map<string, { status: string }>();
    const bots = await this.prisma.botUser.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, chatId: true, isBlocked: true },
    });
    return new Map(
      bots.map((b) => [String(b.userId), { ...b, status: botStatusOf(b) }]),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FON YETKAZISH — `notification.deliver` va `notification.send` joblari
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * ⚠ CHEKLANGAN PARALLELLIK. 500 kishilik e'lonni ketma-ket yuborish
   * daqiqalab cho'zilardi (job qulfi tugab, ish "osilgan" deb qayta
   * boshlanardi); cheklovsiz `Promise.all` esa Telegram'ning tezlik
   * chegarasiga urib, hammasini 429 qilardi. 20 — Express'dagi qiymat.
   */
  private static readonly DELIVERY_CONCURRENCY = 20;

  private static async runPool<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let idx = 0;
    const runners = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (idx < items.length) {
          const cur = idx;
          idx += 1;
          await worker(items[cur]);
        }
      },
    );
    await Promise.all(runners);
  }

  /**
   * BOT PUSH — `notification.deliver` job'ining tanasi.
   *
   * ⚠⚠ IDEMPOTENTLIK SHU YERDA: faqat `botDeliveredAt IS NULL`
   * oluvchilar olinadi. Job qayta urinsa (pg-boss `retryLimit`) yoki
   * jarayon o'rtada yiqilsa, ALLAQACHON yetkazilganlar QAYTA
   * URILMAYDI. Bu shartni olib tashlash — har qayta urinishda butun
   * guruhga takroriy Telegram xabari demak.
   */
  async deliverNotification(notificationId: string): Promise<void> {
    const notif = await this.prisma.notification.findUnique({
      where: { id: String(notificationId) },
    });
    if (!notif) return;

    // Telegram kanali tanlanmagan bo'lsa — bot push YO'Q (faqat in-app).
    const channels = notif.channels?.length ? notif.channels : ['inapp', 'telegram'];
    if (!channels.includes('telegram')) return;

    const recipients = await this.prisma.notificationRecipient.findMany({
      where: { notificationId: String(notificationId), botDeliveredAt: null },
      select: { id: true, userId: true },
    });
    if (recipients.length === 0) return;

    // Barcha `BotUser` lar BITTA so'rovda (N+1 yo'q).
    const userIds = recipients.map((r) => String(r.userId));
    const botUsers = await this.prisma.botUser.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, chatId: true, telegramId: true, isBlocked: true },
    });
    const buByUser = new Map(botUsers.map((b) => [String(b.userId), b]));

    // `{ism}`, `{familiya}`, `{guruh}`, `{markaz}` — har oluvchi uchun.
    const bodyByUser = await this.personalize.personalizeBulk(notif.body, userIds);

    let delivered = 0;
    const updates: Array<Promise<unknown>> = [];

    await NotificationsService.runPool(
      recipients,
      NotificationsService.DELIVERY_CONCURRENCY,
      async (r) => {
        const bu = buByUser.get(String(r.userId));
        if (!bu || bu.isBlocked || !bu.chatId) {
          updates.push(
            this.prisma.notificationRecipient.update({
              where: { id: r.id },
              data: { botFailedReason: 'no-bot-link' },
            }),
          );
          return;
        }

        const res = await this.botDeliver.deliverToChat(
          // BigInt → Number: Telegram API raqam kutadi, Postgres BigInt beradi.
          { chatId: Number(bu.chatId), telegramId: Number(bu.telegramId) },
          {
            title: notif.title,
            body: bodyByUser.get(String(r.userId)) ?? notif.body,
            category: notif.category,
          },
        );

        if (res.ok) {
          delivered += 1;
          updates.push(
            this.prisma.notificationRecipient.update({
              where: { id: r.id },
              data: { botDeliveredAt: new Date(), botFailedReason: '' },
            }),
          );
        } else if (!res.transient) {
          // ⚠ O'TKINCHI (transient) NOSOZLIK TERMINAL SIFATIDA
          // SAQLANMAYDI: bot ishlamayotgani yoki 429 oluvchining aybi
          // emas. Saqlansa oluvchi "yetkazib bo'lmadi" bo'lib yopilardi,
          // lekin `botDeliveredAt` hamon `null` — keyingi urinishda
          // qayta uriniladi va bu TO'G'RI.
          updates.push(
            this.prisma.notificationRecipient.update({
              where: { id: r.id },
              data: { botFailedReason: res.reason ?? 'send-failed' },
            }),
          );
        }
      },
    );

    // `allSettled` — bitta yozuv yiqilsa qolganlari saqlanaversin.
    if (updates.length) await Promise.allSettled(updates);
    if (delivered > 0) {
      await this.prisma.notification.update({
        where: { id: String(notificationId) },
        data: { deliveredViaBot: { increment: delivered } },
      });
    }
  }

  /**
   * REJALASHTIRILGAN XABARNI YUBORISH — `notification.send` job'i.
   *
   * ⚠⚠ IDEMPOTENTLIK VA BEKOR QILISH BITTA SHARTDA:
   * `updateMany({ where: { status: "scheduled" } })` — SHARTLI ATOMIK
   * o'tish. Ikki marta ishga tushsa ikkinchisi `status !== "scheduled"`
   * da darhol chiqadi; foydalanuvchi bekor qilgan bo'lsa
   * (`status = "canceled"`) xabar YUBORILMAYDI.
   *
   * Bu shart `cancelScheduled` ning YAGONA haqiqiy tayanchi:
   * `scheduler.unschedule` cron rejasini o'chiradi, `sendAfter` bilan
   * qo'yilgan ishni EMAS — ya'ni ish baribir ishga tushadi va aynan shu
   * yerda to'xtaydi. SHARTNI OLIB TASHLAMANG.
   */
  async dispatchScheduled(notificationId: string): Promise<void> {
    const notif = await this.prisma.notification.findUnique({
      where: { id: String(notificationId) },
      include: {
        audienceGroups: { select: { id: true } },
        audienceUsers: { select: { id: true } },
      },
    });
    if (!notif || notif.status !== 'scheduled') return;

    // Auditoriya tiklanadi — Prisma'da u alohida maydon/relation'larda.
    const audience = {
      type: notif.audienceType,
      groupIds: (notif.audienceGroups || []).map((g) => String(g.id)),
      userIds: (notif.audienceUsers || []).map((u) => String(u.id)),
    };

    const sender = notif.senderId
      ? {
          _id: String(notif.senderId),
          role: notif.senderRole === 'owner' ? ROLES.OWNER : ROLES.TEACHER,
        }
      : null;

    const recipientIds = await this.resolveAudience(audience as never, sender);
    const channels = notif.channels?.length ? notif.channels : ['inapp', 'telegram'];

    const claimed = await this.prisma.notification.updateMany({
      where: { id: notif.id, status: 'scheduled' },
      data: { status: 'sent', sentAt: new Date(), recipientsCount: recipientIds.length },
    });
    // ⚠ DA'VO QILINMAGAN bo'lsa (boshqa nusxa ulgurgan yoki bekor
    // qilingan) — oluvchilarni YARATMAYMIZ. Aks holda xabar ikki marta
    // materializatsiya qilinib, ikkinchi push ketardi.
    if (claimed.count !== 1) return;

    await this.materializeRecipients(notif.id, recipientIds, channels);
  }

  /** ASOSIY YUBORISH. */
  async send(body: Record<string, any>, currentUser?: ActorLike | null) {
    const recipientIds = await this.resolveAudience(body.audience, currentUser);

    // Shablon suratini olish (ixtiyoriy).
    let templateRef: string | null = null;
    let finalBody = String(body.body || '').trim();
    let finalCategory = body.category || 'other';

    if (body.templateId) {
      const tpl = await this.prisma.notificationTemplate.findUnique({
        where: { id: String(body.templateId) },
      });
      if (!tpl) throw new ApiError(400, 'Shablon topilmadi');
      templateRef = tpl.id;
      if (!finalBody) finalBody = tpl.body;
      if (finalCategory === 'other') finalCategory = 'template_based';
    }

    if (!finalBody) {
      throw new ApiError(400, "Xabar matni bo'sh bo'lmasligi kerak");
    }

    // ⚠ IDEMPOTENTLIK: `dedupeKey` berilgan va shunday xabar mavjud bo'lsa
    // QAYTA YARATILMAYDI — avto joblar/qayta urinishlar dublikat
    // bildirishnoma yaratmasligi uchun. Mavjudi AYNAN qaytariladi.
    if (body.dedupeKey) {
      const existing = await this.prisma.notification.findFirst({
        where: { dedupeKey: body.dedupeKey },
      });
      if (existing) return withLegacyId(existing);
    }

    const senderRole = currentUser
      ? currentUser.role === ROLES.OWNER
        ? 'owner'
        : 'teacher'
      : 'system';

    // Kanallar — kamida bittasi (validator `min(1)`). Berilmasa eski
    // xulq: ikkalasi.
    const channels = body.channels?.length
      ? [...new Set(body.channels as string[])]
      : ['inapp', 'telegram'];

    // Rejalashtirish: `scheduleAt` kelajakda bo'lsa hoziroq yubormaymiz.
    // ⚠ 30 SONIYALIK ORALIQ SAQLANADI: undan yaqin vaqt "hozir" deb
    // qabul qilinadi, aks holda job navbatga tushguncha vaqt o'tib
    // ketardi va xabar KECHIKIB yetardi.
    const scheduleAt = body.scheduleAt ? new Date(body.scheduleAt) : null;
    const isScheduled = Boolean(
      scheduleAt && scheduleAt.getTime() > Date.now() + 30 * 1000,
    );

    // Auditoriya — Prisma'da `audienceType` + M2M relation'lar orqali
    // saqlanadi (Mongo'dagi ichki obyekt o'rniga).
    const audienceType = body.audience.type;
    const audienceGroupIds: string[] = (body.audience.groupIds || []).map(String);
    const audienceUserIds: string[] = (body.audience.userIds || []).map(String);

    const senderId = currentUser?._id || currentUser?.id || null;

    const notification = await this.prisma.notification.create({
      data: {
        senderId: senderId ? String(senderId) : null,
        senderRole,
        title: body.title || '',
        body: finalBody,
        category: finalCategory,
        templateId: templateRef,
        audienceType,
        ...(audienceGroupIds.length > 0
          ? { audienceGroups: { connect: audienceGroupIds.map((id) => ({ id })) } }
          : {}),
        ...(audienceUserIds.length > 0
          ? { audienceUsers: { connect: audienceUserIds.map((id) => ({ id })) } }
          : {}),
        channels,
        status: isScheduled ? 'scheduled' : 'sent',
        scheduleAt: isScheduled ? scheduleAt : null,
        recipientsCount: recipientIds.length,
        deliveredViaBot: 0,
        readCount: 0,
        isAuto: !!body.isAuto,
        dedupeKey: body.dedupeKey || null,
        relatedFeedbackId: body.relatedFeedback ? String(body.relatedFeedback) : null,
        sentAt: isScheduled ? scheduleAt : new Date(),
      } as never,
    });

    if (isScheduled) {
      // Oluvchilar va bot push job ishga tushganda materializatsiya
      // qilinadi — shu vaqtga qadar auditoriya o'zgargan bo'lsa ENG
      // SO'NGGI holat olinadi.
      await this.scheduleSend(notification.id, scheduleAt!);
      return withLegacyId(notification);
    }

    // Darhol yuborish — oluvchilarni yaratamiz va bot push'ni navbatga qo'yamiz.
    await this.materializeRecipients(notification.id, recipientIds, channels);
    const created = await this.prisma.notification.findUnique({
      where: { id: notification.id },
    });
    return withLegacyId(created);
  }

  /**
   * Oluvchi hujjatlarini yaratadi va (telegram tanlangan bo'lsa) bot
   * yetkazishni navbatga qo'yadi. Darhol va rejalashtirilgan yuborish —
   * ikkovi ham shu funksiyani chaqiradi. Idempotent EMAS: bir marta
   * chaqirilishi ko'zda tutilgan (`skipDuplicates` faqat poygaga qarshi).
   */
  private async materializeRecipients(
    notificationId: string,
    recipientIds: string[],
    channels: string[],
  ): Promise<void> {
    const wantsInapp = channels.includes('inapp');
    if (recipientIds.length > 0) {
      await this.prisma.notificationRecipient.createMany({
        data: recipientIds.map((uid) => ({
          notificationId: String(notificationId),
          userId: String(uid),
          inapp: wantsInapp,
          readAt: null,
        })),
        skipDuplicates: true,
      });
    }

    if (recipientIds.length > 0 && channels.includes('telegram')) {
      await this.scheduleDelivery(notificationId);
    }
  }

  /**
   * Rejalashtirilgan yuborishni belgilangan vaqtga qo'yadi.
   *
   * ⚠ JOB NOMI EXPRESS BILAN AYNAN BIR XIL (`notification.send`) —
   * navbat bitta Postgres'da va ishchi ham bitta. Nom farq qilsa ish
   * HECH QACHON olinmasdi va rejalashtirilgan xabar jimgina yo'qolardi.
   */
  private async scheduleSend(notificationId: string, when: Date): Promise<void> {
    try {
      await this.scheduler.at(when, 'notification.send', {
        notificationId: String(notificationId),
      });
    } catch (err) {
      this.logger.error(
        `Rejalashtirilgan yuborish job'i qo'yilmadi (${notificationId}): ${String(err)}`,
      );
      throw new ApiError(500, "Xabarni rejalashtirib bo'lmaydi");
    }
  }

  /**
   * Bot yetkazishni navbatga qo'yadi.
   *
   * ⚠ EXPRESS'DA NAVBAT ISHLAMASA "inline" YETKAZISHGA TUSHARDI. Bu
   * yerda inline yo'l YO'Q: u Telegram bot servisiga tayanadi va u
   * hali ko'chirilmagan. Xato QAYD ETILADI, so'rov esa yiqilmaydi —
   * Express'da ham `scheduleDelivery` xatosi javobni o'zgartirmaydi.
   */
  private async scheduleDelivery(notificationId: string): Promise<void> {
    try {
      await this.scheduler.now('notification.deliver', {
        notificationId: String(notificationId),
      });
    } catch (err) {
      this.logger.warn(
        `Yetkazish job'i navbatga qo'yilmadi (${notificationId}): ${String(err)}`,
      );
    }
  }

  /** Rejalashtirilgan xabarni bekor qilish (hali yuborilmagan bo'lsa). */
  async cancelScheduled(notificationId: string) {
    const notif = await this.prisma.notification.findUnique({
      where: { id: String(notificationId) },
    });
    if (!notif) throw new ApiError(404, 'Xabar topilmadi');
    if (notif.status !== 'scheduled') {
      throw new ApiError(400, 'Faqat rejalashtirilgan xabarni bekor qilish mumkin');
    }
    const updated = await this.prisma.notification.update({
      where: { id: notif.id },
      data: { status: 'canceled' },
    });
    try {
      await this.scheduler.unschedule('notification.send');
    } catch (err) {
      this.logger.warn(`Reja job'ini bekor qilishda xato: ${String(err)}`);
    }
    return withLegacyId(updated);
  }

  async list({
    senderId,
    category,
    channel,
    status,
    search,
    fromDate,
    toDate,
    page = 1,
    limit = 20,
  }: {
    senderId?: string;
    category?: string;
    channel?: string;
    status?: string;
    search?: string;
    fromDate?: Date | string;
    toDate?: Date | string;
    page?: number;
    limit?: number;
  }) {
    const where: Record<string, any> = {};
    if (senderId) where.senderId = String(senderId);
    if (category) where.category = category;
    // `channels` Prisma'da enum massiv — `has` operatori bilan filtrlanadi.
    if (channel) where.channels = { has: channel };
    if (status) where.status = status;
    if (search) {
      // ⚠ EKRANLASH SAQLANADI. Prisma `contains` regex EMAS, ya'ni
      // ekranlash endi qat'iy shart emas — lekin uni olib tashlash
      // qidiruv natijasini JIMGINA o'zgartirardi (masalan `a.b` bugun
      // hech nima topmaydi, ekranlashsiz esa topa boshlardi).
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      where.OR = [
        { title: { contains: escaped, mode: 'insensitive' } },
        { body: { contains: escaped, mode: 'insensitive' } },
      ];
    }
    if (fromDate || toDate) {
      where.sentAt = {};
      if (fromDate) where.sentAt.gte = new Date(fromDate);
      if (toDate) where.sentAt.lte = new Date(toDate);
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip,
        take: limit,
        include: {
          sender: { select: SENDER_SELECT },
          template: { select: { id: true, name: true, category: true } },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { items: withLegacyIds(items), total, page, limit };
  }

  async getById(id: string) {
    const notif = await this.prisma.notification.findUnique({
      where: { id: String(id) },
      include: {
        sender: { select: SENDER_SELECT },
        template: { select: { id: true, name: true, body: true, category: true } },
        // Mongo `populate("audience.groupIds")` → Prisma M2M relation.
        audienceGroups: { select: { id: true, name: true } },
        audienceUsers: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
        relatedFeedback: { select: { id: true, message: true, status: true } },
      },
    });
    if (!notif) throw new ApiError(404, 'Xabar topilmadi');

    // Frontend `notif.audience.type`, `notif.audience.groupIds[].name`,
    // `notif.audience.userIds[].firstName` shaklida o'qiydi. Prisma'da bu
    // alohida maydon/relation — ESKI SHAKLNI TIKLAYMIZ.
    const result = withLegacyId(notif) as Record<string, any>;
    result.audience = {
      type: notif.audienceType,
      groupIds: withLegacyIds(notif.audienceGroups || []),
      userIds: withLegacyIds(notif.audienceUsers || []),
    };
    return result;
  }

  async getRecipientList(notifId: string, { page = 1, limit = 50 }) {
    const where = { notificationId: String(notifId) };
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.notificationRecipient.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true, firstName: true, lastName: true, phone: true, role: true,
            },
          },
        },
      }),
      this.prisma.notificationRecipient.count({ where }),
    ]);
    return { items: items.map((i) => withLegacyId(i)), total, page, limit };
  }

  async getMyInbox(
    userId: string,
    { page = 1, limit = 20, unreadOnly = false }: {
      page?: number; limit?: number; unreadOnly?: boolean;
    } = {},
  ) {
    // ⚠ FAQAT IN-APP kanali tanlangan xabarlar inbox'da ko'rinadi.
    const where: Record<string, any> = { userId: String(userId), inapp: true };
    if (unreadOnly) where.readAt = null;

    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.prisma.notificationRecipient.findMany({
        where,
        // ⚠ IKKILAMCHI TARTIB (`id`): `createdAt` teng bo'lgan yozuvlarda
        // sahifalash beqaror bo'lib qolmasligi uchun — aks holda 2-sahifada
        // 1-sahifadagi yozuv qayta chiqishi mumkin edi.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        include: {
          notification: {
            include: {
              sender: {
                select: { id: true, firstName: true, lastName: true, role: true },
              },
            },
          },
        },
      }),
      this.prisma.notificationRecipient.count({ where }),
    ]);

    // `notification.body` JOYIDA almashtiriladi — avval nusxa olamiz.
    const items = rows.map((r) => withLegacyId(r) as Record<string, any>);

    const withBody = items.filter((it) => it.notification?.body);
    if (withBody.length) {
      const bodies = withBody.map((it) => it.notification.body as string);
      const personalized = await this.personalize.personalizeManyForUser(bodies, userId);
      withBody.forEach((it, i) => {
        it.notification.body = personalized[i];
      });
    }

    return { items, total, page, limit };
  }

  getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notificationRecipient.count({
      where: { userId: String(userId), readAt: null, inapp: true },
    });
  }

  async markRead(recipientId: string, userId: string) {
    // ⚠ SHARTLI ATOMIK YANGILANISH: `readAt: null` WHERE ICHIDA, ya'ni
    // ikki marta bosilsa ikkinchisi `count = 0` oladi va `readCount`
    // IKKI MARTA OSHMAYDI.
    const res = await this.prisma.notificationRecipient.updateMany({
      where: { id: String(recipientId), userId: String(userId), readAt: null },
      data: { readAt: new Date() },
    });
    if (!res.count) return null;

    const updated = await this.prisma.notificationRecipient.findUnique({
      where: { id: String(recipientId) },
    });
    if (updated) {
      await this.prisma.notification.update({
        where: { id: updated.notificationId },
        data: { readCount: { increment: 1 } },
      });
    }
    return withLegacyId(updated);
  }

  async markAllRead(userId: string) {
    // ⚠ FAQAT IN-APP — `getMyInbox` va `getUnreadCount` bilan BIR XIL
    // qamrov. Telegram-only oluvchilar inbox'da ko'rinmaydi, shuning
    // uchun ularning `readCount` iga ham tegmaymiz.
    const docs = await this.prisma.notificationRecipient.findMany({
      where: { userId: String(userId), readAt: null, inapp: true },
      select: { id: true, notificationId: true },
    });
    if (!docs.length) return { updated: 0 };

    // Har bir xabar bo'yicha oluvchi ID'larini guruhlaymiz, so'ng ATOMIK
    // `updateMany` qilib FAQAT shu chaqiruvda haqiqatan o'zgargan sonni
    // `readCount` ga qo'shamiz — bir vaqtda kelgan `markRead` bilan ikki
    // marta sanash POYGASINI oldini oladi.
    const byNotif = new Map<string, string[]>();
    for (const d of docs) {
      const k = String(d.notificationId);
      if (!byNotif.has(k)) byNotif.set(k, []);
      byNotif.get(k)!.push(d.id);
    }

    const now = new Date();
    const results = await Promise.all(
      [...byNotif.entries()].map(async ([nid, ids]) => {
        const res = await this.prisma.notificationRecipient.updateMany({
          where: { id: { in: ids }, readAt: null },
          data: { readAt: now },
        });
        const n = res.count || 0;
        if (n > 0) {
          await this.prisma.notification.update({
            where: { id: nid },
            data: { readCount: { increment: n } },
          });
        }
        return n;
      }),
    );

    return { updated: results.reduce((a, b) => a + b, 0) };
  }

  async getStats({ fromDate, toDate }: { fromDate?: Date | string; toDate?: Date | string } = {}) {
    // ⚠ FAQAT HAQIQATAN YUBORILGAN xabarlar statistikaga kiradi.
    // `scheduled` (hali yuborilmagan, `recipientsCount` faqat preview) va
    // `canceled` (umuman yetkazilmagan) yozuvlar `totalRecipients` va
    // `readRate` ni BUZARDI.
    const where: Record<string, any> = { status: 'sent' };
    if (fromDate || toDate) {
      where.sentAt = {};
      if (fromDate) where.sentAt.gte = new Date(fromDate);
      if (toDate) where.sentAt.lte = new Date(toDate);
    }

    const [total, byCategory, totals] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.groupBy({
        by: ['category'],
        where,
        _count: { _all: true },
        _sum: { recipientsCount: true, deliveredViaBot: true, readCount: true },
        orderBy: { _count: { _all: 'desc' } },
      } as never),
      this.prisma.notification.aggregate({
        where,
        _sum: { recipientsCount: true, deliveredViaBot: true, readCount: true },
      }),
    ]);

    // Mongo aggregate shakli: `{ _id, count, recipients, delivered, reads }`.
    // Prisma groupBy shakli boshqacha — ESKI SHAKLGA o'giramiz, klient
    // shunga tayanadi.
    const byCategoryFormatted = (byCategory as any[]).map((r) => ({
      _id: r.category,
      count: r._count._all,
      recipients: r._sum.recipientsCount || 0,
      delivered: r._sum.deliveredViaBot || 0,
      reads: r._sum.readCount || 0,
    }));

    const t = {
      totalRecipients: totals._sum.recipientsCount || 0,
      totalDelivered: totals._sum.deliveredViaBot || 0,
      totalReads: totals._sum.readCount || 0,
    };
    const readRate =
      t.totalRecipients > 0 ? Math.round((t.totalReads / t.totalRecipients) * 100) : 0;

    return {
      total,
      totalRecipients: t.totalRecipients,
      totalDelivered: t.totalDelivered,
      totalReads: t.totalReads,
      readRate,
      byCategory: byCategoryFormatted,
    };
  }

  /**
   * Feedback holati o'zgarganda avto-bildirishnoma (anonim BO'LMASA).
   * `feedback` moduli ko'chirilganda shu yerdan chaqiriladi.
   */
  async notifyFeedbackStatusChange(
    feedback: Record<string, any>,
    { statusLabel, adminReply, rejectionReason }: Record<string, any>,
    currentUser?: ActorLike | null,
  ) {
    const authorId = feedback?.authorId || feedback?.author;
    if (!authorId || feedback.isAnonymous) return null;

    const lines = [`Sizning feedback'ingiz holati: ${statusLabel}`];
    if (adminReply) lines.push(`Javob: ${adminReply}`);
    if (rejectionReason) lines.push(`Sabab: ${rejectionReason}`);
    const body = lines.join('\n');

    return this.send(
      {
        title: "Feedback holati o'zgardi",
        body,
        category: 'feedback_status',
        audience: { type: 'feedback_author', userIds: [String(authorId)] },
        relatedFeedback: feedback.id || feedback._id,
        isAuto: true,
      },
      currentUser,
    );
  }
}
