import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { branchFilter } from '../../common/als/branch-context.js';
import { TREASURY_KINDS } from '../../common/constants/ledger.js';
import { n, ratioPercent } from './metrics.js';
import {
  parseRange,
  branchClause,
  journalWhere,
  planPeriodClause,
  SQL_REVENUE_NET,
  SQL_EXPENSE,
  SQL_SHORTAGE,
  type AnalyticsFilter,
} from './analytics-filter.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILIAL KESIMI — BOSH EKRANDAGI GRAFIK UCHUN YAGONA MANBA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bosh ekran (`/org`) ilgari OLTITA KARTA edi: har biri butun tashkilot
 * bo'yicha bitta son. Ular savolga javob bermasdi — "6.9 mln daromad"
 * qaysi filialdan kelganini aytmasdi, ya'ni rahbar ekranni ko'rib
 * HECH QANDAY qaror qabul qila olmasdi.
 *
 * Bu servis o'sha oltita ko'rsatkichni FILIAL KESIMIDA beradi. Endi
 * savol "qancha?" emas, "QAYERDAN?" — va javob bitta grafikda.
 *
 * ── NEGA YANGI ENDPOINT, MAVJUDLARINI QO'SHIB EMAS ──
 *
 * Kerakli oltita ko'rsatkich UCHTA turli manbada yotardi:
 *   • daromad / xarajat / marja  → `/branch-analytics/pnl`
 *   • qarzdorlik / o'quvchi      → `/finance-analytics/branches`
 *   • kassa qoldig'i             → HECH QAYERDA filial kesimida yo'q edi
 *
 * Klientda uchta javobni `branchId` bo'yicha birlashtirish mumkin edi,
 * lekin unda:
 *   1. har biri O'Z davrini o'zi hisoblardi va ular bir-biriga mos
 *      kelishiga hech kim kafolat bermasdi;
 *   2. `/finance-analytics/branches` `finance.view_profitability`
 *      talab qiladi (u MAOSH tannarxini ochadi) — ya'ni oddiy
 *      `finance.read` egasi grafikning yarmini ko'rmasdi;
 *   3. filial ro'yxati UCHALASINING KESISHMASI bo'lardi: harakati
 *      yo'q filial umuman tushib qolardi va "grafikda yo'q" degani
 *      "filial yo'q" bilan chalkashardi.
 *
 * ── RUXSAT: `finance.read` ──
 * Javobda MAOSH tannarxi YO'Q (xarajat yaxlit summa), ya'ni
 * `/branch-analytics/pnl` bilan bir xil sezgirlik darajasi. Uni
 * `finance.view_profitability` ga bog'lash grafikni asossiz yopardi.
 *
 * ── FILIAL RO'YXATI JURNALDAN EMAS, `branches` JADVALIDAN ──
 * Aggregatlar filiallar ro'yxatiga CHAPDAN ulanadi. Shu sababli
 * hech qanday harakat bo'lmagan filial ham grafikda NOL ustun bo'lib
 * turadi. Bu ataylab: "0 so'm daromad" — O'LCHANGAN va muhim fakt,
 * qatorning yo'qligi esa "bunday filial yo'q" degan boshqa gap.
 *
 * ⚠ Bu YAGONA joy bo'lib, bu yerda `0` yolg'on emas: filial mavjudligi
 * ALOHIDA so'rov bilan tasdiqlangan, ya'ni "yozuv topilmadi" =
 * "harakat bo'lmagan". Marja esa BOSHQA GAP — daromad nol bo'lsa u
 * `null` qaytadi ("hisoblab bo'lmaydi"), 0% EMAS.
 */

/** Grafik uchun oy qatori uzunligi — bitta filial tanlanganda. */
const TREND_MONTHS = 12;

interface MonthKey {
  key: string;
  year: number;
  month: number;
}

