import { z } from 'zod';

/**
 * `server/src/modules/users/validators/*.js` NING AYNAN KO'CHIRMASI.
 *
 * Sxemalar butun so'rovni bitta obyekt sifatida oladi — xato yo'llari
 * (`details[].path`, masalan `"body.password"`) Express bilan bir xil
 * chiqishi uchun.
 *
 * ⚠ `createStaffSchema` `compensation` va `openingBalance` ni QABUL
 * QILADI va ular ENDI HAQIQATAN BAJARILADI (ilgari 501 berardi).
 * Sxemada saqlanishi ATAYLAB edi: ularni olib tashlash xatoni 400 ga
 * aylantirardi — "hali ko'chirilmagan" o'rniga "noto'g'ri so'rov" deb
 * yolg'on aytardi. Chegara VALIDATSIYADA emas, SERVISDA.
 */

/** `update.validator.js` dagi `idSchema`. */
export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

/** `list.validator.js` */
export const listSchema = z.object({
  query: z.object({
    // Rollar DINAMIK — enum bilan cheklamaymiz, custom rol bo'yicha ham
    // filtrlash mumkin bo'lsin.
    role: z.string().min(1).optional(),
    search: z.string().optional(),
    // XODIMLAR ro'yxati: o'quvchidan boshqa hamma. Rol nomlari dinamik
    // bo'lgani uchun ro'yxat emas, BAYROQ.
    staff: z.enum(['0', '1', 'true', 'false']).optional(),
    // FILIAL KESIMI — `x-branch-id` SARLAVHASIDAN FARQLI.
    //
    // Sarlavha butun sessiyaning ko'lamini belgilaydi; bu parametr esa
    // BITTA so'rovni toraytiradi. Super Admin panelidagi filial sahifasi
    // aynan shuni talab qiladi: u ko'lamni almashtirmasdan (boshqa
    // bo'limlar butun markazni ko'rsatib turibdi) faqat shu filialning
    // odamlarini so'raydi.
    //
    // ⚠ Faqat TORAYTIRADI — servis `assertBranchInScope` bilan
    // kengaytirishga urinishni 403 qiladi.
    branchId: z.string().min(1).optional(),
    archived: z.enum(['0', '1', 'true', 'false']).optional(),
    status: z.enum(['active', 'archived', 'frozen', 'all']).optional(),
    sort: z.enum(['createdAt', 'firstName', 'lastName', 'debt']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

/**
 * `checkAvailability.validator.js`
 *
 * ⚠ `phone` HAMON QABUL QILINADI (eski/keshlangan klient uni yuboradi),
 * lekin javobga TA'SIR QILMAYDI — telefon takrorlanishi ruxsat etilgan.
 * Sxemadan olib tashlansa eski klient 400 olardi.
 */
export const checkAvailabilitySchema = z.object({
  query: z.object({
    phone: z.string().max(30).optional(),
    username: z.string().max(40).optional(),
    // Tahrirlashda: odamning O'Z logini "band" deb ko'rsatilmasin.
    excludeId: z.string().min(1).optional(),
  }),
});

/** `update.validator.js` dagi `updateSchema`. */
export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      firstName: z.string().min(1).max(60).optional(),
      lastName: z.string().min(1).max(60).optional(),
      // Telefon ixtiyoriy: bo'sh satr "kiritilmagan" deb qabul qilinadi.
      phone: z.preprocess(
        (v) => (v === '' || v == null ? undefined : v),
        z.string().min(9, "Telefon noto'g'ri").optional(),
      ),
      isActive: z.boolean().optional(),

      birthDate: z.coerce.date().nullable().optional(),
      gender: z.enum(['male', 'female']).nullable().optional(),

      // Faqat o'quvchi uchun
      enrolledAt: z.coerce.date().nullable().optional(),
      completedAt: z.coerce.date().nullable().optional(),

      // Faqat o'qituvchi uchun
      hiredAt: z.coerce.date().nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});

/** `password.validator.js` */
export const setPasswordSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    password: z.string().min(6, 'Parol kamida 6 belgidan iborat'),
  }),
});

/** `role.validator.js` */
export const setRoleSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    // `Role.value` — dinamik, enum yo'q. Haqiqiyligi servisda tekshiriladi.
    role: z.string().min(1, 'Rol kerak'),
  }),
});

/** `createStaff.validator.js` dagi `setBranchesSchema`. */
const branchAssignmentSchema = z.object({
  branchId: z.string().min(1),
  // Bo'sh bo'lsa asosiy rol ishlatiladi.
  role: z.string().min(1).max(40).optional().nullable(),
});

export const setBranchesSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    homeBranchId: z.string().min(1).optional(),
    branchAssignments: z.array(branchAssignmentSchema).optional(),
  }),
});

/**
 * `archive.validator.js` — arxivlash / qaytarish.
 *
 * ⚠ `body` DA `.default({})` BOR: Express `validate()` tanasi umuman
 * yuborilmagan so'rovni ham o'tkazadi (`DELETE` odatda tanasiz keladi).
 * Uni tashlab ketish "Required" 400 berardi va klient arxivlay olmasdi.
 */
export const archiveActionSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      reasonId: z.string().min(1).optional(),
      // Arxivlash sanasi (ixtiyoriy). Berilmasa — bugun.
      archiveDate: z.coerce.date().nullable().optional(),
    })
    .default({}),
});

