import { z } from "zod";
import { LEAD_STATUSES } from "../../../constants/leadStatus.js";

const statusEnum = z.enum(LEAD_STATUSES);

export const listSchema = z.object({
  query: z.object({
    status: statusEnum.optional(),
    source: z.string().optional(),
    direction: z.string().optional(),
    // ALOQA holati bo'yicha filtr:
    //   no_contact - hech kim qo'lga olmagan (status "new", tarix bo'sh)
    //   stale      - aloqa qilingan, lekin 7+ kun tashlab qo'yilgan
    // Status filtridan ATAYLAB ajratilgan: "new" statusdagi lidlarning
    // bir qismi bilan allaqachon ishlangan bo'lishi mumkin.
    engagement: z.enum(["no_contact", "stale"]).optional(),
    search: z.string().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const statsSchema = z.object({
  query: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});

const leadFields = {
  firstName: z.string().min(1).max(60),
  lastName: z.string().max(60).optional(),
  age: z.coerce.number().int().min(1).max(120).nullable().optional(),
  phone: z.string().min(9, "Telefon kerak"),
  parentPhone: z.string().nullable().optional(),
  sourceId: z.string().nullable().optional(),
  directionId: z.string().nullable().optional(),
  rejectionReasonId: z.string().nullable().optional(),
  status: statusEnum.optional(),
  trialDate: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).optional(),
  rejectionNote: z.string().max(1000).optional(),
};

// LIDNI YOPISHDA IZOH MAJBURIY.
//
// Bu qoida validatorga (servisga emas) ATAYLAB qo'yilgan: u create va
// update ikkalasiga ham bir xil qo'llanishi kerak va foydalanuvchi 400
// javobida aynan QAYSI maydon yetishmayotganini ko'rishi lozim.
//
// Minimal uzunlik 10 belgi: "yo'q", "ok", "-" kabi javoblar shartni
// qanoatlantiradi-yu, tahlil uchun HECH NARSA bermaydi. 10 belgi odamni
// hech bo'lmasa bitta mazmunli jumla yozishga majburlaydi.
const MIN_NOTE = 10;

export const assertClosingNote = (b, ctx) => {
  if (b.status !== "rejected") return;

  const note = (b.rejectionNote || "").trim();
  if (note.length < MIN_NOTE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rejectionNote"],
      message:
        "Lidni yopishda izoh majburiy: mijoz nima dedi? " +
        "(narx, joylashuv, vaqt, boshqa markaz...). Kamida 10 ta belgi.",
    });
  }
  if (!b.rejectionReasonId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rejectionReasonId"],
      message: "Rad etish sababini tanlang",
    });
  }
};

export const createSchema = z.object({
  body: z
    .object({
      ...leadFields,
      // FAQAT yaratishda: "Barcha filiallar" rejimida client formada qaysi
      // filialga yozishni so'raydi. Bo'sh bo'lsa server aktiv filialdan
      // (yoki markazda yagona filial bo'lsa - o'shandan) aniqlaydi.
      // Tahrirlashda YO'Q: lidni filialdan filialga ko'chirish alohida amal.
      branchId: z.string().nullable().optional(),
    })
    // Lid darhol "rad etilgan" holatda yaratilishi ham mumkin (kelib
    // so'radi-yu, qiziqmadi) - u holda ham izoh majburiy.
    .superRefine(assertClosingNote),
});

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      ...leadFields,
      firstName: z.string().min(1).max(60).optional(),
      phone: z.string().min(9).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    })
    .superRefine(assertClosingNote),
});

export const reminderSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    followUpAt: z.coerce.date().nullable().optional(),
    followUpNote: z.string().max(500).optional(),
  }),
});

const convertFields = {
  firstName: z.string().min(1, "Ism kerak").max(60),
  lastName: z.string().min(1, "Familiya kerak").max(60),
  username: z.string().min(3, "Username kamida 3 belgidan iborat").max(40),
  phone: z.string().min(9, "Telefon kerak"),
  password: z.string().min(6, "Parol kamida 6 belgidan iborat"),
  gender: z.enum(["male", "female"]).nullable().optional(),
  enrolledAt: z.coerce.date().nullable().optional(),
};

export const convertSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    ...convertFields,
    // Ixtiyoriy: aylantirish bilan BIR VAQTDA guruhga qabul qilish.
    // Bo'sh bo'lsa o'quvchi guruhsiz yaratiladi (eski xatti-harakat).
    groupId: z.string().nullable().optional(),
  }),
});

// Ko'p lidni bir martada aylantirish. Har lid uchun login/parol ALOHIDA
// keladi - klient ularni generatsiya qiladi va operator tahrirlay oladi.
export const convertBulkSchema = z.object({
  body: z.object({
    leads: z
      .array(z.object({ id: z.string().min(1), ...convertFields }))
      .min(1, "Kamida bitta lid tanlang")
      .max(100, "Bir martada ko'pi bilan 100 ta lid"),
    groupId: z.string().nullable().optional(),
  }),
});
