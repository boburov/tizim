import { z } from "zod";
import { ALL_ROLE_TYPES } from "../../../constants/roles.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Noto'g'ri identifikator");

export const updateSchema = z.object({
  params: z.object({ value: z.string().min(1) }),
  body: z
    .object({
      label: z.string().min(2).max(60).optional(),
      description: z.string().max(300).optional(),
      permissionIds: z.array(objectId).optional(),
      roleType: z.enum(ALL_ROLE_TYPES).optional(),
      defaultPath: z.string().max(120).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, "O'zgartirish uchun maydon yuboring"),
});
