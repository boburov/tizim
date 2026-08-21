import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { describeLog } from '../../common/constants/audit-actions.js';
import { withLegacyId } from '../../common/utils/serialize.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAOLIYAT LOGLARI — `services/activityLogs.service.js` EKVIVALENTI.
 *
 * FAQAT O'QISH: yozuvni `auditLog` middleware yaratadi (u hali Express'da).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  username: true,
} as const;

// Middleware endi bu yo'llarni yozmaydi, lekin bazada eski yozuvlar qolgan.
// Ularni o'qish bosqichida ham chiqarib tashlaymiz (ma'lumot o'chirilmaydi).
const NOISE_PATHS = ['/api/auth/refresh', '/auth/refresh'];

// "action" — hosila qiymat, bazada saqlanmaydi. Uni to'g'ridan-to'g'ri
// filtrlash uchun har bir amal turini bazadagi maydonlarga tarjima qilamiz,
// aks holda sahifalash (pagination) buziladi.
const LOGIN_PATHS = ['/api/auth/login', '/api/bot-auth/login'];
const LOGOUT_PATHS = ['/api/auth/logout'];

const ACTION_QUERY: Record<string, Prisma.ActivityLogWhereInput> = {
  CREATE: {
    method: 'POST',
    path: { notIn: [...LOGIN_PATHS, ...LOGOUT_PATHS] },
  },
  UPDATE: { method: { in: ['PATCH', 'PUT'] } },
  DELETE: { method: 'DELETE' },
  LOGIN: { path: { in: LOGIN_PATHS } },
  LOGOUT: { path: { in: LOGOUT_PATHS } },
};

