import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';

/**
 * ARXIVLASH SABABLARI + SABAB BO'YICHA HISOBOT.
 *
 * ⚠ `logAction` — `users` hayot sikli (arxivlash/qaytarish) shu yerdan
 * yozadi. Hozircha ular `common/helpers/archive-log.service.ts`
 * KO'PRIGIDAN foydalanadi; ko'prik shu modul bilan almashtirilishi
 * kerak (BOSHQA AGENT ishi tugagach — hozir o'chirilsa ularning ish
 * daraxti buzilardi).
 */
@Injectable()
export class ArchiveReasonsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list({ search, includeInactive = false, page = 1, limit = 100 }: {
    search?: string; includeInactive?: boolean; page?: number; limit?: number;
  }) {
    const where: Record<string, any> = {};
    if (!includeInactive) where.isActive = true;
    if (search && search.trim()) {
      where.title = { contains: search.trim(), mode: 'insensitive' };
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.archiveReason.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take: limit,
      }),
      this.prisma.archiveReason.count({ where }),
    ]);
    return { items: withLegacyIds(items), total, page, limit };
  }

  async getById(id: string) {
    const doc = await this.prisma.archiveReason.findUnique({ where: { id } });
    if (!doc) throw new ApiError(404, 'Sabab topilmadi');
    return withLegacyId(doc);
  }

  async create(body: Record<string, any>, currentUser: any) {
    const title = String(body.title || '').trim();
    if (!title) throw new ApiError(400, 'Sarlavha kerak');
    const doc = await this.prisma.archiveReason.create({
      data: { title, createdById: currentUser?.id || currentUser?._id || null } as never,
    });
    return withLegacyId(doc);
  }

  async update(id: string, body: Record<string, any>) {
    await this.getById(id);
    const data: Record<string, any> = {};
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) throw new ApiError(400, 'Sarlavha kerak');
      data.title = title;
    }
    if (body.isActive !== undefined) data.isActive = !!body.isActive;
    const doc = await this.prisma.archiveReason.update({ where: { id }, data });
    return withLegacyId(doc);
  }

  /** YUMSHOQ o'chirish — arxiv jurnali shu sababga ishora qilib turadi. */
  async softRemove(id: string) {
    await this.getById(id);
    const doc = await this.prisma.archiveReason.update({
      where: { id }, data: { isActive: false },
    });
    return withLegacyId(doc);
  }

  /** Arxivlash/qaytarish amalini jurnalga yozadi (`users` dan chaqiriladi). */
  async logAction({ user, action, reasonId, by }: {
    user: string; action: string; reasonId?: string | null; by?: string | null;
  }): Promise<void> {
    let reasonRel: string | null = null;
    let reasonTitle = '';
    if (reasonId) {
      const r = await this.prisma.archiveReason.findUnique({
        where: { id: String(reasonId) },
        select: { id: true, title: true },
      });
      if (r) {
        reasonRel = r.id;
        // ⚠ SARLAVHA NUSXASI SAQLANADI: sabab keyinchalik o'chirilsa
        // hisobotda "(o'chirilgan sabab)" o'rniga HAQIQIY nom chiqadi.
        reasonTitle = r.title;
      }
    }
    await this.prisma.archiveLog.create({
      data: {
        userId: String(user),
        action,
        reasonId: reasonRel,
        reasonTitle,
        performedById: by ? String(by) : null,
      } as never,
    });
  }

  /** Sabab bo'yicha hisobot: har sabab uchun arxivlangan/qaytarilgan sonlari. */
  async report({ from, to, action }: {
    from?: Date | string; to?: Date | string; action?: string;
  } = {}) {
    const where: Record<string, any> = {};
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    if (action) where.action = action;

    // ⚠ Prisma `groupBy` SHARTLI yig'indini bilmaydi, shuning uchun
    // `(reasonId, action)` bo'yicha guruhlab, ikkala amalni JS'da BIR
    // qatorga yig'amiz (Mongo'da bu bitta `$group` edi).
    const rows = await this.prisma.archiveLog.groupBy({
      by: ['reasonId', 'action'],
      where,
      _count: { _all: true },
    } as never) as any[];

    const byReason = new Map<string, any>();
    for (const r of rows) {
      const key = r.reasonId ? String(r.reasonId) : 'null';
      const cur = byReason.get(key) || {
        reasonId: r.reasonId ? String(r.reasonId) : null,
        archiveCount: 0,
        restoreCount: 0,
        total: 0,
      };
      const n = r._count._all || 0;
      if (r.action === 'archive') cur.archiveCount += n;
      if (r.action === 'restore') cur.restoreCount += n;
      cur.total += n;
      byReason.set(key, cur);
    }

    const ids = [...byReason.values()].map((r) => r.reasonId).filter(Boolean);
    const reasons = ids.length
      ? await this.prisma.archiveReason.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true },
        })
      : [];
    const titleMap = new Map(reasons.map((r) => [String(r.id), r.title]));

    // Sabab o'chirilgan bo'lsa OXIRGI yozuvdagi nomni ko'rsatamiz.
    const fallbackTitle = async (rid: string) => {
      const last = await this.prisma.archiveLog.findFirst({
        where: { ...where, reasonId: rid },
        orderBy: { createdAt: 'desc' },
        select: { reasonTitle: true },
      });
      return last?.reasonTitle || "(o'chirilgan sabab)";
    };

    const out: any[] = [];
    for (const r of [...byReason.values()].sort((a, b) => b.total - a.total)) {
      out.push({
        ...r,
        title: r.reasonId
          ? titleMap.get(r.reasonId) || (await fallbackTitle(r.reasonId))
          : 'Sababsiz',
      });
    }
    return out;
  }
}
