import prisma from "../../../config/prisma.js";
import { ROLES } from "../../../constants/roles.js";
import { withLegacyIds } from "../../../utils/serialize.js";
import {
  branchFilter,
  userBranchCondition,
} from "../../../helpers/branchContext.helper.js";
import { hasAnyPermission } from "../../../helpers/permission.helper.js";
import { PERMISSIONS } from "../../../constants/permissions.js";

// Global qidiruv: bitta so'rov bilan o'quvchi, o'qituvchi va guruhlarni topadi.
// ⌘K oynasi shu natijalarni ko'rsatadi - foydalanuvchi profil/guruhga to'g'ridan o'tadi.
//
// ═══════════════════════════════════════════════════════════════════
// REGEX O'RNIGA `contains` — VA `escapeRegex` OLIB TASHLANDI.
//
// Mongo'da qidiruv `new RegExp(escapeRegex(q), "i")` bilan qurilardi.
// Prisma'da `contains` XOM SATRNI qidiradi va LIKE maxsus belgilarini
// o'zi ekranlaydi, ya'ni:
//   • `escapeRegex` endi hech nimadan himoya qilmaydi - u faqat
//     foydalanuvchi yozgan matnga teskari chiziqlar qo'shib, qidiruvni
//     BUZARDI ("C++" izlagan odam hech narsa topmasdi);
//   • `mode: "insensitive"` regexdagi "i" bayrog'ining o'rnini bosadi.
//
// Bundan tashqari `contains` indeksdan foydalana oladi, regex esa yo'q.
// ═══════════════════════════════════════════════════════════════════

