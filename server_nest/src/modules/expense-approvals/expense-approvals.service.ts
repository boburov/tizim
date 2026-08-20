import { Inject, Injectable, Logger } from '@nestjs/common';
// Lug'at (holat/kategoriya/tur) bazadan mustaqil konstantalarda.
import {
  APPROVAL_STATUSES,
  APPROVAL_CATEGORIES,
  APPROVAL_KINDS,
  EXPENSE_KINDS,
  resolveCategory,
} from '../../common/constants/approvals.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { withPopulatedShape } from '../../common/utils/serialize.js';
import { ApiError } from '../../common/errors/api-error.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { hasPermission } from '../../common/rbac/permission.service.js';
import { branchFilter, getActiveBranchId } from '../../common/als/branch-context.js';
import {
  DELEGATION_MODES,
  LIMIT_DIRECTIONS,
  DELEGATABLE_KINDS,
  FALLBACK_DELEGATION_MODE,
  resolveRule,
  type DelegatableKindSpec,
  type DelegationRule,
} from '../../common/constants/delegation.js';
import { SORT_OPTIONS } from './expense-approvals.validators.js';

export { APPROVAL_STATUSES, APPROVAL_CATEGORIES, APPROVAL_KINDS, EXPENSE_KINDS };

// Kategoriya -> uni tasdiqlash uchun kerak bo'lgan ruxsat.
// AJRATILGAN bo'lishi PRINSIPIAL: chiqim tasdiqlash huquqi berilgan
// direktor avtomatik ravishda maosh stavkasi belgilash huquqini
// olmasligi kerak.
const DECIDE_PERMISSION: Record<string, string> = {
  [APPROVAL_CATEGORIES.FINANCIAL]: PERMISSIONS.FINANCE_APPROVE,
  [APPROVAL_CATEGORIES.CONFIGURATION]: PERMISSIONS.APPROVALS_DECIDE_CONFIG,
};

// Kategoriya -> uni RO'YXATDA ko'rish uchun kerak bo'lgan ruxsat.
const READ_PERMISSION: Record<string, string> = {
  [APPROVAL_CATEGORIES.FINANCIAL]: PERMISSIONS.FINANCE_READ,
  [APPROVAL_CATEGORIES.CONFIGURATION]: PERMISSIONS.APPROVALS_DECIDE_CONFIG,
};

// PAYLOAD ICHIDAGI MAXFIY MAYDONLAR - o'qish javoblarida olib tashlanadi.
//
// NEGA: ishga olish so'rovi payload'ida yangi xodimning paroli turadi
// (loyihada parollar ochiq matnda saqlanadi - qarang password.helper.js).
// User modelida u `omit` bilan himoyalangan, lekin `Approval.payload`
// oddiy JSON maydon - tasdiqlar ro'yxatini ko'ra oladigan HAR KIM uni
// o'qib olardi. Bu mavjud himoyadan ORQAGA qadam bo'lardi, shuning
// uchun o'qishda kesib tashlanadi.
//
// Bajaruvchi (EXECUTORS) baza hujjatini to'g'ridan-to'g'ri oladi, shuning
// uchun bu kesish ishlashga ta'sir qilmaydi.
const SENSITIVE_PAYLOAD_FIELDS = ['password'];

const stripSensitive = <T extends Record<string, unknown>>(doc: T | null | undefined) => {
  if (!doc) return doc;
  const plain = { ...doc } as Record<string, unknown>;
  if (plain.payload && typeof plain.payload === 'object') {
    plain.payload = { ...(plain.payload as Record<string, unknown>) };
    for (const field of SENSITIVE_PAYLOAD_FIELDS) {
      delete (plain.payload as Record<string, unknown>)[field];
    }
  }
  return plain;
};

// Prisma relation nomi → klient kutadigan eski maydon nomi.
const SHAPE_MAP = { branch: 'branchId' };

const LIST_INCLUDE = {
  requestedBy: {
    select: { id: true, firstName: true, lastName: true, username: true },
  },
  decidedBy: {
    select: { id: true, firstName: true, lastName: true, username: true },
  },
  branch: { select: { id: true, name: true, code: true } },
};

