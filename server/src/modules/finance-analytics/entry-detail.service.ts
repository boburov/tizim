import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { hasAnyPermission } from '../../common/rbac/permission.service.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { branchFilter } from '../../common/als/branch-context.js';
import { parseRange, journalWhere, type AnalyticsFilter } from './analytics-filter.js';
import { n } from './metrics.js';
import { TREASURY_KINDS } from '../../common/constants/ledger.js';

/**
 * ══════════════════════════════════════════════════════════════════════
 * TRANZAKSIYA TAFSILOTI — "bu raqam nimadan iborat?"
 * (`services/entryDetail.service.js` EKVIVALENTI)
 * ══════════════════════════════════════════════════════════════════════
 *
 * MANBA — MAVJUD JURNAL. Yangi jadval YO'Q.
 *
 * Tahlil sahifasidagi har qanday summani oxirigacha kuzatish uchun
 * kerak: daromad → yo'nalish → guruh → o'quvchi → to'lov → JURNAL
 * YOZUVI. Shu zanjirning oxirgi bo'g'ini shu yerda.
 *
 * ── FAQAT MAVJUD ALOQALAR QAYTARILADI ──
 * `dimensions` obyektiga NULL o'lchovlar UMUMAN kirmaydi. Ijara
 * chiqimida `student: null` qaytarilsa, UI "O'quvchi: —" degan bo'sh
 * qator chizardi va ekran ma'nosiz yorliqlar bilan to'lardi. Yo'q
 * narsa — yo'q.
 */

const fullName = (u: any): string | null =>
  u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || '' : null;

const ref = (
  id: string | null | undefined,
  name: string | null | undefined,
  extra: Record<string, unknown> = {},
) => (id ? { id, name: name || '', ...extra } : null);

/** Yozuv turi → o'zbekcha nom (UI da bir xil atama ishlatilsin). */
export const ENTRY_KIND_LABELS: Readonly<Record<string, string>> = Object.freeze({
  payment: "O'quvchi to'lovi",
  deposit_in: "Depozitga to'ldirish",
  deposit_out: 'Depozitdan qaytarish',
  deposit_apply: 'Depozitdan qoplash',
  expense: 'Chiqim',
  salary: "Maosh to'lovi",
  refund: 'Qaytarim',
  payment_fee: "To'lov komissiyasi",
  owner_investment: 'Egasi kiritdi',
  owner_withdrawal: 'Egasi yechdi',
  account_transfer: "Hisoblar orasida o'tkazma",
  transfer_send: "Inkassatsiya (jo'natildi)",
  transfer_receive: 'Inkassatsiya (qabul qilindi)',
  inter_branch: 'Filiallararo',
  shift_close: 'Smena yopilishi',
  opening: "Boshlang'ich qoldiq",
  adjustment: 'Tuzatish',
});

/** Hisob turi → o'zbekcha nom. */
export const ACCOUNT_KIND_LABELS: Readonly<Record<string, string>> = Object.freeze({
  cash: 'Naqd',
  terminal: 'Terminal',
  click: 'Click',
  payme: 'Payme',
  uzcard: 'Uzcard',
  humo: 'Humo',
  bank: 'Bank',
  other: 'Boshqa',
  transit: "Yo'ldagi pul",
  due_from: 'Filialdan talab',
  due_to: 'Filialga majburiyat',
  deposit: "O'quvchi depoziti",
  equity: 'Kapital',
  revenue: 'Daromad',
  expense: 'Xarajat',
  shortage: 'Kamomad',
  owner_capital: 'Egasi kapitali',
  payment_fee: "To'lov komissiyasi",
});

