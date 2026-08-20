import { z } from 'zod';

/**
 * `modules/groups/validators/*.js` NING O'QISH YO'LLARIGA TEGISHLI QISMI.
 *
 * Yozish sxemalari (`create`, `update`, `addStudent`, `addStudentsBulk`,
 * `updateMembership`, `teacherPeriod.create/update`) FAZA 5b da
 * qo'shiladi — ular ko'chiriladigan marshrutlar bilan BIRGA kelishi
 * kerak, aks holda ishlatilmaydigan sxema qolib, vaqt o'tib asl
 * nusxadan ajralib ketardi.
 */

export const idParam = z.object({ id: z.string().min(1) });

export const idStudentParams = z.object({
  id: z.string().min(1),
  studentId: z.string().min(1),
});

export const listSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    teacherId: z.string().optional(),
    // ⚠ `z.enum` — ATAYLAB. Ixtiyoriy satr qabul qilinsa "arxiv"
    // ekranida `?archived=yes` JIMGINA faol guruhlarni ko'rsatardi
    // (`"yes" === "1"` → false).
    archived: z.enum(['0', '1', 'true', 'false']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const idParamSchema = z.object({ params: idParam });

export const historyQuerySchema = z.object({
  params: idParam,
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const membershipListSchema = z.object({ params: idStudentParams });

export const teacherPeriodListSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export type ListRequest = z.infer<typeof listSchema>;
export type IdParamRequest = z.infer<typeof idParamSchema>;
export type HistoryRequest = z.infer<typeof historyQuerySchema>;
export type MembershipListRequest = z.infer<typeof membershipListSchema>;
export type TeacherPeriodListRequest = z.infer<typeof teacherPeriodListSchema>;
