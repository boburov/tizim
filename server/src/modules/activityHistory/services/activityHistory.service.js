import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { assertTargetInScope } from "../../../helpers/branchAccess.helper.js";
import { ROLES } from "../../../constants/roles.js";

// ─────────────────────────────────────────────────────────────────────────────
// Faoliyat tarixi (Arxiv) - o'chirilgan ma'lumot EMAS, balki mavjud domen
// yozuvlaridan O'QISH VAQTIDA yig'iladigan xronologik hodisalar oqimi. Hech qanday
// yangi yozuv yo'li (write-path) qo'shilmaydi - shu sabab mavjud funksiya buzilmaydi
// va o'tmishdagi ma'lumot ham avtomatik ko'rinadi.
// ─────────────────────────────────────────────────────────────────────────────

// Chiqish sababi bo'yicha "guruhdan chiqdi" hodisasi sarlavhasi.
const LEFT_TITLE = {
  removed: "Guruhdan chiqarildi",
  graduated: "Guruhni bitirdi",
  transferred: "Boshqa guruhga o'tkazildi",
};

const DEPOSIT_TITLE = {
  topup: "Depozit to'ldirildi",
  withdraw: "Depozitdan yechildi",
  refund: "Depozitga qaytarildi",
};

const monthLabel = (year, month) => `${month}-oy, ${year}`;

// Bitta hodisa obyekti (frontend type -> ikon/tone bilan chizadi).
const makeEvent = ({
  id,
  type,
  title,
  description = "",
  date,
  performedBy = null,
  student = null,
  group = null,
  amount = null,
}) => ({
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

const groupRef = (g) =>
  g ? { _id: g.id, name: g.name } : null;
const userRef = (u) =>
  u ? { _id: u.id, firstName: u.firstName, lastName: u.lastName } : null;

// performedBy id'larini (turli manbalardan) bitta so'rovda ism bilan to'ldiradi.
const resolvePerformers = async (events) => {
  const ids = new Set();
  for (const e of events) {
    if (e.performedBy && typeof e.performedBy !== "object") ids.add(String(e.performedBy));
  }
  if (ids.size === 0) return;
  const users = await prisma.user.findMany({
    where: { id: { in: [...ids] } },
    // `id` ATAYLAB: xarita kaliti sifatida kerak.
    select: { id: true, firstName: true, lastName: true },
  });
  const map = new Map(users.map((u) => [String(u.id), u]));
  for (const e of events) {
    if (e.performedBy && typeof e.performedBy !== "object") {
      e.performedBy = userRef(map.get(String(e.performedBy))) || null;
    }
  }
};

// Yangi -> eski tartib, keyin sahifalash. total = umumiy hodisalar soni.
const paginate = (events, page, limit) => {
  events.sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    return tb - ta;
  });
  const total = events.length;
  const start = (page - 1) * limit;
  return { items: events.slice(start, start + limit), total, page, limit };
};

// ─── A'zolik (qo'shildi / chiqdi) hodisalari ───
const membershipEvents = (m, { withStudent = false } = {}) => {
  const out = [];
  const g = groupRef(m.group);
  const s = withStudent ? userRef(m.student) : null;
  out.push(
    makeEvent({
      id: `mem-join:${m.id}`,
      type: "student_joined_group",
      title: "Guruhga qo'shildi",
      // Guruh/o'quvchi nomi "chip"da ko'rsatiladi - tavsifda takrorlamaymiz.
      description: "",
      date: m.joinedAt,
      group: g,
      student: s,
    }),
  );
  if (m.leftAt) {
    out.push(
      makeEvent({
        id: `mem-left:${m.id}`,
        type: "student_left_group",
        title: LEFT_TITLE[m.leftReason] || "Guruhdan chiqdi",
        description: m.leftReasonTitle || "",
        date: m.leftAt,
        group: g,
        student: s,
      }),
    );
  }
  return out;
};

// ─── Muzlatish / chiqarish hodisalari ───
const freezeEvents = (f, { withStudent = false } = {}) => {
  const s = withStudent ? userRef(f.student) : null;
  const out = [
    makeEvent({
      id: `freeze:${f.id}`,
      type: "student_frozen",
      title: "Muzlatildi",
      description: f.reason || "",
      date: f.startDate,
      performedBy: f.createdBy || null,
      student: s,
    }),
  ];
  if (f.endDate) {
    out.push(
      makeEvent({
        id: `unfreeze:${f.id}`,
        type: "student_unfrozen",
        title: "Muzlatishdan chiqarildi",
        date: f.endDate,
        performedBy: f.endedBy || null,
        student: s,
      }),
    );
  }
  return out;
};