/**
 * MAOSH MA'LUMOTI SEZGIR.
 *
 * ── NEGA YON ESHIK YOPILADI ──
 * `/finance-analytics/teachers` allaqachon `salary.read` yoki
 * `payroll.read` talab qiladi. Agar tranzaksiya tafsiloti faqat
 * `finance.read` bilan ochilsa, xodim o'sha jadvalni ko'ra olmasa
 * ham, HAR BIR maosh yozuvini bittalab ochib, aynan o'sha
 * ma'lumotni yig'ib olardi.
 *
 * Shuning uchun maosh yozuvi (`kind = "salary"`) uchun O'SHA IKKI
 * ruxsatdan biri SHART. Bu — ta'rifi bo'yicha ochiq chegara: qisman
 * yashirish (summani berkitib, o'qituvchi ismini qoldirish kabi)
 * qaysi bo'lak "yetarlicha xavfsiz" ekani haqida bahsga aylanardi.
 *
 * ⚠ SHU MODULDA YAGONA JOY: boshqa servislar ruxsat tekshirmaydi
 * (bu kontroller ishi). Bu yerda tekshiriladi, chunki chegara
 * MA'LUMOT ICHIDA — marshrut bitta, lekin yozuv turiga qarab javob
 * ochiq yoki yopiq bo'ladi.
 */
const PAYROLL_KINDS = new Set(['salary']);

