import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { validateDelegation } from "../../../constants/delegation.js";
import { hashPassword } from "../../../helpers/password.helper.js";
import { normalizePhone } from "../../../utils/phone.js";
import {
  assertRoleAssignable,
  assertCanGrantRole,
} from "../../../helpers/roles.helper.js";


// Foydalanuvchi filialga IKKI yo'l bilan bog'lanadi. Mongo'da bu
// `{ $or: [{homeBranchId}, {"branchAssignments.branchId"}] }` edi;
// Prisma'da `branchAssignments` ALOHIDA jadval, shuning uchun relation
// filtri `some` ishlatiladi.
const userInBranch = (branchId) => ({
  OR: [
    { homeBranchId: String(branchId) },
    { branchAssignments: { some: { branchId: String(branchId) } } },
  ],
});

const userInBranches = (ids) => ({
  OR: [
    { homeBranchId: { in: ids } },
    { branchAssignments: { some: { branchId: { in: ids } } } },
  ],
});

/**
 * Filiallar ro'yxati.
 * DIQQAT: bu yerda branchFilter() ISHLATILMAYDI - foydalanuvchi qaysi
 * filiallarga kira olishini allowedBranchIds hal qiladi (u requireAuth
 * bosqichida hisoblangan). Filial ro'yxati - scope'ning O'ZI, uni yana
 * o'ziga filtrlab bo'lmaydi.
 */
export const list = async ({
  search,
  includeInactive = false,
  allowedBranchIds = [],
  canSeeAllBranches = false,
  page = 1,
  limit = 100,
}) => {
  const where = { isDeleted: false };
  if (!includeInactive) where.isActive = true;
  if (search && search.trim()) {
    where.name = { contains: search.trim(), mode: "insensitive" };
  }
  // view_all yo'q bo'lsa - faqat biriktirilgan filiallar.
  if (!canSeeAllBranches) {
    where.id = { in: allowedBranchIds.map(String) };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.branch.findMany({
      where,
      orderBy: [{ isMain: "desc" }, { name: "asc" }],
      skip,
      take: limit,
    }),
    prisma.branch.count({ where }),
  ]);
  return { items: withLegacyIds(items), total, page, limit };
};

export const getById = async (id) => {
  const doc = await prisma.branch.findFirst({ where: { id, isDeleted: false } });
  if (!doc) throw new ApiError(404, "Filial topilmadi");
  return withLegacyId(doc);
};

export const create = async (body) => {
  const name = String(body.name || "").trim();
  if (!name) throw new ApiError(400, "Filial nomi kerak");

  const exists = await prisma.branch.findFirst({ where: { name, isDeleted: false } });
  if (exists) throw new ApiError(409, "Bunday nomli filial allaqachon mavjud");

  // Birinchi filial avtomatik ASOSIY bo'ladi.
  const count = await prisma.branch.count({ where: { isDeleted: false } });

  const doc = await prisma.branch.create({
    data: {
      name,
      code: body.code ? String(body.code).trim().toUpperCase() : null,
      address: body.address ? String(body.address).trim() : null,
      phone: body.phone ? String(body.phone).trim() : null,
      isMain: count === 0,
    },
  });
  return withLegacyId(doc);
};

/**
 * FILIAL + DIREKTOR ni BIRGA yaratadi.
 *
 * NEGA bitta amal: filial ochilgach unga darhol kirish kerak. Direktorsiz
 * filial - "qorong'i ma'lumot": u yerda guruh/to'lov paydo bo'ladi, lekin
 * owner'dan boshqa hech kim ko'ra olmaydi.
 *
 * ATOMIKLIK: bu kodbazada ishonchli ko'p-hujjatli tranzaksiya YO'Q -
 * runFinanceTxn standalone MongoDB'da jimgina atomiklikni yo'qotadi.
 * Shuning uchun: (1) OLDINDAN validatsiya - eng ko'p uchraydigan xato
 * (login band) filial yaratilgunga QADAR tutiladi; (2) xato bo'lsa
 * KOMPENSATSIYA - filial o'chiriladi.
 */
