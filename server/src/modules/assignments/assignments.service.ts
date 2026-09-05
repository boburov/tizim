import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { ApiError } from '../../common/errors/api-error.js';
import { isTeacherActor, isStudentActor, type Actor } from '../../common/helpers/actor.js';
import { branchFilter } from '../../common/als/branch-context.js';
import { botStatusOf, BOT_STATUS } from '../../common/rbac/bot-status.js';
import { hasPermission } from '../../common/rbac/permission.service.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { StorageService } from '../storage/index.js';
import { SchedulerService } from '../../jobs/scheduler.service.js';
import { AssignmentDeliverService } from '../../bot/assignment-deliver.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VAZIFALAR — `assignments.service.js` NING EKVIVALENTI.
 *
 * ── IKKI KANAL, BIRI IKKINCHISIGA BOG'LIQ EMAS ──
 *   BOT      — `AssignmentRecipient.status` (pending → delivered/blocked/…)
 *   PLATFORMA— `AssignmentRecipient.readAt`
 * Botni bloklagan o'quvchi vazifani baribir platformada ko'radi,
 * shuning uchun o'qilmaganlar sanog'i yetkazish holatiga UMUMAN
 * qaramaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Bir vaqtda nechta bot xabari ketsin (Telegram ~30/sek global chegara). */
const DELIVERY_CONCURRENCY = 20;

const USER_SELECT = { id: true, firstName: true, lastName: true, phone: true };

const ASSIGNMENT_INCLUDE = {
  sender: { select: { id: true, firstName: true, lastName: true, role: true } },
  groups: { select: { id: true, name: true } },
  file: { select: { id: true, originalName: true, size: true, mimeType: true } },
};

/**
 * Bot holatidan boshlang'ich yetkazish statusi. Xarita bitta joyda —
 * bot holati mantiqi butun tizimda YAGONA manbadan
 * (`bot-status.ts`) oziqlanadi, aks holda bildirishnoma va vazifa
 * modullari vaqt o'tib bir-biridan uzoqlashib ketardi.
 */
const STATUS_BY_BOT: Record<string, string> = {
  [BOT_STATUS.LINKED]: 'pending', // yuborishga tayyor
  [BOT_STATUS.BLOCKED]: 'blocked', // kirgan, keyin bloklagan
  [BOT_STATUS.NOT_LINKED]: 'no_bot', // botga umuman kirmagan
};

interface BotUserRow {
  userId: string;
  chatId: bigint | null;
  telegramId: bigint | null;
  isBlocked: boolean;
}

const initialStatus = (botUser: BotUserRow | null): string =>
  STATUS_BY_BOT[botStatusOf(botUser as never)];

/** Cheklangan parallellik bilan ishlovchi pool (tashqi kutubxonasiz). */
const runPool = async <T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> => {
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
};

const actorId = (a: Actor | null): string => String(a?._id || '');