@Injectable()
export class EntryDetailService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getEntryDetail(id: string, _currentUser: unknown, permissions: string[] = []) {
    // FILIAL KO'LAMI: begona filial yozuvi umuman ochilmaydi.
    return this.buildDetail({ id: String(id), ...branchFilter() }, permissions);
  }

  /**
   * ══════════════════════════════════════════════════════════════════
   * KVITANSIYA UCHUN: YOZUVNI `postingKey` BO'YICHA OCHISH
   * ══════════════════════════════════════════════════════════════════
   *
   * ── NEGA ID YETARLI EMAS ──
   * Chek to'lov QILINGAN PAYTDA kerak. O'sha payt qo'lda bor narsa —
   * manba hujjat ID si (`PaymentTransaction.id`), jurnal yozuvining ID
   * si EMAS: yozuv `postCore()` ichida, boshqa tranzaksiyada tug'iladi
   * va uning ID si mijozga umuman qaytarilmaydi.
   *
   * ── NEGA YANGI MAYDON EMAS ──
   * `postingKey` ALLAQACHON mavjud, UNIQUE va MA'NOLI:
   *   `payment:<paymentTransactionId>` · `expense:<expenseId>`
   *   `salary_teacher:<salaryTransactionId>` · `refund:<refundId>`
   * Ya'ni mijoz kalitni O'ZI qura oladi va qidiruv unique indeksga
   * tushadi. Muqobil yo'l — har bir yozish endpointiga jurnal ID sini
   * qaytartirish — o'nlab javob shaklini o'zgartirardi.
   *
   * ── XAVFSIZLIK O'ZGARMAYDI ──
   * Bir xil `buildDetail()`: o'sha filial ko'lami, o'sha maosh
   * tekshiruvi. Kalit taxmin qilinsa ham begona filial yozuvi
   * ochilmaydi — 404 qaytadi.
   */
  async getEntryDetailByPostingKey(
    postingKey: string,
    _currentUser: unknown,
    permissions: string[] = [],
  ) {
    const key = String(postingKey);
    return this.buildDetail(
      {
        // ── REVIZIYA: `expense:<id>` → `expense:<id>:v2` ──
        // Chiqim tahrirlanganda eski yozuv storno qilinadi va yangisi
        // `:v2` qo'shimchasi bilan yoziladi (`financial-transaction
        // .service.ts` dagi `revision` izohiga qarang). Mijoz esa
        // hamon MANBA kalitini (`expense:<id>`) biladi, chunki
        // reviziya raqami unga umuman ko'rinmaydi.
        //
        // Prefiks mos kelishi XAVFSIZ: manba ID lari qat'iy 24 hex,
        // ya'ni `expense:<id>` dan keyin FAQAT `:v<N>` kelishi
        // mumkin — boshqa hujjatning kaliti bu shablonga tushmaydi.
        OR: [{ postingKey: key }, { postingKey: { startsWith: `${key}:v` } }],
        ...branchFilter(),
      },
      permissions,
      // Eng OXIRGI reviziya — amaldagi hujjat. Storno qilingan eski
      // yozuvdan chek berish mijozga bekor qilingan summani ko'rsatardi.
      { createdAt: 'desc' },
    );
  }

  private async buildDetail(
    where: Record<string, unknown>,
    permissions: string[],
    orderBy?: Record<string, 'asc' | 'desc'>,
  ) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: where as never,
      ...(orderBy ? { orderBy: orderBy as never } : {}),
      include: {
        lines: { orderBy: [{ debit: 'desc' }] },
        branch: { select: { id: true, name: true } },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, username: true },
        },
        student: { select: { id: true, firstName: true, lastName: true, username: true } },
        teacher: { select: { id: true, firstName: true, lastName: true, username: true } },
        staff: { select: { id: true, firstName: true, lastName: true, username: true } },
        group: { select: { id: true, name: true } },
        course: { select: { id: true, title: true } },
        room: { select: { id: true, name: true } },
        expenseCategory: { select: { id: true, name: true, kind: true } },
        membership: { select: { id: true, joinedAt: true, leftAt: true } },
      },
    });

    if (!entry) throw new ApiError(404, 'Moliyaviy yozuv topilmadi');

    const e = entry as never as Record<string, any>;

    if (PAYROLL_KINDS.has(e.kind)) {
      const allowed = hasAnyPermission(permissions, [
        PERMISSIONS.SALARY_READ,
        PERMISSIONS.PAYROLL_READ,
      ]);
      if (!allowed) {
        throw new ApiError(403, "Maosh ma'lumotini ko'rish uchun ruxsat yo'q");
      }
    }

    // ── O'LCHOVLAR: faqat MAVJUDLARI ──
    const dimensions: Record<string, unknown> = {};
    const put = (k: string, v: unknown) => {
      if (v) dimensions[k] = v;
    };
    put('student', ref(e.studentId, fullName(e.student)));
    put('teacher', ref(e.teacherId, fullName(e.teacher)));
    put('staff', ref(e.staffId, fullName(e.staff)));
    put('group', ref(e.groupId, e.group?.name));
    put('course', ref(e.courseId, e.course?.title));
    put('room', ref(e.roomId, e.room?.name));
    put('membership', ref(e.membershipId, ''));
    put(
      'expenseCategory',
      ref(e.expenseCategoryId, e.expenseCategory?.name, {
        kind: e.expenseCategory?.kind || null,
      }),
    );
    if (e.paymentMethod) dimensions.paymentMethod = e.paymentMethod;
    if (e.costType) dimensions.costType = e.costType;
    if (e.periodYear && e.periodMonth) {
      dimensions.period = { year: e.periodYear, month: e.periodMonth };
    }

    // ── QATORLAR: debet va kredit ALOHIDA ──
    // UI da ular ikki ustunda ko'rsatiladi, shuning uchun bu yerda
    // ajratiladi — frontend qayta saralamasin.
    const debits: Array<Record<string, unknown>> = [];
    const credits: Array<Record<string, unknown>> = [];
    for (const l of e.lines) {
      const row = {
        accountId: l.accountId,
        accountKind: l.accountKind,
        accountLabel: ACCOUNT_KIND_LABELS[l.accountKind] || l.accountKind,
        debit: n(l.debit),
        credit: n(l.credit),
      };
      if (row.debit > 0) debits.push(row);
      else credits.push(row);
    }

    // ── AUDIT ──
    const logs = await this.prisma.financialAuditLog.findMany({
      where: {
        OR: [
          { entityId: e.refId || '___none___' },
          ...(e.postingKey
            ? [{ entityId: String(e.postingKey).split(':')[1] || '___none___' }]
            : []),
        ],
      } as never,
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        entityType: true,
        action: true,
        actorLabel: true,
        actorId: true,
        amountBefore: true,
        amountAfter: true,
        reason: true,
        changedFields: true,
        createdAt: true,
      },
    });

    // ── MANBA HUJJAT ──
    const source = await this.resolveSource(e);

    return {
      id: e.id,
      postingKey: e.postingKey,
      kind: e.kind,
      kindLabel: ENTRY_KIND_LABELS[e.kind] || e.kind,
      date: e.date,
      memo: e.memo || '',
      // Yozuv summasi = jami debet (muvozanat tufayli kreditga teng).
      amount: n(e.totalDebit),
      isInternal: e.isInternal,
      branch: ref(e.branchId, e.branch?.name),
      counterpartyBranchId: e.counterpartyBranchId || null,
      dimensions,
      accounting: {
        debits,
        credits,
        totalDebit: n(e.totalDebit),
        totalCredit: n(e.totalCredit),
        // Muvozanat UI da ko'rsatiladi: buzilgan yozuv darhol ko'zga
        // tashlanishi kerak.
        balanced: n(e.totalDebit) === n(e.totalCredit),
      },
      audit: {
        createdBy: e.createdById ? ref(e.createdById, fullName(e.createdBy)) : null,
        createdAt: e.createdAt,
        logs: logs.map((l: any) => ({
          ...l,
          amountBefore: l.amountBefore === null ? null : n(l.amountBefore),
          amountAfter: l.amountAfter === null ? null : n(l.amountAfter),
        })),
      },
      source,
    };
  }

  /**
   * MANBA HUJJATGA HAVOLA.
   *
   * Jurnal yozuvi `refModel`/`refId` orqali o'z manbasini biladi. Bu
   * yerda o'sha hujjatning QISQA ko'rinishi olinadi — UI "asl to'lovni
   * ochish" tugmasini shu asosda chizadi.
   *
   * Hujjat o'chirilgan bo'lsa `exists: false` qaytadi: havolani
   * ko'rsatib, keyin 404 ga olib borish yomonroq.
   */
  private async resolveSource(entry: Record<string, any>) {
    if (!entry.refModel || !entry.refId) return null;
    const base = { model: entry.refModel, id: entry.refId };

    try {
      if (entry.refModel === 'PaymentTransaction') {
        const p = await this.prisma.paymentTransaction.findUnique({
          where: { id: entry.refId },
          select: {
            id: true,
            amount: true,
            feeAmount: true,
            method: true,
            paidAt: true,
            note: true,
            isDeleted: true,
            year: true,
            month: true,
            paymentId: true,
          },
        });
        if (!p) return { ...base, exists: false };
        return {
          ...base,
          exists: true,
          label: "To'lovni ochish",
          route: `/owner/finance/student-payments/student/${entry.studentId || ''}`,
          data: {
            gross: n(p.amount),
            fee: n(p.feeAmount),
            net: n(p.amount) - n(p.feeAmount),
            method: p.method,
            paidAt: p.paidAt,
            note: p.note,
            period: `${p.year}-${String(p.month).padStart(2, '0')}`,
            canceled: p.isDeleted,
          },
        };
      }
      if (entry.refModel === 'Expense') {
        const ex = await this.prisma.expense.findUnique({
          where: { id: entry.refId },
          select: {
            id: true,
            title: true,
            amount: true,
            vendor: true,
            method: true,
            spentAt: true,
            categoryName: true,
            isDeleted: true,
            description: true,
          },
        });
        if (!ex) return { ...base, exists: false };
        return {
          ...base,
          exists: true,
          label: 'Chiqimni ochish',
          route: '/owner/finance/expenses',
          data: {
            title: ex.title,
            amount: n(ex.amount),
            vendor: ex.vendor,
            method: ex.method,
            spentAt: ex.spentAt,
            category: ex.categoryName,
            description: ex.description,
            canceled: ex.isDeleted,
          },
        };
      }
      if (entry.refModel === 'Refund') {
        const r = await this.prisma.refund.findUnique({
          where: { id: entry.refId },
          select: {
            id: true,
            amount: true,
            reason: true,
            status: true,
            method: true,
            executedAt: true,
            originalTransactionId: true,
          },
        });
        if (!r) return { ...base, exists: false };
        return {
          ...base,
          exists: true,
          label: 'Qaytarim',
          data: {
            amount: n(r.amount),
            reason: r.reason,
            status: r.status,
            method: r.method,
            executedAt: r.executedAt,
            originalTransactionId: r.originalTransactionId,
          },
        };
      }
      if (
        entry.refModel === 'SalaryTransaction' ||
        entry.refModel === 'StaffSalaryTransaction'
      ) {
        const table =
          entry.refModel === 'SalaryTransaction'
            ? 'salaryTransaction'
            : 'staffSalaryTransaction';
        const s = await (this.prisma as never as Record<string, any>)[table].findUnique({
          where: { id: entry.refId },
          select: {
            id: true,
            amount: true,
            method: true,
            paidAt: true,
            year: true,
            month: true,
            note: true,
          },
        });
        if (!s) return { ...base, exists: false };
        return {
          ...base,
          exists: true,
          label: "Maosh to'lovi",
          data: {
            amount: n(s.amount),
            method: s.method,
            paidAt: s.paidAt,
            period: `${s.year}-${String(s.month).padStart(2, '0')}`,
            note: s.note,
          },
        };
      }
      if (entry.refModel === 'DepositTransaction') {
        const d = await this.prisma.depositTransaction.findUnique({
          where: { id: entry.refId },
          select: {
            id: true,
            amount: true,
            type: true,
            method: true,
            paidAt: true,
            balanceAfter: true,
          },
        });
        if (!d) return { ...base, exists: false };
        return {
          ...base,
          exists: true,
          label: 'Depozit amali',
          data: {
            amount: n(d.amount),
            type: d.type,
            method: d.method,
            paidAt: d.paidAt,
            balanceAfter: n(d.balanceAfter),
          },
        };
      }
      if (entry.refModel === 'CashTransfer') {
        const t = await this.prisma.cashTransfer.findUnique({
          where: { id: entry.refId },
          select: { id: true, amount: true, status: true, sentAt: true, receivedAt: true },
        });
        if (!t) return { ...base, exists: false };
        return {
          ...base,
          exists: true,
          label: 'Inkassatsiya',
          data: {
            amount: n(t.amount),
            status: t.status,
            sentAt: t.sentAt,
            receivedAt: t.receivedAt,
          },
        };
      }
    } catch {
      // Manba o'qilmasa yozuvning O'ZI baribir ko'rsatiladi — tafsilot
      // manba tufayli butunlay yopilib qolmasligi kerak.
      return { ...base, exists: false };
    }

    // `OwnerCapital`, `AccountTransfer`, `Adjustment`, `PaymentFee` —
    // ular alohida hujjatga ega EMAS: jurnal yozuvining o'zi manba.
    return { ...base, exists: false, selfContained: true };
  }

  /**
   * ══════════════════════════════════════════════════════════════════
   * YOZUVLAR RO'YXATI — jamlanma bilan tafsilot orasidagi KO'PRIK
   * ══════════════════════════════════════════════════════════════════
   *
   * NEGA KERAK: tahlil endpoint'lari JAMLANMA qaytaradi ("IELTS — 1.4 mln"),
   * tafsilot esa BITTA yozuvni oladi. Ular orasida bo'shliq bor edi:
   * foydalanuvchi guruhga yetib kelgach, "qaysi to'lovlar bu summani
   * tashkil qiladi?" degan savolga javob yo'q edi.
   *
   * Bu YANGI TAHLIL EMAS — hech narsa hisoblanmaydi. Bu o'sha jurnalning
   * filtrlangan ro'yxati, aynan tahlil ishlatadigan `journalWhere` bilan.
   * Ya'ni ro'yxatdagi summalar yig'indisi tahlildagi raqam bilan MOS
   * keladi, chunki shart bir xil.
   *
   * MAOSH YOZUVLARI: ruxsati bo'lmagan foydalanuvchi uchun ro'yxatdan
   * BUTUNLAY chiqariladi (tafsilotdagi 403 bilan bir xil chegara —
   * aks holda ro'yxatda summalar ko'rinib qolardi).
   */
  async listEntries(filters: AnalyticsFilter, permissions: string[] = []) {
    const range = parseRange(filters);
    const limit = Math.min(Number(filters.limit) || 25, 100);

    const where = journalWhere({
      ...range,
      branchId: filters.branchId || null,
      dimensions: filters as Record<string, unknown>,
      // Ichki o'tkazma va egasining puli ham ko'rinadi: ro'yxat
      // "shu kesimda nima bo'lgan" degan savolga javob beradi.
      excludeNonOperating: false,
    });

    const canPayroll = hasAnyPermission(permissions, [
      PERMISSIONS.SALARY_READ,
      PERMISSIONS.PAYROLL_READ,
    ]);
    const payrollClause = canPayroll ? Prisma.empty : Prisma.sql`AND e.kind <> 'salary'`;

    /**
     * HISOB BO'YICHA FILTR — "Bank hisobini bosdim, nima bo'lgan?"
     *
     * ── NEGA `EXISTS`, JOIN EMAS ──
     * Hisob turi yozuvda emas, uning QATORLARIDA (`journal_lines`).
     * `JOIN` qilinsa, ikki qatori bir xil hisobga tegadigan yozuv
     * ro'yxatda IKKI MARTA chiqardi va summalar qo'shilib ketardi.
     * `EXISTS` esa yozuvni bir marta beradi — "shu hisobga tegdimi?"
     * degan savolga ha/yo'q javob.
     *
     * Kalit qat'iy ro'yxatdan (zod enum) keladi, ya'ni bu yerda
     * in'ektsiya mumkin emas; baribir parametr sifatida uzatiladi.
     */
    const accountClause = filters.accountKind
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM journal_lines jl
          WHERE jl."entryId" = e.id
            AND jl."accountKind"::text = ${String(filters.accountKind)}
        )`
      : Prisma.empty;

    /**
     * ══════════════════════════════════════════════════════════════
     * ISHORA (`cashDelta`) — SERVERDA HISOBLANADI, UI DA EMAS
     * ══════════════════════════════════════════════════════════════
     *
     * Ro'yxatdagi `amount` — yozuvning JAMI DEBETI, ya'ni HAR DOIM
     * musbat. "+300 000 / −100 000" ko'rinishini chizish uchun UI
     * ishorani BILISHI kerak, va uni yozuv TURIDAN taxmin qilib
     * bo'lmaydi:
     *
     *   • `account_transfer` (bank → kassa) kassa uchun MANFIY,
     *     bank uchun MUSBAT — bitta yozuv, ikki xil ishora;
     *   • `adjustment` ikkala tomonga ham ketishi mumkin.
     *
     * Shuning uchun ishora XAZINA QATORLARIDAN yig'iladi
     * (debet − kredit). Hisob tanlangan bo'lsa FAQAT o'sha hisob
     * qatorlari — "Kassani bosdim" ko'rinishida o'tkazma to'g'ri
     * −500 000 bo'lib chiqadi. Hisob tanlanmagan bo'lsa ichki
     * o'tkazma nolga teng bo'ladi va bu HAQIQAT: umumiy pul
     * miqdori o'zgarmagan.
     *
     * `accountKinds` — yozuv TEGIB O'TGAN xazina hisoblari. Jadvaldagi
     * "Hisob" ustuni shu yerdan chiqadi; UI to'lov kanalidan hisob
     * turini O'ZI chiqarib olmaydi (ular har doim ham mos kelmaydi —
     * `card` → `terminal`).
     */
    const deltaScope = filters.accountKind
      ? Prisma.sql`AND jl."accountKind"::text = ${String(filters.accountKind)}`
      : Prisma.sql`AND jl."accountKind"::text IN (${Prisma.join(
          TREASURY_KINDS as unknown as string[],
        )})`;

    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT e.id, e.kind::text AS kind, e.date, e.memo, e."totalDebit" AS amount,
             e."postingKey", e."refModel", e."paymentMethod"::text AS "paymentMethod",
             e."createdById" AS "createdById",
             NULLIF(TRIM(CONCAT_WS(' ', u."firstName", u."lastName")), '') AS "createdByName",
             COALESCE(t.delta, 0) AS "cashDelta",
             COALESCE(t.kinds, ARRAY[]::text[]) AS "accountKinds"
      FROM journal_entries e
      LEFT JOIN users u ON u.id = e."createdById"
      LEFT JOIN LATERAL (
        SELECT SUM(jl.debit - jl.credit) AS delta,
               ARRAY_AGG(DISTINCT jl."accountKind"::text) AS kinds
        FROM journal_lines jl
        WHERE jl."entryId" = e.id ${deltaScope}
      ) t ON TRUE
      WHERE ${where} ${payrollClause} ${accountClause}
      ORDER BY e.date DESC, e."createdAt" DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      kindLabel: ENTRY_KIND_LABELS[String(r.kind)] || r.kind,
      date: r.date,
      memo: r.memo || '',
      amount: n(r.amount),
      // Xazina bo'yicha ISHORALI o'zgarish (yuqoridagi izohga qarang).
      cashDelta: n(r.cashDelta),
      accountKinds: (r.accountKinds as string[]) || [],
      createdBy: r.createdById
        ? { id: r.createdById, name: (r.createdByName as string) || '' }
        : null,
      postingKey: r.postingKey,
      refModel: r.refModel,
      paymentMethod: r.paymentMethod,
    }));
  }
}
