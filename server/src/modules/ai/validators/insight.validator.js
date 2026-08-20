import { z } from "zod";
import {
  INSIGHT_DOMAINS,
  INSIGHT_KINDS,
  INSIGHT_SEVERITIES,
  INSIGHT_STANCES,
  INSIGHT_STATUSES,
  INSIGHT_SUBJECT_TYPES,
} from "../insightKinds.js";
import { AI_REPORT_PERIODS } from "../../../constants/ai.js";

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "ID formati noto'g'ri");

export const listSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    status: z.enum(INSIGHT_STATUSES).optional(),
    kind: z.enum(INSIGHT_KINDS).optional(),
    subjectType: z.enum(INSIGHT_SUBJECT_TYPES).optional(),
    severity: z.enum(INSIGHT_SEVERITIES).optional(),
    domain: z.enum(INSIGHT_DOMAINS).optional(),
    stance: z.enum(INSIGHT_STANCES).optional(),
    subjectId: objectId.optional(),
  }),
});

export const actionCenterSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
});

// Modul paneli: /ai/insights/domain/finance. Domen YO'L parametrida,
// query'da emas - u resursni aniqlaydi, uni filtrlamaydi.
export const byDomainSchema = z.object({
  params: z.object({ domain: z.enum(INSIGHT_DOMAINS) }),
  query: z.object({
    limit: z.coerce.number().int().min(1).max(20).optional(),
  }),
});

// Brifing "hozir nima qilay" bo'limida nechta harakat ko'rsatilishi.
export const briefingSchema = z.object({
  query: z.object({
    actionLimit: z.coerce.number().int().min(1).max(20).optional(),
  }),
});

export const listReportsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    period: z.enum(AI_REPORT_PERIODS).optional(),
  }),
});

export const latestReportSchema = z.object({
  query: z.object({
    period: z.enum(AI_REPORT_PERIODS).optional(),
  }),
});

export const reportIdSchema = z.object({
  params: z.object({ id: objectId }),
});

// Sozlamalarni o'qish: branchId QUERY'dan keladi va to'g'ridan-to'g'ri
// Mongo so'roviga tushadi. Validatsiyasiz "?branchId=abc" CastError
// beradi va foydalanuvchi toza 400 o'rniga 500 ko'radi.
export const getConfigSchema = z.object({
  query: z.object({
    branchId: objectId.optional(),
  }),
});

// Ro'yxat sahifasi uchun: N ta o'quvchining badge'ini BITTA so'rovda olish.
// POST, chunki 200 ta ID query string'ga sig'maydi.
export const bySubjectsSchema = z.object({
  body: z.object({
    subjectIds: z.array(objectId).min(1).max(500),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: objectId }),
});

export const dismissSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    // Majburiy: sababsiz rad etish modelni kalibrlash imkonini bermaydi.
    reason: z.string().trim().min(3, "Sabab kamida 3 belgi bo'lishi kerak").max(500),
  }),
});

const weightRecord = z.record(z.string(), z.number().min(0).max(1));

export const updateConfigSchema = z.object({
  body: z.object({
    // null = global standart, ObjectId = filial override.
    branchId: objectId.nullable().optional(),
    churnWeights: weightRecord.optional(),
    paymentWeights: weightRecord.optional(),
    thresholds: z.record(z.string(), z.number()).optional(),
    confidenceFloor: z.number().min(0).max(1).optional(),
    narrationEnabled: z.boolean().optional(),
    narrationModel: z.string().trim().min(1).max(60).optional(),
  }),
});

export const recomputeSchema = z.object({
  body: z.object({
    branchId: objectId.optional(),
  }),
});
