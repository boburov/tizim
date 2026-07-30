import mongoose from "mongoose";
import Group from "../../../models/group.model.js";
import User from "../../../models/user.model.js";
import Attendance from "../../../models/attendance.model.js";
import Grade from "../../../models/grade.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import TeacherAttendance from "../../../models/teacherAttendance.model.js";
import TeacherAbsence from "../../../models/teacherAbsence.model.js";
import TeacherGroupPeriod from "../../../models/teacherGroupPeriod.model.js";
import { ROLES } from "../../../constants/roles.js";
import { buildWindows } from "./student.signal.js";

// O'QITUVCHI SIGNALLARI - sof aggregation.
//
// ENG MUHIM QOIDA (Gemini "The Hallucinated Scolding" deb atagan xavf):
// o'qituvchi ko'rsatkichi XOM O'RTACHA bo'lishi mumkin EMAS. Qiyin guruh
// olgan o'qituvchi ("boshlang'ich daraja", "qarzdor o'quvchilar") xom
// o'rtachada har doim yomon chiqadi. Bunday insight bir marta ko'rsatilsa,
// owner butun tizimga ishonishni to'xtatadi.
//
// Shuning uchun bu yerda ikkita narsa hisoblanadi:
//   1. o'qituvchi guruhlarining natijasi (davomat, baho o'sishi)
//   2. shu guruhlarning BOSHLANG'ICH darajasi (baseline)
// Ball esa FARQdan chiqadi - "o'quvchilar u bilan qanchalik yaxshilandi",
// "uning o'quvchilari qanchalik yaxshi" dan emas.

const DAY_MS = 24 * 60 * 60 * 1000;
const toId = (v) => new mongoose.Types.ObjectId(String(v));

/**
 * Filialdagi faol o'qituvchilar va ular hozir dars berayotgan guruhlar.
 *
 * MANBA: TeacherGroupPeriod (endDate=null → hozir dars beradi), Group.teachers[]
 * EMAS. Sabab kodbazada aniq yozilgan: Group.teachers[] tarixsiz massiv,
 * TeacherGroupPeriod esa manba haqiqati. Massivdan foydalanish o'tgan oy
 * ketgan o'qituvchini ham "hozir ishlayapti" deb ko'rsatardi.
 */
export const loadTeachers = async (branchId) => {
  const groups = await Group.find({
    branchId: toId(branchId),
    isDeleted: false,
    isActive: true,
  })
    .select("_id name courseId")
    .lean();
  if (!groups.length) return { teachers: [], groups: [] };

  const groupIds = groups.map((g) => g._id);
  const periods = await TeacherGroupPeriod.find({
    group: { $in: groupIds },
    endDate: null,
    isDeleted: false,
  })
    .select("teacher group")
    .lean();
  if (!periods.length) return { teachers: [], groups };

  const byTeacher = new Map();
  for (const p of periods) {
    const tid = String(p.teacher);
    if (!byTeacher.has(tid)) byTeacher.set(tid, []);
    byTeacher.get(tid).push(p.group);
  }

  const users = await User.find({
    _id: { $in: [...byTeacher.keys()].map(toId) },
    role: ROLES.TEACHER,
    isActive: true,
    isDeleted: false,
  })
    .select("_id firstName lastName")
    .lean();

  return {
    teachers: users.map((u) => ({
      ...u,
      groupIds: byTeacher.get(String(u._id)) || [],
    })),
    groups,
  };
};

/**
 * O'QITUVCHI DAVOMATI - kelmagan kunlar.
 *
 * IKKI MANBA, ATAYLAB: TeacherAttendance (xodim kunlik davomati, HR
 * tomoni) va TeacherAbsence (guruh darslari uchun "o'qituvchi kelmadi"
 * belgisi, o'quv tomoni). Ular turli jarayonlarda to'ldiriladi va biri
 * bo'sh bo'lishi mumkin, shuning uchun ikkalasi ham o'qiladi.
 *
 * MUHIM CHEKLOV: kodbazada o'qituvchi KECHIKISHI yozilmaydi -
 * TeacherAttendance.status faqat present/absent/excused, lateMinutes YO'Q
 * (o'quvchi davomatida bor, o'qituvchida yo'q). Shuning uchun bu signal
 * "kechikdi" emas, "kelmadi" deb nomlanadi va shunday ko'rsatiladi.
 * Kechikishni ko'rsatish uchun avval uni yozadigan maydon kerak.
 */