export interface ListFilters {
  userId?: string;
  method?: string;
  action?: string;
  resourceType?: string;
  fromDate?: Date | string;
  toDate?: Date | string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ActivityLogsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BranchAccessService) private readonly branchAccess: BranchAccessService,
  ) {}

  /**
   * `where` ni yig'ish.
   *
   * ═════════════════════════════════════════════════════════════════════
   * `AND` MAJBURIY, SPREAD EMAS.
   *
   * Shovqin filtri ham, amal filtri ham `path` bo'yicha shart qo'yadi.
   * Ular bitta obyektga spread qilinsa `path` kaliti IKKI marta uchraydi
   * va keyingisi oldingisini JIMGINA bosib ketardi — masalan "LOGIN"
   * tanlanganda shovqin filtri yo'qolardi.
   *
   * Xuddi shu sabab `branchUserFilter` ham `AND` ichida turadi: u
   * `userId` bo'yicha filtrlaydi va `userId` filtri bilan to'qnashardi.
   * ═════════════════════════════════════════════════════════════════════
   */
  private async buildWhere({
    userId,
    method,
    action,
    resourceType,
    fromDate,
    toDate,
  }: ListFilters): Promise<Prisma.ActivityLogWhereInput> {
    const and: Prisma.ActivityLogWhereInput[] = [];

    // FILIAL KO'LAMI: `ActivityLog` da `branchId` YO'Q — yozuv AKTYORGA
    // (`userId`) tegishli, aktyor esa filialga.
    //
    // TIZIM yozuvlari (`userId: null`) filial direktoriga KO'RINMAYDI —
    // fail-closed. Markaz darajasidagi audit owner'ning ishi.
    //
    // MAYDON NOMI `user` EMAS, `userId`: Prisma'da `user` bu RELATION.
    const scope = await this.branchAccess.branchUserFilter('userId');
    if (Object.keys(scope).length) and.push(scope as Prisma.ActivityLogWhereInput);

    // Shovqin (refresh) — doim chiqarib tashlanadi.
    and.push({ path: { notIn: NOISE_PATHS } });

    if (userId) and.push({ userId: String(userId) });
    if (method) and.push({ method: method as Prisma.ActivityLogWhereInput['method'] });
    if (resourceType) and.push({ resourceType });

    if (fromDate || toDate) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (fromDate) createdAt.gte = new Date(fromDate);
      if (toDate) createdAt.lte = new Date(toDate);
      and.push({ createdAt });
    }

    const clause = action ? ACTION_QUERY[action] : undefined;
    if (clause) and.push(clause);

    return { AND: and };
  }

  /** Yozuvga semantik maydonlarni qo'shadi (`action`, `description`, `failed`). */
  private enrich(doc: Record<string, unknown>) {
    return { ...withLegacyId(doc), ...describeLog(doc as never) };
  }

  async list({ page = 1, limit = 30, ...filters }: ListFilters) {
    const where = await this.buildWhere(filters);

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: USER_SELECT } },
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return { items: items.map((d) => this.enrich(d as never)), total, page, limit };
  }

  /**
   * ⚠ FILIAL KO'LAMI ATAYLAB TEKSHIRILMAYDI — Express AYNAN SHUNDAY.
   *
   * `getById` da hech qanday `branchUserFilter` yo'q: `activity_logs.read`
   * ruxsati bo'lgan har kim ISTALGAN logni id bo'yicha o'qiy oladi,
   * ro'yxat esa filial bo'yicha cheklangan. Bu FARQ Express'da mavjud
   * (`services/activityLogs.service.js::getById`).
   *
   * BU YERDA TUZATILMADI — paritet shart, "yaxshilash" ikki stekni
   * ajratib yuborardi va paritet testi buni yiqitardi. Farq hisobotda
   * alohida qayd etilgan; qarorni tizim egasi qabul qiladi.
   */
  async getById(id: string) {
    const doc = await this.prisma.activityLog.findUnique({
      where: { id: String(id) },
      include: { user: { select: USER_SELECT } },
    });
    if (!doc) throw new ApiError(404, 'Log topilmadi');
    return this.enrich(doc as never);
  }

  async getStats({ fromDate, toDate }: { fromDate?: Date | string; toDate?: Date | string } = {}) {
    // Ro'yxat bilan AYNI ko'lam — shovqin filtridan TASHQARI (statistika
    // xom hisob; Express'da ham aynan shunday).
    const and: Prisma.ActivityLogWhereInput[] = [];
    const scope = await this.branchAccess.branchUserFilter('userId');
    if (Object.keys(scope).length) and.push(scope as Prisma.ActivityLogWhereInput);
    if (fromDate || toDate) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (fromDate) createdAt.gte = new Date(fromDate);
      if (toDate) createdAt.lte = new Date(toDate);
      and.push({ createdAt });
    }
    const where: Prisma.ActivityLogWhereInput = and.length ? { AND: and } : {};

    const [total, byMethodRows, byResourceRows, topRows] = await Promise.all([
      this.prisma.activityLog.count({ where }),
      this.prisma.activityLog.groupBy({
        by: ['method'],
        where,
        _count: { _all: true },
        orderBy: { _count: { method: 'desc' } },
      }),
      this.prisma.activityLog.groupBy({
        by: ['resourceType'],
        where,
        _count: { _all: true },
        orderBy: { _count: { resourceType: 'desc' } },
        take: 15,
      }),
      this.prisma.activityLog.groupBy({
        by: ['userId'],
        // `userId: { not: null }` — ustun NULLABLE. TIZIM yozuvlari
        // "eng faol foydalanuvchi" bo'la olmaydi.
        where: { AND: [...and, { userId: { not: null } }] },
        _count: { _all: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 5,
      }),
    ]);

    // MONGO'DAGI `$lookup` O'RNIGA IKKINCHI SO'ROV: `groupBy` `include`
    // qabul qilmaydi, lekin bu yerda ehtiyoj ham yo'q — qatorlar soni
    // BESHTA bilan cheklangan.
    const topIds = topRows.map((r) => r.userId).filter(Boolean) as string[];
    const users = topIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: topIds } },
          select: { id: true, firstName: true, lastName: true, role: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [String(u.id), u]));

    return {
      total,
      // Javob shakli Mongo bilan BIR XIL: `{ _id, count }` — klient
      // jadvallari shunga tayangan.
      byMethod: byMethodRows.map((r) => ({ _id: r.method, count: r._count._all })),
      byResource: byResourceRows.map((r) => ({ _id: r.resourceType, count: r._count._all })),
      topUsers: topRows.map((r) => {
        const u = userMap.get(String(r.userId));
        return {
          userId: r.userId,
          firstName: u?.firstName || '',
          lastName: u?.lastName || '',
          role: u?.role || '',
          count: r._count._all,
        };
      }),
    };
  }
}
