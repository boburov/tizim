import Room from "../../../models/room.model.js";
import Group from "../../../models/group.model.js";
import ApiError from "../../../utils/ApiError.js";
import {
  branchFilter,
  resolveBranchForWrite,
  isBranchAllowed,
} from "../../../helpers/branchContext.helper.js";

// XONALAR - filialning fizik resursi.
//
// Kurs katalogidan FARQI: xona filialga tegishli, shuning uchun bu yerda
// har bir amal filial ko'lami bilan cheklanadi (branchFilter /
// resolveBranchForWrite). Kurs esa global va u yerda filtr yo'q.

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const list = async ({
  search,
  includeInactive = false,
  page = 1,
  limit = 200,
}) => {
  const filter = { ...branchFilter(), isDeleted: false };
  if (!includeInactive) filter.isActive = true;
  if (search && search.trim()) {
    filter.name = { $regex: escapeRegex(search.trim()), $options: "i" };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Room.find(filter)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .populate("branchId", { name: 1, code: 1 })
      .lean(),
    Room.countDocuments(filter),
  ]);

  // Nechta faol guruh shu xonada - "bo'shmi yoki band" savoliga javob.
  const ids = items.map((r) => r._id);
  const counts = ids.length
    ? await Group.aggregate([
        {
          $match: {
            roomId: { $in: ids },
            isActive: true,
            isDeleted: { $ne: true },
          },
        },
        { $group: { _id: "$roomId", count: { $sum: 1 } } },
      ])
    : [];
  const countMap = new Map(counts.map((r) => [String(r._id), r.count]));

  return {
    items: items.map((r) => ({ ...r, groupCount: countMap.get(String(r._id)) || 0 })),
    total,
    page,
    limit,
  };
};

/**
 * Bitta xona. FILIAL TEKSHIRUVI shu yerda - aks holda ID'ni qo'lda kiritib
 * boshqa filialning xonasini o'qib olish mumkin edi.
 */
export const getById = async (id) => {
  const doc = await Room.findOne({ _id: id, isDeleted: false });
  if (!doc) throw new ApiError(404, "Xona topilmadi");
  if (!isBranchAllowed(doc.branchId)) {
    throw new ApiError(403, "Bu xonaga kirish huquqingiz yo'q");
  }
  return doc;
};

export const create = async (body, currentUser) => {
  const name = String(body.name || "").trim();
  if (!name) throw new ApiError(400, "Xona nomi kerak");

  // Yozish DOIM aniq filialga. "Barcha filiallar" rejimida 400 qaytadi -
  // qaysi filialga xona qo'shilishini taxmin qilib bo'lmaydi.
  const branchId = await resolveBranchForWrite(currentUser, body.branchId ?? null);

  const clash = await Room.findOne({ branchId, name, isDeleted: false }).lean();
  if (clash) throw new ApiError(409, "Bu filialda shunday nomli xona bor");

  return Room.create({
    branchId,
    name,
    capacity: body.capacity ?? null,
    areaM2: body.areaM2 ?? null,
    equipment: body.equipment || [],
    note: String(body.note || "").trim(),
  });
};

export const update = async (id, body) => {
  const doc = await getById(id);

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new ApiError(400, "Xona nomi kerak");
    if (name !== doc.name) {
      const clash = await Room.findOne({
        branchId: doc.branchId,
        name,
        isDeleted: false,
        _id: { $ne: doc._id },
      }).lean();
      if (clash) throw new ApiError(409, "Bu filialda shunday nomli xona bor");
      doc.name = name;
    }
  }

  if (body.capacity !== undefined) doc.capacity = body.capacity ?? null;
  if (body.areaM2 !== undefined) doc.areaM2 = body.areaM2 ?? null;
  if (body.equipment !== undefined) doc.equipment = body.equipment || [];
  if (body.note !== undefined) doc.note = String(body.note || "").trim();
  if (body.isActive !== undefined) doc.isActive = Boolean(body.isActive);

  // FILIALNI ALMASHTIRISH TAQIQLANADI.
  //
  // Xona - fizik obyekt, u ko'chmaydi. Ruxsat berilsa, jadval va bandlik
  // tarixi bir kechada boshqa filialga o'tib ketardi va o'tgan oylarning
  // bandlik hisoboti jimgina o'zgarardi.
  if (body.branchId && String(body.branchId) !== String(doc.branchId)) {
    throw new ApiError(400, "Xonaning filialini o'zgartirib bo'lmaydi");
  }

  await doc.save();
  return doc;
};

/**
 * O'chirish (yumshoq). Faol guruh biriktirilgan bo'lsa TO'SILADI -
 * aks holda guruh "xonasiz" qolib, jadval ko'rinishidan yo'qolardi.
 */
export const softRemove = async (id, currentUser) => {
  const doc = await getById(id);

  const busy = await Group.countDocuments({
    roomId: doc._id,
    isActive: true,
    isDeleted: { $ne: true },
  });
  if (busy > 0) {
    throw new ApiError(
      400,
      `Bu xonada ${busy} ta faol guruh bor. Avval ularni boshqa xonaga ko'chiring.`,
    );
  }

  await doc.softDelete(currentUser?._id);
  return doc;
};
