import { z } from "zod";
import {
  ALL_APPROVAL_STATUSES,
  ALL_APPROVAL_KINDS,
  ALL_APPROVAL_CATEGORIES,
} from "../../../models/approval.model.js";

export const listSchema = z.object({
  query: z.object({
    status: z.enum(ALL_APPROVAL_STATUSES).optional(),
    kind: z.enum(ALL_APPROVAL_KINDS).optional(),
    // Owner inbox'ini ikkiga bo'lish uchun ("Moliya" / "Sozlamalar" tab'lari).
    category: z.enum(ALL_APPROVAL_CATEGORIES).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
});
