import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHIQIB KETISH (CHURN) TAHLILI — `services/retention.service.js`
 * EKVIVALENTI.
 *
 * Tushunchalar:
 *  • "Tark etgan" = `leftReason: "removed"` (haqiqatan chiqib ketgan).
 *    `transferred` = boshqa guruhga ko'chirildi (churn EMAS),
 *    `graduated`   = kursni bitirdi (ijobiy, churn EMAS).
 *  • Davomiylik = `leftAt - joinedAt` (oyda).
 *  • Sabab = `leftReasonTitle` surati (yo'q bo'lsa "Sababsiz").
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠⚠ MA'LUM KAMCHILIK — FILIAL KO'LAMI BU SERVISDA YO'Q (B24) ⚠⚠
 *
 * `/retention` va `/churned-students` HECH QANDAY filial filtri
 * qo'llamaydi: `buildLeftRange` faqat `leftReason`/`leftAt`/`isDeleted`
 * bo'yicha filtrlaydi. Ya'ni filial direktori BUTUN TASHKILOTNING
 * chiqib ketgan o'quvchilarini — ism, familiya, login, guruh nomi va
 * o'qituvchisi bilan — ko'radi.
 *
 * Qo'shni servislar buni ATAYLAB qo'shgan:
 *   `adminDashboard.service.js`  — 18 marta ko'lam helperi
 *   `studentStats.service.js`    — ochiq izoh bilan TUZATILGAN
 * Bu fayl esa chetda qolgan.
 *
 * ⚠ BU YERDA TUZATILMADI — sabab: ko'chirish ishi xatti-harakatni
 * O'ZGARTIRMASLIGI kerak. Filtr qo'shilsa NestJS Express'dan boshqa
 * (kamroq) natija qaytarardi, ya'ni paritet ataylab buzilardi va
 * xatolik "ko'chirish regressiyasi" bo'lib ko'rinardi.
 *
 * Test bu holatni QULFLAYDI va uni "ko'lam ishlayapti" deb EMAS,
 * "MA'LUM SIZISH" deb belgilaydi. Tuzatish alohida qaror va u
 * `MIGRATION-CHECKLIST.md` (B24) da qayd etilgan.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;
/** O'rtacha oy uzunligi (365.25 / 12) — Express bilan AYNAN bir xil. */
const DAYS_PER_MONTH = 30.4375;

/** Ikki sana orasidagi oy farqi (KASR bilan — o'rtacha hisob uchun). */
const monthsBetween = (from: Date, to: Date): number =>
  (new Date(to).getTime() - new Date(from).getTime()) / MS_PER_DAY / DAYS_PER_MONTH;

/** O'rtacha / median davomiylik. */
const summarizeDurations = (durations: number[]) => {
  if (durations.length === 0) return { avgMonths: 0, medianMonths: 0 };
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((s, d) => s + d, 0);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    avgMonths: Math.round((sum / sorted.length) * 10) / 10,
    medianMonths: Math.round(median * 10) / 10,
  };
};

/** Tark etishdan oldin qancha o'qishgan — kohortalar. */
const buildDurationBuckets = (durations: number[]) => {
  const defs = [
    { key: '0-1', label: '0-1 oy', min: 0, max: 1 },
    { key: '1-3', label: '1-3 oy', min: 1, max: 3 },
    { key: '3-6', label: '3-6 oy', min: 3, max: 6 },
    { key: '6-12', label: '6-12 oy', min: 6, max: 12 },
    { key: '12+', label: '1 yildan ortiq', min: 12, max: null as number | null },
  ];
  const counts: Record<string, number> = Object.fromEntries(defs.map((d) => [d.key, 0]));
  for (const m of durations) {
    const d = defs.find((b) => m >= b.min && (b.max === null || m < b.max));
    if (d) counts[d.key] += 1;
  }
  return defs.map((d) => ({ key: d.key, label: d.label, count: counts[d.key] }));
};

