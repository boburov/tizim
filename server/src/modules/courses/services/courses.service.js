import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId } from "../../../utils/serialize.js";
import { branchFilter } from "../../../helpers/branchContext.helper.js";

// KURS KATALOGI - markazlashgan spravochnik.
//
// NEGA MODEL BOR EDI, ROUTE YO'Q: Course modeli va `courses.*` ruxsatlari
// allaqachon yozilgan, migratsiya ham bor (migrateCourses.seed.js), lekin
// CRUD endpoint hech qachon qo'shilmagan. Natijada `Group.courseId`
// maydonini hech qanday yo'l bilan to'ldirib bo'lmasdi - ya'ni "qaysi kurs
// qancha daromad keltirdi" savoli javobsiz qolardi.
//
// KATALOG GLOBAL: yozish faqat owner'da (permissionScope.js:
// courses.manage owner-only). Filiallar o'zicha yangi nom o'ylab topsa,
// "A filial IELTS" va "B filial IELTS" alohida qator bo'lib chiqardi va
// tarmoq hisobotini birlashtirib bo'lmasdi.
// O'QISH esa hammaga - guruh yaratishda kurs tanlanadi.


export const list = async ({
  search,
  includeInactive = false,
  page = 1,
  limit = 100,
}) => {
  const where = {};
  if (!includeInactive) where.isActive = true;
  if (search && search.trim()) {
    const q = { contains: search.trim(), mode: "insensitive" };
    where.OR = [{ title: q }, { code: q }];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.course.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { title: "asc" }],
      skip,
      take: limit,
      include: { leadDirection: { select: { id: true, name: true } } },
    }),
    prisma.course.count({ where }),
  ]);

  // GURUHLAR SONI - katalogda "bu kurs ishlatilyaptimi" ko'rinishi uchun.
  //
  // FILIAL KO'LAMI QO'LLANADI: katalogning o'zi global, lekin SON filialga
  // tegishli. A filial direktori "IELTS - 12 guruh" degan raqamni ko'rsa,
  // uning 9 tasi boshqa filialda bo'lsa - bu yolg'on ma'lumot.
  const ids = items.map((c) => c.id);
  const counts = ids.length
    ? await prisma.group.groupBy({
        by: ["courseId"],
        where: { ...branchFilter(), courseId: { in: ids }, isDeleted: false },
        _count: { _all: true },
      })
    : [];
  const countMap = new Map(counts.map((r) => [String(r.courseId), r._count._all]));

  return {
    items: items.map((c) => ({
      ...withLegacyId(c),
      groupCount: countMap.get(String(c.id)) || 0,
    })),
    total,
    page,
    limit,
  };
};

export const getById = async (id) => {
  const doc = await prisma.course.findUnique({
    where: { id },
    include: { leadDirection: { select: { id: true, name: true } } },
  });
  if (!doc) throw new ApiError(404, "Kurs topilmadi");
  return withLegacyId(doc);
};

const normalizeCode = (raw) => String(raw || "").trim().toLowerCase();

export const create = async (body, currentUser) => {
  const title = String(body.title || "").trim();
  if (!title) throw new ApiError(400, "Kurs nomi kerak");

  const code = normalizeCode(body.code);
  if (!code) throw new ApiError(400, "Kurs kodi kerak");

  // Kod UNIKAL (model darajasida ham), lekin xatoni bu yerda ushlaymiz -
  // aks holda foydalanuvchi tushunarsiz E11000 ko'rardi.
  const clash = await prisma.course.findUnique({ where: { code } });
  if (clash) throw new ApiError(409, `"${code}" kodi allaqachon band`);

  const doc = await prisma.course.create({
    data: {
      title,
      code,
      level: String(body.level || "").trim(),
      defaultDurationMonths: body.defaultDurationMonths ?? null,
      leadDirectionId: body.leadDirection || null,
      createdById: currentUser?.id || currentUser?._id || null,
    },
  });
  return withLegacyId(doc);
};

export const update = async (id, body) => {
  const doc = await getById(id);
  const data = {};

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) throw new ApiError(400, "Kurs nomi kerak");
    data.title = title;
  }

  if (body.code !== undefined) {
    const code = normalizeCode(body.code);
    if (!code) throw new ApiError(400, "Kurs kodi kerak");
    if (code !== doc.code) {
      const clash = await prisma.course.findFirst({
        where: { code, id: { not: doc.id } },
      });
      if (clash) throw new ApiError(409, `"${code}" kodi allaqachon band`);
      data.code = code;
    }
  }

  if (body.level !== undefined) data.level = String(body.level || "").trim();
  if (body.defaultDurationMonths !== undefined) {
    data.defaultDurationMonths = body.defaultDurationMonths ?? null;
  }
  if (body.leadDirection !== undefined) {
    data.leadDirectionId = body.leadDirection || null;
  }
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  const updated = await prisma.course.update({ where: { id: doc.id }, data });
  return withLegacyId(updated);
};

/**
 * NOFAOL qilish (o'chirish EMAS).
 *
 * NEGA HARD DELETE YO'Q: kurs guruhlarga bog'langan va u yo'qolsa
 * hisobotdagi tarixiy qatorlar "kursi belgilanmagan" ga tushib qolardi -
 * ya'ni o'tgan yillar statistikasi jimgina o'zgarardi.
 *
 * Faol guruhlari bor kursni nofaol qilish MUMKIN: yangi guruhda u
 * tanlanmaydi, mavjudlari esa tegilmaydi. Foydalanuvchiga nechta guruh
 * ta'sirlanishi aytiladi.
 */
export const softRemove = async (id) => {
  const doc = await getById(id);
  const activeGroups = await prisma.group.count({
    where: { courseId: doc.id, isActive: true, isDeleted: false },
  });

  const course = await prisma.course.update({
    where: { id: doc.id },
    data: { isActive: false },
  });
  return { course: withLegacyId(course), activeGroups };
};
