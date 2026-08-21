import prisma from "../config/prisma.js";
import ApiError from "../utils/ApiError.js";
import { ROLES, ROLE_TYPES } from "../constants/roles.js";
import { hasPermission } from "./permission.helper.js";

// "Bosh buxgalter" -> "bosh-buxgalter"
export const slugifyRole = (label) =>
  String(label || "")
    .toLowerCase()
    .trim()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

// Nom band bo'lsa -ohirига raqam qo'shadi: buxgalter, buxgalter-2, ...
export const generateUniqueRoleValue = async (label) => {
  const base = slugifyRole(label) || "rol";
  let value = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.role.findUnique({ where: { value }, select: { id: true } })) {
    n += 1;
    value = `${base}-${n}`;
  }
  return value;
};

// ROL KATALOGI: value -> { value, label, roleType, isFrozen, isSystem }.
//
// Role kolleksiyasi kichik (odatda 20 dan kam hujjat), shuning uchun bitta
// to'liq o'qish har qator uchun resolveRole() chaqirishdan (N+1) arzonroq.
export const loadRoleCatalog = async () => {
  const docs = await prisma.role.findMany({
    select: {
      value: true, label: true, roleType: true, isFrozen: true, isSystem: true,
    },
  });
  return new Map(docs.map((r) => [r.value, r]));
};

// XODIM = o'quvchi TIPIDAGI rollardan boshqa hamma (owner + staff + teacher).
//
// Rol NOMIGA emas TIPIGA qaraydi: "Katta o'qituvchi" nomli custom rol
// roleType="teacher" bo'lsa xodim hisoblanadi, "Tinglovchi" nomlisi esa
// roleType="student" bo'lsa - yo'q. Shu sababli qattiq ro'yxat yozilmaydi:
// ertaga yaratilgan rol avtomatik to'g'ri tomonga tushadi.
export const staffRoleFilter = (catalog) => {
  const studentValues = [...catalog.values()]
    .filter((r) => r.roleType === ROLE_TYPES.STUDENT)
    .map((r) => r.value);
  // Katalog bo'sh yoki student roli o'chirilgan bo'lsa ham built-in qiymat
  // chetlab o'tilmasin.
  if (!studentValues.includes(ROLES.STUDENT)) studentValues.push(ROLES.STUDENT);
  // Mongo `$nin` → Prisma `notIn`.
  return { notIn: studentValues };
};

// Rol mavjudmi va foydalanuvchiga biriktirsa bo'ladimi.
// User.role'dan enum olib tashlangani uchun YAGONA himoya shu.
export const assertRoleAssignable = async (value) => {
  const role = await prisma.role.findUnique({ where: { value } });
  if (!role) throw new ApiError(400, "Bunday rol mavjud emas");
  if (role.isFrozen) {
    throw new ApiError(400, "Muzlatilgan rolni foydalanuvchiga biriktirib bo'lmaydi");
  }
  return role;
};

// PRIVILEGE ESCALATION HIMOYASI.
// Rol yaratayotgan/tahrirlayotgan foydalanuvchi O'ZIDA yo'q ruxsatni
// boshqa rolga BERA OLMAYDI. Owner ["*"] bo'lgani uchun undan o'tadi.
export const assertCanGrantPermissions = (currentPermissions, permissionKeys) => {
  const missing = permissionKeys.filter((key) => !hasPermission(currentPermissions, key));
  if (missing.length) {
    throw new ApiError(
      403,
      "O'zingizda mavjud bo'lmagan ruxsatni bera olmaysiz: " + missing.join(", "),
    );
  }
};

// ROLNI BIRIKTIRISHDAN OLDINGI HIMOYA.
//
// assertCanGrantPermissions ruxsatlar RO'YXATINI tekshiradi (rol yaratishda),
// bu esa TAYYOR ROLNI odamga biriktirishni tekshiradi. Ikkalasi ham kerak:
// aks holda direktor o'zi yarata olmaydigan kuchli rolni mavjudlaridan
// tanlab, odamga biriktirib qo'yardi.
//
// @param {object} targetRole - biriktirilayotgan rol hujjati
// @param {object} currentUser - { permissions, role } bo'lgan aktor
export const assertCanGrantRole = async (targetRole, currentUser) => {
  const actorPerms = currentUser?.permissions || [];

  // Owner (["*"]) hamma narsani qila oladi.
  if (hasPermission(actorPerms, "*")) return;

  // OWNER rolini faqat owner biriktira oladi.
  if (
    targetRole?.value === ROLES.OWNER ||
    targetRole?.roleType === ROLE_TYPES.OWNER
  ) {
    throw new ApiError(403, "Ega rolini biriktirish huquqingiz yo'q");
  }

  // Rolning ruxsatlarini ochib, har birini aktorda bor-yo'qligini tekshiramiz.
  const populated = await prisma.role.findUnique({
    where: { id: String(targetRole.id || targetRole._id) },
    include: { permissions: { select: { key: true } } },
  });
  const keys = (populated?.permissions || []).map((p) => p.key);
  assertCanGrantPermissions(actorPerms, keys);
};

// Built-in rolni himoya qilish.
export const assertNotSystemRole = (role, action = "o'zgartirib") => {
  if (role.isSystem) {
    throw new ApiError(400, `Tizim rolini ${action} bo'lmaydi`);
  }
};

// Owner o'z rolini yoki o'zini qulflab qo'ymasligi uchun.
export const assertNotSelfRoleChange = (currentUser, targetUserId) => {
  if (String(currentUser.id || currentUser._id) === String(targetUserId)) {
    throw new ApiError(400, "O'z rolingizni o'zgartira olmaysiz");
  }
};

// Oxirgi owner o'chirilmasin/rolidan ayrilmasin.
export const assertNotLastOwner = async (targetUserId) => {
  const target = await prisma.user.findUnique({ where: { id: String(targetUserId) } });
  if (!target || target.role !== ROLES.OWNER) return;

  const owners = await prisma.user.count({
    where: {
      role: ROLES.OWNER,
      isActive: true,
      isDeleted: false,
      id: { not: String(targetUserId) },
    },
  });
  if (owners === 0) {
    throw new ApiError(400, "Tizimdagi yagona egani o'zgartirib bo'lmaydi");
  }
};

// Rolda nechta faol foydalanuvchi bor.
export const countRoleUsers = (value) =>
  prisma.user.count({ where: { role: value, isDeleted: false } });

// roleType bo'yicha tekshiruv - servicelardagi scope logikasi uchun.
// Rol nomiga emas, tipiga qaraydi: custom "Katta o'qituvchi" ham teacher.
export const isTeacherLike = (roleDoc) => roleDoc?.roleType === ROLE_TYPES.TEACHER;
export const isStudentLike = (roleDoc) => roleDoc?.roleType === ROLE_TYPES.STUDENT;
export const isOwnerLike = (roleDoc) => roleDoc?.roleType === ROLE_TYPES.OWNER;
