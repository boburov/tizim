import { z } from 'zod';

/**
 * `server/src/modules/users/validators/*.js` NING AYNAN KO'CHIRMASI.
 *
 * Sxemalar butun so'rovni bitta obyekt sifatida oladi — xato yo'llari
 * (`details[].path`, masalan `"body.password"`) Express bilan bir xil
 * chiqishi uchun.
 *
 * ⚠ `createStaffSchema` BU YERDA YO'Q. `POST /users/staff` tasdiqlar
 * (`expenseApprovals`), maosh shartnomasi (`teacherSalary`) va
 * boshlang'ich qoldiq (`openingBalance`) modullariga tayanadi — ular
 * hali ko'chirilmagan va UCHALASI HAM JAVOB TANASIGA ta'sir qiladi
 * (202 tasdiq, `openingBalanceError`). Sxemani "oldindan" yozib qo'yish
 * uni marshrutsiz qoldirardi va keyin ikkinchi manba bo'lib ajralib
 * ketardi.
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

export type IdRequest = z.infer<typeof idSchema>;
export type ListRequest = z.infer<typeof listSchema>;
export type CheckAvailabilityRequest = z.infer<typeof checkAvailabilitySchema>;
export type UpdateRequest = z.infer<typeof updateSchema>;
export type SetPasswordRequest = z.infer<typeof setPasswordSchema>;
export type SetRoleRequest = z.infer<typeof setRoleSchema>;
export type SetBranchesRequest = z.infer<typeof setBranchesSchema>;
export type ArchiveActionRequest = z.infer<typeof archiveActionSchema>;
export type PermanentDeleteRequest = z.infer<typeof permanentDeleteSchema>;
