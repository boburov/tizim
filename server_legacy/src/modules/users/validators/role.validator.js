import { z } from "zod";

export const setRoleSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    // Role.value - dinamik, enum yo'q. Haqiqiyligi service'da tekshiriladi.
    role: z.string().min(1, "Rol kerak"),
  }),
});
