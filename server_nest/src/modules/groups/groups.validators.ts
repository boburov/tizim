import { z } from 'zod';

/**
 * `modules/groups/validators/*.js` NING KO'CHIRMASI (o'qish + yozish).
 *
 * Yozish sxemalari FAZA 5b da, ko'chirilgan marshrutlar bilan BIRGA
 * qo'shildi — ilgari ular ataylab yozilmagan edi, chunki
 * ishlatilmaydigan sxema vaqt o'tib asl nusxadan ajralib ketardi.
 */

// ─────────────────────────── JADVAL ───────────────────────────
// ⚠ `validators/common.js` NING AYNAN KO'CHIRMASI.

const GROUP_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const TIME_RX = /^([01]\d|2[0-3]):[0-5]\d$/;

const scheduleItem = z
  .object({
    day: z.enum(GROUP_DAYS),
    startTime: z.string().regex(TIME_RX, 'Vaqt formati HH:mm'),
    endTime: z.string().regex(TIME_RX, 'Vaqt formati HH:mm'),
    // Versiyalash: shu slot qaysi sanadan amal qiladi. null/yo'q → boshidan.
    effectiveFrom: z.coerce.date().nullish(),
  })
  .refine((s) => s.startTime < s.endTime, {
    message: "Tugash vaqti boshlanishidan keyin bo'lishi kerak",
    path: ['endTime'],
  });

/**
 * ⚠ Versiyalash tufayli bir kun BIR NECHTA versiyada (turli
 * `effectiveFrom` bilan) bo'lishi MUMKIN. Faqat AYNAN bir xil
 * (kun + boshlanish vaqti + effectiveFrom) takrorlanishi rad etiladi.
 */
const effKeyOf = (item: { effectiveFrom?: Date | null }) =>
  item.effectiveFrom ? new Date(item.effectiveFrom).getTime() : 'null';

const scheduleArray = z.array(scheduleItem).superRefine((arr, ctx) => {
  const seen = new Map<string, number>();
  arr.forEach((item, idx) => {
    const key = `${item.day}-${item.startTime}-${effKeyOf(item)}`;
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Bu dars vaqti jadvalda allaqachon mavjud',
        path: [idx, 'startTime'],
      });
    } else {
      seen.set(key, idx);
    }
  });
});

export const idParam = z.object({ id: z.string().min(1) });

export const idStudentParams = z.object({
  id: z.string().min(1),
  studentId: z.string().min(1),
});

