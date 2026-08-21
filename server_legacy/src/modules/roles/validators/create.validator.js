import { z } from "zod";
import { ALL_ROLE_TYPES } from "../../../constants/roles.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Noto'g'ri identifikator");

export const createSchema = z.object({
  body: z.object({
    label: z.string().min(2, "Rol nomi kerak").max(60),
    description: z.string().max(300).optional(),
    // value (slug) serverda avtomatik generatsiya qilinadi - clientdan olinmaydi.
    permissionIds: z.array(objectId).default([]),
    roleType: z.enum(ALL_ROLE_TYPES).optional(),
    defaultPath: z.string().max(120).optional(),
  }),
});