export interface UploadedFile {
  buffer?: Buffer;
  originalname?: string;
  mimetype?: string;
}

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger('Assignments');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly scheduler: SchedulerService,
    private readonly deliverer: AssignmentDeliverService,
  ) {}

  /**
   * Tanlangan guruhlarni tekshiradi va qaytaradi.
   *
   * Uch qatlamli tekshiruv: filial ko'lami (`branchFilter`), mavjudlik
   * va o'qituvchi uchun egalik. Uchalasi ham SHU YERDA — preview ham,
   * yuborish ham bir xil qoidaga bo'ysunishi kerak, aks holda preview
   * "30 kishi" deb ko'rsatib, yuborish 403 qaytarardi.
   */
  private async resolveGroups(groupIds: string[] | undefined, currentUser: Actor | null) {
    const ids = [...new Set((groupIds || []).map(String))];
    if (!ids.length) throw new ApiError(400, "Kamida bitta guruh tanlanishi kerak");

    const groups = await this.prisma.group.findMany({
      where: {
        id: { in: ids },
        isDeleted: false,
        ...branchFilter(),
      } as never,
      select: { id: true, name: true, branchId: true, teachers: { select: { id: true } } },
    });

    if (groups.length !== ids.length) {
      throw new ApiError(404, "Ba'zi guruhlar topilmadi");
    }

    if (isTeacherActor(currentUser)) {
      const currentUserId = actorId(currentUser);
      const mine = groups.every((g) =>
        (g.teachers || []).some((t) => String(t.id) === currentUserId),
      );
      if (!mine) {
        throw new ApiError(403, "Faqat o'z guruhlaringizga vazifa yubora olasiz");
      }
    }

    // Filial aralashib ketmasin: hisobot ham, ro'yxat filtri ham bitta
    // filial taxminiga tayanadi (`Assignment.branchId` — yagona qiymat).
    const branchIds = [...new Set(groups.map((g) => String(g.branchId || '')))];
    if (branchIds.length > 1) {
      throw new ApiError(
        400,
        "Tanlangan guruhlar turli filiallarga tegishli. Har bir filial uchun alohida yuboring",
      );
    }

    return groups;
  }

  /**
   * Guruh(lar)dagi faol o'quvchilar + ularning bot holati.
   *
   * Bir o'quvchi ikki guruhda bo'lsa BIR MARTA qaytadi (birinchi guruh
   * bilan) — aks holda unga bir xil vazifa ikki marta borardi.
   */
  private async resolveRecipients(groups: { id: string }[]) {
    const groupIds = groups.map((g) => g.id);

    const memberships = await this.prisma.groupMembership.findMany({
      where: { groupId: { in: groupIds }, leftAt: null, isDeleted: false },
      select: { studentId: true, groupId: true },
    });
    if (!memberships.length) return [];

    // Faqat faol, o'chirilmagan o'quvchilar (boshqa modullar bilan bir
    // xil qoida).
    const studentIds = [...new Set(memberships.map((m) => String(m.studentId)))];
    const students = await this.prisma.user.findMany({
      where: { id: { in: studentIds }, isActive: true, isDeleted: false },
      select: USER_SELECT,
    });
    const studentById = new Map(students.map((s) => [String(s.id), s]));

    // Bot bog'lanishlari BITTA so'rovda (N+1 yo'q).
    const botUsers = await this.prisma.botUser.findMany({
      where: { userId: { in: students.map((s) => s.id) } },
      select: { userId: true, chatId: true, telegramId: true, isBlocked: true },
    });
    const botByUser = new Map(botUsers.map((b) => [String(b.userId), b as BotUserRow]));

    const seen = new Set<string>();
    const out: {
      student: { id: string; firstName: string; lastName: string; phone: string | null };
      groupId: string;
      botUser: BotUserRow | null;
    }[] = [];
    for (const m of memberships) {
      const sid = String(m.studentId);
      if (seen.has(sid)) continue;
      const student = studentById.get(sid);
      if (!student) continue; // nofaol / arxivlangan
      seen.add(sid);
      out.push({
        student: student as never,
        groupId: m.groupId,
        botUser: botByUser.get(sid) || null,
      });
    }
    return out;
  }

  /**
   * Yuborishdan OLDINGI ko'rib chiqish.
   *
   * Aynan shu javob "N ta o'quvchi botni bloklagan" ogohlantirishini
   * beradi: o'qituvchi yuborishdan oldin kimga yetib bormasligini
   * bilsin.
   */
  async preview({ groupIds }: { groupIds: string[] }, currentUser: Actor | null) {
    const groups = await this.resolveGroups(groupIds, currentUser);
    const recipients = await this.resolveRecipients(groups);

    const buckets: Record<string, typeof recipients> = {
      pending: [], blocked: [], no_bot: [],
    };
    for (const r of recipients) buckets[initialStatus(r.botUser)].push(r);

    const brief = (list: typeof recipients) =>
      list.map((r) => ({
        _id: r.student.id,
        firstName: r.student.firstName,
        lastName: r.student.lastName,
        phone: r.student.phone,
      }));

    return {
      total: recipients.length,
      deliverable: buckets.pending.length,
      blocked: buckets.blocked.length,
      noBot: buckets.no_bot.length,
      // Ro'yxatlar ham qaytadi: "5 ta" degan raqamdan ko'ra "kim"
      // degani foydaliroq — o'qituvchi ularga darsda aytib qo'yishi
      // mumkin.
      blockedStudents: brief(buckets.blocked),
      noBotStudents: brief(buckets.no_bot),
      groups: groups.map((g) => ({ _id: g.id, name: g.name })),
    };
  }

  /**
   * Vazifani yaratadi: fayl saqlanadi, oluvchilar materializatsiya
   * qilinadi, bot yetkazish navbatga qo'yiladi.
   *
   * Fayl KVOTAGA sig'masa — butun so'rov rad etiladi (`StorageService`
   * 507 tashlaydi). Vazifani "faylsiz" holda jimgina yuborish ATAYLAB
   * qilinmaydi: o'qituvchi fayl ketganiga ishonib qolardi.
   */
  async create({
    body, file, currentUser,
  }: {
    body: { groupIds: string[]; title: string; body?: string; dueDate?: Date | null };
    file?: UploadedFile | null;
    currentUser: Actor | null;
  }) {
    const groups = await this.resolveGroups(body.groupIds, currentUser);
    const recipients = await this.resolveRecipients(groups);

    if (!recipients.length) {
      throw new ApiError(400, "Tanlangan guruhlarda faol o'quvchi yo'q");
    }

    const currentUserId = actorId(currentUser);

    type StoredFileRef = { id?: string; _id?: string; relPath: string; size?: number };
    let storedFile: StoredFileRef | null = null;
    if (file?.buffer?.length) {
      storedFile = (await this.storage.saveBuffer({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        userId: currentUserId,
        purpose: 'assignment',
      })) as unknown as StoredFileRef;
    }

    const statuses = recipients.map((r) => initialStatus(r.botUser));
    const countOf = (s: string) => statuses.filter((x) => x === s).length;

    let assignment;
    try {
      assignment = await this.prisma.assignment.create({
        data: {
          senderId: currentUserId,
          title: body.title,
          body: body.body || '',
          branchId: groups[0]?.branchId || null,
          fileId: storedFile?.id || storedFile?._id || null,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          recipientsCount: recipients.length,
          deliveredCount: 0,
          blockedCount: countOf('blocked'),
          noBotCount: countOf('no_bot'),
          failedCount: 0,
          sentAt: new Date(),
          groups: { connect: groups.map((g) => ({ id: g.id })) },
        } as never,
      });
    } catch (err) {
      // Vazifa yaratilmasa fayl yetim qoladi — kvotani bekorga yeb
      // turadi.
      if (storedFile) await this.storage.removeFile(storedFile, currentUserId);
      throw err;
    }

    await this.prisma.assignmentRecipient.createMany({
      data: recipients.map((r, i) => ({
        assignmentId: assignment.id,
        studentId: String(r.student.id),
        groupId: String(r.groupId),
        status: statuses[i],
      })) as never,
    });

    await this.scheduleDelivery(assignment.id);

    return this.getById(assignment.id, currentUser);
  }

  /**
   * Yetkazishni so'rov oqimidan ajratamiz: pg-boss job'iga qo'yamiz.
   *
   * ⚠ NestJS bu yerda PRODUSER: ishni Express'ning ishchisi
   * (`assignment.deliver` job'i) olib bajaradi. Navbat ishlamasa —
   * fonda (detached) bajaramiz, Express'da ham AYNAN shunday.
   */
  private async scheduleDelivery(assignmentId: string): Promise<void> {
    try {
      await this.scheduler.now('assignment.deliver', {
        assignmentId: String(assignmentId),
      });
    } catch (err) {
      this.logger.warn(
        `Vazifa yetkazish job'i navbatga qo'yilmadi, inline bajariladi: ${String(err)}`,
      );
      this.deliverAssignment(assignmentId).catch((e) =>
        this.logger.error(`Inline vazifa yetkazish xato (${assignmentId}): ${String(e)}`),
      );
    }
  }

  /**
   * Bot orqali yetkazish. Idempotent: faqat `status="pending"`
   * bo'lganlar uriniladi, ya'ni job qayta ishga tushsa dublikat xabar
   * ketmaydi.
   */
  async deliverAssignment(assignmentId: string): Promise<void> {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: String(assignmentId) },
    });
    if (!assignment) return;

    const pending = await this.prisma.assignmentRecipient.findMany({
      where: { assignmentId: String(assignmentId), status: 'pending' as never },
      select: { id: true, studentId: true },
    });
    if (!pending.length) return;

    const botUsers = await this.prisma.botUser.findMany({
      where: { userId: { in: pending.map((r) => r.studentId) } },
      select: { userId: true, chatId: true, telegramId: true, isBlocked: true },
    });
    const botByUser = new Map(botUsers.map((b) => [String(b.userId), b as BotUserRow]));

    // Fayl bir marta o'qiladi va hamma oluvchiga o'sha bufer ketadi.
    //
    // Fayl diskda topilmasa (qo'lda o'chirilgan, volume ko'chgan)
    // vazifa FAQAT MATN bo'lib ketadi. Xato tashlanmaydi ATAYLAB: job
    // yiqilsa pg-boss uni cheksiz qayta urinardi va o'quvchi matnni ham
    // olmasdi.
    let filePayload: {
      originalName: string; mimeType: string;
      telegramFileId: string | null; buffer: Buffer | null;
    } | null = null;
    if (assignment.fileId) {
      const doc = await this.prisma.storedFile.findUnique({
        where: { id: assignment.fileId },
      });
      if (doc && !doc.isDeleted) {
        try {
          filePayload = {
            originalName: doc.originalName,
            mimeType: doc.mimeType,
            telegramFileId: doc.telegramFileId || null,
            // `telegramFileId` bo'lsa bufer kerak emas — Telegram
            // nusxani o'zida saqlagan.
            buffer: doc.telegramFileId ? null : await this.storage.readFile(doc),
          };
        } catch (err) {
          this.logger.error(
            `Biriktirma diskda yo'q — vazifa faqat matn bo'lib ketadi ` +
            `(${assignmentId}/${doc.id}): ${String(err)}`,
          );
        }
      }
    }

    const ops: Promise<unknown>[] = [];
    const counters = { delivered: 0, blocked: 0, failed: 0 };

    await runPool(pending, DELIVERY_CONCURRENCY, async (r) => {
      const bu = botByUser.get(String(r.studentId));
      if (!bu || !bu.chatId || bu.isBlocked) {
        // Yaratilgandan keyin bloklagan bo'lishi mumkin — holatni
        // yangilaymiz.
        const status = !bu || !bu.chatId ? 'no_bot' : 'blocked';
        ops.push(
          this.prisma.assignmentRecipient.update({
            where: { id: r.id },
            data: { status: status as never, failedReason: status },
          }),
        );
        if (status === 'blocked') counters.blocked += 1;
        return;
      }

      const res = await this.deliverer.deliverToChat(
        { chatId: Number(bu.chatId), telegramId: Number(bu.telegramId) },
        {
          title: assignment.title,
          body: assignment.body,
          dueDate: assignment.dueDate,
          file: filePayload,
        },
      );

      if (res.ok) {
        counters.delivered += 1;
        // Birinchi muvaffaqiyatli yuborishdan keyin Telegram
        // `telegramFileId` ni keshlaymiz: qolgan o'quvchilarga fayl
        // qayta yuklanmaydi.
        if (res.telegramFileId && filePayload && !filePayload.telegramFileId) {
          filePayload.telegramFileId = res.telegramFileId;
          filePayload.buffer = null;
          this.storage
            .cacheTelegramFileId(assignment.fileId as string, res.telegramFileId)
            .catch(() => null);
        }
        ops.push(
          this.prisma.assignmentRecipient.update({
            where: { id: r.id },
            data: {
              status: 'delivered' as never, deliveredAt: new Date(), failedReason: '',
            },
          }),
        );
        return;
      }

      if (res.reason === 'blocked') {
        counters.blocked += 1;
        ops.push(
          this.prisma.assignmentRecipient.update({
            where: { id: r.id },
            data: { status: 'blocked' as never, failedReason: 'blocked' },
          }),
        );
        return;
      }

      // transient (bot ishlamayapti / 429) — "pending" holida
      // qoldiramiz, keyingi yurishda qayta uriniladi.
      if (res.transient) return;

      counters.failed += 1;
      ops.push(
        this.prisma.assignmentRecipient.update({
          where: { id: r.id },
          data: { status: 'failed' as never, failedReason: res.reason || '' },
        }),
      );
    });

    if (ops.length) await Promise.allSettled(ops);

    // Hisoblagichlarni recipient yozuvlaridan QAYTA hisoblaymiz.
    // `increment` EMAS: job qayta ishga tushsa (yoki bir qismi
    // transient bo'lib qolgan bo'lsa) increment raqamlarni ikki
    // hisoblab yuborardi.
    await this.recountAssignment(assignmentId);
  }

  /** Yetkazish hisoblagichlarini recipient'lardan qayta yig'adi. */
  private async recountAssignment(assignmentId: string): Promise<void> {
    const grouped = await this.prisma.assignmentRecipient.groupBy({
      by: ['status'],
      where: { assignmentId: String(assignmentId) },
      _count: { _all: true },
    });
    const by = Object.fromEntries(grouped.map((r) => [r.status, r._count._all]));

    await this.prisma.assignment.update({
      where: { id: String(assignmentId) },
      data: {
        deliveredCount: by.delivered || 0,
        blockedCount: by.blocked || 0,
        noBotCount: by.no_bot || 0,
        failedCount: by.failed || 0,
      },
    });
  }

  /**
   * O'qituvchi faqat O'ZI yuborganini ko'radi. Owner/xodim — filial
   * ko'lamidagi hammasini.
   */
  private scopeFilter(currentUser: Actor | null): Record<string, unknown> {
    if (isTeacherActor(currentUser)) return { senderId: actorId(currentUser) };
    return {};
  }

  async list(
    query: { page: number; limit: number; skip: number; groupId?: string },
    currentUser: Actor | null,
  ) {
    const { limit, skip } = query;

    const where: Record<string, unknown> = {
      isDeleted: false,
      ...branchFilter(),
      ...this.scopeFilter(currentUser),
    };

    // `groups: groupId` Mongo shakli edi, Prisma'da bu RELATION filtri.
    if (query.groupId) {
      where.groups = { some: { id: String(query.groupId) } };
    }

    const [items, total] = await Promise.all([
      this.prisma.assignment.findMany({
        where: where as never,
        orderBy: { sentAt: 'desc' },
        skip,
        take: limit,
        include: ASSIGNMENT_INCLUDE,
      }),
      this.prisma.assignment.count({ where: where as never }),
    ]);

    return { items: withLegacyIds(items), total };
  }

  async getById(id: string, currentUser: Actor | null) {
    const doc = await this.prisma.assignment.findFirst({
      where: {
        id: String(id),
        isDeleted: false,
        ...branchFilter(),
      } as never,
      include: ASSIGNMENT_INCLUDE,
    });

    if (!doc) throw new ApiError(404, 'Vazifa topilmadi');

    if (isTeacherActor(currentUser) && String(doc.senderId) !== actorId(currentUser)) {
      throw new ApiError(403, "Ruxsat yo'q");
    }

    return withLegacyId(doc);
  }

  /** Har bir o'quvchining yetkazish holati (o'qituvchi ko'radigan jadval). */
  async getRecipientList(
    assignmentId: string,
    { limit, skip, status }: { page?: number; limit: number; skip: number; status?: string },
  ) {
    const where: Record<string, unknown> = { assignmentId: String(assignmentId) };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.assignmentRecipient.findMany({
        where: where as never,
        // Yetkazilmaganlar TEPADA: o'qituvchi aynan ular bilan ishlashi
        // kerak.
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        skip,
        take: limit,
        include: {
          student: { select: USER_SELECT },
          group: { select: { id: true, name: true } },
        },
      }),
      this.prisma.assignmentRecipient.count({ where: where as never }),
    ]);

    return { items: withLegacyIds(items), total };
  }

  /** Vazifani arxivlaydi va faylni diskdan o'chirib joyni bo'shatadi. */
  async remove(id: string, currentUser: Actor | null) {
    const doc = await this.prisma.assignment.findFirst({
      where: { id: String(id), isDeleted: false, ...branchFilter() } as never,
    });
    if (!doc) throw new ApiError(404, 'Vazifa topilmadi');

    const currentUserId = actorId(currentUser);

    if (isTeacherActor(currentUser) && String(doc.senderId) !== currentUserId) {
      throw new ApiError(403, "Faqat o'z vazifangizni o'chira olasiz");
    }

    if (doc.fileId) {
      const storedFile = await this.prisma.storedFile.findUnique({
        where: { id: doc.fileId },
      });
      if (storedFile && !storedFile.isDeleted) {
        await this.storage.removeFile(storedFile, currentUserId);
      }
    }

    await this.prisma.assignment.update({
      where: { id: doc.id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: currentUserId },
    });

    return { _id: doc.id };
  }

  /** Biriktirmani yuklab olish uchun tekshiruv + fayl yozuvi. */
  async getDownloadable(
    assignmentId: string,
    currentUser: Actor | null,
    permissions: string[] | undefined,
  ) {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id: String(assignmentId), isDeleted: false },
    });
    if (!assignment) throw new ApiError(404, 'Vazifa topilmadi');
    if (!assignment.fileId) throw new ApiError(404, "Bu vazifada fayl yo'q");

    await this.assertCanRead(assignment, currentUser, permissions);

    const storedFile = await this.prisma.storedFile.findUnique({
      where: { id: assignment.fileId },
    });
    if (!storedFile || storedFile.isDeleted) {
      throw new ApiError(404, "Fayl o'chirilgan");
    }
    return withLegacyId(storedFile);
  }

  /**
   * Faylni kim yuklab ola oladi.
   *
   * ⚠ DIQQAT: bu yerda `branchFilter` ATAYLAB ishlatilmaydi —
   * o'quvchi filial tanlagichiga ega emas va uning konteksti bo'sh
   * bo'lishi mumkin. Himoya EGALIK orqali quriladi:
   *   • yuboruvchining o'zi;
   *   • oluvchilar ro'yxatidagi o'quvchi (o'ziga kelgan faylni oladi);
   *   • `ASSIGNMENTS_READ` ruxsatiga ega xodim/owner.
   *
   * Ruxsat marshrutda emas, SHU YERDA tekshiriladi: bitta manzil
   * (`GET /:id/file`) uch xil rolga xizmat qiladi va
   * `requirePermission` ularning birortasini (o'quvchini) butunlay
   * yopib qo'yardi.
   */
  private async assertCanRead(
    assignment: { id: string; senderId: string },
    currentUser: Actor | null,
    permissions: string[] | undefined,
  ): Promise<void> {
    if (!currentUser) throw new ApiError(401, "Avtorizatsiyadan o'tilmagan");

    const currentUserId = actorId(currentUser);
    if (String(assignment.senderId) === currentUserId) return;

    if (isStudentActor(currentUser)) {
      const mine = await this.prisma.assignmentRecipient.findFirst({
        where: { assignmentId: assignment.id, studentId: currentUserId },
        select: { id: true },
      });
      if (!mine) throw new ApiError(403, "Ruxsat yo'q");
      return;
    }

    // ⚠ O'qituvchi uchun `ASSIGNMENTS_READ` YETARLI EMAS: u ruxsat
    // standart rolda hammada bor va bo'lmasa o'qituvchi hamkasbining
    // faylini yuklab olardi. Uning uchun yagona shart — yuboruvchi
    // bo'lishi (yuqorida tekshirildi).
    if (isTeacherActor(currentUser)) throw new ApiError(403, "Ruxsat yo'q");

    if (!hasPermission(permissions, PERMISSIONS.ASSIGNMENTS_READ)) {
      throw new ApiError(403, "Ruxsat yo'q");
    }
  }

  /** O'quvchining o'ziga kelgan vazifalari (platforma ichida). */
  async listForStudent(
    studentId: string,
    { limit, skip }: { page?: number; limit: number; skip: number },
  ) {
    const [rows, total] = await Promise.all([
      this.prisma.assignmentRecipient.findMany({
        where: { studentId: String(studentId) },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          assignment: {
            select: {
              title: true,
              body: true,
              dueDate: true,
              sentAt: true,
              fileId: true,
              // Fayl tozalash bilan olib tashlangan bo'lsa o'quvchi
              // buni ko'rishi kerak — aks holda "fayl bor edi
              // shekilli" degan savol javobsiz qolardi.
              fileRemovedAt: true,
              senderId: true,
              isDeleted: true,
              sender: { select: { id: true, firstName: true, lastName: true } },
              file: {
                select: { id: true, originalName: true, size: true, mimeType: true },
              },
            },
          },
          group: { select: { id: true, name: true } },
        },
      }),
      this.prisma.assignmentRecipient.count({
        where: { studentId: String(studentId) },
      }),
    ]);

    // O'chirilgan vazifa o'quvchi ro'yxatida turmasin (recipient yozuvi
    // qoladi, chunki u yetkazish tarixi).
    const items = rows
      .filter((r) => r.assignment && !r.assignment.isDeleted)
      .map((r) => ({
        _id: r.id,
        status: r.status,
        readAt: r.readAt,
        group: withLegacyId(r.group),
        assignment: withLegacyId(r.assignment),
      }));

    return { items, total };
  }

  /**
   * O'qilmagan vazifalar soni (yon panel nishoni uchun).
   *
   * ⚠ PLATFORMA kanali bot kanalidan MUSTAQIL: botni bloklagan
   * o'quvchi xabarni faqat shu yerdan oladi, shuning uchun sanoq
   * yetkazish holatiga umuman qaramaydi — `readAt` bo'yicha
   * hisoblanadi.
   */
  async unreadCountForStudent(studentId: string) {
    const count = await this.prisma.assignmentRecipient.count({
      where: {
        studentId: String(studentId),
        readAt: null,
        assignment: { isDeleted: false },
      },
    });
    return { count };
  }

  /** O'quvchi vazifani platformada ochdi. */
  async markRead(recipientId: string, studentId: string) {
    // `updateMany` — atomik shart uchun (`readAt: null`).
    const res = await this.prisma.assignmentRecipient.updateMany({
      where: { id: String(recipientId), studentId: String(studentId), readAt: null },
      data: { readAt: new Date() },
    });

    if (res.count === 0) return null; // avval o'qilgan yoki topilmadi

    const updated = await this.prisma.assignmentRecipient.findUnique({
      where: { id: String(recipientId) },
    });

    return { _id: updated!.id, readAt: updated!.readAt };
  }
}
