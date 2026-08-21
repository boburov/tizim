import prisma from "../../../config/prisma.js";
import { branchFilter } from "../../../helpers/branchContext.helper.js";

/**
 * SOTUV TAHLILI - FILIALLAR KESIMIDA.
 *
 * ══════════════════════════════════════════════════════════════════
 * NEGA ALOHIDA ENDPOINT
 *
 * `/leads/stats` allaqachon bor, lekin u BITTA ko'lam ichida ishlaydi:
 * "barcha filiallar" rejimida hamma lidni bitta raqamga qo'shib beradi.
 * Rahbariyat ekranidagi savol esa boshqa - "QAYSI filial ko'proq
 * o'quvchi olib kelyapti va QAYSI kanal orqali". Bu savol javobini
 * filial bo'yicha AJRATILGAN holda talab qiladi.
 * ══════════════════════════════════════════════════════════════════
 *
 * ══════════════════════════════════════════════════════════════════
 * IKKI SANA IKKI XIL SAVOLGA JAVOB BERADI - ARALASHTIRILMAYDI
 *
 *   createdAt   - lid QACHON KELDI      -> "voronkaga nechta kirdi"
 *   convertedAt - lid QACHON O'QUVCHI   -> "nechtasi pul keltirdi"
 *                 BO'LDI
 *
 * Konversiya foizi ATAYLAB bitta kogortadan hisoblanadi: DAVR ICHIDA
 * KELGAN lidlarning nechtasi (keyinchalik) o'quvchiga aylandi.
 *
 * Agar maxraj "davrda kelgan", surat esa "davrda aylangan" bo'lsa,
 * ikki xil odamlar to'plami taqqoslanardi va oy oxirida kelgan lid
 * hali qaror qilishga ulgurmagani uchun konversiya sun'iy ravishda
 * PAST ko'rinardi. Aksincha, uzoq davr olinganda 100% dan oshib
 * ketishi ham mumkin edi.
 *
 * Shu sababli `enrolled` ustuni ikki xil o'qiladi:
 *   cohortEnrolled - shu davr lidlaridan aylanganlar (konversiya uchun)
 *   enrolledInRange - shu davrda aylanganlar, qachon kelganidan qat'i
 *                     nazar (sotuv jamoasining OYLIK natijasi)
 * ══════════════════════════════════════════════════════════════════
 */

const ENROLLED = "enrolled";
const REJECTED = "rejected";

/** Nolga bo'lishdan himoyalangan foiz (2 xona aniqlik). */
const pct = (part, whole) =>
  whole > 0 ? Math.round((part / whole) * 10000) / 100 : null;

const rangeWhere = (field, from, to) => {
  const r = {};
  if (from) r.gte = from;
  if (to) r.lte = to;
  return Object.keys(r).length ? { [field]: r } : {};
};

