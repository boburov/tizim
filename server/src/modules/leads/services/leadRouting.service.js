import prisma from "../../../config/prisma.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ensureMainBranch } from "../../../helpers/branchAccess.helper.js";

// LID YO'NALTIRISH - qoida dvigateli.
//
// Batafsil sabab: models/leadRoutingRule.model.js.
//
// ══════════════════════════════════════════════════════════════════
// YECHIM TARTIBI (birinchi mos kelgan yutadi)
// ══════════════════════════════════════════════════════════════════
//   1. Manba bo'yicha aniq qoida  (priority bo'yicha, kichigi ustun)
//   2. Zaxira qoida               (isFallback)
//   3. ASOSIY FILIAL              (oxirgi chora - lid yo'qolmasin)
//
// 3-qadam ATAYLAB mavjud: qoida umuman sozlanmagan markazda ham lid
// biror ro'yxatga tushishi kerak. Aks holda tizim ishga tushgan
// birinchi kuni barcha lid "yo'q joyga" ketardi.

const toObjectId = (id) => (id ? String(id) : null);

/**
 * Manba kalitini normallashtiradi.
 *
 * `source` LeadOption ObjectId bo'lishi ham, erkin matn bo'lishi ham
 * mumkin (bot to'g'ridan-to'g'ri "telegram_chilonzor" yuborishi mumkin).
 * Ikkalasini bitta kalitga keltiramiz - aks holda qoida bir holatda
 * ishlab, ikkinchisida jimgina o'tkazib yuborilardi.
 */
export const resolveSourceKey = async (source) => {
  if (!source) return null;
  const raw = String(source).trim();
  if (!raw) return null;

  // Kalit 24-hex ko'rinishida bo'lsa - LeadOption ID'si bo'lishi mumkin.
  // (Mongo'da bu `mongoose.isValidObjectId` edi; format saqlangani uchun
  // oddiy regex yetadi.)
  if (/^[0-9a-fA-F]{24}$/.test(raw)) {
    const opt = await prisma.leadOption.findUnique({
      where: { id: raw },
      select: { name: true },
    });
    if (opt?.name) return opt.name.trim().toLowerCase();
  }
  return raw.toLowerCase();
};

/**
 * LIDNI QAYSI FILIALGA YO'NALTIRISH.
 *
 * @returns {Promise<{branchId, assigneeId, matchedBy, ruleId}>}
 *   matchedBy: "source" | "fallback" | "main_branch"
 */
export const route = async ({ source } = {}) => {
  const sourceKey = await resolveSourceKey(source);

  // 1) Manba bo'yicha aniq qoida.
  if (sourceKey) {
    const rule = await prisma.leadRoutingRule.findFirst({
      where: { sourceKey, isActive: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });

    if (rule) {
      return {
        branchId: rule.branchId,
        assigneeId: rule.assigneeId || null,
        matchedBy: "source",
        ruleId: rule.id,
      };
    }
  }

  // 2) Zaxira qoida.
  const fallback = await prisma.leadRoutingRule.findFirst({
    where: { isFallback: true, isActive: true },
  });

  if (fallback) {
    return {
      branchId: fallback.branchId,
      assigneeId: fallback.assigneeId || null,
      matchedBy: "fallback",
      ruleId: fallback.id,
    };
  }

  // 3) ASOSIY FILIAL - oxirgi chora.
  //
  // Bu yerga yetib kelish "qoidalar sozlanmagan" degani, xato emas.
  // Lekin logga yozamiz: owner ko'rib, qoida qo'shishi kerak.
  const main = await ensureMainBranch();
  if (!main?.id) {
    throw new ApiError(400, "Lid uchun filial aniqlanmadi - avval filial oching");
  }

  logger.warn(
    { sourceKey },
    "Lid yo'naltirish qoidasi topilmadi - asosiy filialga yuborildi",
  );

  return {
    // DIQQAT: `main._id` EMAS.
    //
    // `ensureMainBranch()` XOM Prisma natijasini qaytaradi (`id`), uni
    // `withLegacyId` bilan o'ramaydi - `_id` taxallusi faqat JAVOB
    // chegarasida qo'shiladi. Migratsiyada bu qator `_id` bo'lib
    // qolgan edi va `branchId: undefined` chiqib, lid yaratish
    // yiqilardi. Ya'ni "lid hech qachon yo'qolmaydi" invarianti
    // aynan zaxira yo'lida buzilgan edi.
    branchId: main.id,
    assigneeId: null,
    matchedBy: "main_branch",
    ruleId: null,
  };
};

// ============================================================
// QOIDALARNI BOSHQARISH
// ============================================================

export const list = async () => {
  const rules = await prisma.leadRoutingRule.findMany({
    orderBy: [{ isFallback: "asc" }, { priority: "asc" }, { createdAt: "asc" }],
    include: {
      branch: { select: { id: true, name: true, code: true } },
      assignee: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  // Klient eski populate shaklini kutadi: branchId/assigneeId OBYEKT.
  return rules.map((r) => ({
    ...withLegacyId(r),
    branchId: r.branch ? withLegacyId(r.branch) : null,
    assigneeId: r.assignee ? withLegacyId(r.assignee) : null,
  }));
};

export const create = async (body) => {
  const branch = await prisma.branch.findFirst({
    where: { id: String(body.branchId), isDeleted: false },
    select: { id: true },
  });
  if (!branch) throw new ApiError(400, "Filial topilmadi");

  const isFallback = Boolean(body.isFallback);
  const sourceKey = isFallback
    ? null
    : String(body.sourceKey || "").trim().toLowerCase() || null;

  try {
    // Model pre("validate") tekshiruvi Mongo'da edi - Prisma'da model
    // hook'i yo'q, shuning uchun shu yerda ochiq takrorlaymiz.
    if (!isFallback && !sourceKey) {
      throw new ApiError(400, "Qoida uchun manba kerak (yoki uni zaxira qiling)");
    }
    if (isFallback && sourceKey) {
      throw new ApiError(400, "Zaxira qoidada manba bo'lmaydi - u hammaga qo'llanadi");
    }

    const created = await prisma.leadRoutingRule.create({
      data: {
        branchId: toObjectId(body.branchId),
        sourceKey,
        isFallback,
        assigneeId: body.assigneeId || null,
        priority: body.priority ?? 100,
        note: String(body.note || "").trim(),
      },
    });
    return withLegacyId(created);
  } catch (err) {
    // Mongo E11000 → Prisma P2002 (qisman unique indekslar migratsiyada).
    if (err?.code === "P2002") {
      throw new ApiError(
        409,
        isFallback
          ? "Zaxira qoida allaqachon mavjud - faqat bittasi bo'lishi mumkin"
          : "Bu manba uchun shu filialda qoida allaqachon bor",
      );
    }
    throw err;
  }
};

export const update = async (id, body) => {
  const rule = await prisma.leadRoutingRule.findUnique({ where: { id } });
  if (!rule) throw new ApiError(404, "Qoida topilmadi");

  const data = {};
  if (body.branchId !== undefined) data.branchId = toObjectId(body.branchId);
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (body.note !== undefined) data.note = String(body.note || "").trim();

  const updated = await prisma.leadRoutingRule.update({ where: { id }, data });
  return withLegacyId(updated);
};

export const remove = async (id) => {
  const rule = await prisma.leadRoutingRule.findUnique({ where: { id } });
  if (!rule) throw new ApiError(404, "Qoida topilmadi");
  await prisma.leadRoutingRule.delete({ where: { id } });
  return withLegacyId(rule);
};
