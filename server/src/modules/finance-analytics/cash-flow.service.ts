import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  parseRange,
  branchClause,
  autoGranularity,
  truncExpr,
  type AnalyticsFilter,
} from './analytics-filter.js';
import { n } from './metrics.js';
import { TREASURY_KINDS, FINANCING_ENTRY_KINDS } from '../../common/constants/ledger.js';

/**
 * ══════════════════════════════════════════════════════════════════════
 * PUL OQIMI (cash flow) — Faza 11
 * (`services/cashFlow.service.js` EKVIVALENTI)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── FOYDA ≠ PUL ──
 * Bu hisobotning butun mavjudlik sababi shu. Ular boshqacha:
 *   • qarzga o'qiyotgan o'quvchi FOYDA beradi, PUL bermaydi
 *   • egasining investitsiyasi PUL beradi, FOYDA bermaydi
 *   • depozitga qo'yilgan pul KASSAGA tushadi, lekin hali DAROMAD emas
 * Shuning uchun pul oqimi FAQAT xazina hisoblari harakatidan
 * hisoblanadi — daromad/xarajat hisoblariga umuman qaralmaydi.
 *
 * ── UCH BO'LIM ──
 *   OPERATSION       — to'lov, depozit, chiqim, maosh
 *   MOLIYALASHTIRISH — egasining puli (investitsiya / yechish)
 *   ICHKI            — hisoblar/filiallar orasidagi ko'chirish
 *
 * Ichki ko'chirish YIG'INDIDA NOLGA teng bo'ladi (bir hisobdan chiqib,
 * ikkinchisiga kiradi) — lekin ALOHIDA ko'rsatiladi, chunki bitta
 * hisob kesimida u haqiqiy harakat.
 */

const TREASURY_FILTER = Prisma.sql`l."accountKind"::text IN (${Prisma.join(
  TREASURY_KINDS as unknown as string[],
)})`;

/**
 * ICHKI KO'CHIRISH TURLARI.
 *
 * ⚠ `FINANCING_ENTRY_KINDS` dan farqli o'laroq bu ro'yxat
 * `constants/ledger` da EMAS, servisning o'zida — Express'da ham
 * shunday. Ko'chirishda uni konstantalarga chiqarish vasvasasi bor
 * edi, lekin u boshqa modullarga ko'rinadigan bo'lib qolardi va
 * "bu ro'yxat qayerda ishlatiladi" savoli kengayardi.
 */
const INTERNAL_KINDS = ['account_transfer', 'transfer_send', 'transfer_receive', 'inter_branch'];

interface Bucket {
  inflow: number;
  outflow: number;
  byKind: Array<{ kind: string; inflow: number; outflow: number; net: number }>;
}

