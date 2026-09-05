import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { describeLog } from './audit-actions.js';
import { branchFilter } from '../../common/als/branch-context.js';
import { ROLES } from '../../common/constants/permissions.js';
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

/**
 * Aktyorsiz yozuvlarning roli (`req.user` yo'q — cron, webhook,
 * muvaffaqiyatsiz login). Middleware AYNAN shu satrni yozadi
 * (`audit-log.middleware.ts`), shuning uchun u YOZUVCHI bilan bitta
 * qiymatda bo'lishi shart.
 */
const SYSTEM_ACTOR_ROLE = 'system';

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
  branchId?: string;
  method?: string;
  action?: string;
  resourceType?: string;
  fromDate?: Date | string;
  toDate?: Date | string;
  /** Faqat qaytarib bo'lmaydigan/qimmat amallar. */
  dangerousOnly?: boolean;
  page?: number;
  limit?: number;
}

export interface FinancialListFilters {
  branchId?: string;
  actorId?: string;
  entityType?: string;
  action?: string;
  fromDate?: Date | string;
  toDate?: Date | string;
  page?: number;
  limit?: number;
}

export interface PayrollListFilters {
  employeeId?: string;
  actorId?: string;
  action?: string;
  fromDate?: Date | string;
  toDate?: Date | string;
  page?: number;
  limit?: number;
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * "XAVFLI AMALLAR" — SUPER ADMIN PANELIDAGI STANDART FILTR
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Tashkilot ko'lamidagi oqim juda shovqinli: kunlik davomat, baho va
 * bildirishnoma yozuvlari ming qatorni to'ldiradi va ega orasidan
 * "kim rolni o'zgartirdi" ni topa olmaydi.
 *
 * Ro'yxat ATAYLAB qisqa va ikkita savolga javob beradi: nimani ORQAGA
 * QAYTARIB BO'LMAYDI (o'chirish) va nima IMTIYOZ yoki PULGA tegadi.
 */
const DANGEROUS_QUERY: Prisma.ActivityLogWhereInput = {
  OR: [
    // O'chirish — har qanday resursda qaytarib bo'lmaydi.
    { method: 'DELETE' },
    // Imtiyoz: rol, ruxsat, foydalanuvchi, filial.
    { resourceType: { in: ['roles', 'users', 'branches', 'permissions'] } },
    // Pul: to'lov, chiqim, oylik, qaytarish, kassa.
    {
      resourceType: {
        in: [
          'payments',
          'student-payments',
          'expenses',
          'salaries',
          'payroll',
          'refunds',
          'cash-transfers',
          'accounts',
        ],
      },
    },
  ],
};

