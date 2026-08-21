import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { withLegacyIds } from '../../common/utils/serialize.js';
import { ROLES, PERMISSIONS } from '../../common/constants/permissions.js';
import { branchFilter, userBranchCondition } from '../../common/als/branch-context.js';
import { hasAnyPermission } from '../../common/rbac/permission.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GLOBAL QIDIRUV (⌘K) — `services/search.service.js` EKVIVALENTI.
 *
 * Bitta so'rov bilan o'quvchi, o'qituvchi, guruh va (ruxsat bo'lsa)
 * to'lovlarni topadi.
 *
 * ── ⚠ QIDIRUV — TIZIMNING ENG QULAY "YON ESHIGI" ──
 *
 * U bitta so'rov bilan bir nechta jadvalni ochadi va odatda hech kim
 * uni ro'yxat sahifasi kabi jiddiy tekshirmaydi. Ilgari bu servis
 * filial shartini UMUMAN qo'llamasdi: B filiali direktori "Ali" deb
 * yozsa, A va C filiallaridagi o'quvchilar ham chiqardi — ismi,
 * telefoni va profil havolasi bilan. Profilni ochganda 404 kelardi,
 * lekin RO'YXATNING O'ZI allaqachon ma'lumot edi.
 *
 * ── REGEX O'RNIGA `contains` ──
 *
 * Mongo'da qidiruv `new RegExp(escapeRegex(q), "i")` bilan qurilardi.
 * Prisma `contains` XOM SATRNI qidiradi va LIKE maxsus belgilarini
 * o'zi ekranlaydi, ya'ni `escapeRegex` endi hech nimadan himoya
 * qilmaydi — u faqat qidiruvni BUZARDI ("C++" izlagan odam hech narsa
 * topmasdi). `mode: "insensitive"` esa "i" bayrog'ining o'rnini bosadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class SearchService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async globalSearch(
    term?: string,
    { limit = 5, permissions = [] }: { limit?: number; permissions?: string[] } = {},
  ) {
    const q = (term || '').trim();
    // ⚠ IKKI BELGIDAN QISQA SO'ROV UMUMAN BAJARILMAYDI: bitta harf
    // butun bazani qaytarardi va har bosishda to'rtta jadval
    // skanerlanardi.
    if (q.length < 2) return { students: [], teachers: [], groups: [], payments: [] };

    const like = { contains: q, mode: 'insensitive' as const };

    /**
     * ⚠ QOIDA MAVJUD JOYIDAN OLINADI: `userBranchCondition()` —
     * "foydalanuvchi qaysi filialda" savolining YAGONA javobi (u
     * `/users` ro'yxatida ham ishlatiladi). Yangi qoida yozilsa,
     * ikkalasi vaqt o'tishi bilan AJRALIB ketardi.
     *
     * FAIL-CLOSED: hech qaysi filialga biriktirilmagan odam uchun
     * `{ id: { in: [] } }` qaytadi — hech kim topilmaydi.
     */
    const userScope = userBranchCondition();
    const groupScope = branchFilter();

    const userWhere: Record<string, any> = {
      isActive: true,
      isDeleted: false,
      ...(userScope || {}),
      /**
       * ⚠ `AND` ATAYLAB: `userScope` ning O'ZI `OR` ishlatadi (uy
       * filiali YOKI biriktirilgan filial). Qidiruv shartini ham `OR`
       * bilan YONMA-YON qo'ysak, ular BIRLASHIB ketardi — "boshqa
       * filialdagi, lekin ismi mos" odam ham topilardi. Aynan shu xato
       * ko'lam filtrini BEKOR qilardi.
       */
      AND: [
        {
          OR: [
            { firstName: like },
            { lastName: like },
            { phone: like },
            { username: like },
          ],
        },
      ],
    };

    // ⚠ `id` ATAYLAB ochiq so'raladi: Prisma `select` bilan uni
    // avtomatik qaytarmaydi, javobda esa `_id` bo'lishi SHART — ⌘K
    // oynasi shu bilan profilga o'tadi.
    const userSelect = { id: true, firstName: true, lastName: true, phone: true };

    const [students, teachers, groups] = await Promise.all([
      this.prisma.user.findMany({
        where: { ...userWhere, role: ROLES.STUDENT },
        select: userSelect,
        take: limit,
      }),
      this.prisma.user.findMany({
        where: { ...userWhere, role: ROLES.TEACHER },
        select: userSelect,
        take: limit,
      }),
      this.prisma.group.findMany({
        // Guruh filiali TO'G'RIDAN-TO'G'RI ustunda (`branchId`), shuning
        // uchun oddiy `branchFilter()` yetarli.
        where: { isActive: true, isDeleted: false, name: like, ...groupScope },
        select: { id: true, name: true },
        take: limit,
      }),
    ]);

    // Guruhlar uchun o'quvchilar soni (yengil kontekst).
    //
    // ⚠ `groupId` (`group` EMAS): `{ group: ... }` deb yozilsa Prisma
    // uni RELATION filtri deb o'qiydi va butunlay boshqa ma'no chiqadi.
    const groupIds = groups.map((g) => g.id);
    let countMap = new Map<string, number>();
    if (groupIds.length > 0) {
      const countRows = await this.prisma.groupMembership.groupBy({
        by: ['groupId'],
        where: { groupId: { in: groupIds }, leftAt: null, isDeleted: false },
        _count: { _all: true },
      } as never) as any[];
      countMap = new Map(countRows.map((c) => [String(c.groupId), c._count._all]));
    }

    /**
     * ── TO'LOVLAR ──
     *
     * Foydalanuvchi "qaysi modulda ekanini bilishi" shart emas: "Ali"
     * deb yozgan odam Alini ham, uning to'lovlarini ham ko'rishi kerak.
     * To'lovning o'z nomi yo'q — u ODAMGA tegishli, shuning uchun
     * qidiruv o'quvchi ismi bo'ylab ketadi.
     *
     * ⚠ RUXSAT: `finance.read` bo'lmasa bu bo'lim UMUMAN so'ralmaydi.
     * Resepshin "Ali" deb qidirsa Alini topadi, lekin to'lov summasini
     * KO'RMAYDI.
     *
     * ⚠ FILIAL KO'LAMI IKKI QAVAT: to'lovning o'z `branchId` si
     * (`branchFilter()`) VA o'quvchining o'zi ham ko'lamda bo'lishi
     * shart (`student: userWhere`) — aks holda begona filialdagi
     * o'quvchining ismi to'lov qatorida ko'rinib qolardi.
     */
    const canFinance = hasAnyPermission(permissions, [PERMISSIONS.FINANCE_READ]);
    let payments: any[] = [];
    if (canFinance) {
      const rows = await this.prisma.paymentTransaction.findMany({
        where: {
          isDeleted: false,
          ...branchFilter(),
          student: userWhere,
        } as never,
        select: {
          id: true,
          amount: true,
          method: true,
          paidAt: true,
          studentId: true,
          student: { select: { firstName: true, lastName: true } },
          group: { select: { name: true } },
        },
        orderBy: { paidAt: 'desc' },
        take: limit,
      });
      payments = rows.map((r) => ({
        id: r.id,
        studentId: r.studentId,
        studentName: `${r.student?.firstName || ''} ${r.student?.lastName || ''}`.trim(),
        groupName: r.group?.name || null,
        // ⚠ `Decimal` → son: klient FORMATLAYDI, hisoblamaydi.
        amount: Number(r.amount || 0),
        method: r.method,
        paidAt: r.paidAt,
      }));
    }

    return {
      payments: withLegacyIds(payments),
      students: withLegacyIds(
        students.map((s) => ({
          id: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          phone: s.phone || null,
        })),
      ),
      teachers: withLegacyIds(
        teachers.map((t) => ({
          id: t.id,
          firstName: t.firstName,
          lastName: t.lastName,
          phone: t.phone || null,
        })),
      ),
      groups: withLegacyIds(
        groups.map((g) => ({
          id: g.id,
          name: g.name,
          studentsCount: countMap.get(String(g.id)) || 0,
        })),
      ),
    };
  }
}