// NULL TARTIBI — MONGO BILAN POSTGRES ZID.
//
// MongoDB BSON tartibida `null` sonlardan PAST turadi, ya'ni kamayuvchi
// saralashda null'lar OXIRIDA qolardi. PostgreSQL'da esa DESC ning
// standarti NULLS FIRST — aksincha.
//
// Bu MUHIM: konfiguratsiya so'rovlarida `amount = null`. E'tibor
// berilmasa "summa bo'yicha, kattadan" saralashda birinchi sahifa
// TO'LIQ null-summali sozlama so'rovlaridan iborat bo'lib, eng katta
// chiqim ikkinchi sahifaga tushib ketardi — ya'ni saralash aynan
// mo'ljallangan maqsadiga TESKARI ishlardi.
// `nulls` FAQAT nullable ustunda ishlatiladi — Prisma uni majburiy
// maydonga (createdAt) berilsa validatsiya xatosi bilan rad etadi.
const NULLABLE_SORT_FIELDS = new Set(['amount']);

const toOrderBy = (mongoSort: Record<string, number>) =>
  Object.entries(mongoSort).map(([field, dir]) => {
    const sort = dir === -1 ? 'desc' : 'asc';
    return {
      [field]: NULLABLE_SORT_FIELDS.has(field) ? { sort, nulls: 'last' } : sort,
    };
  });

interface Actor {
  id?: string | null;
  _id?: string | null;
}
const actorId = (u?: Actor | null): string | null => u?.id || u?._id || null;

export interface ListArgs {
  status?: string;
  kind?: string;
  category?: string;
  search?: string;
  sort?: string;
  dateFrom?: Date;
  dateTo?: Date;
  requestedBy?: string;
  page?: number;
  limit?: number;
  permissions?: string[];
  currentUser?: Actor | null;
}

@Injectable()
export class ExpenseApprovalsService {
  private readonly logger = new Logger('ExpenseApprovals');

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ============================================================
  // 1) LIMIT / TASDIQ TEKSHIRUVI - amal servislaridan chaqiriladi
  // ============================================================

  /**
   * Chiqim limitdan oshganmi va tasdiq kerakmi.
   *
   * OZOD bo'lganlar:
   *   - owner (["*"])
   *   - finance.approve ruxsati borlar (ular baribir o'zi tasdiqlay olardi)
   *
   * Limit qo'yilmagan bo'lsa (null) - cheksiz. Bu ATAYLAB "fail open":
   * limit ixtiyoriy imkoniyat, aks holda yangilanishdan keyin barcha
   * mavjud markazlarda to'lovlar to'satdan bloklanardi.
   */
  async checkExpenseLimit({
    branchId,
    amount,
    permissions,
  }: {
    branchId?: string | null;
    amount: number;
    permissions?: string[];
  }): Promise<{ needsApproval: boolean; threshold: number | null }> {
    // Tasdiqlash huquqi borlar limitdan ozod.
    if (hasPermission(permissions, PERMISSIONS.FINANCE_APPROVE)) {
      return { needsApproval: false, threshold: null };
    }
    if (!branchId) return { needsApproval: false, threshold: null };

    const branch = await this.prisma.branch.findUnique({
      where: { id: String(branchId) },
      select: { expenseApprovalThreshold: true },
    });
    const threshold = branch?.expenseApprovalThreshold as unknown as number | null;

    // null / 0 / manfiy => limit yo'q
    if (threshold === null || threshold === undefined || threshold <= 0) {
      return { needsApproval: false, threshold: null };
    }

    // Qat'iy KATTA: limit 10 mln bo'lsa, 10 mln o'tadi, 10 mln + 1 so'm o'tmaydi.
    return { needsApproval: Number(amount) > threshold, threshold };
  }