/** `YYYY-MM` — SQL `date_trunc` natijasi va plan yili/oyi uchun umumiy kalit. */
const monthKey = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, '0')}`;

@Injectable()
export class BranchOverviewService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════════════════
  // FILIALLAR RO'YXATI — GRAFIKNING O'QI
  // ══════════════════════════════════════════════════════════════════

  /**
   * Ko'lamdagi FAOL filiallar.
   *
   * `branchFilter('id')` — `Branch` modeli uchun ko'lam ustuni uning
   * O'Z `id` si (boshqa modellarda `branchId`). Cross-branch huquqi
   * borlarda `{}` qaytadi, ya'ni hamma filial; direktorda esa faqat
   * o'ziniki — grafik shu bilan avtomatik kesiladi.
   */
  private async branchesInScope() {
    return this.prisma.branch.findMany({
      where: { isDeleted: false, isActive: true, ...branchFilter('id') },
      select: { id: true, name: true, code: true, isMain: true },
      orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // DAVR KESIMI (grafikning "Barcha filiallar" rejimi)
  // ══════════════════════════════════════════════════════════════════

  /**
   * DAROMAD / XARAJAT / KAMOMAD — filial bo'yicha.
   *
   * `excludeInternal: true` — filiallararo o'tkazma tarmoq darajasida
   * pul harakati EMAS. Ikkala tomonda sanalsa A filialning "xarajati"
   * va B filialning "daromadi" bo'lib, taqqoslash buzilardi.
   */
  private async pnlByBranch(from: Date, to: Date) {
    const where = journalWhere({ from, to, excludeInternal: true });
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT e."branchId"  AS "id",
             ${SQL_REVENUE_NET}  AS "revenue",
             ${SQL_EXPENSE}      AS "expense",
             ${SQL_SHORTAGE}     AS "shortage"
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      WHERE ${where}
      GROUP BY e."branchId"
    `;
  }

  /**
   * KASSA QOLDIG'I — filial bo'yicha, davr OXIRIGA.
   *
   * ⚠ UCH JIHATDAN BOSHQA HISOB:
   *
   *  1. DAVR BILAN CHEKLANMAYDI. "Hozir qancha pul bor" — bu oqim
   *     emas, QOLDIQ: yozuvning boshidan davr oxirigacha hammasi.
   *  2. Ichki o'tkazma CHIQARIB TASHLANMAYDI. A dan B ga o'tgan pul
   *     tarmoq foydasini o'zgartirmaydi, lekin A ning kassasini
   *     ROSTDAN kamaytiradi — filial kesimida bu haqiqiy fakt.
   *  3. Operatsiondan tashqari yozuvlar ham kiradi (`journalWhere`
   *     ularni foyda hisobidan ayiradi, pul esa baribir harakatlangan).
   *
   * `summary.service.ts` → `cashBalance()` bilan AYNAN bir xil ta'rif.
   * Farq bo'lsa bitta ekranda ikki xil "kassadagi pul" chiqardi.
   */
  private async cashByBranch(to: Date) {
    const bc = branchClause('e."branchId"', null);
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT e."branchId" AS "id",
             COALESCE(SUM(l.debit - l.credit), 0) AS "cash"
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      WHERE l."accountKind"::text IN (${Prisma.join(TREASURY_KINDS as unknown as string[])})
        AND e.date <= ${to}
        ${bc}
      GROUP BY e."branchId"
    `;
  }

  /**
   * QARZDORLIK VA O'QUVCHI SONI — to'lov REJASIDAN, jurnaldan emas.
   *
   * O'QUVCHI TA'RIFI: davr ichida to'lov rejasi bo'lgan noyob o'quvchi.
   * `User.role = 'student'` sanog'idan ATAYLAB farq qiladi — u "ro'yxatda
   * turgan" ni sanaydi, bu esa "shu oyda o'qigan" ni. Moliyaviy kesimda
   * ikkinchisi to'g'ri: daromad aynan shu odamlardan keladi.
   *
   * `/finance-analytics/branches` (`profitability.service.ts`) ham AYNAN
   * shu ta'rifni ishlatadi — ikki ekranda ikki xil o'quvchi soni
   * bo'lmasligi uchun.
   */
  private async plansByBranch(from: Date, to: Date) {
    const bc = branchClause('sp."branchId"', null);
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT sp."branchId" AS "id",
             COUNT(DISTINCT sp."studentId") AS "students",
             COALESCE(SUM(GREATEST(sp."expectedAmount" - sp."paidAmount", 0))
               FILTER (WHERE NOT sp."writtenOff"), 0) AS "outstanding"
      FROM student_payments sp
      WHERE ${planPeriodClause('sp', from, to)}
        ${bc}
      GROUP BY sp."branchId"
    `;
  }

  // ══════════════════════════════════════════════════════════════════
  // OYLIK QATOR (grafikning "bitta filial" rejimi)
  // ══════════════════════════════════════════════════════════════════

  /** Oxirgi `TREND_MONTHS` oy — davr oxiridagi oy bilan tugaydi. */
  private buildMonths(to: Date): MonthKey[] {
    const months: MonthKey[] = [];
    for (let i = TREND_MONTHS - 1; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - i, 1));
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1;
      months.push({ key: monthKey(year, month), year, month });
    }
    return months;
  }

  /**
   * BITTA FILIALNING OYMA-OY DINAMIKASI.
   *
   * ── NEGA "BARCHA FILIALLAR" REJIMIDA HISOBLANMAYDI ──
   * Grafik o'sha rejimda filiallarni yonma-yon qo'yadi, ya'ni oy qatori
   * chizilmaydi. Uni baribir hisoblash har sahifa ochilishida to'rtta
   * ortiqcha so'rov bo'lardi — natijasi hech qachon ko'rsatilmaydigan.
   *
   * ── KASSA QOLDIG'I — YIG'ILIB BORADI ──
   * Qolgan beshtasi oy ICHIDAGI hajm, kassa esa oy OXIRIDAGI holat.
   * Shuning uchun oldin oraliqdan OLDINGI butun tarix yig'iladi
   * ("ochilish qoldig'i"), keyin har oy ustiga qo'shiladi. Faqat
   * oraliq ichini sanash grafikni noldan boshlab yolg'on ko'rsatardi.
   */
  private async trendForBranch(branchId: string, months: MonthKey[], to: Date) {
    const from = new Date(Date.UTC(months[0].year, months[0].month - 1, 1));

    const pnlWhere = journalWhere({ from, to, branchId, excludeInternal: true });
    const cashBc = branchClause('e."branchId"', branchId);
    const planBc = branchClause('sp."branchId"', branchId);

    const [pnlRows, cashRows, planRows] = await Promise.all([
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT date_trunc('month', e.date) AS "bucket",
               ${SQL_REVENUE_NET} AS "revenue",
               ${SQL_EXPENSE}     AS "expense",
               ${SQL_SHORTAGE}    AS "shortage"
        FROM journal_lines l
        JOIN journal_entries e ON e.id = l."entryId"
        WHERE ${pnlWhere}
        GROUP BY 1
      `,
      // ⚠ `e.date <= to` — oraliq BOSHIDAN oldingi yozuvlar HAM keladi.
      // Ular ochilish qoldig'ini beradi (pastda `bucket < from` bo'yicha
      // yig'iladi), shuning uchun `from` sharti ATAYLAB yo'q.
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT date_trunc('month', e.date) AS "bucket",
               COALESCE(SUM(l.debit - l.credit), 0) AS "delta"
        FROM journal_lines l
        JOIN journal_entries e ON e.id = l."entryId"
        WHERE l."accountKind"::text IN (${Prisma.join(TREASURY_KINDS as unknown as string[])})
          AND e.date <= ${to}
          ${cashBc}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT sp.year AS "year", sp.month AS "month",
               COUNT(DISTINCT sp."studentId") AS "students",
               COALESCE(SUM(GREATEST(sp."expectedAmount" - sp."paidAmount", 0))
                 FILTER (WHERE NOT sp."writtenOff"), 0) AS "outstanding"
        FROM student_payments sp
        WHERE ${planPeriodClause('sp', from, to)}
          ${planBc}
        GROUP BY sp.year, sp.month
      `,
    ]);

    const bucketKey = (v: unknown): string => {
      const d = new Date(v as string);
      return monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
    };

    const pnlByMonth = new Map(pnlRows.map((r) => [bucketKey(r.bucket), r]));
    const planByMonth = new Map(
      planRows.map((r) => [monthKey(Number(r.year), Number(r.month)), r]),
    );

    // Kassa: oraliqdan OLDINGI hamma narsa bitta boshlang'ich songa yig'iladi.
    const inRange = new Set(months.map((m) => m.key));
    let running = 0;
    const cashDelta = new Map<string, number>();
    for (const r of cashRows) {
      const key = bucketKey(r.bucket);
      if (inRange.has(key)) cashDelta.set(key, (cashDelta.get(key) || 0) + n(r.delta));
      else if (new Date(r.bucket as string) < from) running += n(r.delta);
    }

    return months.map((m) => {
      const p = pnlByMonth.get(m.key) || {};
      const pl = planByMonth.get(m.key) || {};
      const revenue = n(p.revenue);
      const expense = n(p.expense);
      const net = revenue - expense - n(p.shortage);
      running += cashDelta.get(m.key) || 0;

      return {
        key: m.key,
        year: m.year,
        month: m.month,
        revenue,
        expense,
        net,
        profitMarginPercent: revenue > 0 ? ratioPercent(net, revenue) : null,
        cashBalance: running,
        outstanding: n(pl.outstanding),
        students: Number(pl.students || 0),
      };
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // OMMAVIY METOD
  // ══════════════════════════════════════════════════════════════════

  /**
   * @param filters `branchId` berilsa — QO'SHIMCHA oylik qator. Filial
   *   ro'yxati (`items`) baribir TO'LIQ qaytadi: grafik bitta filialga
   *   o'tganda ham yon tomondagi taqqoslash yo'qolmasligi kerak, aks
   *   holda "bu filial yaxshimi?" degan savol javobsiz qolardi.
   */
  async getBranchOverview(filters: AnalyticsFilter = {}) {
    const range = parseRange(filters);
    const branchId = filters.branchId || null;

    const [branches, pnlRows, cashRows, planRows] = await Promise.all([
      this.branchesInScope(),
      this.pnlByBranch(range.from, range.to),
      this.cashByBranch(range.to),
      this.plansByBranch(range.from, range.to),
    ]);

    const pnlById = new Map(pnlRows.map((r) => [String(r.id), r]));
    const cashById = new Map(cashRows.map((r) => [String(r.id), r]));
    const planById = new Map(planRows.map((r) => [String(r.id), r]));

    const items = branches.map((b) => {
      const id = String(b.id);
      const p = pnlById.get(id) || {};
      const c = cashById.get(id) || {};
      const pl = planById.get(id) || {};

      const revenue = n(p.revenue);
      const expense = n(p.expense);
      const shortage = n(p.shortage);
      const net = revenue - expense - shortage;

      return {
        branchId: id,
        name: b.name,
        code: b.code,
        isMain: b.isMain,
        revenue,
        expense,
        shortage,
        net,
        // ⚠ `null`, 0 EMAS: daromadsiz filialda marja HISOBLANMAYDI.
        // 0% "hech narsa ishlamadi" degan YOLG'ON da'vo bo'lardi —
        // aslida bo'linuvchi ham, bo'luvchi ham yo'q.
        profitMarginPercent: revenue > 0 ? ratioPercent(net, revenue) : null,
        cashBalance: n(c.cash),
        outstanding: n(pl.outstanding),
        students: Number(pl.students || 0),
      };
    });

    const totals = items.reduce(
      (acc, i) => ({
        revenue: acc.revenue + i.revenue,
        expense: acc.expense + i.expense,
        net: acc.net + i.net,
        cashBalance: acc.cashBalance + i.cashBalance,
        outstanding: acc.outstanding + i.outstanding,
        students: acc.students + i.students,
      }),
      { revenue: 0, expense: 0, net: 0, cashBalance: 0, outstanding: 0, students: 0 },
    );

    const months = this.buildMonths(range.to);
    // ⚠ SO'RALGAN FILIAL KO'LAMDA BO'LMASA `branchClause` 403 tashlaydi
    // (`assertBranchInScope`) — jimgina bo'sh qator qaytarilmaydi.
    const trend = branchId ? await this.trendForBranch(branchId, months, range.to) : null;

    return {
      period: { from: range.from, to: range.to },
      branchId,
      items,
      totals: {
        ...totals,
        profitMarginPercent:
          totals.revenue > 0 ? ratioPercent(totals.net, totals.revenue) : null,
      },
      trend,
      trendMonths: TREND_MONTHS,
      // Har raqamning ASOSI javobning O'ZIDA — ekranda bosilgan foizni
      // tekshirmoqchi bo'lgan odam manbani qidirib yurmasin.
      basis: {
        pnl: "Filiallararo ichki o'tkazmalar chiqarib tashlangan.",
        cash: "Kassa qoldig'i — davr oxiriga, butun tarix bo'yicha yig'indi.",
        students: "Davr ichida to'lov rejasi bo'lgan noyob o'quvchi.",
        margin: "Sof natija ÷ daromad. Markaz xarajatlari taqsimlanmaydi.",
      },
    };
  }
}
