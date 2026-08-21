import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Noto'g'ri ID");

// Guruhlar ro'yxati. multipart/form-data da massiv ikki xil kelishi mumkin:
// bir nechta "groupIds" maydoni (massiv) yoki bitta vergulli satr.
// Ikkalasini ham qabul qilamiz - aks holda formaning ishlashi brauzer
// FormData xulqiga bog'liq bo'lib qolardi.
const groupIdList = z
  .union([z.array(objectId), z.string()])
  .transform((v) =>
    Array.isArray(v)
      ? v
      : String(v)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
  )
  .pipe(z.array(objectId).min(1, "Kamida bitta guruh tanlanishi kerak"));

export const previewSchema = z.object({
  body: z.object({ groupIds: groupIdList }),
});

export const createSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1, "Sarlavha bo'sh bo'lmasligi kerak").max(200),
    body: z.string().trim().max(4000).optional().default(""),
    groupIds: groupIdList,
    // multipart'da bo'sh maydon "" bo'lib keladi - uni null deb qabul qilamiz,
    // aks holda Date("") = Invalid Date bo'lib validatsiya yiqilardi.
    dueDate: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v) => (v ? new Date(v) : null))
      .refine((v) => v === null || !Number.isNaN(v.getTime()), "Noto'g'ri sana"),
  }),
});

export const listSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    groupId: objectId.optional(),
  }),
});

export const idSchema = z.object({
  params: z.object({ id: objectId }),
});

export const recipientListSchema = z.object({
  params: z.object({ id: objectId }),
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    status: z
      .enum(["pending", "delivered", "blocked", "no_bot", "failed"])
      .optional(),
  }),
});

export const myListSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});