export const teacherAbsenceSignal = async (teacherIds, groupIds, now) => {
  const since = new Date(now.getTime() - 28 * DAY_MS);
  const weekSince = new Date(now.getTime() - 7 * DAY_MS);
  const ids = teacherIds.map(toId);

  const [hrRows, lessonRows] = await Promise.all([
    // (a) Xodim kunlik davomati. excused CHIQARIB TASHLANADI: ruxsat
    // berilgan yo'qlik muammo emas, aks holda ta'tildagi o'qituvchi
    // "muammoli" bo'lib chiqardi.
    TeacherAttendance.aggregate([
      {
        $match: {
          teacher: { $in: ids },
          isDeleted: false,
          date: { $gte: since },
          status: "absent",
        },
      },
      {
        $group: {
          _id: "$teacher",
          total: { $sum: 1 },
          thisWeek: { $sum: { $cond: [{ $gte: ["$date", weekSince] }, 1, 0] } },
          ids: { $push: "$_id" },
          lastDate: { $max: "$date" },
        },
      },
    ]),
    // (b) Dars o'tkazilmagan kunlar - guruh bo'yicha.
    TeacherAbsence.aggregate([
      {
        $match: {
          teacher: { $in: ids },
          group: { $in: groupIds.map(toId) },
          isDeleted: false,
          date: { $gte: since },
        },
      },
      {
        $group: {
          _id: "$teacher",
          total: { $sum: 1 },
          thisWeek: { $sum: { $cond: [{ $gte: ["$date", weekSince] }, 1, 0] } },
          ids: { $push: "$_id" },
          groups: { $addToSet: "$group" },
          lastDate: { $max: "$date" },
        },
      },
    ]),
  ]);

  const out = new Map();
  const ensure = (tid) => {
    if (!out.has(tid)) {
      out.set(tid, {
        hrAbsences: 0,
        hrThisWeek: 0,
        missedLessons: 0,
        missedThisWeek: 0,
        affectedGroups: 0,
        lastDate: null,
        hrIds: [],
        lessonIds: [],
      });
    }
    return out.get(tid);
  };

  for (const r of hrRows) {
    const e = ensure(String(r._id));
    e.hrAbsences = r.total;
    e.hrThisWeek = r.thisWeek;
    e.hrIds = (r.ids || []).slice(0, 20);
    if (!e.lastDate || r.lastDate > e.lastDate) e.lastDate = r.lastDate;
  }
  for (const r of lessonRows) {
    const e = ensure(String(r._id));
    e.missedLessons = r.total;
    e.missedThisWeek = r.thisWeek;
    e.affectedGroups = (r.groups || []).length;
    e.lessonIds = (r.ids || []).slice(0, 20);
    if (!e.lastDate || r.lastDate > e.lastDate) e.lastDate = r.lastDate;
  }
  return out;
};

/**
 * YUKLAMA - guruh soni va jami o'quvchi soni.
 * "Bir o'qituvchining o'quvchisi juda kam" signalining asosi.
 */
export const teacherLoadSignal = async (teachers) => {
  const allGroupIds = [...new Set(teachers.flatMap((t) => t.groupIds.map(String)))];
  if (!allGroupIds.length) return new Map();

  const rows = await GroupMembership.aggregate([
    {
      $match: {
        group: { $in: allGroupIds.map(toId) },
        leftAt: null,
        isDeleted: false,
      },
    },
    { $group: { _id: "$group", students: { $sum: 1 } } },
  ]);
  const byGroup = new Map(rows.map((r) => [String(r._id), r.students]));

  const out = new Map();
  for (const t of teachers) {
    let students = 0;
    const perGroup = [];
    for (const gid of t.groupIds) {
      const n = byGroup.get(String(gid)) || 0;
      students += n;
      perGroup.push({ groupId: gid, students: n });
    }
    out.set(String(t._id), {
      groups: t.groupIds.length,
      students,
      perGroup,
      avgPerGroup: t.groupIds.length ? students / t.groupIds.length : 0,
    });
  }
  return out;
};

/**
 * NATIJA signali - o'qituvchi guruhlaridagi davomat va baho O'SISHI.
 *
 * Baho o'sishi (recent - prior) ishlatiladi, xom o'rtacha EMAS: bu aynan
 * yuqoridagi qiyinlik moslashtirish. "Uning o'quvchilari 3.2 dan 4.1 ga
 * ko'tarildi" - o'qituvchining hissasi. "Uning o'quvchilari 4.5 ball" -
 * u shunchaki kuchli guruh olgan bo'lishi mumkin.
 */