/**
 * `update.validator.js` dagi `permanentDeleteSchema`.
 *
 * `confirmName` — o'quvchi/o'qituvchi uchun to'liq ism tasdig'i. Sxema uni
 * MAJBURIY qilmaydi: yo'qligi 400 ni SERVIS qatlamida beradi (xato matni
 * u yerda aniqroq va Express bilan bir xil).
 */
export const permanentDeleteSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      confirmName: z.string().optional(),
    })
    .default({}),
});


/**
 * `createStaff.validator.js` — XODIM (direktor/administrator) yaratish.
 *
 * `registerUser` dan farqi: rol DINAMIK (custom rollar ham), va
 * `hiredAt`/`enrolledAt` kabi rolga xos MAJBURIY maydonlar YO'Q.
 */

/** `constants/compensation.js` — sxemadagi enumlar bilan AYNAN bir xil. */
const COMP_BASE_TYPES = ['none', 'fixed_monthly'] as const;
const COMP_VARIABLE_TYPES = [
  'none',
  'percent',
  'per_student',
  'per_lesson_hour',
  'per_group',
] as const;
const COMP_PERCENT_BASES = ['billed', 'collected'] as const;

/** `constants/openingBalance.js` */
const OPENING_MAX_AMOUNT = 500_000_000;

/**
 * ISHGA OLISHDA MAOSH (ixtiyoriy). O'qituvchi uchun formaning o'zida
 * oylik belgilanadi — keyin alohida sahifaga o'tish shart emas.
 */
const compensationSchema = z
  .object({
    effectiveFrom: z.coerce.date().optional(),
    baseType: z.enum(COMP_BASE_TYPES).optional(),
    baseAmount: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
    variableType: z.enum(COMP_VARIABLE_TYPES).optional(),
    variableRate: z.coerce.number().min(0).max(1_000_000_000).optional(),
    percentBase: z.enum(COMP_PERCENT_BASES).optional(),
    branchId: z.string().min(1).nullable().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.variableType !== 'percent' || (d.variableRate ?? 0) <= 100, {
    message: "Foiz stavkasi 100 dan oshmasligi kerak",
    path: ['variableRate'],
  });

/**
 * `openingBalance.validator.js` dagi `openingAmountSchema`.
 *
 * ⚠ Bo'sh forma maydoni ("") "kiritilmagan" deb qabul qilinadi — aks
 * holda `z.coerce.number()` uni 0 ga aylantirib, "qoldiq nol" degan
 * ma'noda ham, "kiritilmagan" ma'noda ham bir xil ko'rinardi.
 */
const openingAmountSchema = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z
    .coerce.number()
    .int("Boshlang'ich summa butun son bo'lishi kerak")
    .refine((n) => Math.abs(n) <= OPENING_MAX_AMOUNT, {
      message: `Boshlang'ich summa ${OPENING_MAX_AMOUNT.toLocaleString('ru-RU')} so'mdan oshmasligi kerak`,
    })
    .optional(),
);

export const createStaffSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'Ism kerak').max(60),
    lastName: z.string().min(1, 'Familiya kerak').max(60),
    username: z.string().min(3, 'Login kamida 3 belgi').max(40),
    password: z.string().min(6, 'Parol kamida 6 belgi').max(100),
    phone: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v === '' ? undefined : v)),
    // Rol — `Role.value` (dinamik, enum YO'Q). Mavjudligi servisda
    // `assertRoleAssignable` orqali tekshiriladi.
    role: z.string().min(1, 'Rol tanlanishi shart').max(40),
    homeBranchId: z.string().min(1, 'Filial tanlanishi shart'),
    branchAssignments: z.array(branchAssignmentSchema).optional(),
    birthDate: z.coerce.date().optional().nullable(),
    hiredAt: z.coerce.date().optional().nullable(),
    // Faqat o'qituvchi uchun ma'noli — boshqa rollarda e'tiborsiz qoldiriladi.
    compensation: compensationSchema.optional(),
    // BOSHLANG'ICH QOLDIQ — ishga olishdan OLDINGI hisob-kitob.
    //   +X = markaz xodimga qarzdor (to'lanmagan eski oylik)
    //   -X = xodim markazga qarzdor (ortiqcha olingan avans)
    openingBalance: openingAmountSchema,
    openingBalanceNote: z.string().trim().max(500).optional(),
    // Tasdiq talab qilinganda so'rovchi qoldiradigan izoh (owner ko'radi).
    requestNote: z.string().trim().max(500).optional(),
  }),
});

export type IdRequest = z.infer<typeof idSchema>;
export type ListRequest = z.infer<typeof listSchema>;
export type CheckAvailabilityRequest = z.infer<typeof checkAvailabilitySchema>;
export type UpdateRequest = z.infer<typeof updateSchema>;
export type SetPasswordRequest = z.infer<typeof setPasswordSchema>;
export type SetRoleRequest = z.infer<typeof setRoleSchema>;
export type SetBranchesRequest = z.infer<typeof setBranchesSchema>;
export type ArchiveActionRequest = z.infer<typeof archiveActionSchema>;
export type PermanentDeleteRequest = z.infer<typeof permanentDeleteSchema>;
export type CreateStaffRequest = z.infer<typeof createStaffSchema>;
