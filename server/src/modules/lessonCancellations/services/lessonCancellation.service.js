import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { parseLocalDay, dateKeyOf } from "../../../helpers/attendance.helper.js";
import { branchFilter } from "../../../helpers/branchContext.helper.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import * as financePaymentService from "../../finance/services/studentPayment.service.js";
import * as teacherSalaryService from "../../teacherSalary/services/teacherSalary.service.js";

// BEKOR QILINGAN DARS - servis qatlami.
//
// Har bir yozuv/o'chirish MOLIYAGA ta'sir qiladi (o'quvchi qarzi va o'qituvchi
// soatbay maoshi dars soniga bog'liq), shuning uchun o'sha oy DARHOL qayta
// hisoblanadi. Tungi job'ni kutish "nega qarz o'zgarmadi?" degan savolni
// tug'dirardi.
//
// ─────────────────────────────────────────────────────────────────
// MONGO → PRISMA
//   { group: id }                → { groupId: id }
//   doc.softDelete(by)           → update({ isDeleted, deletedAt, deletedBy })
//   err.code === 11000           → err.code === "P2002"   ← MUHIM
//
// TAKRORLANISH KODI: Mongo dublikat kalitni `11000` bilan qaytarardi,
// Postgres/Prisma esa `P2002` bilan. Eski tekshiruvni qoldirish
// 409 o'rniga xom 500 berardi - qisman unique indeks o'z ishini
// qilardi-yu, foydalanuvchi sababni ko'rmasdi.
// ─────────────────────────────────────────────────────────────────

const assertGroup = async (groupId) => {
  const group = await prisma.group.findFirst({
    where: { id: String(groupId), ...branchFilter(), isDeleted: false },
    select: { id: true, name: true },
  });
  if (!group) throw new ApiError(404, "Guruh topilmadi");
  return group;
};

// Moliya kaskadi: shu oyning to'lovlari va maoshlari qayta hisoblanadi.
// Best-effort - kaskad xatosi yozuvni bekor QILMAYDI (u allaqachon saqlangan
// va to'g'ri; tungi job qolganini tuzatadi).
const recomputeMonth = async (groupId, date) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  try {
    await financePaymentService.recalcForGroupMonth(groupId, year, month);
    await teacherSalaryService.recalcForGroupMonth(groupId, year, month);
  } catch (err) {
    logger.warn({ err, groupId, year, month }, "Dars bekor qilingach moliya qayta hisoblanmadi");
  }
};

export const create = async (body, currentUser) => {
  const group = await assertGroup(body.group);
  const date = parseLocalDay(body.date);
  if (!date) throw new ApiError(400, "Sana noto'g'ri");

  try {
    const doc = await prisma.lessonCancellation.create({
      data: {
        groupId: group.id,
        date,
        dateKey: dateKeyOf(date),
        slot: body.slot || "",
        reason: body.reason || "other",
        note: body.note || "",
        // Ko'chirilgan (makeup) bo'lsa dars baribir o'tiladi -> pul o'zgarmaydi.
        billable: Boolean(body.makeupDate) || Boolean(body.billable),
        makeupDate: body.makeupDate ? parseLocalDay(body.makeupDate) : null,
        createdById: currentUser?.id || currentUser?._id || null,
      },
    });
    await recomputeMonth(doc.groupId, date);
    return withLegacyId(doc);
  } catch (err) {
    // Qisman unique indeks: (groupId, dateKey, slot) WHERE isDeleted = false.
    if (err?.code === "P2002") {
      throw new ApiError(409, "Bu dars allaqachon bekor qilingan deb belgilangan");
    }
    throw err;
  }
};

export const list = async ({ groupId, year, month }) => {
  const where = { isDeleted: false };
  if (groupId) where.groupId = String(groupId);
  if (year && month) {
    where.date = {
      gte: new Date(Date.UTC(Number(year), Number(month) - 1, 1)),
      lte: new Date(Date.UTC(Number(year), Number(month), 0, 23, 59, 59, 999)),
    };
  }
  const rows = await prisma.lessonCancellation.findMany({
    where,
    include: {
      group: { select: { id: true, name: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { date: "desc" },
  });
  return withLegacyIds(rows);
};

export const remove = async (id, currentUser) => {
  const doc = await prisma.lessonCancellation.findFirst({
    where: { id: String(id), isDeleted: false },
    select: { id: true, groupId: true, date: true },
  });
  if (!doc) throw new ApiError(404, "Yozuv topilmadi");
  await assertGroup(doc.groupId);

  await prisma.lessonCancellation.update({
    where: { id: doc.id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: currentUser?.id || currentUser?._id || null,
    },
  });
  // Bekor qilish olib tashlandi -> dars qaytadi -> qarz va maosh oshadi.
  await recomputeMonth(doc.groupId, doc.date);
  return { ok: true };
};
