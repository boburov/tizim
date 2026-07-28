import Role from "../../../models/role.model.js";
import Permission from "../../../models/permission.model.js";
import User from "../../../models/user.model.js";
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
  const perms = await Permission.find().lean();

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
      id: String(p._id),
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
  id: String(doc._id),
  value: doc.value,
  label: doc.label,
  description: doc.description || "",
  roleType: doc.roleType,
  defaultPath: doc.defaultPath,
  isSystem: Boolean(doc.isSystem),
  isFrozen: Boolean(doc.isFrozen),
  frozenAt: doc.frozenAt || null,
  frozenReason: doc.frozenReason || "",
  permissionIds: (doc.permissions || []).map((p) =>
    String(p?._id ? p._id : p),
  ),
  permissionKeys: (doc.permissions || [])
    .filter((p) => p?.key)
    .map((p) => p.key),
  userCount,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export const list = async () => {
  const roles = await Role.find().populate("permissions").sort({ isSystem: -1, label: 1 }).lean();

  // Har rolda nechta foydalanuvchi borligini bitta aggregate bilan olamiz.
  const counts = await User.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    { $group: { _id: "$role", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [c._id, c.count]));

  return roles.map((r) => shapeRole(r, countMap.get(r.value) || 0));
};

export const getByValue = async (value) => {
  const role = await Role.findOne({ value }).populate("permissions").lean();
  if (!role) throw new ApiError(404, "Rol topilmadi");
  return shapeRole(role, await countRoleUsers(value));
};

// Berilgan ObjectId'lar haqiqiy permission'ligini tekshiradi va
// ularning key'larini qaytaradi (escalation tekshiruvi uchun kerak).
const resolvePermissionIds = async (permissionIds = []) => {
  if (!permissionIds.length) return { ids: [], keys: [] };
  const docs = await Permission.find({ _id: { $in: permissionIds } })
    .select("_id key")
    .lean();
  if (docs.length !== new Set(permissionIds.map(String)).size) {
    throw new ApiError(400, "Noto'g'ri ruxsat identifikatori yuborildi");
  }
  return { ids: docs.map((d) => d._id), keys: docs.map((d) => d.key) };
};

export const create = async (body, currentUser, currentPermissions) => {
  const label = String(body.label).trim();

  const exists = await Role.findOne({ label });
  if (exists) throw new ApiError(409, "Bunday nomli rol allaqachon mavjud");

  const { ids, keys } = await resolvePermissionIds(body.permissionIds);
  // Privilege escalation himoyasi.
  assertCanGrantPermissions(currentPermissions, keys);

  const value = await generateUniqueRoleValue(label);

  const role = await Role.create({
    value,
    label,
    description: body.description || "",
    permissions: ids,
    roleType: body.roleType || ROLE_TYPES.STAFF,
    defaultPath: body.defaultPath || DEFAULT_ROLE_PATH,
    isSystem: false,
  });

  invalidateRoleCache(value);
  return getByValue(role.value);
};

export const update = async (value, body, currentUser, currentPermissions) => {
  const role = await Role.findOne({ value });
  if (!role) throw new ApiError(404, "Rol topilmadi");

  // Tizim rolining ruxsatlarini o'zgartirish mumkin, lekin tipini/nomini yo'q.
  if (role.isSystem && (body.roleType || body.label)) {
    throw new ApiError(400, "Tizim rolining nomi va tipini o'zgartirib bo'lmaydi");
  }

  if (body.label !== undefined && !role.isSystem) {
    const label = String(body.label).trim();
    const taken = await Role.findOne({ label, _id: { $ne: role._id } });
    if (taken) throw new ApiError(409, "Bunday nomli rol allaqachon mavjud");
    role.label = label;
  }

  if (body.permissionIds !== undefined) {
    const { ids, keys } = await resolvePermissionIds(body.permissionIds);
    assertCanGrantPermissions(currentPermissions, keys);
    role.permissions = ids;
    role.permissionsVersion += 1;
  }

  if (body.description !== undefined) role.description = body.description;
  if (body.defaultPath !== undefined) role.defaultPath = body.defaultPath;
  if (body.roleType !== undefined && !role.isSystem) role.roleType = body.roleType;

  await role.save();
  invalidateRoleCache(value);
  return getByValue(value);
};

// --- MUZLATISH ---
// Muzlatilgan rol egasi tizimga kira olmaydi: login rad etiladi va
// mavjud sessiya requireAuth'da uziladi (auth.js + auth.service.js).
export const setFrozen = async (value, { isFrozen, reason }, currentUser) => {
  const role = await Role.findOne({ value });
  if (!role) throw new ApiError(404, "Rol topilmadi");

  assertNotSystemRole(role, "muzlatib");

  // O'zining roli - o'zini tizimdan qulflab qo'ymasin.
  if (currentUser.role === value) {
    throw new ApiError(400, "O'z rolingizni muzlata olmaysiz");
  }

  role.isFrozen = Boolean(isFrozen);
  role.frozenAt = isFrozen ? new Date() : null;
  role.frozenBy = isFrozen ? currentUser._id : null;
  role.frozenReason = isFrozen ? reason || "" : "";

  await role.save();
  // Cache'ni darhol tozalaymiz - muzlatish keyingi requestdayoq ishlaydi.
  invalidateRoleCache(value);

  return getByValue(value);
};

export const remove = async (value, { migrateTo } = {}) => {
  const role = await Role.findOne({ value });
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
    const target = await Role.findOne({ value: migrateTo });
    if (!target) throw new ApiError(400, "Ko'chiriladigan rol topilmadi");
    if (target.isFrozen) {
      throw new ApiError(400, "Muzlatilgan rolga ko'chirib bo'lmaydi");
    }
    await User.updateMany({ role: value }, { $set: { role: migrateTo } });
    invalidateRoleCache(migrateTo);
  }

  await role.deleteOne();
  invalidateRoleCache(value);

  return { value, migratedUsers: userCount };
};
