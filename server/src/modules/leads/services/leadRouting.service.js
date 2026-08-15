import mongoose from "mongoose";
import LeadRoutingRule from "../../../models/leadRoutingRule.model.js";
import Branch from "../../../models/branch.model.js";
import LeadOption from "../../../models/leadOption.model.js";
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

const toObjectId = (id) =>
  id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));

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

  if (mongoose.isValidObjectId(raw)) {
    const opt = await LeadOption.findById(raw).select("name").lean();
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
    const rule = await LeadRoutingRule.findOne({
      sourceKey,
      isActive: true,
    })
      .sort({ priority: 1, createdAt: 1 })
      .lean();

    if (rule) {
      return {
        branchId: rule.branchId,
        assigneeId: rule.assigneeId || null,
        matchedBy: "source",
        ruleId: rule._id,
      };
    }
  }

  // 2) Zaxira qoida.
  const fallback = await LeadRoutingRule.findOne({
    isFallback: true,
    isActive: true,
  }).lean();

  if (fallback) {
    return {
      branchId: fallback.branchId,
      assigneeId: fallback.assigneeId || null,
      matchedBy: "fallback",
      ruleId: fallback._id,
    };
  }

  // 3) ASOSIY FILIAL - oxirgi chora.
  //
  // Bu yerga yetib kelish "qoidalar sozlanmagan" degani, xato emas.
  // Lekin logga yozamiz: owner ko'rib, qoida qo'shishi kerak.
  const main = await ensureMainBranch();
  if (!main?._id) {
    throw new ApiError(400, "Lid uchun filial aniqlanmadi - avval filial oching");
  }

  logger.warn(
    { sourceKey },
    "Lid yo'naltirish qoidasi topilmadi - asosiy filialga yuborildi",
  );

  return {
    branchId: main._id,
    assigneeId: null,
    matchedBy: "main_branch",
    ruleId: null,
  };
};

// ============================================================
// QOIDALARNI BOSHQARISH
// ============================================================

export const list = async () => {
  const rules = await LeadRoutingRule.find({})
    .sort({ isFallback: 1, priority: 1, createdAt: 1 })
    .populate("branchId", { name: 1, code: 1 })
    .populate("assigneeId", { firstName: 1, lastName: 1 })
    .lean();

  return rules;
};

export const create = async (body) => {
  const branch = await Branch.findOne({ _id: body.branchId, isDeleted: false })
    .select("_id")
    .lean();
  if (!branch) throw new ApiError(400, "Filial topilmadi");

  const isFallback = Boolean(body.isFallback);
  const sourceKey = isFallback
    ? null
    : String(body.sourceKey || "").trim().toLowerCase() || null;

  try {
    return await LeadRoutingRule.create({
      branchId: toObjectId(body.branchId),
      sourceKey,
      isFallback,
      assigneeId: body.assigneeId || null,
      priority: body.priority ?? 100,
      note: String(body.note || "").trim(),
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(
        409,
        isFallback
          ? "Zaxira qoida allaqachon mavjud - faqat bittasi bo'lishi mumkin"
          : "Bu manba uchun shu filialda qoida allaqachon bor",
      );
    }
    // Model validatsiyasi (manba yo'q / zaxirada manba bor).
    if (err?.name === "ValidationError") throw new ApiError(400, err.message);
    throw err;
  }
};

export const update = async (id, body) => {
  const rule = await LeadRoutingRule.findById(id);
  if (!rule) throw new ApiError(404, "Qoida topilmadi");

  if (body.branchId !== undefined) rule.branchId = toObjectId(body.branchId);
  if (body.assigneeId !== undefined) rule.assigneeId = body.assigneeId || null;
  if (body.priority !== undefined) rule.priority = body.priority;
  if (body.isActive !== undefined) rule.isActive = Boolean(body.isActive);
  if (body.note !== undefined) rule.note = String(body.note || "").trim();

  await rule.save();
  return rule;
};

export const remove = async (id) => {
  const rule = await LeadRoutingRule.findById(id);
  if (!rule) throw new ApiError(404, "Qoida topilmadi");
  await LeadRoutingRule.deleteOne({ _id: id });
  return rule;
};