  /**
   * Qoida chegarasi ichidami.
   *
   * FAIL-CLOSED: o'lchov (metrics) aniqlanmagan bo'lsa yoki tegishli
   * chegara kiritilmagan bo'lsa - `false`, ya'ni tasdiqqa tushadi.
   * "Bilmasam o'tkazaman" bu yerda xavfli, chunki sozlama TAKRORLANUVCHI
   * ta'sirga ega.
   */
  private withinLimit(
    spec: DelegatableKindSpec,
    rule: DelegationRule,
    metrics?: { amount?: number | null; percent?: number | null } | null,
  ): boolean {
    const amount = metrics?.amount;
    const percent = metrics?.percent;

    const hasAmount =
      amount !== null && amount !== undefined && Number.isFinite(Number(amount));
    const hasPercent =
      percent !== null && percent !== undefined && Number.isFinite(Number(percent));

    // O'lchovsiz baholab bo'lmaydi.
    if (!hasAmount && !hasPercent) return false;

    if (hasAmount) {
      if (spec.direction === LIMIT_DIRECTIONS.FLOOR) {
        // Guruh narxi: PASTGA tushirish xavfli.
        if (rule.minAmount === null) return false;
        if (Number(amount) < rule.minAmount) return false;
      } else {
        // Chegirma / maosh: YUQORIGA ko'tarish xavfli.
        if (rule.maxAmount === null) return false;
        if (Number(amount) > rule.maxAmount) return false;
      }
    }

    if (hasPercent) {
      if (rule.maxPercent === null) return false;
      if (Number(percent) > rule.maxPercent) return false;
    }

    return true;
  }