export const idMembershipParams = z.object({
  id: z.string().min(1),
  membershipId: z.string().min(1),
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

// ═══════════════════════ YOZISH SXEMALARI (FAZA 5b) ═══════════════════════

/**
 * ⚠ `null`/`""` "KIRITILMAGAN" (undefined) deb qabul qilinadi —
 * `null` ning epoch/0 ga coerce bo'lib MAJBURIY tekshiruvni chetlab
 * o'tishining oldini oladi.
 */
const emptyToUndef = (v: unknown) => (v === '' || v == null ? undefined : v);

export const createSchema = z.object({
  body: z.object({
    // "Barcha filiallar" rejimida klient formada qaysi filialga yozishni
    // so'raydi. Bo'sh bo'lsa server aktiv filialdan aniqlaydi.
    branchId: z.string().nullable().optional(),
    // KURS (global katalog) va XONA (filial resursi) — ikkalasi ham
    // IXTIYORIY: eski/aralash guruhlar va onlayn darslar uchun `null`.
    courseId: z.string().min(1).nullable().optional(),
    roomId: z.string().min(1).nullable().optional(),
    name: z
      .string({ required_error: 'Guruh nomini kiriting' })
      .min(2, "Kamida 2 belgidan iborat bo'lishi kerak")
      .max(120, "120 belgidan oshmasligi kerak"),
    schedule: scheduleArray.refine((arr) => (arr?.length ?? 0) >= 1, {
      message: "Kamida bitta dars kuni qo'shing",
    }),
    teachers: z
      .array(z.string().min(1))
      .min(1, "O'qituvchi tanlang")
      .max(1, "Guruhda faqat bitta o'qituvchi bo'lishi mumkin"),
    // ⚠ `coerce.date` noto'g'ri sanani "Invalid Date" bilan o'tkazib
    // yuborardi — shuning uchun preprocess ichida ochiq tekshiriladi.
    startDate: z.preprocess((v) => {
      if (v === '' || v == null) return undefined;
      const d = new Date(v as never);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }, z.date({ required_error: 'Dars boshlanish sanasini kiriting' })),
    endDate: z.coerce.date().nullable().optional(),
    durationMonths: z.coerce.number().min(0).nullable().optional(),
    entryBilling: z.enum(['prorated', 'full']).optional(),
    // Joriy oy tarifi (MAJBURIY) — `GroupFee` shu summa bilan yaratiladi.
    monthlyPrice: z.preprocess(
      emptyToUndef,
      z.coerce
        .number({
          required_error: "Oylik to'lovni kiriting",
          invalid_type_error: "Oylik to'lovni kiriting",
        })
        .int()
        .min(0),
    ),
  }),
});

export const updateSchema = z.object({
  params: idParam,
  body: z
    .object({
      name: z
        .string()
        .min(2, "Kamida 2 belgidan iborat bo'lishi kerak")
        .max(120, "120 belgidan oshmasligi kerak")
        .optional(),
      schedule: scheduleArray.optional(),
      // Versiyalash: yangi jadval qaysi sanadan amal qiladi. Berilmasa —
      // bugundan. Eski versiya TARIX uchun saqlanib qoladi.
      scheduleEffectiveFrom: z.coerce.date().nullish(),
      teachers: z
        .array(z.string().min(1))
        .max(1, "Guruhda faqat bitta o'qituvchi bo'lishi mumkin")
        .optional(),
      startDate: z.coerce.date().nullable().optional(),
      endDate: z.coerce.date().nullable().optional(),
      durationMonths: z.coerce.number().min(0).nullable().optional(),
      entryBilling: z.enum(['prorated', 'full']).optional(),
      courseId: z.string().min(1).nullable().optional(),
      roomId: z.string().min(1).nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});

/** Butunlay o'chirish: TASDIQ uchun guruh nomi body'da yuboriladi. */
export const permanentDeleteSchema = z.object({
  params: idParam,
  body: z.object({ confirmName: z.string().optional() }).default({}),
});

export const addStudentSchema = z.object({
  params: idParam,
  body: z
    .object({
      studentId: z.string().min(1, "O'quvchi tanlanmagan"),
      joinedAt: z.coerce.date({ required_error: 'Boshlash sanasi kiritilmagan' }),
      leftAt: z.coerce.date().optional(),
      requestNote: z.string().trim().max(500).optional(),
    })
    .refine((b) => !b.leftAt || b.leftAt >= b.joinedAt, {
      message: "Tugatgan sana boshlash sanasidan oldin bo'lishi mumkin emas",
      path: ['leftAt'],
    }),
});

/** ORQAGA SANA TA'SIRINI OLDINDAN KO'RISH — hech narsa SAQLAMAYDI. */
export const backdatePreviewSchema = z.object({
  params: idParam,
  query: z
    .object({
      joinedAt: z.coerce.date({ required_error: 'Boshlash sanasi kiritilmagan' }),
      leftAt: z.coerce.date().optional(),
    })
    .refine((b) => !b.leftAt || b.leftAt >= b.joinedAt, {
      message: "Tugatgan sana boshlash sanasidan oldin bo'lishi mumkin emas",
      path: ['leftAt'],
    }),
});

export const addStudentsBulkSchema = z.object({
  params: idParam,
  body: z
    .object({
      studentIds: z.array(z.string().min(1)).min(1, "Kamida bitta o'quvchi tanlang"),
      joinedAt: z.coerce.date({ required_error: 'Boshlash sanasi kiritilmagan' }),
      leftAt: z.coerce.date().optional(),
      // Dars to'qnashuviga QARAMAY baribir qo'shish.
      force: z.boolean().optional().default(false),
    })
    .refine((b) => !b.leftAt || b.leftAt >= b.joinedAt, {
      message: "Tugatgan sana boshlash sanasidan oldin bo'lishi mumkin emas",
      path: ['leftAt'],
    }),
});

/**
 * A'zolik sanalarini tahrirlash.
 * ⚠ `leftAt: null` yuborilsa "o'qimoqda"ga QAYTARILADI; umuman
 * yuborilmasa O'ZGARMAYDI.
 */
export const updateMembershipSchema = z.object({
  params: idStudentParams,
  body: z
    .object({
      joinedAt: z.coerce.date().optional(),
      leftAt: z.coerce.date().nullable().optional(),
    })
    .refine((b) => b.joinedAt !== undefined || b.leftAt !== undefined, {
      message: "O'zgartirish uchun sana kiritilmagan",
    }),
});

export const studentParamsSchema = z.object({
  params: idStudentParams,
  // Guruhdan chiqarishda IXTIYORIY dinamik sabab (`ArchiveReason` id) va
  // qarzni yomon qarz sifatida hisobdan chiqarishga admin tasdig'i.
  body: z
    .object({
      reasonId: z.string().min(1).optional(),
      writeOff: z.boolean().optional(),
    })
    .optional(),
});

export const membershipByIdSchema = z.object({ params: idMembershipParams });

export const membershipUpdateSchema = z.object({
  params: idMembershipParams,
  body: z
    .object({
      joinedAt: z.coerce.date().optional(),
      leftAt: z.coerce.date().nullable().optional(),
    })
    .refine((b) => b.joinedAt !== undefined || b.leftAt !== undefined, {
      message: "O'zgartirish uchun sana kiritilmagan",
    }),
});

export type CreateRequest = z.infer<typeof createSchema>;
export type UpdateRequest = z.infer<typeof updateSchema>;
export type PermanentDeleteRequest = z.infer<typeof permanentDeleteSchema>;
export type AddStudentRequest = z.infer<typeof addStudentSchema>;
export type BackdatePreviewRequest = z.infer<typeof backdatePreviewSchema>;
export type AddStudentsBulkRequest = z.infer<typeof addStudentsBulkSchema>;
export type UpdateMembershipRequest = z.infer<typeof updateMembershipSchema>;
export type StudentParamsRequest = z.infer<typeof studentParamsSchema>;
export type MembershipByIdRequest = z.infer<typeof membershipByIdSchema>;
export type MembershipUpdateRequest = z.infer<typeof membershipUpdateSchema>;
