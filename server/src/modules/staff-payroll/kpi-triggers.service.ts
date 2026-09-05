import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { computeRate } from '../attendance/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRIGGERLAR KATALOGI — KPI dvigatelining yagona KOD qismi.
 *
 * FALSAFA: qoida (nima uchun, qancha, kimga) MA'LUMOT, o'lchash usuli
 * esa KOD. Yangi mukofot turi qo'shish uchun qoida yozuvi yaratiladi —
 * deploy kerak emas. Yangi O'LCHOV (hech qachon o'lchanmagan hodisa)
 * kerak bo'lgandagina shu faylga bitta trigger qo'shiladi.
 *
 * ── NEGA HODISA EMAS, DAVR BO'YICHA HISOB (pull, not push) ──
 *   • Idempotentlik: oyni istalgan marta qayta hisoblash mumkin, natija
 *     bir xil. Hodisa-asosli yechimda qo'shaloq yozuv yoki o'tkazib
 *     yuborilgan hodisa abadiy qolib ketardi.
 *   • Kech kelgan ma'lumot: davomat orqadan belgilanadi, to'lov keyin
 *     kiritiladi — hodisa o'sha paytda "hali shart bajarilmagan" derdi.
 *   • Qoida o'zgarsa oy qayta hisoblanadi va yangi shart bo'yicha
 *     to'g'ri natija chiqadi (yopilmagan oy uchun).
 *
 * Har trigger `evaluate` qaytaradigan qatorlar:
 *   `{ sourceType, sourceId, quantity, base, meta }`
 * `base` faqat `percent` turidagi mukofot uchun kerak (foiz nimadan
 * olinishini TRIGGER biladi, qoida emas).
 *
 * ⚠ NestJS'da bu SERVIS (Express'da modul darajasidagi obyektlar
 * massivi edi) — sabab bitta: Prisma klienti DI orqali keladi. Trigger
 * TA'RIFLARI o'sha-o'sha ma'lumot bo'lib qoladi, ular metodlarga
 * ISHORA qiladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const toId = (v: unknown): string => String(v);

/** Oy chegaralari — loyihadagi hamma joyda bir xil (UTC oy boshi/oxiri). */
export const monthRange = (year: number, month: number) => ({
  start: new Date(Date.UTC(year, month - 1, 1)),
  endExcl: new Date(Date.UTC(year, month, 1)),
});

export interface TriggerEvent {
  sourceType: string;
  sourceId: string | null;
  quantity: number;
  base: number;
  meta: Record<string, unknown>;
  eventKey?: string;
}

export interface TriggerContext {
  employeeId: string;
  year: number;
  month: number;
  conditions: Record<string, unknown>;
}

export interface TriggerDefinition {
  key: string;
  label: string;
  sourceType: string;
  conditionKeys: string[];
}

/**
 * Bosqich DARAJASI — "kamida shu yergacha yetdi" ni o'lchash uchun.
 *
 * ⚠ `rejected` ATAYLAB YO'Q: u daraja bermaydi. Aks holda "kiritdim va
 * darhol rad etdim" eng oson firib yo'li bo'lib qolardi. Lid rad
 * etilishidan oldin haqiqatan `info_given` bo'lgan bo'lsa — o'sha yozuv
 * tarixda qoladi va daraja o'sha yerdan olinadi.
 */
const LEAD_STAGE_RANK: Record<string, number> = {
  new: 0,
  info_given: 1,
  recontacted: 1,
  trial: 2,
  trial_attended: 3,
  enrolled: 4,
};

/**
 * Lid TARIXDA yetgan eng yuqori bosqich. Joriy status bo'yicha EMAS:
 * lid orqaga qaytarilishi mumkin (`enrolled` → `recontacted`), lekin
 * bir marta bajarilgan ish bajarilganicha qoladi.
 */
const reachedRank = (lead: { status: string; statusHistory?: unknown }): number => {
  let rank = LEAD_STAGE_RANK[lead.status] ?? 0;
  const history = (Array.isArray(lead.statusHistory) ? lead.statusHistory : []) as {
    status?: string;
  }[];
  for (const h of history) {
    const r = h?.status ? LEAD_STAGE_RANK[h.status] : undefined;
    if (r != null && r > rank) rank = r;
  }
  return rank;
};

const DEFAULT_DEDUPE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const rowOfLead = (l: {
  id: string; firstName: string | null; lastName: string | null;
  phone: string | null; status: string; createdAt: Date;
}): TriggerEvent => ({
  sourceType: 'lead',
  sourceId: l.id,
  quantity: 1,
  base: 0,
  meta: {
    leadName: [l.firstName, l.lastName].filter(Boolean).join(' '),
    phone: l.phone || '',
    status: l.status,
    createdAt: l.createdAt,
  },
});

