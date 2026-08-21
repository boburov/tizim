import { z } from "zod";
import { PERMISSIONS } from "../../../constants/permissions.js";
import * as usersService from "../../users/services/users.service.js";

// XODIMLAR - Excel eksport tavsifi.
//
// NEGA users.service.list() chaqiriladi: u userBranchCondition() ni $and
// orqali qo'llaydi (homeBranchId YOKI branchAssignments). Bu shartni bu
// yerda qayta yozish filial sizishiga olib kelardi.
//
// DIQQAT: `role` ATAYLAB filterSchema'da EMAS. Aks holda client role="owner"
// yuborib owner hisoblarini yuklab olardi. `staff: true` esa qattiq
// belgilangan - ro'yxat bilan bir xil ta'rif (o'quvchidan boshqa hamma).
//
// PAROL USTUNI HECH QACHON QO'SHILMAYDI: parollar ochiq matnda saqlanadi va
// faqat owner uchun /users/:id/password orqali beriladi. Ustun nomi eksport
// so'rovining audit yozuviga ham tushib qolardi.
const staffDataset = {
  key: "staff",
  label: "Xodimlar",
  fileBase: "xodimlar",
  sheetName: "Xodimlar",
  permission: PERMISSIONS.USERS_READ,

  filterSchema: z.object({
    search: z.string().trim().optional(),
    status: z.enum(["active", "archived", "all"]).optional(),
    sort: z.enum(["createdAt", "firstName", "lastName"]).optional(),
    order: z.enum(["asc", "desc"]).optional(),
  }),

  columns: [
    { key: "fullName", header: "Ism familiya", width: 28, type: "text", default: true },
    { key: "username", header: "Login", width: 16, type: "text", default: true },
    { key: "phone", header: "Telefon", width: 16, type: "text", default: true },
    { key: "roleLabel", header: "Rol", width: 20, type: "text", default: true },
    { key: "branchName", header: "Filial", width: 20, type: "text", default: true },
    { key: "statusLabel", header: "Holat", width: 12, type: "text", default: true },
    { key: "lastLoginAt", header: "Oxirgi kirish", width: 16, type: "date", default: true },
    { key: "hiredAt", header: "Ishga kirgan", width: 14, type: "date", default: false },
    { key: "extraBranches", header: "Qo'shimcha filiallar", width: 24, type: "int", default: false },
    { key: "createdAt", header: "Qo'shilgan", width: 14, type: "date", default: false },
  ],

  fetchPage: ({ filters, page, limit }) =>
    usersService.list({
      ...filters,
      staff: true,
      status: filters.status || "active",
      page,
      limit,
    }),

  mapRow: (doc) => ({
    fullName: [doc.firstName, doc.lastName].filter(Boolean).join(" "),
    username: doc.username || "",
    phone: doc.phone || "",
    // staff:true bo'lgani uchun roleLabel ro'yxatda allaqachon bor.
    roleLabel: doc.roleLabel || doc.role || "",
    branchName: doc.homeBranchId?.name || "",
    statusLabel: doc.isActive ? "Faol" : "Arxiv",
    lastLoginAt: doc.lastLoginAt || null,
    hiredAt: doc.hiredAt || null,
    extraBranches: (doc.branchAssignments || []).length,
    createdAt: doc.createdAt || null,
  }),
};

export default staffDataset;
