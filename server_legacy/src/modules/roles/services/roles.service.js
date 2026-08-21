import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { invalidateRoleCache } from "../../../helpers/permission.helper.js";
import {
  generateUniqueRoleValue,
  assertCanGrantPermissions,
  assertNotSystemRole,
  countRoleUsers,
} from "../../../helpers/roles.helper.js";
import {
  getActionLabel,
  getActionOrder,
  ACTION_ORDER,
} from "../../../constants/permissions.js";
import { ROLE_TYPES, DEFAULT_ROLE_PATH } from "../../../constants/roles.js";

// --- Matritsa ---
// Tizimda MAVJUD permission'lardan module x action jadvalini quradi.
// Frontend hech narsani hardcode qilmaydi: qatorlar ham, ustunlar ham
// shu javobdan keladi. Yangi permission qo'shilsa jadvalga o'zi tushadi.
export const getMatrix = async () => {
  const perms = await prisma.permission.findMany();

  const actionSet = new Set();
  const moduleMap = new Map();

  for (const p of perms) {
    actionSet.add(p.action);

    if (!moduleMap.has(p.module)) {
      moduleMap.set(p.module, {
        module: p.module,
        label: p.moduleLabel || p.module,
        order: p.moduleOrder ?? 999,
        cells: {},
      });
    }
    // Katak = shu modulda shu action mavjud degani. Katak yo'q bo'lsa
    // frontend BO'SH chizadi (checkbox umuman ko'rsatilmaydi).
    moduleMap.get(p.module).cells[p.action] = {
      id: String(p.id),
      key: p.key,
      label: p.label,
    };
  }

  const actions = [...actionSet]
    .sort((a, b) => getActionOrder(a) - getActionOrder(b) || a.localeCompare(b))
    .map((action) => ({
      key: action,
      label: getActionLabel(action),
      // Standart CRUD ustunlarimi yoki modulga xos qo'shimcha action.
      isCore: ACTION_ORDER.slice(0, 4).includes(action),
    }));

  const modules = [...moduleMap.values()].sort(
    (a, b) => a.order - b.order || a.label.localeCompare(b.label),
  );

  return { actions, modules };
};