  /**
   * KONFIGURATSIYA o'zgarishi tasdiq talab qiladimi.
   *
   * Chiqimdan farqi: bir martalik summa yo'q. Maosh stavkasi va chegirma
   * TAKRORLANUVCHI - ularni `expenseApprovalThreshold` bilan solishtirish
   * ma'nosiz (oyiga 500k so'm chegirma 2 yilda 12 mln bo'ladi, lekin
   * bironta ham "amaliyot" limitdan oshmaydi).
   *
   * @throws {ApiError} 403 - tur bu filialda umuman taqiqlangan bo'lsa
   */
  async checkConfigApproval({
    permissions,
    kind = null,
    branchId = null,
    metrics = null,
  }: {
    permissions?: string[];
    kind?: string | null;
    branchId?: string | null;
    metrics?: { amount?: number | null; percent?: number | null } | null;
  } = {}): Promise<{ needsApproval: boolean; mode: string }> {
    // Tasdiqlash huquqi borlar (owner va unga tenglashtirilganlar)
    // matritsadan TASHQARIDA. Sabab avvalgidek: ular so'rov yaratsa ham
    // o'zi tasdiqlardi, ya'ni oraliq qadam faqat ortiqcha ish bo'lardi.
    if (hasPermission(permissions, PERMISSIONS.APPROVALS_DECIDE_CONFIG)) {
      return { needsApproval: false, mode: DELEGATION_MODES.AUTO };
    }

    const spec = kind ? DELEGATABLE_KINDS[kind] : null;
    const activeBranchId = branchId || getActiveBranchId();

    // FAIL-CLOSED IKKI HOLAT:
    //   1. Tur delegatsiya qilinmaydi (matritsa unga taalluqli emas).
    //   2. Aniq filial tanlanmagan ("barcha filiallar" rejimi) - qaysi
    //      filialning qoidasini o'qishni bilmaymiz.
    // Ikkalasida ham tasdiqqa yuboriladi.
    // ⚠ `kind` ham shartga KIRITILGAN — `spec` faqat `kind` bo'lganda
    // topiladi, lekin TypeScript buni o'zi keltirib chiqara olmaydi va
    // quyidagi `resolveRule(..., kind)` da `string | null` deb qarshilik
    // qiladi. Shart mantiqan o'zgarmaydi.
    if (!kind || !spec || !activeBranchId) {
      return { needsApproval: true, mode: FALLBACK_DELEGATION_MODE };
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: String(activeBranchId) },
      select: { delegation: true },
    });
    const rule = resolveRule(branch?.delegation, kind);

    switch (rule.mode) {
      case DELEGATION_MODES.FORBIDDEN:
        // So'rov ham YARATILMAYDI. Tasdiqqa yuborish "balki o'tar" degan
        // umid qoldirardi va owner navbatini keraksiz so'rov bilan
        // to'ldirardi.
        throw new ApiError(
          403,
          `Bu filialda "${spec.label}" amali sizga taqiqlangan`,
        );

      case DELEGATION_MODES.AUTO:
        return { needsApproval: false, mode: rule.mode };

      case DELEGATION_MODES.THRESHOLD:
        return {
          needsApproval: !this.withinLimit(spec, rule, metrics),
          mode: rule.mode,
        };

      default:
        return { needsApproval: true, mode: DELEGATION_MODES.APPROVAL };
    }
  }

  // ============================================================
  // QAROR YO'LLARINING UMUMIY POYDEVORI
  // ============================================================

  /** So'rovni XOM holda o'qiydi (qaror mantig'i uchun; javob emas). */
  private async loadApproval(id: string) {
    const doc = await this.prisma.approval.findUnique({ where: { id: String(id) } });
    if (!doc) throw new ApiError(404, "So'rov topilmadi");
    return doc;
  }

  /**
   * ATOMIK HOLAT O'ZGARISHI (compare-and-set).
   *
   * ═══════════════════════════════════════════════════════════════════
   * Prisma'da `update()` shart QO'YIB bo'lmaydi - u faqat unique kalit
   * bo'yicha ishlaydi. Shuning uchun `updateMany` ishlatiladi: u bitta
   * `UPDATE ... WHERE id = ? AND status = ?` SQL'iga aylanadi va
   * `{ count }` qaytaradi. `count === 0` degani - holat allaqachon
   * o'zgargan.
   *
   * NEGA "O'QI, KEYIN YOZ" EMAS: ikki owner bir vaqtda tasdiqlashiga
   * yo'l ochardi va bajaruvchi IKKI MARTA ishga tushardi (ya'ni ikki
   * marta to'lov).
   * ═══════════════════════════════════════════════════════════════════
   */
  private async transition(
    id: string,
    {
      from,
      data,
      conflict,
    }: { from: string; data: Record<string, unknown>; conflict: string },
  ) {
    const { count } = await this.prisma.approval.updateMany({
      where: { id: String(id), status: from as never },
      data: data as never,
    });
    if (!count) throw new ApiError(409, conflict);
    return this.prisma.approval.findUnique({ where: { id: String(id) } });
  }

  /** Bajarish yiqilganda holatni FAILED qiladi (sabab bilan). */
  private async markFailed(id: string, reason: string) {
    await this.prisma.approval.update({
      where: { id: String(id) },
      data: {
        status: APPROVAL_STATUSES.FAILED as never,
        failureReason: String(reason || '').slice(0, 500),
      },
    });
  }

  /**
   * Tasdiq so'rovini yaratadi. Hech qanday holat o'zgarmaydi - so'rov
   * faqat "buyruq jurnali", haqiqiy ish tasdiqlanganda bajariladi.
   *
   * subjectKey berilgan bo'lsa, o'sha subyekt uchun ikkinchi kutilayotgan
   * so'rov YARATILMAYDI (partial unique indeks -> 409).
   */
  async createRequest({
    branchId,
    kind,
    amount = null,
    payload,
    threshold,
    subjectKey,
    subjectName,
    contextName,
    requestNote,
    currentUser,
  }: {
    branchId?: string | null;
    kind: string;
    amount?: number | null;
    payload?: Record<string, unknown>;
    threshold?: number | null;
    subjectKey?: string | null;
    subjectName?: string;
    contextName?: string;
    requestNote?: string;
    currentUser?: Actor | null;
  }) {
    // ═══════════════════════════════════════════════════════════════
    // SUMMA INVARIANTI - avval Mongoose modelida edi, ikki joyda.
    //
    // NEGA MUHIM: chiqim so'rovining butun ma'nosi LIMIT tekshiruvida.
    // Summasiz "moliyaviy" so'rov limit bilan solishtirib bo'lmaydigan
    // bo'lardi va tasdiq oqimini aylanib o'tish yo'li ochilardi.
    //
    // SERVISDA, Zod'da emas: `createRequest` ni 29 fayl chaqiradi va
    // ularning aksariyati HTTP qatlamidan o'tmaydi.
    // ═══════════════════════════════════════════════════════════════
    const category = resolveCategory(kind);
    if (amount !== null && amount !== undefined && Number(amount) < 0) {
      throw new ApiError(400, "So'rov summasi manfiy bo'lishi mumkin emas");
    }
    if (category === APPROVAL_CATEGORIES.FINANCIAL) {
      if (amount === null || amount === undefined || Number(amount) < 1) {
        throw new ApiError(400, "Chiqim so'rovida summa ko'rsatilishi shart");
      }
    }

    // So'rovchi MAJBURIY: `requestedById` NOT NULL va FK (RESTRICT).
    const requesterId = currentUser?.id || currentUser?._id;
    if (!requesterId) throw new ApiError(400, "So'rovchi aniqlanmadi");

    try {
      return await this.prisma.approval.create({
        data: {
          branchId,
          kind: kind as never,
          category: category as never,
          amount,
          payload: (payload || {}) as never,
          thresholdAtRequest: threshold ?? null,
          // `undefined` EMAS, `null`. Prisma'da `undefined` "maydonni
          // umuman yozma" degani va standart qiymat qo'llanardi; qulf
          // indeksi esa `subjectKey IS NOT NULL` shartiga tayanadi.
          subjectKey: subjectKey || null,
          subjectName: subjectName || '',
          contextName: contextName || '',
          requestedById: requesterId,
          requestNote: requestNote || '',
          status: APPROVAL_STATUSES.PENDING as never,
        } as never,
      });
    } catch (err) {
      // Qisman unique indeks (subjectKey + pending) - subyekt qulfi.
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ApiError(
          409,
          "Bu obyekt uchun tasdiq kutilayotgan so'rov allaqachon mavjud. Avval o'shani ko'rib chiqing.",
        );
      }
      throw err;
    }
  }

  // ============================================================
  // 2) O'QISH
  // ============================================================

  /**
   * Foydalanuvchi ko'ra oladigan kategoriyalar sharti.
   *
   * O'Z so'rovini har kim ko'radi (kategoriyadan qat'i nazar) - aks holda
   * direktor o'zi yuborgan so'rovning holatini kuza ololmasdi.
   */
  private categoryCondition(
    permissions: string[] | undefined,
    userId: string | null,
  ): Record<string, unknown> {
    const cats = Object.entries(READ_PERMISSION)
      .filter(([, key]) => hasPermission(permissions, key))
      .map(([category]) => category);

    if (cats.length === Object.keys(READ_PERMISSION).length) return {};
    if (cats.length === 0) return { requestedById: userId };
    return { OR: [{ category: { in: cats } }, { requestedById: userId }] };
  }

  /**
   * Ro'yxat filtrini quradi. `count` va `list` bitta manbadan qurilishi
   * uchun alohida chiqarildi - aks holda ikkalasi vaqt o'tib
   * bir-biridan uzoqlashardi.
   */
  private buildListFilter({
    status,
    kind,
    category,
    search,
    dateFrom,
    dateTo,
    requestedBy,
    permissions,
    currentUser,
  }: ListArgs): Record<string, unknown> {
    const filter: Record<string, unknown> = {
      ...branchFilter(),
      ...this.categoryCondition(permissions, actorId(currentUser)),
    };
    if (status) filter.status = status;
    if (kind) filter.kind = kind;
    if (category) filter.category = category;
    if (requestedBy) filter.requestedById = requestedBy;

    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {};
      if (dateFrom) createdAt.gte = dateFrom;
      // `dateTo` KUN OXIRIGACHA: foydalanuvchi "31-dekabrgacha" deganda
      // o'sha kunning o'zi ham kirishini kutadi, 00:00 ni emas.
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        createdAt.lte = end;
      }
      filter.createdAt = createdAt;
    }

    if (search) {
      // Mongo RegExp o'rniga Prisma `contains` + `insensitive`.
      // Qo'shimcha yutuq: foydalanuvchi matnini regexp'dan qochirish
      // endi umuman kerak emas - SQL parametri sifatida uzatiladi,
      // ya'ni "(" kabi belgi so'rovni yiqita olmaydi.
      const q = { contains: search, mode: 'insensitive' };
      const searchOr = [
        { subjectName: q },
        { contextName: q },
        { requestNote: q },
      ];
      // DIQQAT: categoryCondition ham OR ishlatishi mumkin. Ikkinchi OR
      // uni jimgina yozib yuborardi va foydalanuvchi ko'rmasligi kerak
      // bo'lgan kategoriyani ham qidiruv orqali ochib berardi. Shuning
      // uchun AND.
      if (filter.OR) {
        filter.AND = [{ OR: filter.OR }, { OR: searchOr }];
        delete filter.OR;
      } else {
        filter.OR = searchOr;
      }
    }

    return filter;
  }

  async list(args: ListArgs) {
    const { sort = '-createdAt', page = 1, limit = 20 } = args;
    const filter = this.buildListFilter(args);

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.approval.findMany({
        where: filter as never,
        orderBy: toOrderBy(SORT_OPTIONS[sort] || SORT_OPTIONS['-createdAt']) as never,
        skip,
        take: limit,
        include: LIST_INCLUDE,
      }),
      this.prisma.approval.count({ where: filter as never }),
    ]);
    // Klient `branchId` ni OBYEKT sifatida kutadi (eski populate shakli).
    return {
      items: items.map((i) =>
        stripSensitive(
          withPopulatedShape(i as unknown as Record<string, unknown>, SHAPE_MAP) as Record<
            string,
            unknown
          >,
        ),
      ),
      total,
      page,
      limit,
    };
  }

  /**
   * KPI kartalari uchun yig'ma.
   *
   * `pendingAmount` FAQAT `financial` so'rovlarni qo'shadi: konfiguratsiya
   * so'rovlarida `amount` null va ular "kutilayotgan chiqim" summasiga
   * qo'shilsa hisobot yolg'on ko'rsatardi.
   */
  async stats({
    permissions,
    currentUser,
  }: { permissions?: string[]; currentUser?: Actor | null }) {
    const base = this.buildListFilter({ permissions, currentUser });

    // Prisma'da shartli yig'indi yo'q, shuning uchun uch mustaqil so'rov -
    // ular PARALLEL ketadi va har biri indeksdan foydalanadi, ya'ni bitta
    // to'liq skanerdan qimmat emas.
    const [pending, failed, amountAgg] = await Promise.all([
      this.prisma.approval.count({
        where: { ...base, status: APPROVAL_STATUSES.PENDING } as never,
      }),
      this.prisma.approval.count({
        where: { ...base, status: APPROVAL_STATUSES.FAILED } as never,
      }),
      this.prisma.approval.aggregate({
        where: {
          ...base,
          status: APPROVAL_STATUSES.PENDING,
          category: APPROVAL_CATEGORIES.FINANCIAL,
        } as never,
        _sum: { amount: true },
      }),
    ]);

    return {
      pending,
      pendingAmount: (amountAgg._sum.amount as unknown as number) || 0,
      failed,
    };
  }

  async getById(
    id: string,
    { permissions, currentUser }: { permissions?: string[]; currentUser?: Actor | null } = {},
  ) {
    const doc = await this.prisma.approval.findUnique({
      where: { id },
      include: LIST_INCLUDE,
    });
    if (!doc) throw new ApiError(404, "So'rov topilmadi");

    // Kategoriya ko'lami: moliya so'rovini faqat moliyani ko'ra
    // oladigan, sozlama so'rovini faqat sozlamani tasdiqlay oladigan
    // (yoki so'rovchining o'zi) ko'radi.
    const canRead = hasPermission(permissions, READ_PERMISSION[doc.category]);
    const isOwnRequest =
      String(doc.requestedBy?.id || doc.requestedById) === String(actorId(currentUser));
    if (!canRead && !isOwnRequest) throw new ApiError(403, 'Ruxsat etilmagan');

    return stripSensitive(
      withPopulatedShape(doc as unknown as Record<string, unknown>, SHAPE_MAP) as Record<
        string,
        unknown
      >,
    );
  }

  /** Kutilayotgan so'rovlar soni - sidebar belgisi uchun. */
  pendingCount({
    permissions,
    currentUser,
  }: { permissions?: string[]; currentUser?: Actor | null } = {}) {
    return this.prisma.approval.count({
      where: {
        ...branchFilter(),
        ...this.categoryCondition(permissions, actorId(currentUser)),
        status: APPROVAL_STATUSES.PENDING,
      } as never,
    });
  }

  // ============================================================
  // 3) QAROR: rad etish / bekor qilish
  // ============================================================

  /**
   * Shu KATEGORIYA uchun qaror qabul qilish huquqi bormi.
   *
   * Route qatlamidagi `@Permissions(...)` faqat "eshikni" ochadi (ikki
   * kategoriyadan biri). Haqiqiy tekshiruv shu yerda - aks holda faqat
   * finance.approve bor direktor sozlama so'rovini tasdiqlay olardi.
   */
  private assertCanDecide(approval: { category: string }, permissions?: string[]) {
    const needed = DECIDE_PERMISSION[approval.category];
    if (!needed || !hasPermission(permissions, needed)) {
      throw new ApiError(403, "Bu turdagi so'rovni tasdiqlash huquqingiz yo'q");
    }
  }

  async reject(
    id: string,
    { note }: { note?: string } = {},
    currentUser?: Actor | null,
    permissions?: string[],
  ) {
    const existing = await this.loadApproval(id);
    this.assertCanDecide(existing, permissions);

    return this.transition(id, {
      from: APPROVAL_STATUSES.PENDING,
      data: {
        status: APPROVAL_STATUSES.REJECTED,
        decidedById: actorId(currentUser),
        decidedAt: new Date(),
        decisionNote: note || '',
      },
      conflict: "So'rov allaqachon ko'rib chiqilgan",
    });
  }

  /** So'rovchi o'z so'rovini bekor qiladi. */
  async cancel(id: string, currentUser?: Actor | null) {
    const existing = await this.loadApproval(id);
    if (String(existing.requestedById) !== String(actorId(currentUser))) {
      throw new ApiError(403, "Faqat o'z so'rovingizni bekor qila olasiz");
    }
    return this.transition(id, {
      from: APPROVAL_STATUSES.PENDING,
      data: {
        status: APPROVAL_STATUSES.CANCELED,
        decidedById: actorId(currentUser),
        decidedAt: new Date(),
      },
      conflict: "So'rov allaqachon ko'rib chiqilgan",
    });
  }

  /**
   * FAILED so'rovni qayta urinish (masalan balans to'ldirilgandan keyin).
   * PENDING'ga qaytaradi, owner qaytadan tasdiqlaydi.
   */
  async retry(id: string, permissions?: string[]) {
    const existing = await this.loadApproval(id);
    this.assertCanDecide(existing, permissions);

    try {
      return await this.transition(id, {
        from: APPROVAL_STATUSES.FAILED,
        data: {
          status: APPROVAL_STATUSES.PENDING,
          decidedById: null,
          decidedAt: null,
          failureReason: '',
        },
        conflict: "Faqat xato holatidagi so'rovni qayta urinish mumkin",
      });
    } catch (err) {
      // Xato holatda turgan paytda o'sha subyektga YANGI so'rov
      // yaratilgan bo'lsa, PENDING'ga qaytarish subyekt qulfini buzadi.
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ApiError(
          409,
          "Bu obyekt uchun boshqa kutilayotgan so'rov bor. Avval o'shani ko'rib chiqing.",
        );
      }
      throw err;
    }
  }

  // ============================================================
  // 4) TASDIQLASH VA BAJARISH — HALI KO'CHIRILMAGAN
  // ============================================================

  /**
   * ═══════════════════════════════════════════════════════════════════
   * ⚠ `approve` VA `bulk-*` NestJS'DA HALI YO'Q — ATAYLAB.
   *
   * Tasdiqlash so'rovni bajaradi, bajaruvchilar esa O'N modulda:
   * teacherSalary, deposits, groups, finance/discount, finance/groupFee,
   * users, expenses, staffPayroll. Ulardan faqat `users` ko'chirilgan.
   *
   * NEGA YARIM BAJARUVCHI BILAN OCHILMAYDI: tasdiqlash ATOMIK zanjir —
   * holat PENDING → APPROVED ga o'tadi, keyin bajaruvchi ishlaydi.
   * Bajaruvchi topilmasa so'rov `failed` bo'lib qoladi, ya'ni NestJS
   * orqali bosilgan "Tasdiqlash" tugmasi so'rovni BUZIB qo'yardi va
   * owner uni qo'lda tuzatishi kerak bo'lardi.
   *
   * Shuning uchun bu ikki marshrut 501 qaytaradi
   * (`APPROVAL_EXECUTORS_NOT_MIGRATED`) va `expense-approvals-parity`
   * testi farqni KUZATIB turadi: bajaruvchilar ko'chgan kuni test
   * YIQILADI va e'tibor tortadi.
   *
   * Trafik hamon Express'da (5000-port), ya'ni foydalanuvchi uchun
   * hech narsa o'zgarmaydi.
   * ═══════════════════════════════════════════════════════════════════
   */
  static readonly NOT_MIGRATED_CODE = 'APPROVAL_EXECUTORS_NOT_MIGRATED';
}
