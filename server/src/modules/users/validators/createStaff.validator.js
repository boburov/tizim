import { z } from "zod";
import {
  COMP_BASE_TYPES,
  COMP_VARIABLE_TYPES,
  COMP_PERCENT_BASES,
} from "../../../models/teacherCompensation.model.js";

// ISHGA OLISHDA MAOSH (ixtiyoriy). O'qituvchi uchun formaning o'zida
// oylik belgilanadi - keyin alohida sahifaga o'tish shart emas.
const compensationSchema = z
  .object({
    effectiveFrom: z.coerce.date().optional(),
    baseType: z.enum(COMP_BASE_TYPES).optional(),
    baseAmount: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
    variableType: z.enum(COMP_VARIABLE_TYPES).optional(),
    variableRate: z.coerce.number().min(0).max(1_000_000_000).optional(),
    percentBase: z.enum(COMP_PERCENT_BASES).optional(),
    branchId: z.string().min(1).nullable().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine(
    (d) => d.variableType !== "percent" || (d.variableRate ?? 0) <= 100,
    { message: "Foiz stavkasi 100 dan oshmasligi kerak", path: ["variableRate"] },
  );

const branchAssignmentSchema = z.object({
  branchId: z.string().min(1),
  // Bo'sh bo'lsa asosiy rol ishlatiladi.
  role: z.string().min(1).max(40).optional().nullable(),
});

// XODIM (direktor/administrator) yaratish.
// registerUser'dan farqli: rol DINAMIK (custom rollar ham), va
// hiredAt/enrolledAt kabi rolga xos majburiy maydonlar YO'Q.
export const createStaffSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, "Ism kerak").max(60),
    lastName: z.string().min(1, "Familiya kerak").max(60),
    username: z.string().min(3, "Login kamida 3 belgi").max(40),
    password: z.string().min(6, "Parol kamida 6 belgi").max(100),
    phone: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v === "" ? undefined : v)),
    // Rol - Role.value (dinamik, enum YO'Q). Mavjudligi servisda
    // assertRoleAssignable orqali tekshiriladi.
    role: z.string().min(1, "Rol tanlanishi shart").max(40),
    homeBranchId: z.string().min(1, "Filial tanlanishi shart"),
    branchAssignments: z.array(branchAssignmentSchema).optional(),
    birthDate: z.coerce.date().optional().nullable(),
    hiredAt: z.coerce.date().optional().nullable(),
    // Faqat o'qituvchi uchun ma'noli - boshqa rollarda e'tiborsiz qoldiriladi.
    compensation: compensationSchema.optional(),
    // Tasdiq talab qilinganda so'rovchi qoldiradigan izoh (owner ko'radi).
    requestNote: z.string().trim().max(500).optional(),
  }),
});

export const setBranchesSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    homeBranchId: z.string().min(1).optional(),
    branchAssignments: z.array(branchAssignmentSchema).optional(),
  }),
});
