import { Prisma } from '@prisma/client';
import { branchFilter, assertBranchInScope } from '../../common/als/branch-context.js';
import { NON_OPERATING_ENTRY_KINDS } from '../../common/constants/ledger.js';

/**
 * ══════════════════════════════════════════════════════════════════════
 * TAHLIL QATLAMINING UMUMIY POYDEVORI
 * (`services/analyticsFilter.js` NING KO'CHIRMASI)
 * ══════════════════════════════════════════════════════════════════════
 *
 * Bu fayl uchta narsani BIR JOYDA ushlab turadi:
 *   1. davr (period) va oldingi davr hisobi
 *   2. filial ko'lami (branch scope) — xom SQL uchun
 *   3. jurnal so'rovining umumiy WHERE bo'lagi va pul ifodalari
 *
 * NEGA BIR JOYDA: har hisobot o'zicha "daromad nima" deb yozsa, ular
 * MUQARRAR ajralib ketadi — bitta sahifada 84 mln, boshqasida 81 mln
 * chiqadi va qaysi biri to'g'ri ekanini hech kim ayta olmaydi. Moliyada
 * bu tizimga bo'lgan ishonchni butunlay yo'q qiladi.
 *
 * ⚠ SERVIS EMAS, SOF FUNKSIYALAR: bu qatlam `PrismaService` ga
 * MUHTOJ EMAS — u faqat `Prisma.sql` bo'laklarini QURADI, bajarmaydi.
 * DI ga o'ralganda har servis uni inject qilishi kerak bo'lardi va
 * `SQL_REVENUE_NET` kabi KONSTANTALAR ham metodga aylanardi — bu
 * "bitta joyda" g'oyasini yo'q qilardi.
 *
 * ── PUL ANIQLIGI ──
 * Barcha yig'indi SQL'da (`numeric`) hisoblanadi — JavaScript'da EMAS.
 * Sabab: ustunlar `numeric(18,2)` va Postgres ular ustida ANIQ
 * arifmetika bajaradi. JS'ga faqat TAYYOR natija keladi va u
 * chegarada songa aylantiriladi.
 */

export interface Range {
  from: Date;
  to: Date;
}

export interface AnalyticsFilter {
  from?: string | Date;
  to?: string | Date;
  year?: number | string;
  month?: number | string;
  branchId?: string | null;
  teacherId?: string | null;
  courseId?: string | null;
  groupId?: string | null;
  roomId?: string | null;
  studentId?: string | null;
  expenseCategoryId?: string | null;
  paymentMethod?: string | null;
  costType?: string | null;
  accountKind?: string | null;
  granularity?: string | null;
  limit?: number | null;
}

// ── DAVR ──

const startOfDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));

const endOfDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));

/**
 * Kiruvchi filtrdan davrni aniqlaydi.
 *
 * Qo'llab-quvvatlanadi:
 *   { from, to }        — aniq oraliq
 *   { year, month }     — bitta oy
 *   { year }            — butun yil
 *   (hech narsa)        — joriy oy
 */
export const parseRange = ({ from, to, year, month }: AnalyticsFilter = {}): Range => {
  if (from || to) {
    const f = from ? startOfDay(new Date(from)) : new Date(Date.UTC(1970, 0, 1));
    const t = to ? endOfDay(new Date(to)) : endOfDay(new Date());
    return { from: f, to: t };
  }
  if (year && month) {
    return {
      from: new Date(Date.UTC(Number(year), Number(month) - 1, 1)),
      to: new Date(Date.UTC(Number(year), Number(month), 0, 23, 59, 59, 999)),
    };
  }
  if (year) {
    return {
      from: new Date(Date.UTC(Number(year), 0, 1)),
      to: new Date(Date.UTC(Number(year), 11, 31, 23, 59, 59, 999)),
    };
  }
  const now = new Date();
  return {
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)),
  };
};

/**
 * OLDINGI EKVIVALENT DAVR.
 *
 * Uzunligi bir xil va joriy davrning AYNAN oldidan tugaydi.
 *
 * NEGA "oldingi oy" EMAS: foydalanuvchi 10 kunlik oraliq tanlasa, uni
 * butun oy bilan taqqoslash ma'nosiz o'sish ko'rsatardi (+300%). Teng
 * uzunlikdagi oraliq yagona halol taqqoslash.
 *
 * TO'LIQ OY tanlanganda esa aynan oldingi oy chiqadi (uzunlik farqi
 * 1-2 kun bo'lsa ham, oy chegarasi saqlanadi) — quyidagi `isFullMonth`
 * tekshiruvi shuning uchun.
 */
