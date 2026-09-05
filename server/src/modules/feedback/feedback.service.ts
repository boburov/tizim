import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { NotificationsService } from '../notifications/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FIKR-MULOHAZA — `services/feedback.service.js` EKVIVALENTI.
 *
 * ── ⚠ FILIAL KO'LAMI IKKI YO'L BILAN ──
 *
 * `Feedback` da `branchId` YO'Q. Yozuv filialga IKKI yo'l bilan
 * bog'lanadi — MUALLIF (`authorId`) yoki GURUH (`groupId`) orqali.
 *
 * NEGA IKKALASI HAM KERAK: o'quvchi guruhsiz ham fikr yozishi mumkin
 * (umumiy shikoyat), guruh esa anonim fikrda YAGONA iz bo'lib qoladi
 * (`isAnonymous` da muallif saqlanadi, lekin ko'rsatilmaydi). Bittasi
 * bilan cheklansak, ikkinchi turdagi yozuvlar JIMGINA yo'qolardi yoki
 * aksincha SIZIB chiqardi.
 *
 * ⚠ HECH QAYSISIGA bog'lanmagan yozuv (anonim + guruhsiz) filial
 * direktoriga KO'RINMAYDI — fail-closed, u markaz darajasidagi fikr.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const FEEDBACK_STATUS_LABEL: Record<string, string> = {
  new: 'Yangi',
  in_review: "Ko'rib chiqilmoqda",
  resolved: 'Hal qilindi',
  rejected: 'Rad etildi',
};

/**
 * ⚠ `id` HAR JOYDA ATAYLAB: Prisma `select` bilan uni avtomatik
 * qaytarmaydi (Mongo `_id` ni doim qaytarardi), klient esa yozuvni
 * `_id` bo'yicha ochadi.
 */
