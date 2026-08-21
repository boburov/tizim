import { z } from "zod";

export const cashflowSchema = z.object({
  query: z.object({
    range: z.enum(["week", "month", "year"]).optional(),
    // DAVR - `overview` bilan BIR XIL kontrakt (period.validator.js).
    // Berilmasa joriy davr olinadi (orqaga moslik).
    //
    // `range="week"` da e'tiborga olinmaydi: "o'tgan oyning haftasi"
    // degan tushuncha yo'q - servisdagi izohga qarang.
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
  }),
});
