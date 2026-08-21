import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ACCOUNT_KINDS } from '../../common/constants/ledger.js';
import { branchFilter } from '../../common/als/branch-context.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILIAL FOYDA/ZIYON (P&L) + ELIMINATION —
 * `branchAnalytics/services/branchPnl.service.js` KO'CHIRMASI.
 *
 * ── ELIMINATION NIMA VA NEGA KERAK ──
 *
 * A filial B ga 5 mln inkassatsiya qildi. Har bir filialning O'Z
 * jurnalida bu HAQIQIY pul harakati va u KO'RINISHI kerak — filial
 * rahbari "kassamdan 5 mln chiqdi" ni bilishi shart.
 *
 * Lekin TARMOQ darajasida bu pul HECH QAYERGA KETMAGAN — u bir
 * cho'ntakdan ikkinchisiga o'tgan. Uni ikkala tomonda ham sanasak,
 * tarmoq aylanmasi 10 mln ga oshib ketardi — aslida 0 so'm daromad
 * bo'lgani holda.
 *
 * Shuning uchun yozuvlar `isInternal: true` bilan belgilanadi va
 * KONSOLIDATSIYALANGAN hisobotda chiqarib tashlanadi; FILIAL
 * hisobotida esa QOLADI. Bitta bayroq, ikki xil ko'rinish.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class BranchPnlService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * P&L qatorlari JURNALDAN hisoblanadi.
   *
   * ⚠ NEGA JURNALDAN, operatsion modellardan EMAS: jurnal yagona joy
   * bo'lib, u yerda daromad, xarajat va ichki o'tkazma BIR XIL qoidaga
   * bo'ysunadi. `PaymentTransaction`/`Expense` dan yig'ilsa, elimination
   * bayrog'i bo'lmagani uchun ichki o'tkazmalarni ajratib bo'lmasdi.
   *
   * ⚠ XOM SQL: filial bo'yicha guruhlash KERAK, lekin `branchId` QATORDA
   * emas, OTA yozuvda. Prisma `groupBy` bog'langan jadval maydoni
   * bo'yicha guruhlay OLMAYDI (`by: ["entry.branchId"]` mavjud emas).
   */
  private async collect({ from, to, consolidated, branchIds }: {
    from?: Date | null; to?: Date | null;
    consolidated?: boolean; branchIds?: string[] | null;
  }) {
    const where: Prisma.Sql[] = [];
    if (branchIds?.length) {
      where.push(Prisma.sql`e."branchId" IN (${Prisma.join(branchIds.map(String))})`);
    } else {
      const bf: any = branchFilter();
      if (typeof bf.branchId === 'string') {
        where.push(Prisma.sql`e."branchId" = ${bf.branchId}`);
      } else if (bf.branchId?.in) {
        if (!bf.branchId.in.length) return []; // fail-closed
        where.push(Prisma.sql`e."branchId" IN (${Prisma.join(bf.branchId.in)})`);
      }
    }
    if (from) where.push(Prisma.sql`e.date >= ${from}`);
    if (to) where.push(Prisma.sql`e.date <= ${to}`);
    if (consolidated) where.push(Prisma.sql`e."isInternal" = false`);

    const clause = where.length
      ? Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}`
      : Prisma.empty;

    const grouped = await this.prisma.$queryRaw<
      { branchId: string; kind: string; debit: unknown; credit: unknown }[]
    >`
      SELECT e."branchId" AS "branchId",
             l."accountKind" AS "kind",
             COALESCE(SUM(l.debit), 0)  AS "debit",
             COALESCE(SUM(l.credit), 0) AS "credit"
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      ${clause}
      GROUP BY e."branchId", l."accountKind"
    `;

    // Eski shakl: `{ _id: { branchId, kind }, debit, credit }`.
    return grouped.map((r) => ({
      _id: { branchId: r.branchId, kind: r.kind },
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
    }));
  }

  /** FILIAL BO'YICHA P&L. */
  async pnl({ from = null, to = null, consolidated = false }: {
    from?: Date | null; to?: Date | null; consolidated?: boolean;
  } = {}) {
    const rows = await this.collect({ from, to, consolidated });

    const byBranch = new Map<string, any>();
    for (const r of rows) {
      const key = String(r._id.branchId);
      const cur = byBranch.get(key) || {
        branchId: r._id.branchId, revenue: 0, expense: 0, shortage: 0,
      };

      // Daromad KREDIT bilan o'sadi, xarajat DEBET bilan.
      if (r._id.kind === ACCOUNT_KINDS.REVENUE) cur.revenue += r.credit - r.debit;
      if (r._id.kind === ACCOUNT_KINDS.EXPENSE) cur.expense += r.debit - r.credit;
      // ⚠ KAMOMAD ALOHIDA qator: u xarajat emas, YO'QOTISH. Aralashtirilsa
      // "xarajat oshdi" deb ko'rinib, sababi yashirinardi.
      if (r._id.kind === ACCOUNT_KINDS.SHORTAGE) cur.shortage += r.debit - r.credit;

      byBranch.set(key, cur);
    }

    const ids = [...byBranch.values()].map((b) => b.branchId);
    const branches = ids.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: ids.map(String) } },
          select: { id: true, name: true, code: true, areaM2: true, openedAt: true },
        })
      : [];
    const branchMap = new Map(branches.map((b) => [String(b.id), b]));

    const items = [...byBranch.values()].map((b) => {
      const branch: any = branchMap.get(String(b.branchId)) || {};
      const net = b.revenue - b.expense - b.shortage;
      return {
        branchId: b.branchId,
        name: branch.name || '',
        code: branch.code || '',
        revenue: b.revenue,
        expense: b.expense,
        shortage: b.shortage,
        // ⚠ FILIAL NATIJASI: markaz xarajatlari BU YERGA KIRMAYDI.
        // Ular ataylab taqsimlanmaydi — taqsimlash formulasi doim
        // bahsli va filial rahbari O'ZI BOSHQARA OLMAYDIGAN raqam
        // uchun javob berishi noto'g'ri.
        net,
        margin: b.revenue > 0 ? Math.round((net / b.revenue) * 10000) / 100 : null,
      };
    });

    items.sort((a, b) => b.net - a.net);

    const totals = items.reduce(
      (acc, i) => ({
        revenue: acc.revenue + i.revenue,
        expense: acc.expense + i.expense,
        shortage: acc.shortage + i.shortage,
        net: acc.net + i.net,
      }),
      { revenue: 0, expense: 0, shortage: 0, net: 0 },
    );

    return { consolidated, from, to, items, totals };
  }

  /**
   * ELIMINATION FARQI — "ichki o'tkazmalar hisobotni qancha shishirgan".
   *
   * Ikki rejim yonma-yon. Bu owner uchun ISHONCH vositasi: raqamlar bir
   * xil bo'lsa ichki aylanma yo'q, farq bo'lsa u AYNAN qancha ekani
   * ko'rinadi — "hisobot nega kamaydi" degan savol tug'ilmaydi.
   */
  async eliminationImpact({ from = null, to = null }: {
    from?: Date | null; to?: Date | null;
  } = {}) {
    const [gross, consolidated] = await Promise.all([
      this.pnl({ from, to, consolidated: false }),
      this.pnl({ from, to, consolidated: true }),
    ]);

    return {
      gross: gross.totals,
      consolidated: consolidated.totals,
      eliminated: {
        revenue: gross.totals.revenue - consolidated.totals.revenue,
        expense: gross.totals.expense - consolidated.totals.expense,
      },
    };
  }
}