export const previousRange = ({ from, to }: Range): Range => {
  const isFullMonth =
    from.getUTCDate() === 1 &&
    to.getUTCDate() ===
      new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0)).getUTCDate() &&
    from.getUTCMonth() === to.getUTCMonth() &&
    from.getUTCFullYear() === to.getUTCFullYear();

  if (isFullMonth) {
    const y = from.getUTCFullYear();
    const m = from.getUTCMonth();
    return {
      from: new Date(Date.UTC(y, m - 1, 1)),
      to: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)),
    };
  }
  const ms = to.getTime() - from.getTime();
  return {
    from: new Date(from.getTime() - ms - 1),
    to: new Date(from.getTime() - 1),
  };
};

/** Oraliq uzunligiga qarab mos guruhlash darajasi (day/week/month). */
export const autoGranularity = ({ from, to }: Range): string => {
  const days = Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  return 'month';
};

// ── FILIAL KO'LAMI (xom SQL uchun) ──

/**
 * Filial shartini SQL bo'lagiga aylantiradi.
 *
 * FAIL-CLOSED: ruxsat etilgan filiallar ro'yxati BO'SH bo'lsa `FALSE`
 * qaytadi — ya'ni hech narsa ko'rinmaydi. Aks holda "filtr yo'q" deb
 * talqin qilinib, butun tarmoq ochilib ketardi.
 *
 * @param col — ustun nomi (masalan `e."branchId"`)
 */
export const branchClause = (
  col: string,
  explicitBranchId: string | null = null,
): Prisma.Sql => {
  if (explicitBranchId) {
    // ⚠ ANIQ FILIAL KO'LAMNI ALMASHTIRADI, shuning uchun u KO'LAM
    // ICHIDA ekani shu yerda tekshiriladi. Aks holda `?branchId=...`
    // parametri filial chegarasini butunlay chetlab o'tardi
    // (batafsil: `als/branch-context.ts` → `assertBranchInScope`).
    //
    // Tekshiruv aynan SHU YERDA: bu — tahlil qatlamidagi barcha
    // so'rovlar o'tadigan yagona nuqta. Har handler'da takrorlansa,
    // yangi endpoint qo'shgan odam uni unutishi muqarrar edi.
    assertBranchInScope(explicitBranchId);
    return Prisma.sql`AND ${Prisma.raw(col)} = ${String(explicitBranchId)}`;
  }
  const bf = branchFilter() as { branchId?: string | { in?: string[] } };
  const v = bf.branchId;
  if (typeof v === 'string') return Prisma.sql`AND ${Prisma.raw(col)} = ${v}`;
  if (v && typeof v === 'object' && Array.isArray(v.in)) {
    if (!v.in.length) return Prisma.sql`AND FALSE`;
    return Prisma.sql`AND ${Prisma.raw(col)} IN (${Prisma.join(v.in)})`;
  }
  return Prisma.empty;
};

// ── JURNAL SO'ROVINING UMUMIY BO'LAGI ──

const DIMENSION_COLUMNS: Readonly<Record<string, string>> = Object.freeze({
  teacherId: 'e."teacherId"',
  studentId: 'e."studentId"',
  staffId: 'e."staffId"',
  groupId: 'e."groupId"',
  courseId: 'e."courseId"',
  roomId: 'e."roomId"',
  expenseCategoryId: 'e."expenseCategoryId"',
  costType: 'e."costType"',
  paymentMethod: 'e."paymentMethod"',
});

/**
 * Jurnal yozuvi uchun WHERE bo'lagi.
 *
 * `excludeNonOperating` (standart: true) — egasining puli, ichki
 * o'tkazma va filiallararo yozuvlarni CHIQARIB TASHLAYDI. Ular pul
 * oqimida ko'rinadi, lekin foyda hisobiga KIRMAYDI
 * (`constants/ledger.ts` → `NON_OPERATING_ENTRY_KINDS`).
 *
 * `excludeInternal` — konsolidatsiya uchun: filiallararo ichki
 * aylanmani ikki marta sanamaslik.
 */
export const journalWhere = ({
  from,
  to,
  branchId = null,
  excludeNonOperating = true,
  excludeInternal = false,
  dimensions = {},
}: {
  from: Date;
  to: Date;
  branchId?: string | null;
  excludeNonOperating?: boolean;
  excludeInternal?: boolean;
  dimensions?: Record<string, unknown>;
}): Prisma.Sql => {
  const parts: Prisma.Sql[] = [Prisma.sql`e.date >= ${from} AND e.date <= ${to}`];

  const bc = branchClause('e."branchId"', branchId);
  if (bc !== Prisma.empty) parts.push(bc);

  if (excludeNonOperating) {
    parts.push(
      Prisma.sql`AND e.kind::text NOT IN (${Prisma.join(
        NON_OPERATING_ENTRY_KINDS as unknown as string[],
      )})`,
    );
  }
  if (excludeInternal) parts.push(Prisma.sql`AND e."isInternal" = false`);

  for (const [key, col] of Object.entries(DIMENSION_COLUMNS)) {
    const val = dimensions[key];
    if (val === undefined || val === null || val === '') continue;
    parts.push(Prisma.sql`AND ${Prisma.raw(col)} = ${String(val)}`);
  }

  return Prisma.join(parts, ' ');
};

