import { z } from "zod";

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