export const createWithDirector = async (body, currentUser) => {
  const { director, ...branchBody } = body;

  // DIREKTORSIZ: faqat filial ochiladi. Direktorni keyin "Xodim qo'shish"
  // orqali biriktirish mumkin. Bu holatda filialda 0 ta foydalanuvchi
  // bo'ladi, ya'ni kerak bo'lsa uni o'chirib ham yuborsa bo'ladi.
  if (!director) return create(branchBody);

  // ── 1-QADAM: OLDINDAN validatsiya (hech narsa yaratilmasdan) ──
  // Login/telefon bandligini shu yerda tekshiramiz - keyinroq bilsak,
  // filial yaratilib bo'lgan bo'lardi va uni orqaga qaytarish kerak edi.
  const username = String(director.username || "").toLowerCase().trim();
  if (await prisma.user.findUnique({ where: { username } })) {
    throw new ApiError(409, "Bunday login (username) allaqachon mavjud");
  }
  const dirPhone = director.phone ? normalizePhone(director.phone) : null;
  if (director.phone && !dirPhone) {
    throw new ApiError(400, "Direktor telefon raqami noto'g'ri");
  }
  // Telefon bandligi TEKSHIRILMAYDI - takrorlanish ruxsat etilgan
  // (qarang: user.model.js phone izohi).

  // Rol mavjud va biriktirsa bo'ladimi - bu ham oldindan.
  const roleValue = director.role || "director";
  const targetRole = await assertRoleAssignable(roleValue);
  await assertCanGrantRole(targetRole, currentUser);

  // ── 2-QADAM: filial ──
  const branch = await create(branchBody);

  // ── 3-QADAM: direktor (xato bo'lsa filialni qaytarib olamiz) ──
  try {
    const passwordHash = await hashPassword(director.password);
    const user = await prisma.user.create({
      data: {
        firstName: director.firstName.trim(),
        lastName: director.lastName.trim(),
        username,
        phone: dirPhone || null,
        passwordHash,
        role: roleValue,
        homeBranchId: branch.id,
        isActive: true,
        hiredAt: new Date(),
      },
    });

    return {
      branch,
      director: { _id: user.id, id: user.id, username: user.username },
    };
  } catch (err) {
    // KOMPENSATSIYA: direktorsiz filial qolmasin.
    // Bu yerda hard delete - filial hozirgina yaratilgan, ichida ma'lumot yo'q.
    await prisma.branch.delete({ where: { id: branch.id } }).catch(() => {});
    logger.warn(
      { branchId: String(branch.id), msg: err?.message },
      "Direktor yaratilmadi - filial qaytarib olindi",
    );
    throw err;
  }
};

export const update = async (id, body) => {
  const doc = await getById(id);
  const data = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new ApiError(400, "Filial nomi kerak");
    const clash = await prisma.branch.findFirst({
      where: { name, isDeleted: false, id: { not: doc.id } },
    });
    if (clash) throw new ApiError(409, "Bunday nomli filial allaqachon mavjud");
    data.name = name;
  }

  if (body.code !== undefined) {
    data.code = body.code ? String(body.code).trim().toUpperCase() : null;
  }
  if (body.address !== undefined) {
    data.address = body.address ? String(body.address).trim() : null;
  }
  if (body.phone !== undefined) {
    data.phone = body.phone ? String(body.phone).trim() : null;
  }

  // DELEGATSIYA MATRITSASI.
  //
  // TO'LIQ ALMASHTIRISH (qisman birlashtirish EMAS): owner matritsani
  // yaxlit forma sifatida ko'radi va saqlaydi. Birlashtirish bo'lsa,
  // formadan olib tashlangan qoida bazada qolib ketardi - ya'ni owner
  // "o'chirdim" deb o'ylagan ishonch amalda kuchda qolardi.
  //
  // Tekshiruv validateDelegation orqali: maosh turlariga `auto` qo'yish
  // yoki turga tegishsiz chegara kiritish shu yerda 400 bilan to'xtaydi.
  // (Model'ning pre("validate") hook'i ham shuni chaqiradi - u seed va
  // migratsiya kabi servisdan chetlab o'tuvchi yo'llarni qoplaydi.)
  if (body.delegation !== undefined) {
    if (body.delegation === null) {
      // Prisma'da Json ustunni tozalash - `Prisma.DbNull` emas, oddiy null
      // (ustun nullable). Mongo'dagi `undefined` ham shu ma'noni berardi.
      data.delegation = null;
    } else {
      const error = validateDelegation(body.delegation);
      if (error) throw new ApiError(400, error);
      data.delegation = body.delegation;
    }
  }

  // CHIQIM LIMITI: null yoki 0 = cheksiz.
  if (body.expenseApprovalThreshold !== undefined) {
    const v = body.expenseApprovalThreshold;
    if (v === null || v === "" || Number(v) <= 0) {
      data.expenseApprovalThreshold = null;
    } else {
      data.expenseApprovalThreshold = Number(v);
    }
  }

  if (body.isActive !== undefined) {
    const nextActive = Boolean(body.isActive);
    // ASOSIY filialni o'chirib bo'lmaydi - migratsiyada barcha eski
    // ma'lumot shunga biriktirilgan, u yo'qolsa scope buziladi.
    if (!nextActive && doc.isMain) {
      throw new ApiError(400, "Asosiy filialni nofaol qilib bo'lmaydi");
    }
    data.isActive = nextActive;
    data.archivedAt = nextActive ? null : new Date();
  }

  const updated = await prisma.branch.update({ where: { id: doc.id }, data });
  return withLegacyId(updated);
};

