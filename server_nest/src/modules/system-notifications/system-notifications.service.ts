import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TIZIM BILDIRISHNOMALARI — `systemNotifications.service.js` EKVIVALENTI.
 *
 * Bu OWNER uchun ichki hodisalar oqimi (odam butunlay o'chirildi, maosh
 * stavkasi yopiq va h.k.). `notifications` modulidan FARQLARI:
 *   • oluvchi YO'Q — bitta global oqim, `userId` maydoni ham yo'q;
 *   • filial ko'lami YO'Q — hamma yozuv owner uchun;
 *   • soni CHEKLANGAN (100) — oshgani eng eskisidan o'chiriladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Saqlanadigan maksimal bildirishnoma soni — Express bilan bir xil. */
export const MAX_SYSTEM_NOTIFICATIONS = 100;

@Injectable()
export class SystemNotificationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** `status`: "all" | "read" | "unread" */
  async list({ status = 'all', page = 1, limit = 20 }: {
    status?: string; page?: number; limit?: number;
  }) {
    const where: Record<string, any> = {};
    if (status === 'read') where.isRead = true;
    if (status === 'unread') where.isRead = false;

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.systemNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.systemNotification.count({ where }),
    ]);
    return { items: withLegacyIds(items), total, page, limit };
  }

  getUnreadCount(): Promise<number> {
    return this.prisma.systemNotification.count({ where: { isRead: false } });
  }

  /**
   * ⚠ ALLAQACHON O'QILGAN BO'LSA `readAt` QAYTA YOZILMAYDI — dastlabki
   * o'qilgan vaqti saqlanadi. Shuning uchun erta qaytish (`return doc`)
   * shart va u OLIB TASHLANMASIN.
   */
  async markRead(id: string) {
    const doc = await this.prisma.systemNotification.findUnique({ where: { id } });
    if (!doc) throw new ApiError(404, 'Bildirishnoma topilmadi');
    if (doc.isRead) return withLegacyId(doc);

    const updated = await this.prisma.systemNotification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
    return withLegacyId(updated);
  }

  async markAllRead() {
    const res = await this.prisma.systemNotification.updateMany({
      where: { isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { modified: res.count || 0 };
  }

  /** Yangi tizim bildirishnomasi — boshqa modullar ham shu yerdan yozadi. */
  async create({ message, link = null }: { message?: string; link?: string | null } = {}) {
    const text = String(message || '').trim();
    if (!text) throw new ApiError(400, 'Bildirishnoma matni kerak');

    const doc = await this.prisma.systemNotification.create({
      data: {
        message: text,
        link: link ? String(link).trim() : null,
      },
    });

    await this.enforceMaxDocuments();
    return withLegacyId(doc);
  }

  /**
   * CHEKLOV: jami soni `MAX` dan oshsa eng eski yozuvlar o'chiriladi.
   *
   * ⚠ QATTIQ O'CHIRISH — bu ATAYLAB. Tizim oqimi cheksiz o'smasligi
   * kerak va bu yozuvlarga hech qanday havola yo'q (model'da FK yo'q).
   */
  private async enforceMaxDocuments(): Promise<void> {
    const count = await this.prisma.systemNotification.count();
    if (count <= MAX_SYSTEM_NOTIFICATIONS) return;

    const overflow = count - MAX_SYSTEM_NOTIFICATIONS;
    const oldest = await this.prisma.systemNotification.findMany({
      orderBy: { createdAt: 'asc' },
      take: overflow,
      select: { id: true },
    });

    if (oldest.length) {
      await this.prisma.systemNotification.deleteMany({
        where: { id: { in: oldest.map((d) => d.id) } },
      });
    }
  }
}
