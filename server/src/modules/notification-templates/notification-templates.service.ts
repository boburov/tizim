import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * XABAR SHABLONLARI — `notificationTemplates.service.js` EKVIVALENTI.
 *
 * Shablon GLOBAL katalog: filialga bog'lanmagan, ya'ni bu yerda filial
 * ko'lami YO'Q (xona modulidan farqi shu). Yozish `owner` roli VA
 * `notification_templates.manage` ruxsatini birga talab qiladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ⚠ YAGONA MANBA — `prisma/schema.prisma` dagi `TemplateCategory` enum.
 * Ro'yxat QO'LDA takrorlangan (Express'da ham shunday): enum'dan
 * avtomatik hosil qilinsa, sxemaga yangi qiymat qo'shilgan kunda u
 * JIMGINA qabul qilinadigan bo'lib qolardi.
 */
export const TEMPLATE_CATEGORIES = Object.freeze([
  'payment',
  'debt',
  'class_cancel',
  'announcement',
  'holiday',
  'personal',
  'feedback_status',
  'custom',
]);

@Injectable()
export class NotificationTemplatesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list({
    search,
    category,
    includeInactive = false,
    page = 1,
    limit = 50,
  }: {
    search?: string;
    category?: string;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const where: Record<string, any> = {};
    if (!includeInactive) where.isActive = true;
    if (category) where.category = category;
    if (search && search.trim()) {
      where.name = { contains: search.trim(), mode: 'insensitive' };
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.notificationTemplate.findMany({
        where,
        /**
         * ⚠ B9 — IKKILAMCHI SARALASH KALITI (2026-08-22 da qo'shildi).
         *
         * Ilgari faqat `createdAt: 'desc'` edi. Seed BIR VAQTNING O'ZIDA
         * 6 ta shablon yaratadi va ularning `createdAt` i bir xil
         * millisekundgacha tushishi mumkin — bunda PostgreSQL tartibni
         * KAFOLATLAMAYDI.
         *
         * Bu SAHIFALASHDA ko'rinadigan nuqsonga aylanardi: `skip/take`
         * bilan bitta shablon IKKI sahifada chiqishi yoki UMUMAN
         * tushib qolishi mumkin edi.
         *
         * `id` — birlamchi kalit, ya'ni tartib endi TO'LIQ aniqlangan.
         * AYNI naqsh moliya ro'yxatida B39 da tuzatilgan edi.
         */
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.notificationTemplate.count({ where }),
    ]);
    return { items: withLegacyIds(items), total, page, limit };
  }

  async getById(id: string) {
    const doc = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!doc) throw new ApiError(404, 'Shablon topilmadi');
    return withLegacyId(doc);
  }

  private validateBody(body: Record<string, any>): void {
    if (body.category && !TEMPLATE_CATEGORIES.includes(body.category)) {
      throw new ApiError(400, "Noto'g'ri kategoriya");
    }
  }

  async create(body: Record<string, any>) {
    this.validateBody(body);
    const trimmed = String(body.name || '').trim();
    if (!trimmed) throw new ApiError(400, 'Nom kerak');

    // ⚠ NOYOBLIK FAQAT FAOL SHABLONLAR ORASIDA (`isActive: true`).
    // O'chirilgan shablon YUMSHOQ o'chadi (`isActive: false`), ya'ni
    // o'sha nom bilan yangisini yaratish MUMKIN — eski xabarlardagi
    // shablon havolasi esa buzilmaydi.
    const exists = await this.prisma.notificationTemplate.findFirst({
      where: { name: trimmed, isActive: true },
    });
    if (exists) throw new ApiError(409, 'Bunday shablon mavjud');

    const doc = await this.prisma.notificationTemplate.create({
      data: {
        name: trimmed,
        body: String(body.body),
        category: body.category || 'custom',
      } as never,
    });
    return withLegacyId(doc);
  }

  async update(id: string, body: Record<string, any>) {
    const doc = await this.getById(id);
    this.validateBody(body);
    const data: Record<string, any> = {};

    if (body.name !== undefined) {
      const trimmed = String(body.name).trim();
      if (!trimmed) throw new ApiError(400, "Nom bo'sh bo'lmasligi kerak");
      if (trimmed !== doc.name) {
        const conflict = await this.prisma.notificationTemplate.findFirst({
          where: { id: { not: doc.id }, name: trimmed, isActive: true },
        });
        if (conflict) throw new ApiError(409, 'Bunday shablon mavjud');
      }
      data.name = trimmed;
    }
    if (body.body !== undefined) data.body = String(body.body);
    if (body.category !== undefined) data.category = body.category;
    if (body.isActive !== undefined) data.isActive = !!body.isActive;

    const updated = await this.prisma.notificationTemplate.update({ where: { id }, data });
    return withLegacyId(updated);
  }

  /**
   * O'chirish YUMSHOQ (`isActive: false`).
   *
   * ⚠ QATTIQ O'CHIRISH BO'LMASLIGI SHART: `Notification.templateId`
   * shu yozuvga ishora qiladi va o'chirilsa yuborilgan xabarlar tarixi
   * "shablonsiz" qolardi.
   */
  async softRemove(id: string) {
    await this.getById(id);
    const doc = await this.prisma.notificationTemplate.update({
      where: { id },
      data: { isActive: false },
    });
    return withLegacyId(doc);
  }
}