export const globalSearch = async (term, { limit = 5, permissions = [] } = {}) => {
  const q = (term || "").trim();
  if (q.length < 2) return { students: [], teachers: [], groups: [], payments: [] };

  const like = { contains: q, mode: "insensitive" };

  /**
   * ══════════════════════════════════════════════════════════════════
   * FILIAL KO'LAMI — QIDIRUVDA HAM (talab 22)
   * ══════════════════════════════════════════════════════════════════
   *
   * ── NIMA NOTO'G'RI EDI ──
   * Bu servis filial shartini UMUMAN qo'llamasdi. Ya'ni B filiali
   * direktori ⌘K oynasida "Ali" deb yozsa, A va C filiallaridagi
   * o'quvchilar, o'qituvchilar va guruhlar ham chiqardi — ismi,
   * telefoni va profil havolasi bilan. Profilni ochganda 404 kelardi
   * (u yer qo'riqlangan), lekin RO'YXATNING O'ZI allaqachon
   * ma'lumot: kim o'qiyapti, telefoni nima.
   *
   * Qidiruv butun tizim uchun eng qulay "yon eshik": u bitta so'rov
   * bilan uchta jadvalni ochadi va odatda hech kim uni ro'yxat
   * sahifasi kabi jiddiy tekshirmaydi.
   *
   * ── QOIDA MAVJUD JOYIDAN OLINADI ──
   * `userBranchCondition()` — foydalanuvchi qaysi filialda degan
   * savolning YAGONA javobi (u `/users` ro'yxatida ham ishlatiladi).
   * Yangi qoida yozilsa, ikkalasi vaqt o'tishi bilan ajralib ketardi.
   *
   * FAIL-CLOSED: hech qaysi filialga biriktirilmagan odam uchun
   * `{ id: { in: [] } }` qaytadi — ya'ni hech kim topilmaydi.
   */
  const userScope = userBranchCondition();
  const groupScope = branchFilter();

  const userWhere = {
    isActive: true,
    // `isDeleted` ustuni NOT NULL (default false), ya'ni Mongo'dagi
    // `{ $ne: true }` bu yerda oddiy `false` ga aylanadi.
    isDeleted: false,
    ...(userScope || {}),
    // `AND` ATAYLAB: `userScope` ning o'zi `OR` ishlatadi (uy filiali
    // YOKI biriktirilgan filial). Qidiruv shartini ham `OR` bilan
    // yonma-yon qo'ysak, ular BIRLASHIB ketardi — "boshqa filialdagi,
    // lekin ismi mos" odam ham topilardi. Aynan shu xato ko'lam
    // filtrini bekor qilardi.
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

  // `id` ni ATAYLAB ochiq so'raymiz: Prisma `select` bilan uni
  // avtomatik qaytarmaydi (Mongo `_id` ni doim qaytarardi), javobda
  // esa `_id` bo'lishi SHART - ⌘K oynasi shu bilan profilga o'tadi.
  const userSelect = {
    id: true,
    firstName: true,
    lastName: true,
    phone: true,
  };

  const [students, teachers, groups] = await Promise.all([
    prisma.user.findMany({
      where: { ...userWhere, role: ROLES.STUDENT },
      select: userSelect,
      take: limit,
    }),
    prisma.user.findMany({
      where: { ...userWhere, role: ROLES.TEACHER },
      select: userSelect,
      take: limit,
    }),
    prisma.group.findMany({
      // Guruh filiali TO'G'RIDAN-TO'G'RI ustunda (`branchId`), shuning
      // uchun oddiy `branchFilter()` yetarli.
      where: { isActive: true, isDeleted: false, name: like, ...groupScope },
      select: { id: true, name: true },
      take: limit,
    }),
  ]);

  // Guruhlar uchun o'quvchilar sonini ko'rsatamiz (yengil kontekst).
  //
  // Mongo'da bu `$group: { _id: "$group" }` quvuri edi. Prisma'da
  // `groupBy` yetarli - guruhlash `group_memberships` jadvalining O'Z
  // ustuni (`groupId`) bo'yicha, ya'ni JOIN kerak emas.
  //
  // DIQQAT: Mongo'dagi `group` maydoni Prisma'da `groupId`. `{ group: ... }`
  // deb yozilsa Prisma uni RELATION filtri deb o'qiydi va butunlay
  // boshqa ma'no chiqadi.
  const groupIds = groups.map((g) => g.id);
  let countMap = new Map();
  if (groupIds.length > 0) {
    const countRows = await prisma.groupMembership.groupBy({
      by: ["groupId"],
      where: { groupId: { in: groupIds }, leftAt: null, isDeleted: false },
      _count: { _all: true },
    });
    countMap = new Map(
      countRows.map((c) => [String(c.groupId), c._count._all]),
    );
  }

  /**
   * ══════════════════════════════════════════════════════════════════
   * TO'LOVLAR — «Ali» deb qidirgan odam Alining PULINI ham ko'radi
   * ══════════════════════════════════════════════════════════════════
   *
   * ── NEGA KERAK (talab 22) ──
   * Foydalanuvchi «qaysi modulda ekanini bilishi» shart emas. «Ali»
   * deb yozgan odam Alini ham, uning to'lovlarini ham ko'rishi kerak —
   * shu ikkisi orasida u yana bitta sahifa ochib, filtr qo'yib
   * o'tirmasligi kerak.
   *
   * ── NEGA TO'LOV ISM BILAN QIDIRILADI ──
   * To'lovning o'z nomi yo'q. U ODAMGA tegishli, shuning uchun
   * qidiruv o'quvchi ismi bo'ylab ketadi va natija «kim, qachon,
   * qancha» bo'lib qaytadi.
   *
   * ── RUXSAT ──
   * `finance.read` bo'lmasa bu bo'lim UMUMAN so'ralmaydi (bo'sh
   * massiv). Resepshin «Ali» deb qidirsa, Alini topadi — lekin uning
   * to'lov summasini KO'RMAYDI.
   *
   * ── FILIAL KO'LAMI ──
   * `PaymentTransaction.branchId` — to'g'ridan-to'g'ri ustun, ya'ni
   * oddiy `branchFilter()` yetarli. Bundan tashqari o'quvchining
   * o'zi ham ko'lamda bo'lishi shart (`student: userWhere`) — aks
   * holda begona filialdagi o'quvchining ismi to'lov qatorida
   * ko'rinib qolardi.
   */
  const canFinance = hasAnyPermission(permissions, [PERMISSIONS.FINANCE_READ]);
  let payments = [];
  if (canFinance) {
    const rows = await prisma.paymentTransaction.findMany({
      where: {
        isDeleted: false,
        ...branchFilter(),
        student: userWhere,
      },
      select: {
        id: true,
        amount: true,
        method: true,
        paidAt: true,
        studentId: true,
        student: { select: { firstName: true, lastName: true } },
        group: { select: { name: true } },
      },
      orderBy: { paidAt: "desc" },
      take: limit,
    });
    payments = rows.map((r) => ({
      id: r.id,
      studentId: r.studentId,
      studentName: `${r.student?.firstName || ""} ${r.student?.lastName || ""}`.trim(),
      groupName: r.group?.name || null,
      // `Decimal` → son: client formatlaydi, hisoblamaydi.
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
};
