import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { branchFilter } from '../../common/als/branch-context.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KONVERSIYA TAQQOSLASH — `services/leadConversion.service.js` EKVIVALENTI.
 *
 * "Qaysi filial / qaysi admin lidni yaxshiroq o'quvchiga aylantiryapti".
 *
 * ══════════════════════════════════════════════════════════════════
 * ⚠⚠ MANBA: `statusHistory`, JORIY `status` EMAS
 * ══════════════════════════════════════════════════════════════════
 * Joriy `status` bo'yicha sanash NOTO'G'RI natija beradi: o'quvchiga
 * aylangan lid keyin arxivlanishi yoki statusi qo'lda o'zgartirilishi
 * mumkin — va u konversiya hisobidan JIMGINA tushib qolardi.
 *
 * `statusHistory[]` esa O'ZGARMAS IZ: "enrolled" bosqichiga BIR MARTA
 * yetgan lid HAR DOIM konvertatsiya qilingan hisoblanadi. Bu KPI
 * semantikasi va u o'zgartirilmasin.
 *
 * ══════════════════════════════════════════════════════════════════
 * NEGA IKKI KESIM
 * ══════════════════════════════════════════════════════════════════
 *   FILIAL bo'yicha  — "qaysi filial yaxshiroq ishlayapti"
 *   XODIM bo'yicha   — "kim yaxshiroq ishlayapti"
 * Ikkinchisi muhimroq: filial ko'rsatkichi bir necha odamning
 * yig'indisi va u yomon bo'lsa ham sababi noma'lum qoladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Lid "enrolled" bosqichiga yetganmi (TARIX bo'yicha). */
const wasEnrolled = (lead: any): boolean =>
  lead.status === 'enrolled' ||
  (lead.statusHistory || []).some((h: any) => h.status === 'enrolled');

/** Lid rad etilganmi (TARIX bo'yicha). */
const wasRejected = (lead: any): boolean =>
  lead.status === 'rejected' ||
  (lead.statusHistory || []).some((h: any) => h.status === 'rejected');

/**
 * ⚠ FOIZ IKKI XONALI ANIQLIKDA (`* 10000 / 100`) va bo'linuvchi 0
 * bo'lsa `null` (0 EMAS): "0% konversiya" bilan "ma'lumot yo'q" bir xil
 * ko'rinmasligi kerak — saralashda ular boshqacha joylashadi.
 */
const pct = (part: number, total: number): number | null =>
  total > 0 ? Math.round((part / total) * 10000) / 100 : null;

@Injectable()
export class LeadConversionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * FILIAL va XODIM kesimida konversiya.
   *
   * ⚠ FILIAL KO'LAMI QO'LLANADI: filial direktori FAQAT o'z raqamlarini
   * ko'radi. Owner "barcha filiallar" rejimida hammasini yonma-yon
   * oladi — taqqoslashning butun ma'nosi shu.
   */
  async conversion({ from = null, to = null }: {
    from?: Date | string | null; to?: Date | string | null;
  } = {}) {
    const match: Record<string, any> = { ...branchFilter() };
    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.gte = new Date(from);
      if (to) match.createdAt.lte = new Date(to);
    }

    const rows = await this.prisma.lead.findMany({
      where: match,
      select: {
        branchId: true,
        assignedToId: true,
        status: true,
        statusHistory: true,
      },
    });

    // Pastdagi mantiq eski `assignedTo` nomini kutadi — formulalarga
    // TEGMASLIK uchun shu yerda faqat nom moslashtiriladi.
    const leads = rows.map((l) => ({
      ...l,
      assignedTo: l.assignedToId,
      statusHistory: Array.isArray(l.statusHistory) ? l.statusHistory : [],
    }));

    const byBranch = new Map<string, any>();
    const byAssignee = new Map<string, any>();

    const bump = (map: Map<string, any>, key: string, lead: any) => {
      if (!key) return;
      const cur = map.get(key) || { total: 0, enrolled: 0, rejected: 0 };
      cur.total += 1;
      if (wasEnrolled(lead)) cur.enrolled += 1;
      else if (wasRejected(lead)) cur.rejected += 1;
      map.set(key, cur);
    };

    for (const lead of leads) {
      bump(byBranch, String(lead.branchId || ''), lead);
      // ⚠ BIRIKTIRILMAGAN lid XODIM kesimiga TUSHMAYDI — "hech kim" ni
      // konversiya bo'yicha baholab bo'lmaydi. Lekin FILIAL kesimida u
      // baribir sanaladi, aks holda filial ko'rsatkichi YAXSHIROQ
      // ko'rinardi (javobsiz lidlar hisobdan chiqib ketardi).
      if (lead.assignedTo) bump(byAssignee, String(lead.assignedTo), lead);
    }

    const branchIds = [...byBranch.keys()].filter(Boolean);
    const userIds = [...byAssignee.keys()].filter(Boolean);

    const [branches, users] = await Promise.all([
      branchIds.length
        ? this.prisma.branch.findMany({
            where: { id: { in: branchIds } },
            select: { id: true, name: true, code: true },
          })
        : [],
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true, firstName: true, lastName: true,
              username: true, homeBranchId: true,
            },
          })
        : [],
    ]);

    const branchMap = new Map(branches.map((b) => [String(b.id), b]));
    const userMap = new Map(users.map((u) => [String(u.id), u]));

    const shape = (row: any, meta: Record<string, unknown>) => ({
      ...meta,
      total: row.total,
      enrolled: row.enrolled,
      rejected: row.rejected,
      // Hali ochiq (na yozilgan, na rad etilgan) — "ishlanmoqda".
      open: row.total - row.enrolled - row.rejected,
      conversionPercent: pct(row.enrolled, row.total),
      rejectionPercent: pct(row.rejected, row.total),
    });

    const branchRows = [...byBranch.entries()]
      .filter(([k]) => k)
      .map(([k, row]) =>
        shape(row, {
          branchId: k,
          name: branchMap.get(k)?.name || '—',
          code: branchMap.get(k)?.code || '',
        }),
      )
      .sort((a, b) => (b.conversionPercent ?? -1) - (a.conversionPercent ?? -1));

    const assigneeRows = [...byAssignee.entries()]
      .map(([k, row]) => {
        const u = userMap.get(k);
        return shape(row, {
          userId: k,
          name: u ? `${u.firstName} ${u.lastName || ''}`.trim() : '—',
          username: u?.username || '',
          branchId: u?.homeBranchId ? String(u.homeBranchId) : null,
        });
      })
      .sort((a, b) => (b.conversionPercent ?? -1) - (a.conversionPercent ?? -1));

    const totals = leads.reduce(
      (acc, l) => ({
        total: acc.total + 1,
        enrolled: acc.enrolled + (wasEnrolled(l) ? 1 : 0),
        rejected: acc.rejected + (!wasEnrolled(l) && wasRejected(l) ? 1 : 0),
      }),
      { total: 0, enrolled: 0, rejected: 0 },
    );

    return {
      from,
      to,
      totals: {
        ...totals,
        open: totals.total - totals.enrolled - totals.rejected,
        conversionPercent: pct(totals.enrolled, totals.total),
      },
      branches: branchRows,
      assignees: assigneeRows,
    };
  }
}
