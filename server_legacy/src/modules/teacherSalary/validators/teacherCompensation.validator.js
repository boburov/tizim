import { z } from "zod";
import {
  COMP_BASE_TYPES,
  COMP_VARIABLE_TYPES,
  COMP_PERCENT_BASES,
} from "../../../constants/compensation.js";

// Maosh stavkasi so'rovlari uchun zod sxemalari.
// Enum ro'yxatlari MODELDAN olinadi - ikki joyda saqlansa vaqt o'tib
// ajralib ketardi (modelga yangi tur qo'shilib, validator uni rad etardi).

const objectId = z.string().min(1);
const money = z.coerce.number().int().min(0).max(1_000_000_000);

const baseFields = {
  effectiveFrom: z.coerce.date().optional(),
  baseType: z.enum(COMP_BASE_TYPES).optional(),
  baseAmount: money.optional(),
  variableType: z.enum(COMP_VARIABLE_TYPES).optional(),
  // percent uchun 0-100, qolganlari uchun so'm - chegara refine bilan.
  variableRate: z.coerce.number().min(0).max(1_000_000_000).optional(),
  percentBase: z.enum(COMP_PERCENT_BASES).optional(),
  branchId: objectId.nullable().optional(),
  note: z.string().trim().max(500).optional(),
  requestNote: z.string().trim().max(500).optional(),
};

// Foiz turida stavka 100 dan oshmasligi kerak - modeldagi tekshiruvning
// aynan o'zi, lekin bu yerda foydalanuvchi 400 (validatsiya) xatosini oladi.
const percentGuard = (data) =>
  data.variableType !== "percent" || (data.variableRate ?? 0) <= 100;
const percentMsg = {
  message: "Foiz stavkasi 100 dan oshmasligi kerak",
  path: ["variableRate"],
};

export const setSchema = z.object({
  body: z
    .object({
      teacher: objectId,
      ...baseFields,
    })
    .refine(percentGuard, percentMsg),
});

export const amendSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object(baseFields).refine(percentGuard, percentMsg),
});

export const idParamSchema = z.object({
  params: z.object({ id: objectId }),
});

export const teacherIdParamSchema = z.object({
  params: z.object({ teacherId: objectId }),
});

// ── Mukofot / jarima ──
export const adjustmentCreateSchema = z.object({
  body: z.object({
    teacher: objectId,
    group: objectId.optional(),
    branchId: objectId.optional(),
    kind: z.enum(["bonus", "deduction"]).default("bonus"),
    year: z.coerce.number().int().min(2000).max(3000),
    month: z.coerce.number().int().min(1).max(12),
    amount: z.coerce.number().int().positive().max(1_000_000_000),
    reason: z.string().trim().min(1).max(500),
  }),
});

// ── Hisob-kitobni yopish ──
// Summa ATAYLAB so'ralmaydi: u serverda qoldiqdan hisoblanadi. Mijozdan
// kelgan raqamga ishonilsa, eskirgan ekrandan yuborilgan qiymat qoldiqni
// noto'g'ri yopib, balansni manfiyga tushirib qo'yardi.
export const adjustmentSettleSchema = z.object({
  params: z.object({ teacherId: objectId }),
  body: z.object({
    reason: z.string().trim().min(1).max(500),
    branchId: objectId.optional(),
  }),
});
