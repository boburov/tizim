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

// ─────────────────────── DARS BERISH DAVRLARI (yozish) ───────────────────────
// ⚠ `validators/teacherPeriod.validator.js` DAN AYNAN KO'CHIRILGAN.

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

/** Maosh stavkasi maydonlari (davr o'zida saqlaydi). */
const salaryRate = {
  salaryType: z.enum(['fixed', 'percent', 'mixed']).optional(),
  fixedAmount: z.coerce.number().min(0).optional(),
  percentRate: z.coerce.number().min(0).max(100).optional(),
  // Tasdiq talab qilinganda so'rovchi qoldiradigan izoh (owner ko'radi).
  // Tasdiq kerak bo'lmasa e'tiborga olinmaydi.
  requestNote: z.string().max(500).optional(),
};

export const teacherPeriodCreateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    teacher: z.string().min(1),
    startDate: z.string().regex(DATE_RX, "Sana formati YYYY-MM-DD bo'lishi kerak"),
    endDate: z.string().regex(DATE_RX).nullable().optional(),
    ...salaryRate,
  }),
});

export const teacherPeriodUpdateSchema = z.object({
  params: z.object({ id: z.string().min(1), periodId: z.string().min(1) }),
  body: z.object({
    startDate: z.string().regex(DATE_RX).optional(),
    endDate: z.string().regex(DATE_RX).nullable().optional(),
    ...salaryRate,
  }),
});

export const teacherPeriodRemoveSchema = z.object({
  params: z.object({ id: z.string().min(1), periodId: z.string().min(1) }),
});

/**
 * OMMAVIY TOPSHIRISH — "5 ta guruh Aziza'ga, 3 tasi Bekzod'ga,
 * 20-avgustdan". Har bir taqsimotda stavka IXTIYORIY: berilmasa qabul
 * qiluvchi o'zining standart shartnomasi bo'yicha oladi.
 */
export const teacherPeriodHandoverSchema = z.object({
  params: z.object({ teacherId: z.string().min(1) }),
  body: z.object({
    handoverDate: z
      .string()
      .regex(DATE_RX, "Sana formati YYYY-MM-DD bo'lishi kerak"),
    assignments: z
      .array(
        z.object({
          toTeacher: z.string().min(1),
          groups: z.array(z.string().min(1)).min(1, 'Kamida bitta guruh tanlang'),
          ...salaryRate,
        }),
      )
      .min(1, "Kamida bitta taqsimot ko'rsating"),
  }),
});

export type ListRequest = z.infer<typeof listSchema>;
export type IdParamRequest = z.infer<typeof idParamSchema>;
export type HistoryRequest = z.infer<typeof historyQuerySchema>;
export type MembershipListRequest = z.infer<typeof membershipListSchema>;
export type TeacherPeriodListRequest = z.infer<typeof teacherPeriodListSchema>;
export type TeacherPeriodCreateRequest = z.infer<typeof teacherPeriodCreateSchema>;
export type TeacherPeriodUpdateRequest = z.infer<typeof teacherPeriodUpdateSchema>;
export type TeacherPeriodRemoveRequest = z.infer<typeof teacherPeriodRemoveSchema>;
export type TeacherPeriodHandoverRequest = z.infer<typeof teacherPeriodHandoverSchema>;