@Injectable()
export class ActivityLogsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BranchAccessService) private readonly branchAccess: BranchAccessService,
  ) {}

  /**
   * ═════════════════════════════════════════════════════════════════════
   * KO'LAM — YAGONA MANBA. `list`, `getById` VA `getStats` SHUNI CHAQIRADI.
   * ═════════════════════════════════════════════════════════════════════
   *
   * Ilgari ko'lam uch joyda ALOHIDA yozilgan edi va aynan shu tufayli
   * `getById` bir muddat UMUMAN ko'lamsiz qolib IDOR bergan (pastdagi
   * izohga qarang). Endi qoida BITTA joyda.
   *
   * ── IKKI QATLAM ──
   *
   * 1) FILIAL. Hodisaning O'Z filiali (`branchId`) hal qiladi; u
   *    `null` bo'lsa AKTYORNING filiali bo'yicha hal qilinadi.
   *
   *    Nega faqat `branchId` yetarli emas: login/logout va markaz
   *    amallarida filial konteksti yo'q, ustun qo'shilgunga qadar
   *    yozilgan MILLIONLAB eski qatorda ham `null`. Qat'iy
   *    `branchId IN (...)` ular hammasini yashirardi — ya'ni
   *    administrator "kim tizimga kirdi" ni butunlay ko'rmasdi.
   *
   *    Nega faqat aktyor ham yetarli emas: markazdan kelgan odam shu
   *    filialda o'zgarish qilsa, u aktyor sifatida BOSHQA filialda
   *    turadi va yozuv filial administratoridan yashirinardi.
   *
   *    ⚠ BU BIRLASHMA EMAS. `branchId` MA'LUM bo'lsa u YAKUNIY:
   *    A filial xodimi B filialida qilgan ish faqat B ga ko'rinadi,
   *    A ga emas. Aktyor filiali faqat `branchId IS NULL` da ishlaydi.
   *
   * 2) ROL IYERARXIYASI. Ko'lami cheklangan o'quvchi (filial
   *    administratori) EGA va TIZIM yozuvlarini ko'rmaydi.
   *
   *    Sabab: audit jurnalining vazifasi — quyi darajani nazorat
   *    qilish. Administrator o'z filialidagi xodimni tekshiradi;
   *    ega esa administratorni tekshiradi. Agar administrator
   *    eganing harakatini ko'rsa, "kuzatuvchini kuzatish" himoyasi
   *    yo'qoladi: u qachon tekshirilayotganini bilib qoladi.
   *
   *    ⚠ Bu YANGI QATLAM — ilgari uning o'rnini `userId in (...)`
   *    filtri BILVOSITA bajarardi (ega boshqa filialda bo'lgani
   *    uchun ro'yxatga tushmasdi). Endi filial `branchId` orqali
   *    ham ochilgani uchun u OSHKORA yozilishi SHART, aks holda
   *    yuqoridagi 1-qatlam eganing filialdagi ishini ko'rsatib
   *    qo'yardi.
   *
   * ⚠ Kontekstsiz chaqiruv (job/seed) — cheklovsiz. `branchFilter()`
   * ham, `branchUserFilter()` ham bo'sh qaytaradi, ya'ni bu holat
   * o'z-o'zidan hal bo'ladi va alohida shox kerak emas.
   */
  private async scopeClause(): Promise<Prisma.ActivityLogWhereInput[]> {
    // Hodisa filiali bo'yicha bo'lak: `{}` = cheklov yo'q (ega yoki
    // kontekstsiz), aks holda `{ branchId: ... }`.
    const eventScope = branchFilter('branchId') as Prisma.ActivityLogWhereInput;
    // Aktyor filiali bo'yicha bo'lak: `{}` = cheklov yo'q.
    // MAYDON NOMI `user` EMAS, `userId`: Prisma'da `user` bu RELATION.
    const actorScope = (await this.branchAccess.branchUserFilter(
      'userId',
    )) as Prisma.ActivityLogWhereInput;

    const scoped =
      Object.keys(eventScope).length > 0 || Object.keys(actorScope).length > 0;
    if (!scoped) return [];

    return [
      {
        OR: [
          eventScope,
          // `branchId` noma'lum — aktyor filiali hal qiladi.
          // ⚠ `actorScope` bo'sh bo'lsa bu shox "hamma filialsiz
          // yozuv" degani bo'lardi; lekin u bo'sh bo'lganda
          // `eventScope` ham bo'sh va yuqorida ERTA qaytganmiz.
          { AND: [{ branchId: null }, actorScope] },
        ],
      },
      // Ega va tizim yozuvlari — faqat butun tarmoqni ko'ra oladiganga.
      { userRole: { notIn: [ROLES.OWNER, SYSTEM_ACTOR_ROLE] } },
    ];
  }

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
    branchId,
    method,
    action,
    resourceType,
    fromDate,
    toDate,
    dangerousOnly,
  }: ListFilters): Promise<Prisma.ActivityLogWhereInput> {
    const and: Prisma.ActivityLogWhereInput[] = [];

    and.push(...(await this.scopeClause()));

    // Shovqin (refresh) — doim chiqarib tashlanadi.
    and.push({ path: { notIn: NOISE_PATHS } });

    if (userId) and.push({ userId: String(userId) });

    // FILIAL FILTRI — super admin panelidagi tanlagich.
    //
    // ⚠ Bu ko'lamni KENGAYTIRMAYDI, faqat toraytiradi: `scopeClause()`
    // allaqachon `AND` da turibdi, ya'ni ruxsat etilmagan filial
    // so'ralsa natija bo'sh chiqadi, begona yozuv EMAS.
    if (branchId) and.push({ branchId: String(branchId) });

    if (dangerousOnly) and.push(DANGEROUS_QUERY);
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
   * XAVFSIZLIK TUZATISHI — FILIAL KO'LAMI QO'SHILDI (ikkala stekda
   * BIR VAQTDA: `server/src/modules/activityLogs/services/`).
   *
   * Ilgari `getById` da HECH QANDAY `branchUserFilter` yo'q edi:
   * `activity_logs.read` ruxsati bor har kim ISTALGAN logni id bo'yicha
   * o'qiy olardi, `list` va `getStats` esa CHEKLANGAN edi.
   *
   * O'LCHANDI (taxmin emas): ko'lamlangan aktyor uchun
   *   • `GET /activity-logs?userId=<begona>` → 0 ta qator;
   *   • `GET /activity-logs/<o'sha logning id'si>` → 200.
   * Ya'ni ro'yxat YASHIRGAN yozuv id bilan o'qib olinardi — IDOR.
   *
   * ⚠ 404, 403 EMAS: 403 yozuv MAVJUDLIGINI tasdiqlab, id bo'yicha
   * sanab chiqishga yo'l ochardi. Mavjud bo'lmagan id ham AYNI 404.
   */
  async getById(id: string) {
    const doc = await this.prisma.activityLog.findFirst({
      where: { AND: [{ id: String(id) }, ...(await this.scopeClause())] },
      include: { user: { select: USER_SELECT } },
    });
    if (!doc) throw new ApiError(404, 'Log topilmadi');
    return this.enrich(doc as never);
  }

  /**
   * ═════════════════════════════════════════════════════════════════════
   * MOLIYAVIY AUDIT IZI — "MOLIYA" TAB'I
   * ═════════════════════════════════════════════════════════════════════
   *
   * `ActivityLog` BILAN BIRLASHTIRILMADI (union emas, alohida tab).
   *
   * Sabab: ikki jadval BOSHQA savolga javob beradi va shakli mos
   * kelmaydi. `ActivityLog` — HTTP izi (`method`, `path`, `status`);
   * `FinancialAuditLog` — QIYMAT o'zgarishi (`oldValue`/`newValue`,
   * `amountBefore`/`amountAfter`, `changedFields`). Ularni bitta
   * jadvalga siqish uchun har ikkalasidan ham eng qimmatli ustunlarni
   * tashlab yuborish kerak bo'lardi: natijada "500 000 so'm 300 000 ga
   * o'zgardi" o'rniga "PATCH /payments/x → 200" ko'rinardi.
   *
   * ⚠ KO'LAM BOSHQA YO'L BILAN: bu modelda `branchId` BOR va u
   * to'g'ridan-to'g'ri `branchFilter()` bilan kesiladi.
   */
  async listFinancial({
    branchId,
    actorId,
    entityType,
    action,
    fromDate,
    toDate,
    page = 1,
    limit = 20,
  }: FinancialListFilters) {
    const and: Prisma.FinancialAuditLogWhereInput[] = [];

    const scope = branchFilter('branchId') as Prisma.FinancialAuditLogWhereInput;
    const isScoped = Object.keys(scope).length > 0;
    if (isScoped) {
      and.push(scope);
      // ROL IYERARXIYASI — `scopeClause()` dagi bilan AYNI qoida, faqat
      // bu modelda `userRole` ustuni yo'q, shuning uchun aktyor
      // RELATSIYASI bo'yicha tekshiriladi.
      //
      // ⚠ `actorId: null` (tizim amali) ham yashiriladi: fail-closed,
      // `ActivityLog` dagi bilan bir xil.
      and.push({ actorId: { not: null } });
      and.push({ NOT: { actor: { is: { role: ROLES.OWNER } } } });
    }

    if (branchId) and.push({ branchId: String(branchId) });
    if (actorId) and.push({ actorId: String(actorId) });
    if (entityType) and.push({ entityType });
    if (action) and.push({ action: action as never });
    if (fromDate || toDate) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (fromDate) createdAt.gte = new Date(fromDate);
      if (toDate) createdAt.lte = new Date(toDate);
      and.push({ createdAt });
    }

    const where: Prisma.FinancialAuditLogWhereInput = { AND: and };
    const [items, total] = await Promise.all([
      this.prisma.financialAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { actor: { select: USER_SELECT } },
      }),
      this.prisma.financialAuditLog.count({ where }),
    ]);

    return { items: items.map((d) => withLegacyId(d as never)), total, page, limit };
  }

  /**
   * ═════════════════════════════════════════════════════════════════════
   * OYLIK AUDIT IZI — "OYLIK" TAB'I
   * ═════════════════════════════════════════════════════════════════════
   *
   * ⚠ KO'LAM UCHINCHI YO'L BILAN: bu modelda `branchId` YO'Q va u
   * XODIM orqali bog'lanadi (`employeeId`) — reyestrda `VIA_USER`.
   * Shuning uchun `branchUserFilter('employeeId')`, `branchFilter()`
   * EMAS: oxirgisi mavjud bo'lmagan ustunni so'rab, Prisma xatosi
   * berardi.
   *
   * ⚠ FILTR XODIM bo'yicha, AKTYOR bo'yicha emas: "kimning oyligi
   * o'zgardi" — filialga tegishlilikni belgilaydigan savol. Aktyor
   * markazdan bo'lishi mumkin va u holda ham yozuv xodim filialiga
   * tegishli bo'lib qolaveradi.
   */
  async listPayroll({
    employeeId,
    actorId,
    action,
    fromDate,
    toDate,
    page = 1,
    limit = 20,
  }: PayrollListFilters) {
    const and: Prisma.PayrollAuditLogWhereInput[] = [];

    const scope = (await this.branchAccess.branchUserFilter(
      'employeeId',
    )) as Prisma.PayrollAuditLogWhereInput;
    if (Object.keys(scope).length) {
      and.push(scope);
      and.push({ actorId: { not: null } });
      and.push({ NOT: { actor: { is: { role: ROLES.OWNER } } } });
    }

    if (employeeId) and.push({ employeeId: String(employeeId) });
    if (actorId) and.push({ actorId: String(actorId) });
    if (action) and.push({ action });
    if (fromDate || toDate) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (fromDate) createdAt.gte = new Date(fromDate);
      if (toDate) createdAt.lte = new Date(toDate);
      and.push({ createdAt });
    }

    const where: Prisma.PayrollAuditLogWhereInput = { AND: and };
    const [items, total] = await Promise.all([
      this.prisma.payrollAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actor: { select: USER_SELECT },
          employee: { select: USER_SELECT },
        },
      }),
      this.prisma.payrollAuditLog.count({ where }),
    ]);

    return { items: items.map((d) => withLegacyId(d as never)), total, page, limit };
  }

  async getStats({ fromDate, toDate }: { fromDate?: Date | string; toDate?: Date | string } = {}) {
    // Ro'yxat bilan AYNI ko'lam — shovqin filtridan TASHQARI (statistika
    // xom hisob; Express'da ham aynan shunday).
    const and: Prisma.ActivityLogWhereInput[] = [...(await this.scopeClause())];
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