export const teacherOutcomeSignal = async (teachers, now) => {
  const windows = buildWindows(now);
  const allGroupIds = [...new Set(teachers.flatMap((t) => t.groupIds.map(String)))];
  if (!allGroupIds.length) return new Map();
  const gids = allGroupIds.map(toId);

  const [attRows, gradeRows] = await Promise.all([
    Attendance.aggregate([
      {
        $match: {
          group: { $in: gids },
          isDeleted: false,
          date: { $gte: windows.recentStart, $lt: windows.end },
          status: { $in: ["present", "absent"] },
        },
      },
      {
        $group: {
          _id: "$group",
          present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
          total: { $sum: 1 },
        },
      },
    ]),
    Grade.aggregate([
      {
        $match: {
          group: { $in: gids },
          isDeleted: false,
          date: { $gte: windows.priorStart, $lt: windows.end },
        },
      },
      {
        $group: {
          _id: {
            group: "$group",
            window: {
              $cond: [{ $gte: ["$date", windows.recentStart] }, "recent", "prior"],
            },
          },
          avg: { $avg: "$value" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const attByGroup = new Map(
    attRows.map((r) => [
      String(r._id),
      { rate: r.total > 0 ? r.present / r.total : null, lessons: r.total },
    ]),
  );
  const gradeByGroup = new Map();
  for (const r of gradeRows) {
    const gid = String(r._id.group);
    if (!gradeByGroup.has(gid)) {
      gradeByGroup.set(gid, { recentAvg: null, priorAvg: null, count: 0 });
    }
    const e = gradeByGroup.get(gid);
    if (r._id.window === "recent") {
      e.recentAvg = r.avg;
      e.count = r.count;
    } else {
      e.priorAvg = r.avg;
    }
  }

  const out = new Map();
  for (const t of teachers) {
    let lessons = 0;
    let present = 0;
    let gradeDelta = 0;
    let gradeSamples = 0;
    let groupsWithGrades = 0;

    for (const gid of t.groupIds) {
      const a = attByGroup.get(String(gid));
      if (a?.lessons) {
        lessons += a.lessons;
        present += a.rate * a.lessons;
      }
      const g = gradeByGroup.get(String(gid));
      if (g?.recentAvg != null && g?.priorAvg != null) {
        gradeDelta += g.recentAvg - g.priorAvg;
        gradeSamples += g.count;
        groupsWithGrades += 1;
      }
    }

    out.set(String(t._id), {
      attendanceRate: lessons > 0 ? present / lessons : null,
      lessons,
      // Guruhlar bo'yicha O'RTACHA o'sish (yig'indi emas): ko'p guruhli
      // o'qituvchi shunchaki guruh soni tufayli yuqoriga chiqmasligi kerak.
      gradeImprovement: groupsWithGrades > 0 ? gradeDelta / groupsWithGrades : null,
      gradeSamples,
      groupsWithGrades,
    });
  }
  return out;
};

/** Filialdagi o'rtacha ko'rsatkich - o'qituvchini shunga NISBATAN baholash uchun. */
export const teacherBaseline = (outcomes, loads) => {
  const rates = [...outcomes.values()].map((o) => o.attendanceRate).filter((v) => v != null);
  const improvements = [...outcomes.values()]
    .map((o) => o.gradeImprovement)
    .filter((v) => v != null);
  const studentCounts = [...loads.values()].map((l) => l.students).filter((v) => v > 0);

  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  return {
    attendanceRate: mean(rates),
    gradeImprovement: mean(improvements),
    studentsPerTeacher: mean(studentCounts),
    // Namuna hajmi: 1-2 o'qituvchili filialda "o'rtachadan past" ma'nosiz.
    // Scoring shu songa qarab ishonchni pasaytiradi.
    sampleSize: Math.max(rates.length, improvements.length, studentCounts.length),
  };
};

/** Barcha o'qituvchi signallarini yig'adi. */
export const collectTeacherSignals = async (branchId, now = new Date()) => {
  const { teachers, groups } = await loadTeachers(branchId);
  if (!teachers.length) return { teachers: [], groups, signals: new Map(), baseline: null };

  const teacherIds = teachers.map((t) => String(t._id));
  const groupIds = groups.map((g) => g._id);

  const [absence, loads, outcomes] = await Promise.all([
    teacherAbsenceSignal(teacherIds, groupIds, now),
    teacherLoadSignal(teachers),
    teacherOutcomeSignal(teachers, now),
  ]);

  const baseline = teacherBaseline(outcomes, loads);

  const signals = new Map();
  for (const t of teachers) {
    const tid = String(t._id);
    signals.set(tid, {
      absence: absence.get(tid) || {
        hrAbsences: 0,
        hrThisWeek: 0,
        missedLessons: 0,
        missedThisWeek: 0,
        affectedGroups: 0,
        lastDate: null,
        hrIds: [],
        lessonIds: [],
      },
      load: loads.get(tid) || { groups: 0, students: 0, perGroup: [], avgPerGroup: 0 },
      outcome: outcomes.get(tid) || {
        attendanceRate: null,
        lessons: 0,
        gradeImprovement: null,
        gradeSamples: 0,
        groupsWithGrades: 0,
      },
      baseline,
    });
  }
  return { teachers, groups, signals, baseline };
};