// ─── To'lov (qabul qilindi / bekor qilindi) ───
// PaymentTransaction soft-delete = bekor qilingan to'lov (deletedAt/deletedBy).
const paymentEvent = (t, { withStudent = false } = {}) => {
  const s = withStudent ? userRef(t.student) : null;
  const g = groupRef(t.group);
  const period = monthLabel(t.year, t.month);
  const methodLabel = t.source === "deposit" ? "Depozitdan" : t.method === "card" ? "Karta" : "Naqd";
  if (t.isDeleted) {
    return makeEvent({
      id: `pay-void:${t.id}`,
      type: "payment_cancelled",
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
    type: "payment_received",
    title: "To'lov qabul qilindi",
    description: `${period} · ${methodLabel}`,
    date: t.paidAt,
    performedBy: t.createdBy || null,
    student: s,
    group: g,
    amount: t.amount,
  });
};

const writeOffEvent = (w, { withStudent = false } = {}) => {
  const s = withStudent
    ? userRef(w.student) || (w.studentName ? { name: w.studentName } : null)
    : null;
  return makeEvent({
    id: `writeoff:${w.id}`,
    type: "debt_written_off",
    title: "Qarz hisobdan chiqarildi",
    description: w.reasonTitle || w.groupName || "",
    date: w.createdAt,
    performedBy: w.createdBy || null,
    student: s,
    group: groupRef(w.group),
    amount: w.amount,
  });
};

const depositEvent = (d) =>
  makeEvent({
    id: `deposit:${d.id}`,
    type: `deposit_${d.type}`,
    title: DEPOSIT_TITLE[d.type] || "Depozit amali",
    description: d.note || "",
    date: d.paidAt,
    performedBy: d.createdBy || null,
    amount: d.amount,
  });

const archiveLogEvent = (a) =>
  makeEvent({
    id: `archivelog:${a.id}`,
    type: a.action === "restore" ? "user_restored" : "user_archived",
    title: a.action === "restore" ? "Arxivdan tiklandi" : "Arxivlandi",
    description: a.reasonTitle || "",
    date: a.createdAt,
    performedBy: a.performedBy || null,
  });

// ─── O'qituvchi biriktirish davri (guruh timeline) ───
const teacherPeriodEvents = (tp) => {
  const out = [
    makeEvent({
      id: `tp-start:${tp.id}`,
      type: "teacher_assigned",
      title: "O'qituvchi biriktirildi",
      description: tp.teacher
        ? `${tp.teacher.firstName} ${tp.teacher.lastName}`.trim()
        : "",
      date: tp.startDate,
      performedBy: tp.createdBy || null,
    }),
  ];
  if (tp.endDate) {
    out.push(
      makeEvent({
        id: `tp-end:${tp.id}`,
        type: "teacher_unassigned",
        title: "O'qituvchi olib tashlandi",
        description: tp.teacher
          ? `${tp.teacher.firstName} ${tp.teacher.lastName}`.trim()
          : "",
        date: tp.endDate,
        performedBy: tp.updatedBy || null,
      }),
    );
  }
  return out;
};

// ═══════════════════ O'QUVCHI TIMELINE ═══════════════════
export const getStudentTimeline = async (
  studentId,
  { page = 1, limit = 30, scope = null } = {},
) => {
  const student = await prisma.user.findUnique({
    where: { id: String(studentId) },
  });
  if (!student || student.role !== ROLES.STUDENT) {
    throw new ApiError(404, "O'quvchi topilmadi");
  }

  // FILIAL CHEGARASI.
  //
  // Ilgari bu modul owner-only edi. Endi `activity_logs.read` ruxsatiga
  // ochilgan, ya'ni filial direktori ham kiradi. Timeline o'quvchining
  // BUTUN tarixini beradi - to'lovlar, qarz hisobdan chiqarishlar,
  // depozitlar - shuning uchun boshqa filial o'quvchisiga kirish
  // to'silishi kerak.
  if (scope) {
    assertTargetInScope(scope.allowedBranchIds, scope.canSeeAllBranches, student);
  }

  const [memberships, freezes, txns, writeOffs, deposits, archiveLogs] =
    await Promise.all([
      // `student`/`group`/`user` -> `studentId`/`groupId`/`userId`:
      // Prisma'da nomsiz maydonlar RELATION.
      prisma.groupMembership.findMany({
        where: { studentId: String(studentId), isDeleted: false },
        include: { group: { select: { id: true, name: true } } },
      }),
      prisma.studentFreeze.findMany({
        where: { studentId: String(studentId), isDeleted: false },
      }),
      // soft-delete qilingan (bekor qilingan) to'lovlar ham kerak - shuning uchun
      // isDeleted filtrlanmaydi.
      prisma.paymentTransaction.findMany({
        where: { studentId: String(studentId) },
        include: { group: { select: { id: true, name: true } } },
      }),
      prisma.debtWriteOff.findMany({
        where: { studentId: String(studentId) },
        include: { group: { select: { id: true, name: true } } },
      }),
      prisma.depositTransaction.findMany({
        where: { studentId: String(studentId), isDeleted: false },
      }),
      prisma.archiveLog.findMany({ where: { userId: String(studentId) } }),
    ]);

  const events = [];
  for (const m of memberships) events.push(...membershipEvents(m));
  for (const f of freezes) events.push(...freezeEvents(f));
  for (const t of txns) events.push(paymentEvent(t));
  for (const w of writeOffs) events.push(writeOffEvent(w));
  for (const d of deposits) events.push(depositEvent(d));
  for (const a of archiveLogs) events.push(archiveLogEvent(a));

  await resolvePerformers(events);
  return paginate(events, page, limit);
};

// ═══════════════════ GURUH TIMELINE ═══════════════════
export const getGroupTimeline = async (
  groupId,
  { page = 1, limit = 30, scope = null } = {},
) => {
  const group = await prisma.group.findUnique({ where: { id: String(groupId) } });
  if (!group) throw new ApiError(404, "Guruh topilmadi");

  // FILIAL CHEGARASI - o'quvchi timeline'i bilan bir xil sabab.
  // Guruhda `branchId` bevosita bor (required), shuning uchun
  // assertTargetInScope emas, to'g'ridan-to'g'ri solishtiriladi.
  if (scope && !scope.canSeeAllBranches) {
    const allowed = (scope.allowedBranchIds || []).map(String);
    if (!group.branchId || !allowed.includes(String(group.branchId))) {
      throw new ApiError(403, "Bu guruhga kirish huquqingiz yo'q");
    }
  }

  const [memberships, teacherPeriods, txns, writeOffs] = await Promise.all([
    prisma.groupMembership.findMany({
      where: { groupId: String(groupId), isDeleted: false },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.teacherGroupPeriod.findMany({
      where: { groupId: String(groupId), isDeleted: false },
      include: {
        teacher: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.paymentTransaction.findMany({
      where: { groupId: String(groupId) },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.debtWriteOff.findMany({
      where: { groupId: String(groupId) },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  // Guruh a'zolarining muzlatish hodisalari (muzlatish guruhga bog'lanmagan,
  // shu sabab a'zo o'quvchilar bo'yicha yig'amiz).
  const studentIds = [
    ...new Set(memberships.map((m) => m.student?.id).filter(Boolean).map(String)),
  ];
  const freezes = studentIds.length
    ? await prisma.studentFreeze.findMany({
        where: { studentId: { in: studentIds }, isDeleted: false },
        include: {
          student: { select: { id: true, firstName: true, lastName: true } },
        },
      })
    : [];

  const events = [];
  const gRef = groupRef(group);

  events.push(
    makeEvent({
      id: `group-created:${group.id}`,
      type: "group_created",
      title: "Guruh yaratildi",
      description: group.name || "",
      date: group.createdAt,
      group: gRef,
    }),
  );
  const now = Date.now();
  if (group.endDate && new Date(group.endDate).getTime() <= now && !group.isActive) {
    events.push(
      makeEvent({
        id: `group-ended:${group.id}`,
        type: "group_ended",
        title: "Guruh yakunlandi",
        description: group.name || "",
        date: group.endDate,
        group: gRef,
      }),
    );
  }

  for (const m of memberships) events.push(...membershipEvents(m, { withStudent: true }));
  for (const tp of teacherPeriods) events.push(...teacherPeriodEvents(tp));
  for (const t of txns) events.push(paymentEvent(t, { withStudent: true }));
  for (const w of writeOffs) events.push(writeOffEvent(w, { withStudent: true }));
  for (const f of freezes) events.push(...freezeEvents(f, { withStudent: true }));

  await resolvePerformers(events);
  return paginate(events, page, limit);
};
