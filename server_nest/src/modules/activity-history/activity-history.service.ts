import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { assertTargetInScope } from '../../common/rbac/branch-access.service.js';
import { ROLES } from '../../common/constants/permissions.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAOLIYAT TARIXI (ARXIV) — `services/activityHistory.service.js` EKVIVALENTI.
 *
 * ⚠ BU MODUL HECH NARSA YOZMAYDI. Hodisalar oqimi mavjud domen
 * yozuvlaridan O'QISH VAQTIDA yig'iladi — alohida "hodisa jurnali"
 * jadvali YO'Q. Shuning uchun o'tmishdagi ma'lumot ham avtomatik
 * ko'rinadi va yozish yo'llari (write-path) umuman o'zgarmaydi.
 *
 * ⚠ FILIAL CHEGARASI SHART: bu modul ilgari owner-only edi, endi
 * `activity_logs.read` ga ochilgan, ya'ni filial direktori ham kiradi.
 * Timeline o'quvchining BUTUN tarixini beradi — to'lovlar, qarz
 * hisobdan chiqarishlar, depozitlar — shuning uchun boshqa filial
 * o'quvchisiga kirish TO'SILADI.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Chiqish sababi bo'yicha "guruhdan chiqdi" hodisasi sarlavhasi. */
const LEFT_TITLE: Record<string, string> = {
  removed: 'Guruhdan chiqarildi',
  graduated: 'Guruhni bitirdi',
  transferred: "Boshqa guruhga o'tkazildi",
};

const DEPOSIT_TITLE: Record<string, string> = {
  topup: "Depozit to'ldirildi",
  withdraw: 'Depozitdan yechildi',
  refund: 'Depozitga qaytarildi',
};

const monthLabel = (year: number, month: number) => `${month}-oy, ${year}`;

// ⚠ `export` SHART: kontroller metodlarining QAYTISH TURI shu
// interfeysga tayanadi. Eksport qilinmasa TypeScript uni nomlay
// olmaydi (TS4053) va `nest build` yiqiladi.
export interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  date: Date | null;
  performedBy: any;
  student: any;
  group: any;
  amount: any;
}

/** Bitta hodisa obyekti (frontend `type` ga qarab ikon/tus chizadi). */
const makeEvent = ({
  id, type, title, description = '', date,
  performedBy = null, student = null, group = null, amount = null,
}: Partial<TimelineEvent> & { id: string; type: string; title: string }): TimelineEvent => ({
  id,
  type,
  title,
  description,
  date: date || null,
  performedBy: performedBy || null,
  student: student || null,
  group: group || null,
  amount: amount ?? null,
});

const groupRef = (g: any) => (g ? { _id: g.id, name: g.name } : null);
const userRef = (u: any) =>
  u ? { _id: u.id, firstName: u.firstName, lastName: u.lastName } : null;