const shapeRole = (doc, userCount = 0) => ({
  id: String(doc.id),
  _id: String(doc.id),
  value: doc.value,
  label: doc.label,
  description: doc.description || "",
  roleType: doc.roleType,
  defaultPath: doc.defaultPath,
  isSystem: Boolean(doc.isSystem),
  isFrozen: Boolean(doc.isFrozen),
  frozenAt: doc.frozenAt || null,
  frozenReason: doc.frozenReason || "",
  permissionIds: (doc.permissions || []).map((p) => String(p?.id ? p.id : p)),
  permissionKeys: (doc.permissions || [])
    .filter((p) => p?.key)
    .map((p) => p.key),
  userCount,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export const list = async () => {
  const roles = await prisma.role.findMany({
    include: { permissions: { select: { id: true, key: true } } },
    orderBy: [{ isSystem: "desc" }, { label: "asc" }],
  });

  // Har rolda nechta foydalanuvchi borligini bitta groupBy bilan olamiz
  // (Mongo'da bu $group edi).
  const counts = await prisma.user.groupBy({
    by: ["role"],
    where: { isDeleted: false },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((c) => [c.role, c._count._all]));

  return roles.map((r) => shapeRole(r, countMap.get(r.value) || 0));
};

export const getByValue = async (value) => {
  const role = await prisma.role.findUnique({
    where: { value },
    include: { permissions: { select: { id: true, key: true } } },
  });
  if (!role) throw new ApiError(404, "Rol topilmadi");
  return shapeRole(role, await countRoleUsers(value));
};

// Berilgan ObjectId'lar haqiqiy permission'ligini tekshiradi va
// ularning key'larini qaytaradi (escalation tekshiruvi uchun kerak).
const resolvePermissionIds = async (permissionIds = []) => {
  if (!permissionIds.length) return { ids: [], keys: [] };
  const docs = await prisma.permission.findMany({
    where: { id: { in: permissionIds.map(String) } },
    select: { id: true, key: true },
  });
  if (docs.length !== new Set(permissionIds.map(String)).size) {
    throw new ApiError(400, "Noto'g'ri ruxsat identifikatori yuborildi");
  }
  return { ids: docs.map((d) => d.id), keys: docs.map((d) => d.key) };
};

export const create = async (body, currentUser, currentPermissions) => {
  const label = String(body.label).trim();

  const exists = await prisma.role.findFirst({ where: { label } });
  if (exists) throw new ApiError(409, "Bunday nomli rol allaqachon mavjud");

  const { ids, keys } = await resolvePermissionIds(body.permissionIds);
  // Privilege escalation himoyasi.
  assertCanGrantPermissions(currentPermissions, keys);

  const value = await generateUniqueRoleValue(label);

  const role = await prisma.role.create({
    data: {
      value,
      label,
      description: body.description || "",
      // Ko'p-ko'pga bog'lanish: `connect` join jadvaliga qator qo'shadi.
      permissions: { connect: ids.map((id) => ({ id })) },
      roleType: body.roleType || ROLE_TYPES.STAFF,
      defaultPath: body.defaultPath || DEFAULT_ROLE_PATH,
      isSystem: false,
    },
  });

  invalidateRoleCache(value);
  return getByValue(role.value);
};

export const update = async (value, body, currentUser, currentPermissions) => {
  const role = await prisma.role.findUnique({ where: { value } });
  if (!role) throw new ApiError(404, "Rol topilmadi");

  const data = {};

  // Tizim rolining ruxsatlarini o'zgartirish mumkin, lekin tipini/nomini yo'q.
  if (role.isSystem && (body.roleType || body.label)) {
    throw new ApiError(400, "Tizim rolining nomi va tipini o'zgartirib bo'lmaydi");
  }

  if (body.label !== undefined && !role.isSystem) {
    const label = String(body.label).trim();
    const taken = await prisma.role.findFirst({
      where: { label, id: { not: role.id } },
    });
    if (taken) throw new ApiError(409, "Bunday nomli rol allaqachon mavjud");
    data.label = label;
  }

  if (body.permissionIds !== undefined) {
    const { ids, keys } = await resolvePermissionIds(body.permissionIds);
    assertCanGrantPermissions(currentPermissions, keys);
    // `set` - BARCHA eski bog'lanishni almashtiradi (Mongo'dagi
    // `role.permissions = ids` bilan bir xil ma'no).
    data.permissions = { set: ids.map((id) => ({ id })) };
    data.permissionsVersion = { increment: 1 };
  }

  if (body.description !== undefined) data.description = body.description;
  if (body.defaultPath !== undefined) data.defaultPath = body.defaultPath;
  if (body.roleType !== undefined && !role.isSystem) data.roleType = body.roleType;

  await prisma.role.update({ where: { value }, data });
  invalidateRoleCache(value);
  return getByValue(value);
};

// --- MUZLATISH ---
// Muzlatilgan rol egasi tizimga kira olmaydi: login rad etiladi va
// mavjud sessiya requireAuth'da uziladi (auth.js + auth.service.js).
export const setFrozen = async (value, { isFrozen, reason }, currentUser) => {
  const role = await prisma.role.findUnique({ where: { value } });
  if (!role) throw new ApiError(404, "Rol topilmadi");

  assertNotSystemRole(role, "muzlatib");

  // O'zining roli - o'zini tizimdan qulflab qo'ymasin.
  if (currentUser.role === value) {
    throw new ApiError(400, "O'z rolingizni muzlata olmaysiz");
  }

  await prisma.role.update({
    where: { value },
    data: {
      isFrozen: Boolean(isFrozen),
      frozenAt: isFrozen ? new Date() : null,
      frozenById: isFrozen ? String(currentUser.id || currentUser._id) : null,
      frozenReason: isFrozen ? reason || "" : "",
    },
  });
  // Cache'ni darhol tozalaymiz - muzlatish keyingi requestdayoq ishlaydi.
  invalidateRoleCache(value);

  return getByValue(value);
};

export const remove = async (value, { migrateTo } = {}) => {
  const role = await prisma.role.findUnique({ where: { value } });
  if (!role) throw new ApiError(404, "Rol topilmadi");

  assertNotSystemRole(role, "o'chirib");

  const userCount = await countRoleUsers(value);
  if (userCount > 0) {
    if (!migrateTo) {
      throw new ApiError(
        400,
        `Bu rolda ${userCount} ta foydalanuvchi bor. Avval ularni boshqa rolga o'tkazing`,
      );
    }
    const target = await prisma.role.findUnique({ where: { value: migrateTo } });
    if (!target) throw new ApiError(400, "Ko'chiriladigan rol topilmadi");
    if (target.isFrozen) {
      throw new ApiError(400, "Muzlatilgan rolga ko'chirib bo'lmaydi");
    }
    await prisma.user.updateMany({
      where: { role: value },
      data: { role: migrateTo },
    });
    invalidateRoleCache(migrateTo);
  }

  await prisma.role.delete({ where: { value } });
  invalidateRoleCache(value);

  return { value, migratedUsers: userCount };
};
