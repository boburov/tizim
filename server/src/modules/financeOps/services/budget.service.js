import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId } from "../../../utils/serialize.js";
import { resolveBranchForWrite, branchFilter } from "../../../helpers/branchContext.helper.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * BYUDJET BOSHQARUVI — REJA, PUL EMAS
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── BYUDJET JURNALGA YOZILMAYDI ──
 * Bu shu modulning eng muhim qoidasi. Byudjet — NIYAT, pul harakati
 * emas. Uni jurnalga yozish soxta xarajat yaratardi va "byudjet vs
 * fakt" taqqoslashi o'z-o'zini taqqoslashga aylanardi.
 *
 * Shuning uchun bu servis `financialTransaction.service.js` ni
 * UMUMAN chaqirmaydi va hech qanday `JournalEntry` yaratmaydi.
 *
 * ── UCH DARAJA ARALASHMAYDI ──
 *   total    — butun davr uchun yagona shift
 *   category — aniq kategoriya
 *   kind     — kategoriya turi (payroll/operating/tax/capital)
 * Ular BIR-BIRINI QAMRAMAYDI: "jami 50 mln, shundan marketing 5 mln"
 * — ikkalasi ham to'g'ri va ular qo'shilmaydi. Qisman unique
 * indekslar har darajada takrorlanishni to'sadi
 * (20260819110000_finance_partial_unique_indexes).
 */

const actorId = (u) => u?.id || u?._id || null;

/** Qator kiritilishini tekshiradi — daraja bo'yicha maydonlar farq qiladi. */
const normalizeLine = (line) => {
  const scope = line.scope || "category";
  const amount = Math.round(Number(line.amount) || 0);
  if (amount < 0) throw new ApiError(400, "Byudjet summasi manfiy bo'lishi mumkin emas");

  if (scope === "category" && !line.categoryId) {
    throw new ApiError(400, "Kategoriya qatori uchun kategoriya tanlanishi shart");
  }
  if (scope === "kind" && !line.categoryKind) {
    throw new ApiError(400, "Tur qatori uchun kategoriya turi tanlanishi shart");
  }
  return {
    scope,
    // Daraja bilan mos kelmaydigan maydon TOZALANADI: aks holda
    // `total` qatoriga tasodifan kategoriya yopishib qolib, qisman
    // unique indeks kutilmaganda ishga tushardi.
    categoryId: scope === "category" ? String(line.categoryId) : null,
    categoryKind: scope === "kind" ? line.categoryKind : null,
    amount,
    note: line.note || "",
  };
};

export const listBudgets = async ({ year, branchId } = {}) => {
  const rows = await prisma.budget.findMany({
    where: {
      isDeleted: false,
      ...(year ? { year: Number(year) } : {}),
      ...(branchId ? { branchId: String(branchId) } : branchFilter()),
    },
    include: {
      lines: { include: { category: { select: { id: true, name: true, kind: true } } } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 50,
  });
  return rows.map(withLegacyId);
};

export const getBudget = async (id) => {
  const b = await prisma.budget.findFirst({
    where: { id: String(id), isDeleted: false },
    include: {
      lines: { include: { category: { select: { id: true, name: true, kind: true } } } },
      branch: { select: { id: true, name: true } },
    },
  });
  if (!b) throw new ApiError(404, "Byudjet topilmadi");
  return withLegacyId(b);
};

export const createBudget = async (body, currentUser) => {
  const branchId =
    body.branchId === null ? null : await resolveBranchForWrite(currentUser, body.branchId ?? null);

  const periodType = body.periodType || "month";
  const year = Number(body.year);
  // `month`/`quarter` TEGISHLI BO'LMAGANDA 0 (NULL emas) — Postgres'da
  // NULL != NULL bo'lgani uchun nullable ustun takrorlanishni
  // to'smasdi (qarang schema.prisma, model Budget).
  const month = periodType === "month" ? Number(body.month) : 0;
  const quarter = periodType === "quarter" ? Number(body.quarter) : 0;

  if (!year) throw new ApiError(400, "Yil ko'rsatilishi shart");
  if (periodType === "month" && (!month || month < 1 || month > 12)) {
    throw new ApiError(400, "Oy 1–12 oralig'ida bo'lishi kerak");
  }

  const lines = (body.lines || []).map(normalizeLine);

  try {
    const created = await prisma.budget.create({
      data: {
        name: body.name || "",
        branchId,
        periodType,
        year,
        month,
        quarter,
        status: body.status || "active",
        note: body.note || "",
        createdById: actorId(currentUser),
        lines: { create: lines },
      },
      include: { lines: true },
    });
    return withLegacyId(created);
  } catch (err) {
    // Qisman unique indeks: bir davrga ikkinchi byudjet.
    if (err?.code === "P2002") {
      throw new ApiError(409, "Bu davr uchun byudjet allaqachon mavjud");
    }
    throw err;
  }
};

/**
 * BYUDJETNI YANGILASH.
 *
 * Qatorlar TO'LIQ almashtiriladi (`set` semantikasi): UI butun
 * ro'yxatni yuboradi va qaysi qator o'chgani/qo'shilganini server
 * hisoblab o'tirmaydi. Bu soddaroq va xatosizroq — qisman
 * yangilashda "o'chirilgan qator qayta paydo bo'ldi" turidagi
 * nosozliklar tug'iladi.
 */
export const updateBudget = async (id, body, currentUser) => {
  const existing = await prisma.budget.findFirst({
    where: { id: String(id), isDeleted: false },
    select: { id: true },
  });
  if (!existing) throw new ApiError(404, "Byudjet topilmadi");

  const data = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.note !== undefined) data.note = body.note;
  if (body.status !== undefined) data.status = body.status;

  if (Array.isArray(body.lines)) {
    const lines = body.lines.map(normalizeLine);
    return prisma.$transaction(async (tx) => {
      await tx.budgetLine.deleteMany({ where: { budgetId: existing.id } });
      const updated = await tx.budget.update({
        where: { id: existing.id },
        data: { ...data, lines: { create: lines } },
        include: { lines: true },
      });
      return withLegacyId(updated);
    });
  }

  const updated = await prisma.budget.update({
    where: { id: existing.id },
    data,
    include: { lines: true },
  });
  return withLegacyId(updated);
};

/**
 * O'CHIRISH — YUMSHOQ (soft delete).
 *
 * Byudjet o'tmishdagi taqqoslashning bir qismi: uni butunlay
 * yo'qotish "o'sha oyda reja bor edimi?" degan savolni javobsiz
 * qoldirardi.
 */
export const removeBudget = async (id, currentUser) => {
  const b = await prisma.budget.findFirst({
    where: { id: String(id), isDeleted: false },
    select: { id: true },
  });
  if (!b) throw new ApiError(404, "Byudjet topilmadi");
  await prisma.budget.update({
    where: { id: b.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser) },
  });
  return { id: b.id, deleted: true };
};
