import { z } from "zod";
import { ALL_APPROVAL_STATUSES, ALL_EXPENSE_KINDS } from "../../../models/expenseApproval.model.js";

export const listSchema = z.object({
  query: z.object({
    status: z.enum(ALL_APPROVAL_STATUSES).optional(),
    kind: z.enum(ALL_EXPENSE_KINDS).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
});