export const sales = async ({ from = null, to = null } = {}) => {
  const scope = branchFilter();

  // ── KOGORTA: davr ichida KELGAN lidlar ──
  // Statusi bilan birga o'qiladi - guruhlashni JS'da qilamiz, chunki
  // bir necha kesim kerak (status, manba, konversiya vaqti) va ularning
  // har biri uchun alohida `groupBy` yuborish bir xil qatorlarni
  // to'rt marta o'qish bo'lardi.
  const cohort = await prisma.lead.findMany({
    where: { ...scope, ...rangeWhere("createdAt", from, to) },
    select: {
      branchId: true,
      status: true,
      sourceId: true,
      createdAt: true,
      convertedAt: true,
    },
  });

  // ── DAVR NATIJASI: davr ichida AYLANGAN lidlar ──
  // `convertedAt` bo'yicha, ya'ni ular boshqa oyda kelgan bo'lishi
  // mumkin. Sotuv jamoasining oylik natijasi aynan shu.
  const convertedRows = await prisma.lead.groupBy({
    by: ["branchId"],
    where: {
      ...scope,
      status: ENROLLED,
      convertedAt: { not: null },
      ...rangeWhere("convertedAt", from, to),
    },
    _count: { _all: true },
  });
  const convertedMap = new Map(
    convertedRows.map((r) => [String(r.branchId), r._count._all]),
  );

  // Manba nomlari - `sourceId` NULL bo'lishi mumkin ("manbasiz lid").
  const sourceIds = [
    ...new Set(cohort.map((l) => l.sourceId).filter(Boolean).map(String)),
  ];
  const sources = sourceIds.length
    ? await prisma.leadOption.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, name: true },
      })
    : [];
  const sourceName = new Map(sources.map((s) => [String(s.id), s.name]));

  // ── FILIAL BO'YICHA YIG'ISH ──
  const byBranch = new Map();
  const ensure = (k) => {
    if (!byBranch.has(k)) {
      byBranch.set(k, {
        branchId: k,
        leads: 0,
        cohortEnrolled: 0,
        rejected: 0,
        // Hali yopilmagan - ular hozircha "yo'qotilgan" ham,
        // "yutilgan" ham emas.
        open: 0,
        // Konversiya tezligi uchun kunlar yig'indisi + sanoq.
        daysSum: 0,
        daysCount: 0,
        sources: new Map(),
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

    // KONVERSIYA TEZLIGI faqat `convertedAt` bor lidlardan.
    // Eski yozuvlarda u bo'sh bo'lishi mumkin (maydon keyin qo'shilgan),
    // shunda o'rtacha hisobga UMUMAN kirmaydi - 0 kun deb qo'shilsa
    // o'rtacha sun'iy ravishda pasayardi.
    if (lead.status === ENROLLED && lead.convertedAt && lead.createdAt) {
      const days = (lead.convertedAt - lead.createdAt) / 86400000;
      // Manfiy farq - ma'lumot nuqsoni (qo'lda kiritilgan sana).
      // Uni tashlab yuboramiz, tuzatmaymiz.
      if (days >= 0) {
        b.daysSum += days;
        b.daysCount += 1;
      }
    }

    const sk = lead.sourceId ? String(lead.sourceId) : "";
    const s = b.sources.get(sk) || { sourceId: sk || null, leads: 0, enrolled: 0 };
    s.leads += 1;
    if (lead.status === ENROLLED) s.enrolled += 1;
    b.sources.set(sk, s);
  }

  // Davrda aylangani bor, lekin davrda lidi yo'q filial ham chiqishi
  // kerak - aks holda "o'tgan oy lidlaridan bu oy 5 ta yozildi" degan
  // natija butunlay yo'qolardi.
  for (const k of convertedMap.keys()) ensure(k);

  const ids = [...byBranch.keys()];
  if (!ids.length) return [];

  const branches = await prisma.branch.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, code: true },
  });
  const branchMap = new Map(branches.map((b) => [String(b.id), b]));

  return [...byBranch.values()]
    .map((b) => {
      const meta = branchMap.get(b.branchId) || {};
      return {
        branchId: b.branchId,
        name: meta.name || "",
        code: meta.code || "",

        // Voronka (davr ichida kelganlar)
        leads: b.leads,
        enrolled: b.cohortEnrolled,
        rejected: b.rejected,
        open: b.open,
        // Lid yo'q bo'lsa null - "0% konversiya" degan ayblov emas,
        // "hisoblab bo'lmaydi" degan holat.
        conversionPercent: pct(b.cohortEnrolled, b.leads),

        // Sotuv jamoasining davr natijasi (kogortadan mustaqil)
        enrolledInRange: convertedMap.get(b.branchId) || 0,

        // O'rtacha necha kunda o'quvchiga aylanadi
        avgDaysToConvert:
          b.daysCount > 0
            ? Math.round((b.daysSum / b.daysCount) * 10) / 10
            : null,

        // Kanal kesimi - eng ko'p lid bergani birinchi
        bySource: [...b.sources.values()]
          .map((s) => ({
            sourceId: s.sourceId,
            // Manbasi ko'rsatilmagan lidlar ALOHIDA qator bo'lib
            // qoladi: ularni yashirish "kanal bo'yicha jami" ni
            // umumiy jamidan kichik qilib, raqamlarni bir-biriga
            // to'g'ri kelmaydigan holga keltirardi.
            name: s.sourceId ? sourceName.get(s.sourceId) || "—" : "Ko'rsatilmagan",
            leads: s.leads,
            enrolled: s.enrolled,
            conversionPercent: pct(s.enrolled, s.leads),
          }))
          .sort((a, b2) => b2.leads - a.leads),
      };
    })
    .sort((a, b) => b.leads - a.leads);
};