/**
 * Filialni o'chirish (soft delete).
 * Ichida ma'lumot bo'lsa - bloklanadi. Aks holda guruh/foydalanuvchi
 * "yetim" qolib, hech kim ko'ra olmaydigan holatga tushardi.
 */
export const softRemove = async (id, currentUser) => {
  const doc = await getById(id);

  if (doc.isMain) {
    throw new ApiError(400, "Asosiy filialni o'chirib bo'lmaydi");
  }

  // TO'SIQ FAQAT HAQIQIY MA'LUMOT UCHUN: guruhlar, o'quvchilar va
  // o'qituvchilar. Ular boshqa filialga ko'chirilishi kerak, aks holda
  // yetim qolardi.
  //
  // XODIM (direktor/administrator) ATAYLAB HISOBGA OLINMAYDI. Ilgari u ham
  // to'sardi va natijada halqa hosil bo'lardi: filial yaratilganda tizim
  // O'ZI direktor yaratardi, keyin o'sha direktor filialni o'chirishga
  // to'sqinlik qilardi - ya'ni yaratilgan filialni hech qachon o'chirib
  // bo'lmasdi. Endi xodim filial bilan birga arxivlanadi.
  const [groupCount, members, staff] = await Promise.all([
    prisma.group.count({ where: { branchId: doc.id, isDeleted: false } }),
    // SANAB emas, RO'YXAT bilan olamiz - to'siq xabari kimni ko'chirish
    // kerakligini AYTISHI kerak. Ilgari faqat son berilardi va arxivlangan
    // o'qituvchi kartada ko'rinmagani uchun ("Xodim 0") ega nimani
    // ko'chirishni bilmay qolardi - o'chirib bo'lmaydigan filial.
    prisma.user.findMany({
      where: {
        ...userInBranch(doc.id),
        role: { in: [ROLES.STUDENT, ROLES.TEACHER] },
        isDeleted: false,
      },
      select: { firstName: true, lastName: true, role: true, isActive: true },
      take: 10,
    }),
    prisma.user.findMany({
      where: {
        ...userInBranch(doc.id),
        role: { notIn: [ROLES.STUDENT, ROLES.TEACHER, ROLES.OWNER] },
        isDeleted: false,
      },
      select: {
        id: true,
        homeBranchId: true,
        branchAssignments: { select: { branchId: true } },
      },
    }),
  ]);

  if (groupCount > 0 || members.length > 0) {
    const who = members
      .map(
        (u) =>
          `${u.firstName} ${u.lastName}` +
          (u.isActive === false ? " (arxivda)" : ""),
      )
      .join(", ");

    const parts = [];
    if (groupCount > 0) parts.push(`${groupCount} ta guruh`);
    if (members.length > 0) parts.push(`${members.length} ta o'quvchi/o'qituvchi`);

    throw new ApiError(
      400,
      `Filialda ${parts.join(" va ")} bor. Avval ularni boshqa filialga ko'chiring.` +
        // "(arxivda)" belgisi muhim: arxivlangan odam ro'yxatlarda
        // ko'rinmaydi, lekin baribir to'sadi - ega uni qidirib topa olishi
        // uchun ismini ochiq aytamiz.
        (who ? ` Kimlar: ${who}` : ""),
    );
  }

  // BOSHQA FILIALDA HAM ISHLAYDIGAN xodimni arxivlamaymiz - undan shu
  // filial biriktiruvini olib tashlash yetarli.
  const solelyHere = [];
  const alsoElsewhere = [];
  for (const u of staff) {
    const others = (u.branchAssignments || []).filter(
      (a) => a?.branchId && String(a.branchId) !== String(doc.id),
    );
    const homeElsewhere =
      u.homeBranchId && String(u.homeBranchId) !== String(doc.id);
    (others.length || homeElsewhere ? alsoElsewhere : solelyHere).push(u.id);
  }

  if (solelyHere.length) {
    await prisma.user.updateMany({
      where: { id: { in: solelyHere } },
      data: { isActive: false, archivedAt: new Date() },
    });
  }
  if (alsoElsewhere.length) {
    // Mongo'da bu massivdan element olib tashlash edi (`$pull`).
    // Endi `branchAssignments` alohida jadval, ya'ni oddiy `deleteMany`.
    await prisma.userBranchAssignment.deleteMany({
      where: { userId: { in: alsoElsewhere }, branchId: doc.id },
    });
  }

  const removed = await prisma.branch.update({
    where: { id: doc.id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: currentUser?.id || currentUser?._id || null,
    },
  });
  return withLegacyId(removed);
};

