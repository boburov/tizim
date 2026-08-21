import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { branchFilter } from '../../common/als/branch-context.js';
import {
  parseRange,
  branchClause,
  planPeriodClause,
  type AnalyticsFilter,
} from './analytics-filter.js';
import { ratioPercent, n } from './metrics.js';

/**
 * ══════════════════════════════════════════════════════════════════════
 * O'QUVCHINING MOLIYAVIY YO'LI (talab 15)
 * (`services/studentProfile.service.js` EKVIVALENTI)
 * ══════════════════════════════════════════════════════════════════════
 *
 * Zanjirning oxirgi ODAM bo'g'ini:
 *
 *   Daromad → yo'nalish → guruh → O'QUVCHI → to'lov → jurnal yozuvi
 *
 * Bu yerda faqat SARLAVHA raqamlari va kontekst yig'iladi. Vaqt
 * chizig'ining o'zi mavjud `/entries?studentId=...` dan olinadi —
 * ataylab: yozuvlar ro'yxatining maosh filtri, tartibi va shakli
 * allaqachon bitta joyda (`entry-detail.service.ts`) va uni bu yerda
 * takrorlash IKKINCHI haqiqat manbai bo'lardi.
 *
 * ── HAR RAQAM QAYERDAN ──
 *   to'langan / kutilgan / qarz  → student_payments (REJA tomoni)
 *   qaytarim                     → jurnal (daromad hisobining debeti)
 *   chegirma                     → student_payments.discountApplied
 *   depozit qoldig'i             → student_deposits
 *
 * REJA va JURNAL ataylab ARALASHTIRILMAYDI: "qancha to'lashi kerak
 * edi" reja hujjatida, "qancha pul kirdi" jurnalda. Ikkalasi bitta
 * ustunga qo'shilsa, qaysi biri haqiqat ekani yo'qolardi.
 *
 * ── FILIAL KO'LAMI ──
 * O'quvchi kesib o'tilgandan keyin ham (`loadStudent`) barcha
 * yig'indi `branchClause` ostida — boshqa filialdagi guruhining puli
 * ko'rinmaydi.
 */

const REMAINING = Prisma.raw(`GREATEST(sp."expectedAmount" - sp."paidAmount", 0)`);
const DAYS_OVERDUE = Prisma.raw(
  `EXTRACT(DAY FROM (NOW() - (make_date(sp.year, sp.month, 1) + INTERVAL '1 month - 1 day')))`,
);

