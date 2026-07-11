import { ROLE_LABELS } from "@/shared/constants/roles";

// Foydalanuvchining roli HECH QACHON bo'sh ko'rinmasligi kerak.
// 1) tanilgan rol -> o'zbekcha label (ROLE_LABELS)
// 2) noma'lum, lekin qiymat bor -> qiymatning o'zi
// 3) umuman yo'q (null/undefined/"") -> ogohlantiruvchi label
export const getRoleLabel = (roleValue) => {
  if (!roleValue) return "Rol biriktirilmagan";
  return ROLE_LABELS[roleValue] || roleValue;
};

// Rol mavjud va tizimga tanish ekanligini bildiradi (UI'da ogohlantirish uchun)
export const hasValidRole = (roleValue) => Boolean(ROLE_LABELS[roleValue]);

export const isRoleAllowed = (userRole, allowedRoles) => {
  return allowedRoles.includes(userRole);
};

// Owner is excluded - it cannot be assigned via the UI
export const getAllRoles = (roles = []) =>
  roles
    .filter((r) => r.value !== "owner")
    .map((r) => ({ value: r.value, label: r.name }));