@Injectable()
export class KpiTriggersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * ⚠ TA'RIFLAR — client qoida yaratish formasida shu ro'yxatni
   * ko'rsatadi, triggerlar ikki joyda takrorlanmasin.
   */
  private readonly definitions: TriggerDefinition[] = [
    {
      key: 'lead_created',
      label: 'Lid kiritildi (sotuvchi)',
      sourceType: 'lead',
      conditionKeys: ['minStatus', 'dedupeDays', 'sourceIds', 'directionIds'],
    },
    {
      key: 'lead_converted',
      label: "Lid o'quvchiga aylandi",
      sourceType: 'lead',
      conditionKeys: ['sourceIds', 'directionIds'],
    },
    {
      key: 'student_first_payment',
      label: "O'quvchi birinchi to'lovni qildi",
      sourceType: 'payment',
      conditionKeys: ['minAmount'],
    },
    {
      key: 'student_retained',
      label: "O'quvchi belgilangan muddat qoldi",
      sourceType: 'student',
      conditionKeys: ['minDays', 'minAttendanceRate'],
    },
    {
      key: 'payments_collected',
      label: "Xodim qabul qilgan to'lovlar",
      sourceType: 'payment',
      conditionKeys: ['minAmount'],
    },
    {
      key: 'employee_attendance',
      label: 'Xodim davomati',
      sourceType: 'attendance',
      conditionKeys: ['countMode'],
    },
  ];

  listTriggers(): TriggerDefinition[] {
    return this.definitions.map((t) => ({ ...t }));
  }

  has(key: string): boolean {
    return this.definitions.some((t) => t.key === key);
  }

  getTrigger(key: string): TriggerDefinition | null {
    return this.definitions.find((t) => t.key === key) || null;
  }

  /** Trigger kalitiga qarab tegishli hisoblagichni chaqiradi. */
  evaluate(key: string, ctx: TriggerContext): Promise<TriggerEvent[]> {
    switch (key) {
      case 'lead_created': return this.leadCreated(ctx);
      case 'lead_converted': return this.leadConverted(ctx);
      case 'student_first_payment': return this.studentFirstPayment(ctx);
      case 'student_retained': return this.studentRetained(ctx);
      case 'payments_collected': return this.paymentsCollected(ctx);
      case 'employee_attendance': return this.employeeAttendance(ctx);
      default: return Promise.resolve([]);
    }
  }

  /**
   * LID KIRITILDI — sotuvchi / call-center uchun.
   *
   * ATRIBUTSIYA: `Lead.createdBy` (lidni KIM kiritgan), `creditedTo`
   * EMAS. Ikkalasi ATAYLAB boshqa-boshqa: bitta lid uchun sotuvchi
   * topgani uchun, resepshin aylantirgani uchun mukofot oladi.
   *
   * ⚠ IKKI HIMOYA SHARTDA TURADI. Bu triggerda mukofot xodim FORMANI
   * TO'LDIRGANI uchun to'lanadi, yozish esa tekin — qolgan
   * triggerlardan farqli o'laroq bu yerda soxta ma'lumot
   * to'g'ridan-to'g'ri pulga aylanadi:
   *   • `minStatus`  — lid kamida shu bosqichga YETGAN bo'lsin;
   *   • `dedupeDays` — bitta raqam shu oraliqda BIR MARTA to'lanadi.
   *
   * ⚠ NEGA dedupe "kun oralig'i", "bir raqam — bir marta" EMAS:
   * takroriy telefon bu bazada QONUNIY (ona ikki farzandini bitta
   * raqamdan yozdiradi). Umrbod dedupe o'sha halol lidlarni ham
   * to'lamay qo'yardi. Oraliq esa aynan firibni — bir hafta ichida
   * takrorlangan yozuvni — kesadi.
   */
  private async leadCreated({
    employeeId, year, month, conditions,
  }: TriggerContext): Promise<TriggerEvent[]> {
    const { start, endExcl } = monthRange(year, month);
    const where: Record<string, unknown> = {
      createdById: toId(employeeId),
      createdAt: { gte: start, lt: endExcl },
    };
    const c = conditions as {
      sourceIds?: unknown[]; directionIds?: unknown[];
      minStatus?: string; dedupeDays?: unknown;
    };
    if (c?.sourceIds?.length) where.sourceId = { in: c.sourceIds.map(toId) };
    if (c?.directionIds?.length) where.directionId = { in: c.directionIds.map(toId) };

    const leads = await this.prisma.lead.findMany({
      where: where as never,
      select: {
        id: true, firstName: true, lastName: true, phone: true,
        status: true, statusHistory: true, createdAt: true,
      },
    });
    if (!leads.length) return [];

    // 1) SIFAT DARVOZASI
    const minRank = (c?.minStatus ? LEAD_STAGE_RANK[c.minStatus] : undefined) ?? 0;
    const qualified =
      minRank > 0 ? leads.filter((l) => reachedRank(l as never) >= minRank) : leads;
    if (!qualified.length) return [];

    // 2) TAKRORIY RAQAM
    const dedupeDays =
      c?.dedupeDays == null ? DEFAULT_DEDUPE_DAYS : Number(c.dedupeDays);
    if (!(dedupeDays > 0)) return qualified.map((l) => rowOfLead(l as never));

    const windowMs = dedupeDays * DAY_MS;
    const phones = [...new Set(qualified.map((l) => l.phone).filter(Boolean))];

    // ⚠ BARCHA yaratuvchilar bo'ylab qidiramiz, faqat shu xodim bo'yicha
    // EMAS: aks holda ikki sotuvchi bitta raqamni kiritib, IKKALASI ham
    // pul olardi.
    const sameNumber = await this.prisma.lead.findMany({
      where: { phone: { in: phones as string[] }, createdAt: { lt: endExcl } },
      select: { id: true, phone: true, createdAt: true },
    });

    const byPhone = new Map<string, { id: string; createdAt: Date }[]>();
    for (const row of sameNumber) {
      const key = String(row.phone);
      const list = byPhone.get(key);
      if (list) list.push(row as never);
      else byPhone.set(key, [row as never]);
    }

    return qualified
      .filter((lead) => {
        const siblings = byPhone.get(String(lead.phone)) || [];
        // Oraliq ichida O'ZIDAN OLDIN kelgan yozuv bormi?
        return !siblings.some((s) => {
          if (String(s.id) === String(lead.id)) return false;
          const gap =
            new Date(lead.createdAt).getTime() - new Date(s.createdAt).getTime();
          // ⚠ Bir xil soniyada yaratilgan ikki yozuvdan qaysi biri
          // "oldin" ekani sanadan chiqmaydi — kichik `id` yutadi. Bu
          // shart BARQAROR bo'lishi kerak, aks holda oy har qayta
          // hisoblanganda boshqa qator to'lanardi.
          if (gap === 0) return String(s.id) < String(lead.id);
          return gap > 0 && gap <= windowMs;
        });
      })
      .map((l) => rowOfLead(l as never));
  }

  /**
   * LID → O'QUVCHI KONVERSIYASI.
   *
   * Mukofot lidga MAS'UL xodimga tegadi (`Lead.creditedTo`) — u
   * konversiya paytida bir marta muzlatiladi. Shuning uchun mas'ulni
   * keyin almashtirish o'tgan oy maoshini qayta yozib yubormaydi.
   */
  private async leadConverted({
    employeeId, year, month, conditions,
  }: TriggerContext): Promise<TriggerEvent[]> {
    const { start, endExcl } = monthRange(year, month);
    const where: Record<string, unknown> = {
      creditedToId: toId(employeeId),
      studentId: { not: null },
      convertedAt: { gte: start, lt: endExcl },
    };
    const c = conditions as { sourceIds?: unknown[]; directionIds?: unknown[] };
    if (c?.sourceIds?.length) where.sourceId = { in: c.sourceIds.map(toId) };
    if (c?.directionIds?.length) where.directionId = { in: c.directionIds.map(toId) };

    const leads = await this.prisma.lead.findMany({
      where: where as never,
      select: {
        id: true, firstName: true, lastName: true,
        studentId: true, convertedAt: true,
      },
    });

    return leads.map((l) => ({
      sourceType: 'lead',
      sourceId: l.id,
      quantity: 1,
      base: 0,
      meta: {
        leadName: [l.firstName, l.lastName].filter(Boolean).join(' '),
        studentId: l.studentId ? String(l.studentId) : null,
        convertedAt: l.convertedAt,
      },
    }));
  }

  /**
   * O'QUVCHI BIRINCHI TO'LOVNI QILDI.
   *
   * ⚠ Konversiya QARZ yaratadi, tushum EMAS — shuning uchun "pul keldi"
   * `PaymentTransaction` dan o'qiladi.
   *
   * "Birinchi" — o'quvchining umuman birinchi to'lovi: shu oyda bo'lsa
   * mukofot beriladi. Keyingi oylarda takrorlanmaydi.
   */
  private async studentFirstPayment({
    employeeId, year, month, conditions,
  }: TriggerContext): Promise<TriggerEvent[]> {
    const { start, endExcl } = monthRange(year, month);

    // ⚠ AVVAL lidlardan boshlaymiz (indekslangan: `creditedToId`), keyin
    // o'quvchilar. Teskari tartibda butun o'quvchilar jadvali o'qilardi.
    const ownedLeads = await this.prisma.lead.findMany({
      where: { creditedToId: toId(employeeId), studentId: { not: null } },
      select: { studentId: true },
    });
    if (!ownedLeads.length) return [];

    const mine = await this.prisma.user.findMany({
      where: {
        id: { in: ownedLeads.map((l) => l.studentId as string) },
        isDeleted: false,
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!mine.length) return [];

    const studentIds = mine.map((s) => s.id);

    // ⚠ HAR O'QUVCHINING ENG BIRINCHI TO'LOVI. Prisma `groupBy` "guruh
    // ichidagi birinchi qator" ni bera olmaydi, shuning uchun to'lovlar
    // sana bo'yicha O'SISH tartibida bir marta o'qilib, birinchisi JS'da
    // olinadi. Filtr o'quvchilar ro'yxati bilan cheklangan.
    //
    // ⚠ TARTIB `id` bilan MUSTAHKAMLANGAN: bir xil `paidAt` da qaysi
    // to'lov "birinchi" ekani barqaror bo'lishi shart — aks holda oy
    // har qayta hisoblanganda boshqa qator mukofotlanardi.
    const txs = await this.prisma.paymentTransaction.findMany({
      where: { studentId: { in: studentIds }, isDeleted: false },
      select: { id: true, studentId: true, paidAt: true, amount: true },
      orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
    });

    const firstByStudent = new Map<string, typeof txs[number]>();
    for (const t of txs) {
      if (!firstByStudent.has(t.studentId)) firstByStudent.set(t.studentId, t);
    }

    const nameOf = new Map(
      mine.map((s) => [
        String(s.id),
        [s.firstName, s.lastName].filter(Boolean).join(' '),
      ]),
    );
    const minAmount = Number((conditions as { minAmount?: unknown })?.minAmount || 0);

    return [...firstByStudent.entries()]
      .filter(([, r]) => r.paidAt >= start && r.paidAt < endExcl)
      .filter(([, r]) => (r.amount as unknown as number) >= minAmount)
      .map(([studentId, r]) => ({
        sourceType: 'payment',
        sourceId: r.id,
        quantity: 1,
        base: r.amount as unknown as number,
        meta: {
          studentName: nameOf.get(String(studentId)) || '',
          paidAt: r.paidAt,
          amount: r.amount as unknown as number,
        },
      }));
  }

  /**
   * O'QUVCHI QOLDI (retention).
   *
   * ⚠ Davomat foizi loyihadagi YAGONA formula bilan hisoblanadi
   * (`computeRate`: present / (present + absent)). "excused", "exempt"
   * va belgilanmagan kunlar maxrajga KIRMAYDI — agar bu yerda boshqacha
   * hisoblansa, xodim ko'rgan foiz davomat sahifasidagi foizga to'g'ri
   * kelmasdi.
   */
  private async studentRetained({
    employeeId, year, month, conditions,
  }: TriggerContext): Promise<TriggerEvent[]> {
    const { start, endExcl } = monthRange(year, month);
    const c = conditions as { minDays?: unknown; minAttendanceRate?: unknown };
    const minDays = Number(c?.minDays || 30);
    const minRate = Number(c?.minAttendanceRate || 0);

    const ownedLeads = await this.prisma.lead.findMany({
      where: { creditedToId: toId(employeeId), studentId: { not: null } },
      select: { studentId: true },
    });
    if (!ownedLeads.length) return [];

    const studentIds = ownedLeads.map((l) => l.studentId as string);
    const students = await this.prisma.user.findMany({
      where: { id: { in: studentIds }, isDeleted: false },
      select: { id: true, firstName: true, lastName: true, enrolledAt: true },
    });
    if (!students.length) return [];

    // ⚠ Mukofot O'SHA OYDA beriladi: muddat aynan shu oy ichida to'lgan
    // o'quvchilar. Aks holda har oy qayta-qayta to'lanardi.
    const eligible = students.filter((s) => {
      if (!s.enrolledAt) return false;
      const milestone = new Date(s.enrolledAt);
      milestone.setUTCDate(milestone.getUTCDate() + minDays);
      return milestone >= start && milestone < endExcl;
    });
    if (!eligible.length) return [];

    const rows = await this.prisma.attendance.groupBy({
      by: ['studentId', 'status'],
      where: {
        studentId: { in: eligible.map((s) => s.id) },
        isDeleted: false,
        status: { in: ['present', 'absent'] },
      } as never,
      _count: { _all: true },
    });
    const buckets = new Map<string, { present: number; absent: number }>();
    for (const r of rows) {
      const b = buckets.get(r.studentId) || { present: 0, absent: 0 };
      (b as Record<string, number>)[r.status as string] = r._count._all;
      buckets.set(r.studentId, b);
    }
    const rateOf = new Map(
      [...buckets.entries()].map(([sid, b]) => [
        String(sid),
        computeRate({ ...b, excused: 0, exempt: 0, late: 0 } as never),
      ]),
    );

    return eligible
      .filter((s) => {
        const rate = rateOf.get(String(s.id));
        // ⚠ `null` = umuman belgilanmagan. "Ma'lumot yo'q"ni 0% deb
        // hisoblash xodimni o'zi aybdor bo'lmagan narsa uchun jazolardi.
        if (minRate > 0) return rate !== null && rate !== undefined && rate >= minRate;
        return true;
      })
      .map((s) => ({
        sourceType: 'student',
        sourceId: s.id,
        quantity: 1,
        base: 0,
        meta: {
          studentName: [s.firstName, s.lastName].filter(Boolean).join(' '),
          enrolledAt: s.enrolledAt,
          attendanceRate: rateOf.get(String(s.id)) ?? null,
          minDays,
        },
      }));
  }

  /**
   * XODIM QABUL QILGAN TO'LOVLAR.
   *
   * Kassir/resepshin uchun: shu oyda u kiritgan to'lovlar soni yoki
   * summasi. `percent` mukofot turi bilan birga — inkassatsiya foizi.
   */
  private async paymentsCollected({
    employeeId, year, month, conditions,
  }: TriggerContext): Promise<TriggerEvent[]> {
    const { start, endExcl } = monthRange(year, month);
    const minAmount = Number((conditions as { minAmount?: unknown })?.minAmount || 0);

    const rows = await this.prisma.paymentTransaction.findMany({
      where: {
        createdById: toId(employeeId),
        paidAt: { gte: start, lt: endExcl },
        amount: { gte: minAmount || 1 },
        isDeleted: false,
      } as never,
      select: { id: true, amount: true, paidAt: true, studentId: true },
    });

    return rows.map((r) => ({
      sourceType: 'payment',
      sourceId: r.id,
      quantity: 1,
      base: r.amount as unknown as number,
      meta: { amount: r.amount as unknown as number, paidAt: r.paidAt },
    }));
  }

  /**
   * XODIMNING O'Z DAVOMATI.
   *
   * ⚠ Yozuv YO'QLIGI = kelgan, shuning uchun "kelgan kunlar" = oydagi
   * kunlar − belgilangan yo'q/sababli kunlar.
   *
   * Hozircha manba faqat `TeacherAttendance` va u `role === teacher`
   * bilan qattiq cheklangan. Trigger ma'lumot bo'lsa ishlaydi; xodimlar
   * uchun belgilash interfeysi qo'shilgach o'zi jonlanadi — qoida
   * o'zgartirilmaydi.
   */
  private async employeeAttendance({
    employeeId, year, month,
  }: TriggerContext): Promise<TriggerEvent[]> {
    const { start, endExcl } = monthRange(year, month);
    const rows = await this.prisma.teacherAttendance.findMany({
      where: {
        teacherId: toId(employeeId),
        date: { gte: start, lt: endExcl },
        isDeleted: false,
      },
      select: { status: true },
    });

    const daysInMonthCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const missed = rows.filter((r) => r.status !== 'present').length;
    const present = Math.max(0, daysInMonthCount - missed);

    // Bitta yig'ma qator (har kun uchun alohida emas): maosh varaqasida
    // 30 ta qator o'rniga "24 kun keldi" deb ko'rinadi.
    return [
      {
        sourceType: 'attendance',
        sourceId: null,
        // ⚠ Yig'ma qator HAR OY takrorlanadi, shuning uchun kalitga
        // yil-oy kiradi (aks holda umr bo'yi noyob indeks ikkinchi oyni
        // bloklardi).
        eventKey: `attendance:${year}-${String(month).padStart(2, '0')}`,
        quantity: present,
        base: 0,
        meta: { presentDays: present, missedDays: missed, daysInMonth: daysInMonthCount },
      },
    ];
  }
}