const fullName = (u: any): string =>
  `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || u?.username || '';

@Injectable()
export class StudentProfileService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * O'QUVCHI KO'RINADIMI?
   *
   * FAIL-CLOSED: o'quvchi topilmasa ham, ko'lamdan tashqarida bo'lsa ham
   * BIR XIL 404. Ataylab: 403 qaytarilsa "bu ID mavjud, lekin sizniki
   * emas" degan ma'lumot sizib chiqardi va boshqa filial o'quvchilarini
   * ID bo'ylab sanab chiqish mumkin bo'lardi.
   */
  private async loadStudent(studentId: string) {
    const bf = branchFilter('homeBranchId') as {
      homeBranchId?: string | { in?: string[] };
    };
    const student = await this.prisma.user.findFirst({
      where: { id: String(studentId), isDeleted: false, role: 'student' } as never,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        phone: true,
        isActive: true,
        enrolledAt: true,
        homeBranchId: true,
        homeBranch: { select: { id: true, name: true } },
      },
    });
    if (!student) throw new ApiError(404, "O'quvchi topilmadi");

    const s = student as never as Record<string, any>;

    // Uy filiali ko'lamda emas — LEKIN o'quvchi boshqa filialdagi guruhda
    // o'qiyotgan bo'lishi mumkin. Shuning uchun a'zolik ham tekshiriladi.
    const hb = bf.homeBranchId;
    const homeOk =
      !hb ||
      (typeof hb === 'string' && s.homeBranchId === hb) ||
      (typeof hb === 'object' && Array.isArray(hb.in) && hb.in.includes(s.homeBranchId));

    if (!homeOk) {
      const gf = branchFilter('branchId');
      const inScopeGroup = await this.prisma.groupMembership.findFirst({
        where: {
          studentId: s.id,
          isDeleted: false,
          group: { isDeleted: false, ...gf },
        } as never,
        select: { id: true },
      });
      if (!inScopeGroup) throw new ApiError(404, "O'quvchi topilmadi");
    }
    return s;
  }

  async getStudentFinancialProfile(studentId: string, filters: AnalyticsFilter = {}) {
    const student = await this.loadStudent(studentId);
    const range = parseRange(filters);
    const sid = String(student.id);

    const planBranch = branchClause('sp."branchId"', filters.branchId || null);
    const jrnBranch = branchClause('e."branchId"', filters.branchId || null);

    // ── 1) REJA TOMONI: kutilgan / to'langan / qarz ──
    //
    // IKKI OYNA: "hamma vaqt" (umumiy holat) va tanlangan davr. Talab 15
    // dagi kartalar umumiy holatni ko'rsatadi — o'quvchining qarzi oy
    // tanlashga qarab o'zgarmasligi kerak.
    const planRows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        COALESCE(SUM(sp."expectedAmount") FILTER (WHERE NOT sp."writtenOff"), 0) AS "expected",
        COALESCE(SUM(sp."paidAmount")     FILTER (WHERE NOT sp."writtenOff"), 0) AS "paid",
        COALESCE(SUM(${REMAINING})        FILTER (WHERE NOT sp."writtenOff"), 0) AS "outstanding",
        COALESCE(SUM(${REMAINING}) FILTER (
          WHERE NOT sp."writtenOff" AND ${DAYS_OVERDUE} > 0), 0)                 AS "overdue",
        COALESCE(SUM(sp."writeOffAmount") FILTER (WHERE sp."writtenOff"), 0)     AS "badDebt",
        -- CHEGIRMA: qoida jadvalidan EMAS, QO'LLANGAN summadan.
        -- Discount jadvali foiz yoki qat'iy qiymatni saqlaydi; uni bu yerda
        -- qayta hisoblash ikkinchi haqiqat manbai bo'lardi. Reja qatoridagi
        -- discountApplied esa hisoblash NATIJASI, ya'ni haqiqiy ta'sir.
        COALESCE(SUM(sp."discountApplied") FILTER (WHERE NOT sp."writtenOff"), 0) AS "discounts",
        COUNT(*) FILTER (WHERE NOT sp."writtenOff" AND ${REMAINING} > 0)         AS "unpaidMonths"
      FROM student_payments sp
      WHERE sp."studentId" = ${sid} ${planBranch}
    `;
    const plan = planRows[0] || {};

    // ── 2) TANLANGAN DAVR: reja bo'yicha ──
    const periodRows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        COALESCE(SUM(sp."expectedAmount") FILTER (WHERE NOT sp."writtenOff"), 0) AS "expected",
        COALESCE(SUM(sp."paidAmount")     FILTER (WHERE NOT sp."writtenOff"), 0) AS "paid"
      FROM student_payments sp
      WHERE sp."studentId" = ${sid} ${planBranch}
        AND ${planPeriodClause('sp', range.from, range.to)}
    `;
    const period = periodRows[0] || {};

    // ── 3) JURNAL TOMONI: haqiqiy pul (qaytarim shu yerdan) ──
    //
    // Qaytarim FAQAT jurnaldan — `Refund` jadvalidan olinsa bajarilmagan
    // (pending) so'rov ham hisobga tushardi.
    const jrnRows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        COALESCE(SUM(CASE WHEN l."accountKind" = 'revenue' THEN l.credit ELSE 0 END), 0) AS "revenueGross",
        COALESCE(SUM(CASE WHEN l."accountKind" = 'revenue' THEN l.debit  ELSE 0 END), 0) AS "refunds",
        COUNT(DISTINCT e.id) AS "entries"
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      WHERE e."studentId" = ${sid} ${jrnBranch}
    `;
    const jrn = jrnRows[0] || {};

    // ── 4) CHEGIRMA QOIDALARI (nechta amal qilyapti) ──
    // Summasi yuqorida rejadan olinadi; bu faqat SANOQ — "chegirma bormi".
    const discountCount = await this.prisma.discount.count({
      where: { studentId: sid, isDeleted: false, isActive: true } as never,
    });

    // ── 5) DEPOZIT QOLDIG'I ──
    const deposit = await this.prisma.studentDeposit.findUnique({
      where: { studentId: sid },
      select: { balance: true },
    });

    // ── 6) GURUHLARI (kontekst: yo'nalish, o'qituvchi, xona) ──
    const memberships = await this.prisma.groupMembership.findMany({
      where: { studentId: sid, isDeleted: false } as never,
      select: {
        joinedAt: true,
        leftAt: true,
        group: {
          select: {
            id: true,
            name: true,
            branchId: true,
            course: { select: { id: true, title: true } },
            // `teachers` — KO'PGA-KO'P (Group.teachers). Guruhda bir nechta
            // o'qituvchi bo'lishi mumkin, shuning uchun ro'yxat qaytariladi.
            teachers: {
              select: { id: true, firstName: true, lastName: true, username: true },
            },
            room: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const expectedAll = n(plan.expected);
    const paidAll = n(plan.paid);

    return {
      student: {
        id: student.id,
        name: fullName(student),
        username: student.username,
        phone: student.phone || '',
        isActive: student.isActive,
        enrolledAt: student.enrolledAt,
        branch: student.homeBranch
          ? { id: student.homeBranch.id, name: student.homeBranch.name }
          : null,
      },
      // KARTALAR (talab 15): to'langan / qarz / chegirma / qaytarim.
      totals: {
        paid: paidAll,
        expected: expectedAll,
        outstanding: n(plan.outstanding),
        overdue: n(plan.overdue),
        badDebt: n(plan.badDebt),
        unpaidMonths: Number(plan.unpaidMonths || 0),
        collectionRate: ratioPercent(paidAll, expectedAll),
        discounts: n(plan.discounts),
        discountCount,
        refunds: n(jrn.refunds),
        depositBalance: n(deposit?.balance),
        journalEntries: Number(jrn.entries || 0),
      },
      period: {
        from: range.from,
        to: range.to,
        expected: n(period.expected),
        paid: n(period.paid),
      },
      groups: (memberships as never as any[])
        .filter((m) => m.group)
        .map((m) => ({
          id: m.group.id,
          name: m.group.name,
          active: !m.leftAt,
          joinedAt: m.joinedAt,
          leftAt: m.leftAt,
          course: m.group.course
            ? { id: m.group.course.id, name: m.group.course.title }
            : null,
          teachers: (m.group.teachers || []).map((t: any) => ({
            id: t.id,
            name: fullName(t),
          })),
          room: m.group.room ? { id: m.group.room.id, name: m.group.room.name } : null,
          branch: m.group.branch
            ? { id: m.group.branch.id, name: m.group.branch.name }
            : null,
        })),
    };
  }
}