/** Filial statistikasi - kartochkada ko'rsatish uchun. */
export const stats = async (id, { allowedBranchIds = [], canSeeAllBranches = false } = {}) => {
  const doc = await getById(id);
  const branchId = doc.id;

  // KO'LAM TEKSHIRUVI. Bu endpoint filial rahbariyatining ism va loginini
  // ham qaytaradi, ya'ni "o'z filialingdan boshqasini o'qima" qoidasi shart.
  if (!canSeeAllBranches) {
    const allowed = allowedBranchIds.some((b) => String(b) === String(branchId));
    if (!allowed) throw new ApiError(403, "Bu filialga ruxsatingiz yo'q");
  }

  const [groupCount, activeGroupCount, staffCount, studentCount, managers] =
    await Promise.all([
      prisma.group.count({ where: { branchId, isDeleted: false } }),
      prisma.group.count({
        where: { branchId, isActive: true, isDeleted: false },
      }),
      prisma.user.count({
        where: {
          ...userInBranch(branchId),
          role: { notIn: ["student"] },
          isActive: true,
          isDeleted: false,
        },
      }),
      prisma.user.count({
        where: {
          ...userInBranch(branchId),
          role: "student",
          isActive: true,
          isDeleted: false,
        },
      }),
      // FILIAL RAHBARIYATI - kartada login/parolni ko'rsatish uchun.
      //
      // O'quvchi/o'qituvchi chiqarib tashlanadi: kerak bo'lgani "bu filialni
      // kim boshqaradi" degan savolga javob, ya'ni custom rolli xodimlar
      // (direktor, administrator, buxgalter). Ega ham kerak emas - u
      // filialga bog'liq emas.
      //
      // PAROL BU YERDA QAYTARILMAYDI: uni alohida /users/:id/password
      // beradi, ya'ni ro'yxat so'ralganda parollar yopiq qoladi.
      prisma.user.findMany({
        where: {
          ...userInBranch(branchId),
          role: { notIn: ["student", "teacher", "owner"] },
          isActive: true,
          isDeleted: false,
        },
        select: {
          id: true, firstName: true, lastName: true, username: true, role: true,
        },
        orderBy: { createdAt: "asc" },
        take: 5,
      }),
    ]);

  return {
    groupCount,
    activeGroupCount,
    staffCount,
    studentCount,
    managers: withLegacyIds(managers),
  };
};

