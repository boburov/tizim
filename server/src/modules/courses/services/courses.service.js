import Course from "../../../models/course.model.js";
import Group from "../../../models/group.model.js";
import ApiError from "../../../utils/ApiError.js";
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

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const list = async ({
  search,
  includeInactive = false,
  page = 1,
  limit = 100,
}) => {
  const filter = {};
  if (!includeInactive) filter.isActive = true;
  if (search && search.trim()) {
    const rx = { $regex: escapeRegex(search.trim()), $options: "i" };
    filter.$or = [{ title: rx }, { code: rx }];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Course.find(filter)
      .sort({ isActive: -1, title: 1 })
      .skip(skip)
      .limit(limit)
      .populate("leadDirection", { name: 1 })
      .lean(),
    Course.countDocuments(filter),
  ]);

  // GURUHLAR SONI - katalogda "bu kurs ishlatilyaptimi" ko'rinishi uchun.
  //
  // FILIAL KO'LAMI QO'LLANADI: katalogning o'zi global, lekin SON filialga
  // tegishli. A filial direktori "IELTS - 12 guruh" degan raqamni ko'rsa,
  // uning 9 tasi boshqa filialda bo'lsa - bu yolg'on ma'lumot.
  const ids = items.map((c) => c._id);
  const counts = ids.length
    ? await Group.aggregate([
        {
          $match: {
            ...branchFilter(),
            courseId: { $in: ids },
            isDeleted: { $ne: true },
          },
        },
        { $group: { _id: "$courseId", count: { $sum: 1 } } },
      ])
    : [];
  const countMap = new Map(counts.map((r) => [String(r._id), r.count]));

  return {
    items: items.map((c) => ({ ...c, groupCount: countMap.get(String(c._id)) || 0 })),
    total,
    page,
    limit,
  };
};

export const getById = async (id) => {
  const doc = await Course.findById(id).populate("leadDirection", { name: 1 });
  if (!doc) throw new ApiError(404, "Kurs topilmadi");
  return doc;
};

const normalizeCode = (raw) => String(raw || "").trim().toLowerCase();

export const create = async (body, currentUser) => {
  const title = String(body.title || "").trim();
  if (!title) throw new ApiError(400, "Kurs nomi kerak");

  const code = normalizeCode(body.code);
  if (!code) throw new ApiError(400, "Kurs kodi kerak");

  // Kod UNIKAL (model darajasida ham), lekin xatoni bu yerda ushlaymiz -
  // aks holda foydalanuvchi tushunarsiz E11000 ko'rardi.
  const clash = await Course.findOne({ code }).lean();
  if (clash) throw new ApiError(409, `"${code}" kodi allaqachon band`);

  return Course.create({
    title,
    code,
    level: String(body.level || "").trim(),
    defaultDurationMonths: body.defaultDurationMonths ?? null,
    leadDirection: body.leadDirection || null,
    createdBy: currentUser?._id || null,
  });
};

export const update = async (id, body) => {
  const doc = await getById(id);

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) throw new ApiError(400, "Kurs nomi kerak");
    doc.title = title;
  }

  if (body.code !== undefined) {
    const code = normalizeCode(body.code);
    if (!code) throw new ApiError(400, "Kurs kodi kerak");
    if (code !== doc.code) {
      const clash = await Course.findOne({ code, _id: { $ne: doc._id } }).lean();
      if (clash) throw new ApiError(409, `"${code}" kodi allaqachon band`);
      doc.code = code;
    }
  }

  if (body.level !== undefined) doc.level = String(body.level || "").trim();
  if (body.defaultDurationMonths !== undefined) {
    doc.defaultDurationMonths = body.defaultDurationMonths ?? null;
  }
  if (body.leadDirection !== undefined) doc.leadDirection = body.leadDirection || null;
  if (body.isActive !== undefined) doc.isActive = Boolean(body.isActive);

  await doc.save();
  return doc;
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
  const activeGroups = await Group.countDocuments({
    courseId: doc._id,
    isActive: true,
    isDeleted: { $ne: true },
  });

  doc.isActive = false;
  await doc.save();
  return { course: doc, activeGroups };
};
