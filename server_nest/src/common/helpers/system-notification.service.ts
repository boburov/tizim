import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../errors/api-error.js';
import { withLegacyId } from '../utils/serialize.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `modules/systemNotifications/services/systemNotifications.service.js`
 * DAGI `create()` NING KO'CHIRMASI — VAQTINCHALIK KO'PRIK.
 *
 * ── NEGA KERAK ──
 *
 * Ikkita ko'chirilayotgan foydalanuvchi amali owner'ga bildirishnoma
 * YOZADI va ikkalasi ham "jimgina yo'qolishi" mumkin bo'lgan hodisa:
 *
 *   POST   /users/:id/restore   → ishga qaytarilgan o'qituvchining maosh
 *                                 stavkasi YOPIQ ("maosh 0 bo'lib
 *                                 hisoblanadi" ogohlantirishi)
 *   DELETE /users/:id/permanent → odam butunlay o'chirildi
 *
 * Bularni tashlab ketish owner uchun ko'rinmas yo'qotish bo'lardi.
 * Yozuv `systemNotifications` MARSHRUTLARIGA tegmaydi — faqat bitta
 * jadvalga qator qo'shadi va 100 talik cheklovni saqlaydi.
 *
 * ⚠ `systemNotifications` (FAZA 10) KO'CHIRILGANDA: bu fayl O'CHIRILADI.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Saqlanadigan maksimal bildirishnoma soni — Express bilan bir xil. */
export const MAX_SYSTEM_NOTIFICATIONS = 100;

@Injectable()
export class SystemNotificationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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

  /** Jami soni MAX dan oshsa, eng eski yozuvlarni o'chiradi. */
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
