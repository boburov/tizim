import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId, withPopulatedShape } from "../../../utils/serialize.js";
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

export const list = async ({
  search,
  branchId,
  includeInactive = false,
  page = 1,
  limit = 200,
}) => {
  const where = { ...branchFilter(), isDeleted: false };

  // BITTA FILIAL SO'RALGANDA: avval RUXSAT, keyin filtr.
  //
  // Tartib muhim. Agar filtr shunchaki qo'yilsa, `branchFilter()`
  // baribir himoya qilardi (natija bo'sh chiqardi), lekin foydalanuvchi
  // "bu filialda xona yo'q ekan" degan XATO xulosaga kelardi. 403 esa
  // haqiqatni aytadi: bu filial sizga tegishli emas.
  if (branchId) {
    if (!isBranchAllowed(branchId)) {
      throw new ApiError(403, "Bu filial ma'lumotini ko'rish huquqingiz yo'q");
    }
    where.branchId = String(branchId);
  }
  if (!includeInactive) where.isActive = true;
  if (search && search.trim()) {
    where.name = { contains: search.trim(), mode: "insensitive" };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.room.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take: limit,
      include: { branch: { select: { id: true, name: true, code: true } } },
    }),
    prisma.room.count({ where }),
  ]);

  // Nechta faol guruh shu xonada - "bo'shmi yoki band" savoliga javob.
  const ids = items.map((r) => r.id);
  const counts = ids.length
    ? await prisma.group.groupBy({
        by: ["roomId"],
        where: { roomId: { in: ids }, isActive: true, isDeleted: false },
        _count: { _all: true },
      })
    : [];
  const countMap = new Map(counts.map((r) => [String(r.roomId), r._count._all]));

  return {
    items: items.map((r) => ({
      // Klient `r.branchId?.name` o'qiydi — eski populate shakli.
      ...withPopulatedShape(r, { branch: "branchId" }),
      groupCount: countMap.get(String(r.id)) || 0,
    })),
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
  const doc = await prisma.room.findFirst({ where: { id, isDeleted: false } });
  if (!doc) throw new ApiError(404, "Xona topilmadi");
  if (!isBranchAllowed(doc.branchId)) {
    throw new ApiError(403, "Bu xonaga kirish huquqingiz yo'q");
  }
  return withLegacyId(doc);
};

export const create = async (body, currentUser) => {
  const name = String(body.name || "").trim();
  if (!name) throw new ApiError(400, "Xona nomi kerak");

  // Yozish DOIM aniq filialga. "Barcha filiallar" rejimida 400 qaytadi -
  // qaysi filialga xona qo'shilishini taxmin qilib bo'lmaydi.
  const branchId = await resolveBranchForWrite(currentUser, body.branchId ?? null);

  // Kafolat bazada ham bor (rooms_branch_name_key qisman unique indeksi) -
  // bu tekshiruv chiroyli xato xabari uchun.
  const clash = await prisma.room.findFirst({
    where: { branchId, name, isDeleted: false },
  });
  if (clash) throw new ApiError(409, "Bu filialda shunday nomli xona bor");

  const doc = await prisma.room.create({
    data: {
      branchId,
      name,
      capacity: body.capacity ?? null,
      areaM2: body.areaM2 ?? null,
      equipment: body.equipment || [],
      note: String(body.note || "").trim(),
    },
  });
  return withLegacyId(doc);
};

export const update = async (id, body) => {
  const doc = await getById(id);
  const data = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new ApiError(400, "Xona nomi kerak");
    if (name !== doc.name) {
      const clash = await prisma.room.findFirst({
        where: { branchId: doc.branchId, name, isDeleted: false, id: { not: doc.id } },
      });
      if (clash) throw new ApiError(409, "Bu filialda shunday nomli xona bor");
      data.name = name;
    }
  }

  if (body.capacity !== undefined) data.capacity = body.capacity ?? null;
  if (body.areaM2 !== undefined) data.areaM2 = body.areaM2 ?? null;
  if (body.equipment !== undefined) data.equipment = body.equipment || [];
  if (body.note !== undefined) data.note = String(body.note || "").trim();
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  // FILIALNI ALMASHTIRISH TAQIQLANADI.
  //
  // Xona - fizik obyekt, u ko'chmaydi. Ruxsat berilsa, jadval va bandlik
  // tarixi bir kechada boshqa filialga o'tib ketardi va o'tgan oylarning
  // bandlik hisoboti jimgina o'zgarardi.
  if (body.branchId && String(body.branchId) !== String(doc.branchId)) {
    throw new ApiError(400, "Xonaning filialini o'zgartirib bo'lmaydi");
  }

  const updated = await prisma.room.update({ where: { id: doc.id }, data });
  return withLegacyId(updated);
};

/**
 * O'chirish (yumshoq). Faol guruh biriktirilgan bo'lsa TO'SILADI -
 * aks holda guruh "xonasiz" qolib, jadval ko'rinishidan yo'qolardi.
 */
export const softRemove = async (id, currentUser) => {
  const doc = await getById(id);

  const busy = await prisma.group.count({
    where: { roomId: doc.id, isActive: true, isDeleted: false },
  });
  if (busy > 0) {
    throw new ApiError(
      400,
      `Bu xonada ${busy} ta faol guruh bor. Avval ularni boshqa xonaga ko'chiring.`,
    );
  }

  // Mongoose plugin'idagi `softDelete()` metodi o'rniga ochiq yozamiz.
  const removed = await prisma.room.update({
    where: { id: doc.id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: currentUser?.id || currentUser?._id || null,
    },
  });
  return withLegacyId(removed);
};