@Injectable()
export class RetentionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * `leftAt` diapazon filtri.
   *
   * ⚠ `leftAt` NULLABLE, ya'ni `not: null` bu yerda RUXSAT ETILGAN.
   * Oraliq berilsa `not` bilan BIR obyektda birga turadi — Mongo'da
   * `leftAt` kaliti QAYTA YOZILARDI, Prisma'da esa shartlar BIRLASHADI.
   *
   * ⚠ FILIAL FILTRI YO'Q — fayl boshidagi B24 izohiga qarang.
   */
  private buildLeftRange(fromDate?: Date | string, toDate?: Date | string) {
    const leftAt: Record<string, any> = { not: null };
    if (fromDate) leftAt.gte = new Date(fromDate);
    if (toDate) leftAt.lte = new Date(toDate);
    return { leftReason: 'removed', leftAt, isDeleted: false };
  }

  /** Tark etgan a'zoliklarni guruh (+o'qituvchilar) bilan yuklaydi. */
  private async loadChurnedMemberships(fromDate?: Date | string, toDate?: Date | string) {
    const rows = await this.prisma.groupMembership.findMany({
      where: this.buildLeftRange(fromDate, toDate) as never,
      select: {
        id: true,
        joinedAt: true,
        leftAt: true,
        leftReasonTitle: true,
        // `teachers` KO'P-KO'PGA: Mongo'da guruh hujjati ichidagi
        // ObjectId massivi edi, bu yerda alohida jadval.
        group: { select: { id: true, name: true, teachers: { select: { id: true } } } },
        leftReasonDetail: { select: { id: true, title: true, isActive: true } },
      },
    });

    // Guruh o'chirilgan bo'lsa (null) — tashlab yuboramiz.
    return rows.filter((m: any) => m.group && m.joinedAt && m.leftAt);
  }

  /**
   * Chiqib ketgan o'quvchilar RO'YXATI (kartaga bosilganda modalda).
   *
   * ⚠ Bu javob PII o'z ichiga oladi: ism, familiya, LOGIN. Filial
   * filtri yo'qligi (B24) aynan shu yerda eng sezilarli.
   */
  async getChurnedStudents({ fromDate, toDate }: {
    fromDate?: Date | string; toDate?: Date | string;
  } = {}) {
    const rows = await this.prisma.groupMembership.findMany({
      where: this.buildLeftRange(fromDate, toDate) as never,
      select: {
        id: true,
        joinedAt: true,
        leftAt: true,
        leftReasonTitle: true,
        group: { select: { name: true } },
        student: {
          select: { id: true, firstName: true, lastName: true, username: true },
        },
      },
      orderBy: { leftAt: 'desc' },
    });

    return rows
      .filter((m: any) => m.student && m.joinedAt && m.leftAt)
      .map((m: any) => ({
        membershipId: String(m.id),
        studentId: String(m.student.id),
        studentName: `${m.student.firstName} ${m.student.lastName}`,
        username: m.student.username,
        groupName: m.group?.name || "(o'chirilgan)",
        durationMonths: Math.round(monthsBetween(m.joinedAt, m.leftAt) * 10) / 10,
        reasonTitle: m.leftReasonTitle || 'Sababsiz',
        leftAt: m.leftAt,
      }));
  }

  async getRetentionStats({ fromDate, toDate }: {
    fromDate?: Date | string; toDate?: Date | string;
  } = {}) {
    const memberships = await this.loadChurnedMemberships(fromDate, toDate);

    const allDurations: number[] = [];
    const byReason = new Map<string, any>();
    const byTeacher = new Map<string, any>();

    for (const m of memberships as any[]) {
      const months = Math.max(0, monthsBetween(m.joinedAt, m.leftAt));
      allDurations.push(months);

      // --- Sabab bo'yicha ---
      const title = m.leftReasonTitle || 'Sababsiz';
      const reasonId = m.leftReasonDetail?.id ? String(m.leftReasonDetail.id) : null;
      if (!byReason.has(title)) {
        byReason.set(title, { reasonId, title, count: 0, durations: [] });
      }
      const r = byReason.get(title);
      r.count += 1;
      r.durations.push(months);

      // --- O'qituvchi bo'yicha ---
      // ⚠ Guruhda bir nechta o'qituvchi bo'lsa HAR BIRIGA sanaladi;
      // o'qituvchisiz guruh "none" kaliti ostida yig'iladi.
      const teachers = m.group.teachers?.length ? m.group.teachers : [null];
      for (const t of teachers) {
        const key = t ? String(t.id) : 'none';
        if (!byTeacher.has(key)) {
          byTeacher.set(key, {
            teacherId: t ? String(t.id) : null,
            count: 0,
            durations: [],
            reasons: new Map(),
          });
        }
        const tr = byTeacher.get(key);
        tr.count += 1;
        tr.durations.push(months);
        tr.reasons.set(title, (tr.reasons.get(title) || 0) + 1);
      }
    }

    const overall = summarizeDurations(allDurations);

    const reasons = [...byReason.values()]
      .map((r) => ({
        reasonId: r.reasonId,
        title: r.title,
        count: r.count,
        avgDurationMonths: summarizeDurations(r.durations).avgMonths,
      }))
      .sort((a, b) => b.count - a.count);

    const teacherRows = [...byTeacher.values()]
      .map((t) => ({
        teacherId: t.teacherId,
        churnedCount: t.count,
        avgDurationMonths: summarizeDurations(t.durations).avgMonths,
        // Har o'qituvchi uchun eng ko'p uchragan 3 ta sabab.
        topReasons: [...t.reasons.entries()]
          .map(([title, count]) => ({ title, count }))
          .sort((a: any, b: any) => b.count - a.count)
          .slice(0, 3),
      }))
      .sort((a, b) => b.churnedCount - a.churnedCount);

    // O'qituvchi ismlarini BITTA so'rovda boyitamiz.
    const teacherIds = teacherRows.map((t) => t.teacherId).filter(Boolean) as string[];
    const teacherDocs = teacherIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: teacherIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameMap = new Map(
      teacherDocs.map((u) => [String(u.id), `${u.firstName} ${u.lastName}`]),
    );
    const teachers = teacherRows.map((t) => ({
      ...t,
      teacherName: t.teacherId
        ? nameMap.get(t.teacherId) || "(o'chirilgan)"
        : "O'qituvchisiz",
    }));

    return {
      totalChurned: memberships.length,
      avgDurationMonths: overall.avgMonths,
      medianDurationMonths: overall.medianMonths,
      reasons,
      teachers,
      durationBuckets: buildDurationBuckets(allDurations),
    };
  }
}
