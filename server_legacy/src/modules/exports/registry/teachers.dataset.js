import { z } from "zod";
import { PERMISSIONS } from "../../../constants/permissions.js";
import { ROLES } from "../../../constants/roles.js";
import * as usersService from "../../users/services/users.service.js";

const GENDER_LABELS = { male: "Erkak", female: "Ayol" };

// O'QITUVCHILAR - Excel eksport tavsifi.
//
// NEGA users.service.list() chaqiriladi: u userBranchCondition() ni
// $and orqali qo'llaydi (homeBranchId YOKI branchAssignments). Bu shart
// oddiy branchFilter() dan farq qiladi va uni bu yerda qayta yozish
// filial sizishiga olib kelardi.
//
// DIQQAT: role ATAYLAB filterSchema'da EMAS - u fetchPage'da qattiq
// belgilangan. Aks holda client role="owner" yuborib, owner hisoblarini
// ro'yxatini yuklab olardi.
const teachersDataset = {
  key: "teachers",
  label: "O'qituvchilar",
  fileBase: "oqituvchilar",
  sheetName: "O'qituvchilar",
  permission: PERMISSIONS.TEACHERS_READ,

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
    { key: "branchName", header: "Filial", width: 20, type: "text", default: true },
    { key: "hiredAt", header: "Ishga kirgan", width: 14, type: "date", default: true },
    { key: "statusLabel", header: "Holat", width: 12, type: "text", default: true },
    { key: "birthDate", header: "Tug'ilgan sana", width: 14, type: "date", default: false },
    { key: "genderLabel", header: "Jinsi", width: 10, type: "text", default: false },
    { key: "extraBranches", header: "Qo'shimcha filiallar", width: 24, type: "int", default: false },
    { key: "createdAt", header: "Qo'shilgan", width: 14, type: "date", default: false },
  ],

  fetchPage: ({ filters, page, limit }) =>
    usersService.list({
      ...filters,
      role: ROLES.TEACHER,
      status: filters.status || "active",
      page,
      limit,
    }),

  mapRow: (doc) => ({
    fullName: [doc.firstName, doc.lastName].filter(Boolean).join(" "),
    username: doc.username || "",
    phone: doc.phone || "",
    branchName: doc.homeBranchId?.name || "",
    hiredAt: doc.hiredAt || null,
    statusLabel: doc.isActive ? "Faol" : "Arxiv",
    birthDate: doc.birthDate || null,
    genderLabel: GENDER_LABELS[doc.gender] || "",
    extraBranches: (doc.branchAssignments || []).length,
    createdAt: doc.createdAt || null,
  }),
};

export default teachersDataset;