const TYPE_SELECT = { id: true, name: true, isActive: true };
const GROUP_SELECT = { id: true, name: true };
const USER_SELECT = { id: true, firstName: true, lastName: true, role: true };

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger('Feedback');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BranchAccessService) private readonly branchAccess: BranchAccessService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  private async ensureType(typeId: string) {
    const t = await this.prisma.feedbackType.findUnique({ where: { id: String(typeId) } });
    if (!t) throw new ApiError(400, 'Feedback turi topilmadi');
    return t;
  }

  private async ensureGroup(groupId?: string | null) {
    if (!groupId) return null;
    const g = await this.prisma.group.findUnique({ where: { id: String(groupId) } });
    if (!g) throw new ApiError(400, 'Guruh topilmadi');
    return g;
  }

  async submit(body: Record<string, any>, currentUser: any) {
    await this.ensureType(body.type);
    await this.ensureGroup(body.group);

    const isAnonymous = !!body.isAnonymous;
    const message = String(body.message || '').trim();
    if (message.length < 5) {
      throw new ApiError(400, "Matn kamida 5 belgidan iborat bo'lishi kerak");
    }

    // ⚠ ANONIM BO'LSA `authorId` UMUMAN YOZILMAYDI (`null`). Uni
    // "keyin kerak bo'lar" deb saqlab qo'yish anonimlik va'dasini
    // buzardi — bazaga kirgan har kim muallifni ko'rardi.
    const doc = await this.prisma.feedback.create({
      data: {
        authorId: isAnonymous ? null : String(currentUser._id),
        authorRoleSnapshot: currentUser.role,
        isAnonymous,
        typeId: String(body.type),
        groupId: body.group ? String(body.group) : null,
        message,
        status: 'new',
      } as never,
    });
    return withLegacyId(doc);
  }

  /** Filial ko'lami filtri — yuqoridagi izohga qarang. */
  private async scopeFilter(): Promise<Record<string, any>> {
    // ⚠ USTUN NOMLARI `groupId` / `authorId` (`group` / `author` bo'lsa
    // Prisma ularni RELATION filtri deb o'qib, boshqa ma'no berardi).
    const [groupScope, authorScope] = await Promise.all([
      this.branchAccess.branchGroupFilter('groupId'),
      this.branchAccess.branchUserFilter('authorId'),
    ]);

    // Ko'lam cheklanmagan (owner "barcha filiallar") — filtr shart emas.
    if (!groupScope.groupId && !authorScope.authorId) return {};

    const or: Record<string, unknown>[] = [];
    if (groupScope.groupId) or.push(groupScope);
    if (authorScope.authorId) or.push(authorScope);
    return { OR: or };
  }

  /**
   * `:id` AMALLARI UCHUN KO'LAMLANGAN O'QISH.
   *
   * FILIAL: `list()` va `getStats()` `scopeFilter()` bilan kesilgan edi,
   * `:id` amallari (review/reply/resolve/reject) esa YALANG'OCH
   * `findUnique` bo'lib qolgandi — begona filial fikri ID bo'yicha
   * o'zgartirilar, javobida esa MATNI bilan qaytarilardi (IDOR).
   *
   * ⚠ `AND` ICHIDA: `scopeFilter()` `OR` qaytaradi va uni yuqori
   * darajaga qo'ysak `id` sharti bilan to'qnashardi.
   *
   * ⚠ 404, 403 EMAS: ro'yxat bu yozuvni allaqachon yashirgan — uning
   * MAVJUDLIGINI ham oshkor qilmaymiz (`activity-logs.service.ts` bilan
   * bir xil qoida).
   */
  private async findInScopeOrFail(id: string) {
    const scope = await this.scopeFilter();
    const where: Record<string, any> = { id: String(id) };
    if (Object.keys(scope).length) where.AND = [scope];

    const doc = await this.prisma.feedback.findFirst({ where: where as never });
    if (!doc) throw new ApiError(404, 'Feedback topilmadi');
    return doc;
  }

  async list({ type, status, search, fromDate, toDate, page = 1, limit = 20 }: {
    type?: string; status?: string; search?: string;
    fromDate?: Date | string; toDate?: Date | string;
    page?: number; limit?: number;
  }) {
    const filter: Record<string, any> = { ...(await this.scopeFilter()) };
    if (type) filter.typeId = String(type);
    if (status) filter.status = status;
    // ⚠ `contains` XOM SATRNI qidiradi va LIKE maxsus belgilarini o'zi
    // ekranlaydi — eski `escapeRegex` endi hech nimadan himoya qilmasdi,
    // faqat qidiruv matnini buzardi.
    if (search && search.trim()) {
      filter.message = { contains: search.trim(), mode: 'insensitive' };
    }
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.gte = new Date(fromDate);
      if (toDate) filter.createdAt.lte = new Date(toDate);
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.feedback.findMany({
        where: filter,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          type: { select: TYPE_SELECT },
          group: { select: GROUP_SELECT },
          author: { select: USER_SELECT },
          repliedBy: { select: USER_SELECT },
        },
      }),
      this.prisma.feedback.count({ where: filter }),
    ]);
    return { items: withLegacyIds(items), total, page, limit };
  }

  async getById(id: string) {
    const doc = await this.prisma.feedback.findUnique({
      where: { id: String(id) },
      include: {
        type: { select: TYPE_SELECT },
        group: { select: GROUP_SELECT },
        author: { select: USER_SELECT },
        repliedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        resolvedBy: { select: USER_SELECT },
      },
    });
    if (!doc) throw new ApiError(404, 'Feedback topilmadi');
    return withLegacyId(doc);
  }

  async getMyFeedback(userId: string, { page = 1, limit = 20 } = {}) {
    const filter = { authorId: String(userId) };
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.feedback.findMany({
        where: filter,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          type: { select: TYPE_SELECT },
          group: { select: GROUP_SELECT },
          repliedBy: { select: USER_SELECT },
        },
      }),
      this.prisma.feedback.count({ where: filter }),
    ]);
    return { items: withLegacyIds(items), total, page, limit };
  }

  /** ⚠ YOPILGAN FIKRNI QAYTA OCHIB BO'LMAYDI. */
  private assertCanTransition(currentStatus: string, nextStatus: string): void {
    if (currentStatus === 'rejected' || currentStatus === 'resolved') {
      if (nextStatus === 'new' || nextStatus === 'in_review') {
        throw new ApiError(409, "Yopilgan feedback'ni qayta ochib bo'lmaydi");
      }
    }
  }

  /**
   * Holat o'zgarganda muallifga xabar.
   *
   * ⚠ `feedback.author` EMAS, `authorId`: bu funksiyaga `prisma.update`
   * natijasi keladi va u RELATION'ni O'Z ICHIGA OLMAYDI (`include`
   * berilmagan). `author` bo'yicha tekshirilsa shart HAR DOIM `false`
   * chiqib, muallif holat o'zgarishi haqida XABAR OLMAY qolardi.
   *
   * ⚠ XATO JIMGINA YUTILADI: bildirishnoma yiqilsa fikr amali
   * QAYTMASLIGI kerak — foydalanuvchi "hal qilindi" tugmasini bosdi va
   * u bajarildi.
   */
  private async notifyStatusChangeAsync(
    feedback: Record<string, any>,
    action: string,
    currentUser: any,
  ): Promise<void> {
    if (!feedback?.authorId || feedback.isAnonymous) return;
    try {
      await this.notifications.notifyFeedbackStatusChange(
        feedback,
        {
          statusLabel: FEEDBACK_STATUS_LABEL[action] || action,
          adminReply: feedback.adminReply,
          rejectionReason: feedback.rejectionReason,
        },
        currentUser,
      );
    } catch (err) {
      this.logger.warn(`Holat o'zgarishi xabari yuborilmadi: ${String(err)}`);
    }
  }

  async markReviewed(id: string, currentUser: any) {
    // FILIAL: begona filial fikrini ko'rib chiqishga belgilab bo'lmaydi.
    const doc = await this.findInScopeOrFail(id);
    if (doc.status !== 'new') {
      throw new ApiError(
        409,
        "Faqat 'Yangi' holatdagi feedback'ni ko'rib chiqishga belgilash mumkin",
      );
    }
    const updated = await this.prisma.feedback.update({
      where: { id: doc.id },
      data: {
        status: 'in_review',
        reviewedById: String(currentUser._id),
        reviewedAt: new Date(),
      },
    });
    await this.notifyStatusChangeAsync(updated, 'in_review', currentUser);
    return this.getById(updated.id);
  }

  async reply(id: string, body: Record<string, any>, currentUser: any) {
    // FILIAL: begona filial fikriga javob yozib bo'lmaydi (javob
    // qaytishida fikr MATNI ham oshkor bo'lardi).
    const doc = await this.findInScopeOrFail(id);
    const message = String(body.message || '').trim();
    if (!message) throw new ApiError(400, "Javob matni bo'sh bo'lmasligi kerak");

    // ⚠ JAVOB HOLATNI O'ZGARTIRMAYDI — u alohida amal. Javob berish
    // "hal qilindi" degani emas.
    const updated = await this.prisma.feedback.update({
      where: { id: doc.id },
      data: {
        adminReply: message,
        repliedById: String(currentUser._id),
        repliedAt: new Date(),
      },
    });
    return this.getById(updated.id);
  }

  async resolve(id: string, body: Record<string, any> | undefined, currentUser: any) {
    // FILIAL: begona filial fikrini hal qilingan deb belgilab bo'lmaydi.
    const doc = await this.findInScopeOrFail(id);
    this.assertCanTransition(doc.status, 'resolved');

    const data: Record<string, any> = {
      status: 'resolved',
      resolvedById: String(currentUser._id),
      resolvedAt: new Date(),
    };
    if (body?.adminReply !== undefined) {
      data.adminReply = String(body.adminReply || '').trim();
      // ⚠ Javob matni BO'SH bo'lsa "kim javob berdi" ham yozilmaydi.
      if (data.adminReply) {
        data.repliedById = String(currentUser._id);
        data.repliedAt = new Date();
      }
    }
    const updated = await this.prisma.feedback.update({ where: { id: doc.id }, data });

    await this.notifyStatusChangeAsync(updated, 'resolved', currentUser);
    return this.getById(updated.id);
  }

  async reject(id: string, body: Record<string, any> | undefined, currentUser: any) {
    // FILIAL: begona filial fikrini rad etib bo'lmaydi.
    const doc = await this.findInScopeOrFail(id);
    this.assertCanTransition(doc.status, 'rejected');

    const reason = String(body?.rejectionReason || '').trim();
    if (!reason) throw new ApiError(400, 'Rad etish sababi kerak');

    const updated = await this.prisma.feedback.update({
      where: { id: doc.id },
      data: {
        rejectionReason: reason,
        status: 'rejected',
        resolvedById: String(currentUser._id),
        resolvedAt: new Date(),
      },
    });

    await this.notifyStatusChangeAsync(updated, 'rejected', currentUser);
    return this.getById(updated.id);
  }

  async getStats({ fromDate, toDate }: { fromDate?: Date | string; toDate?: Date | string } = {}) {
    // ⚠ RO'YXAT BILAN AYNI KO'LAM — aks holda kartochkadagi son
    // ro'yxatdagi qatorlar soniga to'g'ri kelmasdi (va boshqa filialni
    // OSHKOR qilardi).
    const range: Record<string, any> = { ...(await this.scopeFilter()) };
    if (fromDate || toDate) {
      range.createdAt = {};
      if (fromDate) range.createdAt.gte = new Date(fromDate);
      if (toDate) range.createdAt.lte = new Date(toDate);
    }

    const [total, statusRows, typeRows] = await Promise.all([
      this.prisma.feedback.count({ where: range }),
      this.prisma.feedback.groupBy({
        by: ['status'], where: range, _count: { _all: true },
      } as never) as any,
      this.prisma.feedback.groupBy({
        by: ['typeId'],
        where: range,
        _count: { _all: true },
        orderBy: { _count: { typeId: 'desc' } },
      } as never) as any,
    ]);

    // ⚠ `groupBy` `include` qabul qilmaydi — tur nomlari IKKINCHI
    // so'rovda olinadi (turlar soni kichik).
    const typeIds = (typeRows as any[]).map((r) => r.typeId).filter(Boolean);
    const types = typeIds.length
      ? await this.prisma.feedbackType.findMany({
          where: { id: { in: typeIds } },
          select: { id: true, name: true },
        })
      : [];
    const typeName = new Map(types.map((t) => [String(t.id), t.name]));

    return {
      total,
      // ⚠ JAVOB SHAKLI ESKI (`{ _id, count }`) — klient kartochkalari
      // shunga tayangan.
      byStatus: (statusRows as any[]).map((r) => ({ _id: r.status, count: r._count._all })),
      byType: (typeRows as any[]).map((r) => ({
        typeId: r.typeId,
        name: typeName.get(String(r.typeId)),
        count: r._count._all,
      })),
    };
  }

  /**
   * Foydalanuvchi shu fikrni ko'ra oladimi.
   *
   * ⚠ ANONIM FIKR MUALLIFIGA HAM KO'RINMAYDI: `isAnonymous` bo'lsa
   * shart darhol yiqiladi. Bu ataylab — anonimlik "kim yozgani
   * saqlanmaydi" degani, ya'ni uni qayta ochish yo'li ham bo'lmasligi
   * kerak.
   */
  ensureOwnerOrAuthor(feedback: Record<string, any>, user: any): boolean {
    if (user.role === 'owner') return true;
    if (
      !feedback.isAnonymous &&
      feedback.author &&
      String(feedback.author?.id || feedback.authorId || feedback.author) ===
        String(user._id)
    ) {
      return true;
    }
    throw new ApiError(403, "Ruxsat yo'q");
  }
}