// ── PUL IFODALARI (SQL) ──
//
// BITTA JOYDA. Har hisobot o'zicha yozsa, "daromad" ta'rifi ajralib
// ketardi. `Prisma.raw` xavfsiz: bu qatorlarda foydalanuvchi kiritgan
// ma'lumot YO'Q — faqat qat'iy ustun nomlari.

/** DAROMAD (qaytarim AYIRILGAN): kredit − debet. */
export const SQL_REVENUE_NET = Prisma.raw(
  `COALESCE(SUM(CASE WHEN l."accountKind" = 'revenue' THEN l.credit - l.debit ELSE 0 END), 0)`,
);
/** BRUTTO daromad: faqat kredit tomoni. */
export const SQL_REVENUE_GROSS = Prisma.raw(
  `COALESCE(SUM(CASE WHEN l."accountKind" = 'revenue' THEN l.credit ELSE 0 END), 0)`,
);
/** QAYTARIM: daromad hisobining debet tomoni. */
export const SQL_REFUNDS = Prisma.raw(
  `COALESCE(SUM(CASE WHEN l."accountKind" = 'revenue' THEN l.debit ELSE 0 END), 0)`,
);
/** OPERATSION XARAJAT (maosh ham shu yerda). */
export const SQL_EXPENSE = Prisma.raw(
  `COALESCE(SUM(CASE WHEN l."accountKind" = 'expense' THEN l.debit - l.credit ELSE 0 END), 0)`,
);
/** FAQAT MAOSH — to'g'ridan-to'g'ri bog'lanadigan xarajat. */
export const SQL_PAYROLL = Prisma.raw(
  `COALESCE(SUM(CASE WHEN l."accountKind" = 'expense' AND e.kind = 'salary' THEN l.debit - l.credit ELSE 0 END), 0)`,
);
/** MAOSHDAN BOSHQA xarajat (ijara, kommunal...). */
export const SQL_EXPENSE_NON_PAYROLL = Prisma.raw(
  `COALESCE(SUM(CASE WHEN l."accountKind" = 'expense' AND e.kind <> 'salary' THEN l.debit - l.credit ELSE 0 END), 0)`,
);
/** TO'LOV TIZIMI KOMISSIYASI. */
export const SQL_FEES = Prisma.raw(
  `COALESCE(SUM(CASE WHEN l."accountKind" = 'payment_fee' THEN l.debit - l.credit ELSE 0 END), 0)`,
);
/** KAMOMAD — xarajat emas, YO'QOTISH (alohida qator). */
export const SQL_SHORTAGE = Prisma.raw(
  `COALESCE(SUM(CASE WHEN l."accountKind" = 'shortage' THEN l.debit - l.credit ELSE 0 END), 0)`,
);

/** Vaqt qatori uchun guruhlash ifodasi. */
export const truncExpr = (granularity: string | null | undefined): Prisma.Sql => {
  const g = ['day', 'week', 'month'].includes(String(granularity))
    ? String(granularity)
    : 'month';
  return Prisma.raw(`date_trunc('${g}', e.date)`);
};

/**
 * OYLIK PLAN DAVRI — INDEKSDAN FOYDALANADIGAN shakl.
 *
 * ── NEGA `make_date(year, month, 1) BETWEEN ...` EMAS ──
 *
 * U o'qishga qulay, lekin ustun ustidagi FUNKSIYA bo'lgani uchun
 * Postgres `student_payments_year_month_status_idx` indeksini
 * ISHLATA OLMAYDI va butun jadvalni ketma-ket o'qiydi.
 *
 * 97 500 qatorli sinovda o'lchandi:
 *     make_date(...)  → Seq Scan,          27 ms
 *     year/month      → Bitmap Index Scan, 11 ms
 *
 * Farq jadval o'sishi bilan KENGAYADI: ketma-ket o'qish butun jadvalga
 * proporsional, indeks esa faqat mos qatorlarga.
 *
 * SHAKL: `year BETWEEN` indeksga yetakchi ustun bo'yicha kirish beradi,
 * (year*12 + month) esa oy chegarasini ANIQ qo'yadi (masalan 2024-03
 * dan 2025-02 gacha oraliq to'g'ri kesiladi).
 */
export const planPeriodClause = (alias: string, from: Date, to: Date): Prisma.Sql => {
  const y1 = from.getUTCFullYear();
  const m1 = from.getUTCMonth() + 1;
  const y2 = to.getUTCFullYear();
  const m2 = to.getUTCMonth() + 1;
  const col = Prisma.raw(alias);
  return Prisma.sql`${col}.year BETWEEN ${y1} AND ${y2}
    AND (${col}.year * 12 + ${col}.month) BETWEEN ${y1 * 12 + m1} AND ${y2 * 12 + m2}`;
};
