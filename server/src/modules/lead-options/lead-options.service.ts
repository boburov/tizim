import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { LEAD_OPTION_KINDS } from '../../common/constants/lead-status.js';

/**
 * LID KATALOGLARI (manba / yo'nalish / rad etish sababi).
 *
 * GLOBAL katalog — filialga bog'lanmagan, ya'ni filial ko'lami YO'Q
 * (Express'da ham shunday).
 */
@Injectable()
export class LeadOptionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * ⚠ SAHIFALASH YO'Q — ATAYLAB. Katalog kichik va u formadagi
   * `<select>` ni to'ldiradi: sahifalansa ro'yxatning bir qismi
   * jimgina tushib qolardi. Javobdagi `meta` ham faqat `{ total }`.
   */
  async list({ kind, search, includeInactive = false }: {
    kind?: string; search?: string; includeInactive?: boolean;
  }) {
    const where: Record<string, any> = {};
    if (kind) where.kind = kind;
    if (!includeInactive) where.isActive = true;
    if (search && search.trim()) {
      where.name = { contains: search.trim(), mode: 'insensitive' };
    }
    const items = await this.prisma.leadOption.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return { items: withLegacyIds(items), total: items.length };
  }

  async getById(id: string) {
    const doc = await this.prisma.leadOption.findUnique({ where: { id } });
    if (!doc) throw new ApiError(404, 'Sozlama topilmadi');
    return withLegacyId(doc);
  }

  async create(body: Record<string, any>, currentUser: any) {
    if (!(LEAD_OPTION_KINDS as readonly string[]).includes(body.kind)) {
      throw new ApiError(400, "Noto'g'ri tur");
    }
    const name = String(body.name || '').trim();
    if (!name) throw new ApiError(400, 'Nom kerak');
    const doc = await this.prisma.leadOption.create({
      data: {
        kind: body.kind,
        name,
        createdById: currentUser?.id || currentUser?._id || null,
      } as never,
    });
    return withLegacyId(doc);
  }

  async update(id: string, body: Record<string, any>) {
    await this.getById(id);
    const data: Record<string, any> = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new ApiError(400, 'Nom kerak');
      data.name = name;
    }
    if (body.isActive !== undefined) data.isActive = !!body.isActive;
    const doc = await this.prisma.leadOption.update({ where: { id }, data });
    return withLegacyId(doc);
  }

  /**
   * O'chirish YUMSHOQ. ⚠ QATTIQ O'CHIRISH BO'LMASLIGI SHART: mavjud
   * lidlar shu katalog qiymatiga ishora qiladi va o'chirilsa ularning
   * "manba"/"yo'nalish" maydoni bo'sh qolardi.
   */
  async softRemove(id: string) {
    await this.getById(id);
    const doc = await this.prisma.leadOption.update({
      where: { id },
      data: { isActive: false },
    });
    return withLegacyId(doc);
  }
}