/**
 * TAQQOSLASH - barcha ko'rinadigan filiallar bitta jadvalda.
 *
 * NEGA ALOHIDA ENDPOINT: global BranchPicker butun ilovani BITTA filialga
 * qisadi, ya'ni "qaysi filial qanday ishlayapti" degan savolga javob
 * berolmaydi. Bu yagona ko'rinish uni filialdan tashqarida beradi.
 *
 * N+1 dan qochish: har filial uchun alohida `stats(id)` chaqirilsa 4xN
 * so'rov bo'lardi. Bu yerda har bir o'lcham uchun BITTA aggregation
 * ishlaydi va natija filial bo'yicha guruhlanadi.
 */
export const compare = async ({ allowedBranchIds = [], canSeeAllBranches = false }) => {
  const where = { isDeleted: false, isActive: true };
  if (!canSeeAllBranches) {
    where.id = { in: allowedBranchIds.map(String) };
  }

  const branches = await prisma.branch.findMany({
    where,
    orderBy: [{ isMain: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, code: true, isMain: true,
      expenseApprovalThreshold: true,
    },
  });

  if (!branches.length) return [];

  const ids = branches.map((b) => b.id);

  // Xodim/o'quvchi filialga IKKI yo'l bilan bog'lanadi: `homeBranchId` yoki
  // `branchAssignments`. Ikkalasini bitta massivga yig'ib, `$unwind` bilan
  // sanaymiz - aks holda ikki filialga biriktirilgan xodim faqat bittasida
  // hisoblanardi.
  // Mongo'da bu $project + $setUnion + $unwind quvuri edi: bir odam
  // homeBranchId va branchAssignments orqali BIR NECHTA filialga tegishli
  // bo'lishi mumkin va har birida sanalishi kerak.
  //
  // Prisma'da ikkala bog'lanishni birga o'qib, JS'da yig'amiz. Ro'yxat
  // faqat FAOL foydalanuvchilar bilan cheklangan, ya'ni hajmi kichik.
  const scopedUsers = await prisma.user.findMany({
    where: { isActive: true, isDeleted: false, ...userInBranches(ids) },
    select: {
      role: true,
      homeBranchId: true,
      branchAssignments: { select: { branchId: true } },
    },
  });

  const idSet = new Set(ids.map(String));
  const users = {};
  for (const u of scopedUsers) {
    // `Set` - bitta odam bir filialda IKKI MARTA sanalmasligi uchun
    // (homeBranchId ham, biriktirish ham bir xil filialni ko'rsatishi mumkin).
    const uBranches = new Set();
    if (u.homeBranchId && idSet.has(String(u.homeBranchId))) {
      uBranches.add(String(u.homeBranchId));
    }
    for (const a of u.branchAssignments) {
      if (idSet.has(String(a.branchId))) uBranches.add(String(a.branchId));
    }
    for (const b of uBranches) {
      if (!users[b]) users[b] = { studentCount: 0, staffCount: 0 };
      if (u.role === "student") users[b].studentCount += 1;
      else users[b].staffCount += 1;
    }
  }

  // Guruhlar: jami va faol - ikki groupBy (Prisma shartli $sum bilmaydi).
  const [groupRows, activeGroupRows, pendingRows] = await Promise.all([
    prisma.group.groupBy({
      by: ["branchId"],
      where: { branchId: { in: ids }, isDeleted: false },
      _count: { _all: true },
    }),
    prisma.group.groupBy({
      by: ["branchId"],
      where: { branchId: { in: ids }, isDeleted: false, isActive: true },
      _count: { _all: true },
    }),
    prisma.approval.groupBy({
      by: ["branchId"],
      where: { branchId: { in: ids }, status: "pending" },
      _count: { _all: true },
    }),
  ]);

  const toMap = (rows) =>
    rows.reduce((acc, r) => {
      acc[String(r.branchId)] = r._count._all;
      return acc;
    }, {});

  const groups = toMap(groupRows);
  const activeGroups = toMap(activeGroupRows);
  const pending = toMap(pendingRows);

  return branches.map((b) => {
    const key = String(b.id);
    return {
      _id: b.id,
      id: b.id,
      name: b.name,
      code: b.code,
      isMain: b.isMain,
      expenseApprovalThreshold: b.expenseApprovalThreshold ?? null,
      studentCount: users[key]?.studentCount || 0,
      staffCount: users[key]?.staffCount || 0,
      groupCount: groups[key] || 0,
      activeGroupCount: activeGroups[key] || 0,
      pendingApprovals: pending[key] || 0,
    };
  });
};
