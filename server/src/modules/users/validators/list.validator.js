import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    // Rollar dinamik - enum bilan cheklamaymiz, custom rol bo'yicha ham
    // filtrlash mumkin bo'lsin.
    role: z.string().min(1).optional(),
    search: z.string().optional(),
    archived: z.enum(["0", "1", "true", "false"]).optional(),
    // Holat filtri: active (faol) | archived (arxiv) | frozen (muzlatilgan) |
    // all (hammasi). Berilmasa - active.
    status: z.enum(["active", "archived", "frozen", "all"]).optional(),
    sort: z.enum(["createdAt", "firstName", "lastName", "debt"]).optional(),
    order: z.enum(["asc", "desc"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});
