import prisma from "../../../config/prisma.js";
import { withLegacyId } from "../../../utils/serialize.js";
import ApiError from "../../../utils/ApiError.js";
import { averagesForStudents } from "./grades.service.js";
import { getStudentSummary as getAttendanceStudentSummary } from "../../attendance/services/attendance.service.js";
import { branchGroupFilter } from "../../../helpers/branchContext.helper.js";

const STUDENT_SELECT = {
  // `id` ATAYLAB: Prisma `select` bilan avtomatik kelmaydi.
  id: true,
  firstName: true,
  lastName: true,
  username: true,
};

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoDaysAgo = (days) =>
  new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

// ─── Sozlamalar (yagona hujjat) ───
// YAGONA QATOR: `id` ning o'zi "default" (schema'dagi @default).
export const getSettings = async () =>
  prisma.ratingSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });

export const updateSettings = async (body) => {
  // Qator mavjudligini kafolatlaymiz (birinchi tahrirda ham ishlashi uchun).
  await getSettings();

  const data = {};
  if (body.gradeWeight !== undefined) {
    const v = Number(body.gradeWeight);
    if (Number.isNaN(v) || v < 0 || v > 1) {
      throw new ApiError(400, "Ball vazni 0 dan 1 gacha bo'lishi kerak");
    }
    data.gradeWeight = v;
  }
  if (body.attendanceWeight !== undefined) {
    const v = Number(body.attendanceWeight);
    if (Number.isNaN(v) || v < 0 || v > 1) {
      throw new ApiError(400, "Davomat vazni 0 dan 1 gacha bo'lishi kerak");
    }
    data.attendanceWeight = v;
  }
  return prisma.ratingSettings.update({ where: { id: "default" }, data });
};

// point = (avgGrade/5*100)*gradeWeight + (attendanceRate)*attendanceWeight
const computePoint = (avgGrade, attendanceRate, settings) => {
  const gradePart = avgGrade != null ? (avgGrade / 5) * 100 : 0;
  const attPart = attendanceRate != null ? attendanceRate : 0;
  const raw =
    gradePart * settings.gradeWeight + attPart * settings.attendanceWeight;
  return Math.round(raw * 100) / 100;
};

// ─── Leaderboard ───
// scope: "all" (barcha aktiv o'quvchilar) yoki groupId (shu guruh a'zolari).
// fromDate/toDate ixtiyoriy - berilmasa "umrbod" (hamma vaqt).
export const getLeaderboard = async ({
  scope = "all",
  fromDate,
  toDate,
  limit = 100,
} = {}) => {
  const settings = await getSettings();

  // O'quvchilar to'plamini aniqlaymiz (aktiv a'zoliklar bo'yicha)
  // FILIAL: reyting boshqa filial o'quvchilarini ARALASHTIRMASLIGI kerak -
  // aks holda direktor begona o'quvchilar ismini va ballarini ko'rardi,
  // va o'z filiali o'quvchisining o'rni ham noto'g'ri chiqardi.
  // `branchGroupFilter("groupId")` - Prisma'da ustun nomi `groupId`
  // (`group` bo'lsa relation filtri bo'lib qolardi).
  const membershipWhere = {
    leftAt: null,
    isDeleted: false,
    ...(await branchGroupFilter("groupId")),
  };
  let groupId = null;
  if (scope && scope !== "all") {
    // ID endi oddiy satr - `new ObjectId(...)` kerak emas.
    groupId = String(scope);
    membershipWhere.groupId = groupId;
  }
  const memberships = await prisma.groupMembership.findMany({
    where: membershipWhere,
    select: { groupId: true, student: { select: STUDENT_SELECT } },
  });

  // O'quvchi -> guruhlar (ko'rsatish uchun) va noyob o'quvchilar
  const studentMap = new Map();
  for (const m of memberships) {
    if (!m.student) continue;
    const sid = String(m.student.id);
    if (!studentMap.has(sid)) {
      // Javobda `_id` QOLADI - klient reyting qatorini shu bilan ochadi.
      studentMap.set(sid, { student: withLegacyId(m.student), groupIds: [] });
    }
    studentMap.get(sid).groupIds.push(m.groupId);
  }
  const studentIds = Array.from(studentMap.keys());
  if (studentIds.length === 0) return { settings, items: [] };

  // Ballar o'rtachasi (bitta aggregate so'rov)
  const gradeAvgMap = await averagesForStudents(studentIds, {
    fromDate,
    toDate,
    groupId,
  });

  // Davomat foizi - har o'quvchi uchun (mavjud attendance summary).
  // Sana berilmasa "umrbod" oraliq (2 yil orqaga … bugun) - attendance summary
  // fromDate/toDate talab qiladi.
  const effFrom = fromDate || isoDaysAgo(730);
  const effTo = toDate || isoToday();
  const scopeGroupIds = groupId ? [groupId] : undefined;
  const rateEntries = await Promise.all(
    studentIds.map(async (sid) => {
      try {
        const s = await getAttendanceStudentSummary(sid, {
          fromDate: effFrom,
          toDate: effTo,
          scopeGroupIds,
        });
        return [sid, s?.attendanceRate ?? null];
      } catch {
        return [sid, null];
      }
    }),
  );
  const rateMap = new Map(rateEntries);

  const items = studentIds
    .map((sid) => {
      const { student } = studentMap.get(sid);
      const g = gradeAvgMap.get(sid) || { average: null, count: 0 };
      const attendanceRate = rateMap.get(sid);
      const point = computePoint(g.average, attendanceRate, settings);
      return {
        student: {
          _id: student._id,
          firstName: student.firstName,
          lastName: student.lastName,
          username: student.username,
        },
        averageGrade: g.average,
        gradeCount: g.count,
        attendanceRate: attendanceRate,
        point,
      };
    })
    .sort((a, b) => b.point - a.point);

  // Reyting o'rinlarini (rank) belgilaymiz
  items.forEach((it, i) => {
    it.rank = i + 1;
  });

  return { settings, items: items.slice(0, limit) };
};

// O'quvchining umumiy va guruh ichidagi reytingdagi o'rni (student panel uchun).
export const getStudentRank = async (studentId, { fromDate, toDate } = {}) => {
  const all = await getLeaderboard({ scope: "all", fromDate, toDate, limit: 100000 });
  const mine = all.items.find((x) => String(x.student._id) === String(studentId));

  // O'quvchining aktiv guruhi (birinchi) ichidagi reyting
  const membership = await prisma.groupMembership.findFirst({
    where: { studentId: String(studentId), leftAt: null, isDeleted: false },
    select: { groupId: true },
  });

  let group = null;
  if (membership) {
    const g = await getLeaderboard({
      scope: String(membership.groupId),
      fromDate,
      toDate,
      limit: 100000,
    });
    const groupDoc = await prisma.group.findUnique({
      where: { id: String(membership.groupId) },
      select: { id: true, name: true },
    });
    group = {
      group: groupDoc ? { _id: groupDoc.id, name: groupDoc.name } : null,
      total: g.items.length,
      me: g.items.find((x) => String(x.student._id) === String(studentId)) || null,
    };
  }

  return {
    overall: {
      total: all.items.length,
      me: mine || null,
    },
    group,
  };
};