@Injectable()
export class ActivityHistoryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * `performedBy` ID'larini (turli manbalardan) BITTA so'rovda ism
   * bilan to'ldiradi — aks holda har hodisa uchun alohida so'rov
   * ketardi (N+1).
   */
  private async resolvePerformers(events: TimelineEvent[]): Promise<void> {
    const ids = new Set<string>();
    for (const e of events) {
      if (e.performedBy && typeof e.performedBy !== 'object') ids.add(String(e.performedBy));
    }
    if (ids.size === 0) return;
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const map = new Map(users.map((u) => [String(u.id), u]));
    for (const e of events) {
      if (e.performedBy && typeof e.performedBy !== 'object') {
        e.performedBy = userRef(map.get(String(e.performedBy))) || null;
      }
    }
  }

  /** Yangi → eski tartib, keyin sahifalash. `total` = umumiy hodisalar soni. */
  private paginate(events: TimelineEvent[], page: number, limit: number) {
    events.sort((a, b) => {
      const ta = a.date ? new Date(a.date).getTime() : 0;
      const tb = b.date ? new Date(b.date).getTime() : 0;
      return tb - ta;
    });
    const total = events.length;
    const start = (page - 1) * limit;
    return { items: events.slice(start, start + limit), total, page, limit };
  }

  private membershipEvents(m: any, { withStudent = false } = {}): TimelineEvent[] {
    const out: TimelineEvent[] = [];
    const g = groupRef(m.group);
    const s = withStudent ? userRef(m.student) : null;
    out.push(
      makeEvent({
        id: `mem-join:${m.id}`,
        type: 'student_joined_group',
        title: "Guruhga qo'shildi",
        // Guruh/o'quvchi nomi "chip"da ko'rsatiladi — tavsifda takrorlamaymiz.
        description: '',
        date: m.joinedAt,
        group: g,
        student: s,
      }),
    );
    if (m.leftAt) {
      out.push(
        makeEvent({
          id: `mem-left:${m.id}`,
          type: 'student_left_group',
          title: LEFT_TITLE[m.leftReason] || 'Guruhdan chiqdi',
          description: m.leftReasonTitle || '',
          date: m.leftAt,
          group: g,
          student: s,
        }),
      );
    }
    return out;
  }

  private freezeEvents(f: any, { withStudent = false } = {}): TimelineEvent[] {
    const s = withStudent ? userRef(f.student) : null;
    const out: TimelineEvent[] = [
      makeEvent({
        id: `freeze:${f.id}`,
        type: 'student_frozen',
        title: 'Muzlatildi',
        description: f.reason || '',
        date: f.startDate,
        performedBy: f.createdBy || null,
        student: s,
      }),
    ];
    if (f.endDate) {
      out.push(
        makeEvent({
          id: `unfreeze:${f.id}`,
          type: 'student_unfrozen',
          title: 'Muzlatishdan chiqarildi',
          date: f.endDate,
          performedBy: f.endedBy || null,
          student: s,
        }),
      );
    }
    return out;
  }

  /**
   * ⚠ `PaymentTransaction` ning YUMSHOQ O'CHIRILGANI = BEKOR QILINGAN
   * to'lov. Shuning uchun to'lovlar `isDeleted` bo'yicha FILTRLANMAYDI —
   * bekor qilish ham tarixdagi hodisa.
   */
  private paymentEvent(t: any, { withStudent = false } = {}): TimelineEvent {
    const s = withStudent ? userRef(t.student) : null;
    const g = groupRef(t.group);
    const period = monthLabel(t.year, t.month);
    const methodLabel =
      t.source === 'deposit' ? 'Depozitdan' : t.method === 'card' ? 'Karta' : 'Naqd';
    if (t.isDeleted) {
      return makeEvent({
        id: `pay-void:${t.id}`,
        type: 'payment_cancelled',
        title: "To'lov bekor qilindi",
        description: `${period} · ${methodLabel}`,
        date: t.deletedAt || t.updatedAt,
        performedBy: t.deletedBy || null,
        student: s,
        group: g,
        amount: t.amount,
      });
    }
    return makeEvent({
      id: `pay:${t.id}`,
      type: 'payment_received',
      title: "To'lov qabul qilindi",
      description: `${period} · ${methodLabel}`,
      date: t.paidAt,
      performedBy: t.createdBy || null,
      student: s,
      group: g,
      amount: t.amount,
    });
  }

  private writeOffEvent(w: any, { withStudent = false } = {}): TimelineEvent {
    const s = withStudent
      ? userRef(w.student) || (w.studentName ? { name: w.studentName } : null)
      : null;
    return makeEvent({
      id: `writeoff:${w.id}`,
      type: 'debt_written_off',
      title: 'Qarz hisobdan chiqarildi',
      description: w.reasonTitle || w.groupName || '',
      date: w.createdAt,
      performedBy: w.createdBy || null,
      student: s,
      group: groupRef(w.group),
      amount: w.amount,
    });
  }

  private depositEvent(d: any): TimelineEvent {
    return makeEvent({
      id: `deposit:${d.id}`,
      type: `deposit_${d.type}`,
      title: DEPOSIT_TITLE[d.type] || 'Depozit amali',
      description: d.note || '',
      date: d.paidAt,
      performedBy: d.createdBy || null,
      amount: d.amount,
    });
  }

  private archiveLogEvent(a: any): TimelineEvent {
    return makeEvent({
      id: `archivelog:${a.id}`,
      type: a.action === 'restore' ? 'user_restored' : 'user_archived',
      title: a.action === 'restore' ? 'Arxivdan tiklandi' : 'Arxivlandi',
      description: a.reasonTitle || '',
      date: a.createdAt,
      performedBy: a.performedBy || null,
    });
  }

  private teacherPeriodEvents(tp: any): TimelineEvent[] {
    const out: TimelineEvent[] = [
      makeEvent({
        id: `tp-start:${tp.id}`,
        type: 'teacher_assigned',
        title: "O'qituvchi biriktirildi",
        description: tp.teacher ? `${tp.teacher.firstName} ${tp.teacher.lastName}`.trim() : '',
        date: tp.startDate,
        performedBy: tp.createdBy || null,
      }),
    ];
    if (tp.endDate) {
      out.push(
        makeEvent({
          id: `tp-end:${tp.id}`,
          type: 'teacher_unassigned',
          title: "O'qituvchi olib tashlandi",
          description: tp.teacher ? `${tp.teacher.firstName} ${tp.teacher.lastName}`.trim() : '',
          date: tp.endDate,
          performedBy: tp.updatedBy || null,
        }),
      );
    }
    return out;
  }

  // ═══════════════════ O'QUVCHI TIMELINE ═══════════════════

  async getStudentTimeline(
    studentId: string,
    { page = 1, limit = 30, scope = null }: {
      page?: number; limit?: number;
      scope?: { allowedBranchIds?: string[]; canSeeAllBranches?: boolean } | null;
    } = {},
  ) {
    const student = await this.prisma.user.findUnique({
      where: { id: String(studentId) },
    });
    if (!student || student.role !== ROLES.STUDENT) {
      throw new ApiError(404, "O'quvchi topilmadi");
    }

    // ⚠ FILIAL CHEGARASI — yuqoridagi izohga qarang.
    if (scope) {
      assertTargetInScope(
        scope.allowedBranchIds,
        scope.canSeeAllBranches,
        student as never,
      );
    }

    const [memberships, freezes, txns, writeOffs, deposits, archiveLogs] =
      await Promise.all([
        this.prisma.groupMembership.findMany({
          where: { studentId: String(studentId), isDeleted: false },
          include: { group: { select: { id: true, name: true } } },
        }),
        this.prisma.studentFreeze.findMany({
          where: { studentId: String(studentId), isDeleted: false },
        }),
        // ⚠ `isDeleted` FILTRLANMAYDI — bekor qilingan to'lov ham hodisa.
        this.prisma.paymentTransaction.findMany({
          where: { studentId: String(studentId) },
          include: { group: { select: { id: true, name: true } } },
        }),
        this.prisma.debtWriteOff.findMany({
          where: { studentId: String(studentId) },
          include: { group: { select: { id: true, name: true } } },
        }),
        this.prisma.depositTransaction.findMany({
          where: { studentId: String(studentId), isDeleted: false },
        }),
        this.prisma.archiveLog.findMany({ where: { userId: String(studentId) } }),
      ]);

    const events: TimelineEvent[] = [];
    for (const m of memberships) events.push(...this.membershipEvents(m));
    for (const f of freezes) events.push(...this.freezeEvents(f));
    for (const t of txns) events.push(this.paymentEvent(t));
    for (const w of writeOffs) events.push(this.writeOffEvent(w));
    for (const d of deposits) events.push(this.depositEvent(d));
    for (const a of archiveLogs) events.push(this.archiveLogEvent(a));

    await this.resolvePerformers(events);
    return this.paginate(events, page, limit);
  }

  // ═══════════════════ GURUH TIMELINE ═══════════════════

  async getGroupTimeline(
    groupId: string,
    { page = 1, limit = 30, scope = null }: {
      page?: number; limit?: number;
      scope?: { allowedBranchIds?: string[]; canSeeAllBranches?: boolean } | null;
    } = {},
  ) {
    const group = await this.prisma.group.findUnique({ where: { id: String(groupId) } });
    if (!group) throw new ApiError(404, 'Guruh topilmadi');

    // ⚠ FILIAL CHEGARASI — o'quvchi timeline'i bilan bir xil sabab.
    // Guruhda `branchId` BEVOSITA bor (majburiy), shuning uchun
    // `assertTargetInScope` emas, to'g'ridan-to'g'ri solishtiriladi.
    if (scope && !scope.canSeeAllBranches) {
      const allowed = (scope.allowedBranchIds || []).map(String);
      if (!group.branchId || !allowed.includes(String(group.branchId))) {
        throw new ApiError(403, "Bu guruhga kirish huquqingiz yo'q");
      }
    }

    const [memberships, teacherPeriods, txns, writeOffs] = await Promise.all([
      this.prisma.groupMembership.findMany({
        where: { groupId: String(groupId), isDeleted: false },
        include: { student: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.teacherGroupPeriod.findMany({
        where: { groupId: String(groupId), isDeleted: false },
        include: { teacher: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.paymentTransaction.findMany({
        where: { groupId: String(groupId) },
        include: { student: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.debtWriteOff.findMany({
        where: { groupId: String(groupId) },
        include: { student: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);

    // Guruh a'zolarining muzlatish hodisalari — muzlatish GURUHGA
    // bog'lanmagan, shu sabab a'zo o'quvchilar bo'yicha yig'iladi.
    const studentIds = [
      ...new Set(memberships.map((m: any) => m.student?.id).filter(Boolean).map(String)),
    ];
    const freezes = studentIds.length
      ? await this.prisma.studentFreeze.findMany({
          where: { studentId: { in: studentIds }, isDeleted: false },
          include: { student: { select: { id: true, firstName: true, lastName: true } } },
        })
      : [];

    const events: TimelineEvent[] = [];
    const gRef = groupRef(group);

    events.push(
      makeEvent({
        id: `group-created:${group.id}`,
        type: 'group_created',
        title: 'Guruh yaratildi',
        description: group.name || '',
        date: group.createdAt,
        group: gRef,
      }),
    );
    const now = Date.now();
    if (group.endDate && new Date(group.endDate).getTime() <= now && !group.isActive) {
      events.push(
        makeEvent({
          id: `group-ended:${group.id}`,
          type: 'group_ended',
          title: 'Guruh yakunlandi',
          description: group.name || '',
          date: group.endDate,
          group: gRef,
        }),
      );
    }

    for (const m of memberships) events.push(...this.membershipEvents(m, { withStudent: true }));
    for (const tp of teacherPeriods) events.push(...this.teacherPeriodEvents(tp));
    for (const t of txns) events.push(this.paymentEvent(t, { withStudent: true }));
    for (const w of writeOffs) events.push(this.writeOffEvent(w, { withStudent: true }));
    for (const f of freezes) events.push(...this.freezeEvents(f, { withStudent: true }));

    await this.resolvePerformers(events);
    return this.paginate(events, page, limit);
  }
}
