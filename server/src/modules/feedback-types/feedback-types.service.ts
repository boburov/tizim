import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';

/** FIKR-MULOHAZA TURLARI — global katalog, filial ko'lami YO'Q. */
@Injectable()
export class FeedbackTypesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list({ search, includeInactive = false, page = 1, limit = 50 }: {
    search?: string; includeInactive?: boolean; page?: number; limit?: number;
  }) {
    const where: Record<string, any> = {};
    if (!includeInactive) where.isActive = true;
    if (search && search.trim()) {
      where.name = { contains: search.trim(), mode: 'insensitive' };
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.feedbackType.findMany({ where, orderBy: { name: 'asc' }, skip, take: limit }),
      this.prisma.feedbackType.count({ where }),
    ]);
    return { items: withLegacyIds(items), total, page, limit };
  }

  async getById(id: string) {
    const doc = await this.prisma.feedbackType.findUnique({ where: { id } });
    if (!doc) throw new ApiError(404, 'Feedback turi topilmadi');
    return withLegacyId(doc);
  }

  async create({ name }: { name: string }) {
    const trimmed = String(name).trim();
    // ⚠ KAFOLAT BAZADA: qisman unique indeks (`name` WHERE `isActive`).
    // Bu tekshiruv faqat chiroyli xato xabari uchun.
    const exists = await this.prisma.feedbackType.findFirst({
      where: { name: trimmed, isActive: true },
    });
    if (exists) throw new ApiError(409, 'Bunday tur mavjud');
    const doc = await this.prisma.feedbackType.create({ data: { name: trimmed } });
    return withLegacyId(doc);
  }

  async update(id: string, body: Record<string, any>) {
    const doc = await this.getById(id);
    const data: Record<string, any> = {};

    if (body.name !== undefined) {
      const trimmed = String(body.name).trim();
      if (!trimmed) throw new ApiError(400, "Nom bo'sh bo'lmasligi kerak");
      if (trimmed !== doc.name) {
        const conflict = await this.prisma.feedbackType.findFirst({
          where: { id: { not: doc.id }, name: trimmed, isActive: true },
        });
        if (conflict) throw new ApiError(409, 'Bunday tur mavjud');
      }
      data.name = trimmed;
    }
    if (body.isActive !== undefined) data.isActive = !!body.isActive;

    const updated = await this.prisma.feedbackType.update({ where: { id }, data });
    return withLegacyId(updated);
  }

  /** YUMSHOQ o'chirish — mavjud fikrlar shu turga ishora qilib turadi. */
  async softRemove(id: string) {
    await this.getById(id);
    const doc = await this.prisma.feedbackType.update({
      where: { id },
      data: { isActive: false },
    });
    return withLegacyId(doc);
  }
}