@Injectable()
export class CashFlowService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Berilgan sanagacha bo'lgan xazina qoldig'i. */
  private async balanceAt(
    date: Date,
    branchId: string | null,
    accountKind: string | null,
  ): Promise<number> {
    const bc = branchClause('e."branchId"', branchId);
    const acc = accountKind
      ? Prisma.sql`AND l."accountKind"::text = ${accountKind}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      WHERE ${TREASURY_FILTER} AND e.date < ${date} ${bc} ${acc}
    `;
    return n(rows[0]?.balance);
  }

  async getCashFlow(filters: AnalyticsFilter = {}) {
    const range = parseRange(filters);
    const branchId = filters.branchId || null;
    const accountKind = filters.accountKind || null;
    const bc = branchClause('e."branchId"', branchId);
    const acc = accountKind
      ? Prisma.sql`AND l."accountKind"::text = ${accountKind}`
      : Prisma.empty;

    const opening = await this.balanceAt(range.from, branchId, accountKind);

    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT e.kind::text AS "kind",
        COALESCE(SUM(l.debit), 0)  AS "inflow",
        COALESCE(SUM(l.credit), 0) AS "outflow"
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      WHERE ${TREASURY_FILTER}
        AND e.date >= ${range.from} AND e.date <= ${range.to}
        ${bc} ${acc}
      GROUP BY e.kind
    `;

    const FINANCING = new Set(FINANCING_ENTRY_KINDS as unknown as string[]);
    const INTERNAL = new Set(INTERNAL_KINDS);

    const buckets: Record<'operating' | 'financing' | 'internal', Bucket> = {
      operating: { inflow: 0, outflow: 0, byKind: [] },
      financing: { inflow: 0, outflow: 0, byKind: [] },
      internal: { inflow: 0, outflow: 0, byKind: [] },
    };
    for (const r of rows) {
      const inflow = n(r.inflow);
      const outflow = n(r.outflow);
      const kind = String(r.kind);
      const bucket = FINANCING.has(kind)
        ? 'financing'
        : INTERNAL.has(kind)
          ? 'internal'
          : 'operating';
      buckets[bucket].inflow += inflow;
      buckets[bucket].outflow += outflow;
      buckets[bucket].byKind.push({ kind, inflow, outflow, net: inflow - outflow });
    }

    const net = (b: Bucket) => b.inflow - b.outflow;
    const closing =
      opening + net(buckets.operating) + net(buckets.financing) + net(buckets.internal);

    return {
      period: { from: range.from, to: range.to },
      accountKind: accountKind || 'all',
      openingBalance: opening,
      operating: { ...buckets.operating, net: net(buckets.operating) },
      financing: {
        ...buckets.financing,
        net: net(buckets.financing),
        note: 'Egasining puli — DAROMAD/XARAJAT EMAS (Faza 13)',
      },
      internal: {
        ...buckets.internal,
        net: net(buckets.internal),
        note: "Ichki ko'chirish — umumiy qoldiqni o'zgartirmaydi",
      },
      netChange: closing - opening,
      closingBalance: closing,
    };
  }

  /** HISOB KESIMIDAGI QOLDIQLAR — "Kassa" ko'rinishi (Faza 3). */
  async getAccountBalances(filters: AnalyticsFilter = {}) {
    const range = parseRange(filters);
    const branchId = filters.branchId || null;
    const bc = branchClause('e."branchId"', branchId);

    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT l."accountKind"::text AS "accountKind", e."branchId" AS "branchId",
        COALESCE(SUM(CASE WHEN e.date <= ${range.to} THEN l.debit - l.credit ELSE 0 END), 0) AS "balance",
        COALESCE(SUM(CASE WHEN e.date >= ${range.from} AND e.date <= ${range.to} THEN l.debit ELSE 0 END), 0) AS "inflow",
        COALESCE(SUM(CASE WHEN e.date >= ${range.from} AND e.date <= ${range.to} THEN l.credit ELSE 0 END), 0) AS "outflow"
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      WHERE ${TREASURY_FILTER} AND e.date <= ${range.to} ${bc}
      GROUP BY l."accountKind", e."branchId"
      ORDER BY "balance" DESC
    `;

    const branchIds = [...new Set(rows.map((r) => r.branchId).filter(Boolean))] as string[];
    const branches = branchIds.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: branchIds } },
          select: { id: true, name: true },
        })
      : [];
    const bn = new Map(branches.map((b) => [b.id, b.name]));

    return rows.map((r) => ({
      accountKind: r.accountKind,
      branchId: r.branchId,
      branchName: bn.get(String(r.branchId)) || '',
      balance: n(r.balance),
      inflow: n(r.inflow),
      outflow: n(r.outflow),
      periodChange: n(r.inflow) - n(r.outflow),
    }));
  }

  /** PUL QOLDIG'I DINAMIKASI — davr ichidagi kunlik/oylik o'zgarish. */
  async getCashTrend(filters: AnalyticsFilter = {}) {
    const range = parseRange(filters);
    const granularity = filters.granularity || autoGranularity(range);
    const branchId = filters.branchId || null;
    const bc = branchClause('e."branchId"', branchId);
    const bucket = truncExpr(granularity);

    const opening = await this.balanceAt(range.from, branchId, null);

    /**
     * ══════════════════════════════════════════════════════════════
     * KIRIM va CHIQIM ALOHIDA — "kirim/chiqim dinamikasi" grafigi
     * ══════════════════════════════════════════════════════════════
     *
     * Ilgari faqat `change` qaytarardi va UI "qancha kirdi, qancha
     * chiqdi" degan savolga javob berish uchun daromad/chiqim
     * trendlaridan foydalanishga majbur bo'lardi — ular esa FOYDA
     * o'lchovi, PUL emas. Grafik jimgina boshqa raqamni chizardi.
     *
     * ── ICHKI KO'CHIRISH KIRIM/CHIQIMDAN CHIQARILADI ──
     * Bank → kassa o'tkazmasi xazina qatorlarida IKKI tomonda turadi:
     * kassaga debet, bankdan kredit. Xom `SUM(debit)` / `SUM(credit)`
     * da u IKKALA ustunni ham shishirardi — 500 000 lik ichki
     * ko'chirish "500 000 kirdi va 500 000 chiqdi" bo'lib ko'rinardi,
     * holbuki markazga bir tiyin ham kirmagan.
     *
     * `change` esa BARCHA harakatni oladi — qoldiq chizig'i shundan
     * chiziladi va u to'g'ri bo'lishi SHART.
     *
     * Ikkalasi ZID EMAS: ichki ko'chirishning NETTOSI nol, ya'ni
     * `inflow − outflow` hamon `change` ga TENG. Grafikdagi ustunlar
     * va chiziq bir-birini tasdiqlaydi.
     */
    const internalFilter = Prisma.sql`e.kind::text NOT IN (${Prisma.join(
      INTERNAL_KINDS,
    )})`;

    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT ${bucket} AS "bucket",
        COALESCE(SUM(CASE WHEN ${internalFilter} THEN l.debit  ELSE 0 END), 0) AS "inflow",
        COALESCE(SUM(CASE WHEN ${internalFilter} THEN l.credit ELSE 0 END), 0) AS "outflow",
        COALESCE(SUM(l.debit - l.credit), 0) AS "change"
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      WHERE ${TREASURY_FILTER} AND e.date >= ${range.from} AND e.date <= ${range.to} ${bc}
      GROUP BY ${bucket}
      ORDER BY "bucket" ASC
    `;

    // Yugurib boruvchi qoldiq JS'da — bu O(bucket) amal, O(qatorlar) emas
    // (bucketlar soni ko'pi bilan bir necha o'nlab).
    let running = opening;
    return {
      granularity,
      openingBalance: opening,
      points: rows.map((r) => {
        const change = n(r.change);
        running += change;
        return {
          date: r.bucket,
          inflow: n(r.inflow),
          outflow: n(r.outflow),
          change,
          balance: running,
        };
      }),
    };
  }
}
