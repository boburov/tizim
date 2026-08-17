import prisma from "../../../config/prisma.js";
import { ROLES } from "../../../constants/roles.js";
import { withLegacyIds } from "../../../utils/serialize.js";

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

export const globalSearch = async (term, { limit = 5 } = {}) => {
  const q = (term || "").trim();
  if (q.length < 2) return { students: [], teachers: [], groups: [] };

  const like = { contains: q, mode: "insensitive" };
  const userWhere = {
    isActive: true,
    // `isDeleted` ustuni NOT NULL (default false), ya'ni Mongo'dagi
    // `{ $ne: true }` bu yerda oddiy `false` ga aylanadi.
    isDeleted: false,
    OR: [
      { firstName: like },
      { lastName: like },
      { phone: like },
      { username: like },
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
      where: { isActive: true, isDeleted: false, name: like },
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

  return {
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
