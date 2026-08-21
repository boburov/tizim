import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { branchFilter } from '../../common/als/branch-context.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOTUV TAHLILI — FILIALLAR KESIMIDA
 * (`branchAnalytics/services/branchSales.service.js` KO'CHIRMASI).
 *
 * ── NEGA ALOHIDA ENDPOINT ──
 * `/leads/stats` allaqachon bor, lekin u BITTA ko'lam ichida ishlaydi.
 * Rahbariyat ekranidagi savol boshqa — "QAYSI filial ko'proq o'quvchi
 * olib kelyapti va QAYSI kanal orqali".
 *
 * ── ⚠ IKKI SANA IKKI XIL SAVOLGA JAVOB BERADI — ARALASHTIRILMAYDI ──
 *   `createdAt`   — lid QACHON KELDI     → "voronkaga nechta kirdi"
 *   `convertedAt` — lid QACHON O'QUVCHI  → "nechtasi pul keltirdi"
 *
 * Konversiya foizi ATAYLAB BITTA KOGORTADAN hisoblanadi. Agar maxraj
 * "davrda kelgan", surat esa "davrda aylangan" bo'lsa, IKKI XIL odamlar
 * to'plami taqqoslanardi va oy oxirida kelgan lid hali qaror qilishga
 * ulgurmagani uchun konversiya SUN'IY ravishda PAST ko'rinardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const ENROLLED = 'enrolled';
const REJECTED = 'rejected';

/** Nolga bo'lishdan himoyalangan foiz (2 xona aniqlik). */
const pct = (part: number, whole: number): number | null =>
  (whole > 0 ? Math.round((part / whole) * 10000) / 100 : null);

const rangeWhere = (field: string, from?: Date | null, to?: Date | null) => {
  const r: any = {};
  if (from) r.gte = from;
  if (to) r.lte = to;
  return Object.keys(r).length ? { [field]: r } : {};
};

@Injectable()
export class BranchSalesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async sales({ from = null, to = null }: {
    from?: Date | null; to?: Date | null;
  } = {}) {
    const scope = branchFilter();

    // ── KOGORTA: davr ichida KELGAN lidlar ──
    // ⚠ Guruhlash JS'da: bir necha kesim kerak (status, manba, konversiya
    // vaqti) va har biri uchun alohida `groupBy` yuborish AYNI qatorlarni
    // to'rt marta o'qish bo'lardi.
    const cohort = await this.prisma.lead.findMany({
      where: { ...scope, ...rangeWhere('createdAt', from, to) } as never,
      select: {
        branchId: true, status: true, sourceId: true,
        createdAt: true, convertedAt: true,
      },
    });

    // ── DAVR NATIJASI: davr ichida AYLANGAN lidlar ──
    // `convertedAt` bo'yicha, ya'ni ular BOSHQA oyda kelgan bo'lishi
    // mumkin. Sotuv jamoasining OYLIK natijasi aynan shu.
    const convertedRows = await this.prisma.lead.groupBy({
      by: ['branchId'],
      where: {
        ...scope,
        status: ENROLLED,
        convertedAt: { not: null },
        ...rangeWhere('convertedAt', from, to),
      } as never,
      _count: { _all: true },
    });
    const convertedMap = new Map(
      convertedRows.map((r: any) => [String(r.branchId), r._count._all]),
    );

    // Manba nomlari — `sourceId` NULL bo'lishi mumkin ("manbasiz lid").
    const sourceIds = [
      ...new Set(cohort.map((l) => l.sourceId).filter(Boolean).map(String)),
    ];
    const sources = sourceIds.length
      ? await this.prisma.leadOption.findMany({
          where: { id: { in: sourceIds } },
          select: { id: true, name: true },
        })
      : [];
    const sourceName = new Map(sources.map((s) => [String(s.id), s.name]));

    const byBranch = new Map<string, any>();
    const ensure = (k: string) => {
      if (!byBranch.has(k)) {
        byBranch.set(k, {
          branchId: k,
          leads: 0,
          cohortEnrolled: 0,
          rejected: 0,
          // Hali yopilmagan — ular hozircha "yo'qotilgan" ham,
          // "yutilgan" ham emas.
          open: 0,
          daysSum: 0,
          daysCount: 0,
          sources: new Map<string, any>(),
        });
      }
      return byBranch.get(k);
    };

    for (const lead of cohort) {
      const b = ensure(String(lead.branchId));
      b.leads += 1;

      if (lead.status === ENROLLED) b.cohortEnrolled += 1;
      else if (lead.status === REJECTED) b.rejected += 1;
      else b.open += 1;

      // ⚠ KONVERSIYA TEZLIGI faqat `convertedAt` BOR lidlardan. Eski
      // yozuvlarda u bo'sh bo'lishi mumkin (maydon keyin qo'shilgan) va
      // 0 kun deb qo'shilsa o'rtacha SUN'IY ravishda pasayardi.
      if (lead.status === ENROLLED && lead.convertedAt && lead.createdAt) {
        const days =
          (new Date(lead.convertedAt).getTime() - new Date(lead.createdAt).getTime())
          / 86400000;
        // Manfiy farq — ma'lumot nuqsoni (qo'lda kiritilgan sana).
        // Uni TASHLAB YUBORAMIZ, tuzatmaymiz.
        if (days >= 0) {
          b.daysSum += days;
          b.daysCount += 1;
        }
      }

      const sk = lead.sourceId ? String(lead.sourceId) : '';
      const s = b.sources.get(sk) || { sourceId: sk || null, leads: 0, enrolled: 0 };
      s.leads += 1;
      if (lead.status === ENROLLED) s.enrolled += 1;
      b.sources.set(sk, s);
    }

    // ⚠ Davrda aylangani BOR, lekin davrda LIDI YO'Q filial ham chiqishi
    // kerak — aks holda "o'tgan oy lidlaridan bu oy 5 ta yozildi" degan
    // natija BUTUNLAY yo'qolardi.
    for (const k of convertedMap.keys()) ensure(k);

    const ids = [...byBranch.keys()];
    if (!ids.length) return [];

    const branches = await this.prisma.branch.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, code: true },
    });
    const branchMap = new Map(branches.map((b) => [String(b.id), b]));

    return [...byBranch.values()]
      .map((b) => {
        const meta: any = branchMap.get(b.branchId) || {};
        return {
          branchId: b.branchId,
          name: meta.name || '',
          code: meta.code || '',

          // Voronka (davr ichida kelganlar)
          leads: b.leads,
          enrolled: b.cohortEnrolled,
          rejected: b.rejected,
          open: b.open,
          // ⚠ Lid yo'q bo'lsa `null` — "0% konversiya" degan AYBLOV emas,
          // "hisoblab bo'lmaydi" degan holat.
          conversionPercent: pct(b.cohortEnrolled, b.leads),

          // Sotuv jamoasining davr natijasi (kogortadan MUSTAQIL)
          enrolledInRange: convertedMap.get(b.branchId) || 0,

          avgDaysToConvert:
            b.daysCount > 0 ? Math.round((b.daysSum / b.daysCount) * 10) / 10 : null,

          // Kanal kesimi — eng ko'p lid bergani birinchi
          bySource: [...b.sources.values()]
            .map((s: any) => ({
              sourceId: s.sourceId,
              // ⚠ Manbasi ko'rsatilmagan lidlar ALOHIDA qator bo'lib
              // qoladi: ularni yashirish "kanal bo'yicha jami" ni umumiy
              // jamidan kichik qilib, raqamlarni bir-biriga to'g'ri
              // kelmaydigan holga keltirardi.
              name: s.sourceId ? sourceName.get(s.sourceId) || '—' : "Ko'rsatilmagan",
              leads: s.leads,
              enrolled: s.enrolled,
              conversionPercent: pct(s.enrolled, s.leads),
            }))
            .sort((a: any, b2: any) => b2.leads - a.leads),
        };
      })
      .sort((a, b) => b.leads - a.leads);
  }
}
