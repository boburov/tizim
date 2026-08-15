import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import { normalizePhone } from "../../../utils/phone.js";
import {
  branchFilter,
  resolveBranchForWrite,
  getAllowedBranchIds,
  canSeeAllBranches,
  userBranchCondition,
} from "../../../helpers/branchContext.helper.js";
import {
  loadRoleCatalog,
  staffRoleFilter,
} from "../../../helpers/roles.helper.js";
import { LEAD_PIPELINE } from "../../../constants/leadStatus.js";
import * as authService from "../../auth/services/auth.service.js";
import * as groupsService from "../../groups/services/groups.service.js";
import * as leadRouting from "./leadRouting.service.js";

// Mongo `.populate(POPULATE)` o'rniga Prisma `include`.
//
// DIQQAT — KLIENT SHARTNOMASI: Mongo populate maydonning O'ZINI obyektga
// aylantirardi (`lead.source = {_id, name}`). Prisma esa `sourceId` ni
// satr qoldirib, `source` deb ALOHIDA maydon qo'shadi. Frontend eski
// shaklni kutadi, shuning uchun javob `shapeLead()` orqali o'giriladi.
const INCLUDE = {
  source: { select: { id: true, name: true } },
  direction: { select: { id: true, name: true } },
  rejectionReason: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true, role: true } },
};

// Prisma yozuvini Mongo-populate shakliga qaytaradi.
const shapeLead = (l) => {
  if (!l) return l;
  const out = withLegacyId(l);
  // Populate qilingan ichki obyektlarda ham `_id` bo'lishi kerak.
  out.source = l.source ? withLegacyId(l.source) : null;
  out.direction = l.direction ? withLegacyId(l.direction) : null;
  out.rejectionReason = l.rejectionReason ? withLegacyId(l.rejectionReason) : null;
  out.assignedTo = l.assignedTo ? withLegacyId(l.assignedTo) : null;
  return out;
};

/**
 * LIDGA BIRIKTIRISH MUMKIN BO'LGAN XODIMLAR.
 *
 * ─── NEGA ALOHIDA, /api/users O'RNIGA ───
 * Lid formasidagi "Mas'ul" tanlagichi va ro'yxatdagi "Barcha mas'ullar"
 * filtri ilgari umumiy foydalanuvchilar ro'yxatidan (`/api/users?staff=1`)
 * oziqlanardi. U esa `users.read` talab qiladi va resepshin rolida bu
 * ruxsat YO'Q - natijada lidlar sahifasi ochilishi bilan 403 chiqardi,
 * garchi odamning lidlarga to'liq huquqi bo'lsa ham.
 *
 * Ruxsatni kengaytirish (resepshinga `users.read` berish) noto'g'ri
 * yechim bo'lardi: u butun foydalanuvchilar bazasini - o'quvchilar,
 * telefonlar, loginlar - ochib yuborardi. Bu yerda esa kerak bo'lgani
 * FAQAT ism va rol yorlig'i.
 *
 * Shu sababli javob ATAYLAB juda tor: `_id`, ism, familiya va rol.
 * Telefon, login, filial - hech biri qaytmaydi.
 *
 * ─── KO'LAM ───
 * Filial sharti umumiy ro'yxat bilan AYNAN bir xil (userBranchCondition):
 * boshqa filial xodimi bu ro'yxatda ko'rinmaydi va unga lid biriktirib
 * bo'lmaydi.
 */
export const assignableStaff = async () => {
  const catalog = await loadRoleCatalog();

  const filter = {
    isDeleted: false,
    isActive: true,
    // XODIM = o'quvchi TIPIDAGI rollardan boshqa hamma. Rol NOMIGA emas
    // TIPIGA qaraydi, ya'ni ertaga yaratilgan custom rol ham avtomatik
    // to'g'ri tomonga tushadi.
    role: staffRoleFilter(catalog),
  };

  const branchCond = userBranchCondition();
  // AND ichiga: userBranchCondition() OR beradi, to'g'ridan-to'g'ri
  // qo'shilsa boshqa OR bilan to'qnashardi.
  if (branchCond) filter.AND = [branchCond];

  const rows = await prisma.user.findMany({
    where: filter,
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  return rows.map((u) => ({
    ...withLegacyId(u),
    // Rol yorlig'i serverdan keladi: custom rollar ("Buxgalter") client
    // tomonidagi qattiq ro'yxatda yo'q va u yerda "noma'lum rol" bo'lib
    // chiqardi.
    roleLabel: catalog.get(u.role)?.label || u.role,
  }));
};

export const list = async ({
  status,
  source,
  direction,
  assignedTo,
  engagement,
  search,
  from,
  to,
  page = 1,
  limit = 20,
}) => {
  // FILIAL ko'lami
  const filter = { ...branchFilter() };
  if (status) filter.status = status;
  if (source) filter.sourceId = source;
  if (direction) filter.directionId = direction;
  // "none" - mas'ul biriktirilmagan lidlar. Bu filtr aynan eng xavfli
  // to'plamni ko'rsatadi: egasiz lid bilan hech kim ishlamaydi.
  if (assignedTo === "none") filter.assignedToId = null;
  else if (assignedTo) filter.assignedToId = assignedTo;

  // ALOQA FILTRI.
  //
  // `no_contact` - lid kelgan, lekin hech kim qo'lga OLMAGAN: status hali
  //   "new" va statusHistory'da faqat yaratilish yozuvi bor.
  //   `$size: 1` aynan shuni beradi - "bironta ham status o'zgarmagan".
  //
  // `stale` - aloqa qilingan, lekin TASHLAB QO'YILGAN: ochiq bosqichda
  //   turibdi, eslatma qo'yilmagan va oxirgi harakatdan beri STALE_DAYS
  //   kun o'tgan. Bu lidlar jimgina o'ladi - hech kim ularni eslamaydi.
  //
  // Ikkalasi ham "yo'qotilgan sotuv"ning eng arzon manbai: mijoz allaqachon
  // O'ZI qiziqib murojaat qilgan, faqat javob kutgan.
  if (engagement === "no_contact") {
    filter.status = "new";
    // `statusHistory` Json massiv - Prisma uzunlik bo'yicha filtrlay
    // olmaydi (Mongo'da `$size: 1` edi). Mos ID'lar xom SQL bilan
    // olinadi; filial ko'lami ASOSIY so'rovda qoladi, ya'ni xavfsizlik
    // sharti SQL'da TAKRORLANMAYDI.
    const noContactRows = await prisma.$queryRaw`
      SELECT id FROM leads WHERE jsonb_array_length("statusHistory") = 1
    `;
    filter.id = { in: noContactRows.map((r) => r.id) };
  } else if (engagement === "stale") {
    const STALE_DAYS = 7;
    filter.status = { notIn: ["enrolled", "rejected"] };
    filter.followUpAt = null;
    filter.updatedAt = {
      lt: new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000),
    };
  }
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.gte = new Date(from);
    if (to) filter.createdAt.lte = new Date(to);
  }
  if (search && search.trim()) {
    // Prisma `contains` + `insensitive`: escapeRegex kerak emas, matn
    // SQL parametri sifatida uzatiladi.
    const rx = { contains: search.trim(), mode: "insensitive" };
    // QO'SHIMCHA RAQAM ham qidiriladi: xodim ota-onaning raqami bilan
    // qo'ng'iroq qilib, "bu kim edi?" deb qidirsa lid TOPILISHI kerak.
    // Aks holda ikkinchi raqamni saqlashning yarim ma'nosi yo'qolardi.
    filter.OR = [
      { firstName: rx },
      { lastName: rx },
      { phone: rx },
      { parentPhone: rx },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where: filter,
      // Ikkilamchi tartib (id): createdAt teng bo'lganda tartib beqaror
      // bo'lib, sahifalashda qator takrorlanishi/tushib qolishi mumkin edi.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: limit,
      include: INCLUDE,
    }),
    prisma.lead.count({ where: filter }),
  ]);
  return { items: items.map(shapeLead), total, page, limit };
};

export const getById = async (id) => {
  const lead = await prisma.lead.findUnique({ where: { id }, include: INCLUDE });
  if (!lead) throw new ApiError(404, "Lid topilmadi");
  return shapeLead(lead);
};

const normalizeOptionalPhone = (raw) => {
  if (!raw) return null;
  const p = normalizePhone(raw);
  if (!p) throw new ApiError(400, "Telefon raqam noto'g'ri");
  return p;
};

// IKKI RAQAM BIR XIL BO'LMASLIGI KERAK.
//
// Tekshiruv NORMALIZATSIYADAN KEYIN qilinadi: "+998 90 123 45 67" va
// "998901234567" xom holda har xil satr, lekin bir xil raqam. Xom
// solishtiruv bu xatoni o'tkazib yuborardi.
//
// Nega muhim: qo'shimcha raqamning butun ma'nosi - birinchisi javob
// bermaganda BOSHQA odamga qo'ng'iroq qilish. Ikkalasi bir xil bo'lsa
// maydon to'ldirilgan ko'rinadi-yu, hech qanday foyda bermaydi.
const assertDistinctPhones = (phone, parentPhone) => {
  if (phone && parentPhone && phone === parentPhone) {
    throw new ApiError(
      400,
      "Qo'shimcha telefon asosiy raqam bilan bir xil bo'lmasligi kerak",
    );
  }
};

export const create = async (body, currentUser) => {
  const phone = normalizeOptionalPhone(body.phone);
  if (!phone) throw new ApiError(400, "Telefon kerak");

  const parentPhone = normalizeOptionalPhone(body.parentPhone);
  assertDistinctPhones(phone, parentPhone);

  // TELEFON TAKRORLANISHI RUXSAT ETILADI (ataylab, uniq tekshiruv YO'Q).
  //
  // Sabab: bitta raqam - bitta lid EMAS. Bir odam kuzda ingliz tili uchun
  // qo'ng'iroq qiladi, bahorda matematika uchun qayta murojaat qiladi; ona
  // bitta raqamdan ikki farzandini yozdiradi. Eski 409 shu holatlarda
  // resepshinni BLOKLARDI va u lidni umuman kiritmasdan qo'yardi - ya'ni
  // qoida ma'lumotni tozalash o'rniga yo'qotardi.
  //
  // Raqamning O'ZI esa majburiy bo'lib qoladi (yuqoridagi tekshiruv):
  // bog'lanib bo'lmaydigan lid - lid emas.
  const status = body.status || "new";

  // FILIAL: lid qaysi filialga kelgan.
  //
  // IKKI YO'L:
  //
  //  (a) OPERATOR kiritdi - "Barcha filiallar" rejimida client formada
  //      aniq filialni so'raydi va uni `branchId` bilan yuboradi.
  //      Bu yo'l O'ZGARMAYDI: odam tanlagan filial har doim ustun.
  //
  //  (b) AVTOMATIK (bot, webhook, integratsiya) - kontekst ham,
  //      foydalanuvchi ham yo'q. Bunday chaqiruvda ilgari xato
  //      qaytardi ("filial tanlanmagan") va lid UMUMAN yaratilmasdi.
  //      Endi MANBA bo'yicha yo'naltiriladi
  //      (leadRouting.service.js: telegram boti -> o'z filiali).
  //
  // Zaxira zanjiri routing ichida: manba qoidasi -> zaxira qoida ->
  // asosiy filial. Ya'ni lid HECH QACHON yo'qolmaydi.
  let branchId;
  let routing = null;
  if (!currentUser && !body.branchId) {
    routing = await leadRouting.route({ source: body.sourceId || body.source });
    branchId = routing.branchId;
  } else {
    branchId = await resolveBranchForWrite(currentUser, body.branchId);
  }

  const actorId = currentUser?.id || currentUser?._id || null;

  const lead = await prisma.lead.create({
    data: {
    branchId,
    firstName: String(body.firstName).trim(),
    lastName: body.lastName ? String(body.lastName).trim() : "",
    age: body.age ?? null,
    phone,
    parentPhone,
    sourceId: body.sourceId || null,
    directionId: body.directionId || null,
    status,
    rejectionReasonId: body.rejectionReasonId || null,
    rejectionNote: (body.rejectionNote || "").trim(),
    // Darhol rad etilgan holatda yaratilsa - yopilish sanasi ham o'sha payt.
    closedAt: status === "rejected" ? new Date() : null,
    trialDate: body.trialDate ? new Date(body.trialDate) : null,
    notes: body.notes || "",
    // Yo'naltirish qoidasi xodim ko'rsatgan bo'lsa - lid darhol unga
    // biriktiriladi. Aks holda filialga tushadi va admin o'zi oladi.
    assignedToId: body.assignedTo || routing?.assigneeId || null,
    createdById: actorId,
    // Json massiv: sana ISO satr sifatida (JSON'da Date turi yo'q).
    statusHistory: [
      { status, at: new Date().toISOString(), by: actorId },
    ],
    },
  });
  return getById(lead.id);
};

export const update = async (id, body, currentUser) => {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) throw new ApiError(404, "Lid topilmadi");

  // Mongoose'da hujjatga to'g'ridan-to'g'ri yozilardi. Prisma'da `data`
  // obyektini yig'amiz - berilmagan maydonga umuman tegilmaydi.
  const actorId = currentUser?.id || currentUser?._id || null;
  const lead_ = {};

  if (body.firstName !== undefined) lead_.firstName = String(body.firstName).trim();
  if (body.lastName !== undefined) lead_.lastName = String(body.lastName).trim();
  if (body.age !== undefined) lead_.age = body.age ?? null;
  if (body.phone !== undefined) {
    // Takroriy raqam BLOKLANMAYDI (qarang: create'dagi izoh), lekin raqamni
    // BO'SHATIB ham bo'lmaydi. Tekshiruvsiz `lead.phone = null` bo'lib,
    // xato mongoose ValidationError'ga aylanardi - foydalanuvchi tushunarsiz
    // 500 ko'rardi.
    const phone = normalizeOptionalPhone(body.phone);
    if (!phone) throw new ApiError(400, "Telefon kerak");
    lead_.phone = phone;
  }
  if (body.parentPhone !== undefined) {
    lead_.parentPhone = body.parentPhone
      ? normalizeOptionalPhone(body.parentPhone)
      : null;
  }
  // Tekshiruv IKKALA maydon qo'llanganidan KEYIN: so'rovda faqat bittasi
  // kelishi mumkin va u saqlangan ikkinchisi bilan to'qnashishi mumkin.
  //
  // FAQAT telefon TEGILGANDA tekshiriladi. Sabab: bu qoida joriy
  // qilinishidan OLDIN yaratilgan lidlarda ikkala raqam bir xil bo'lishi
  // mumkin. Har doim tekshirsak, o'sha eski lidning ISMINI tahrirlash ham
  // "telefon bir xil" xatosi bilan bloklanardi - foydalanuvchi esa telefonga
  // umuman tegmagan bo'lardi.
  if (body.phone !== undefined || body.parentPhone !== undefined) {
    assertDistinctPhones(
      lead_.phone ?? lead.phone,
      lead_.parentPhone !== undefined ? lead_.parentPhone : lead.parentPhone,
    );
  }
  if (body.sourceId !== undefined) lead_.sourceId = body.sourceId || null;
  if (body.directionId !== undefined) lead_.directionId = body.directionId || null;
  if (body.rejectionReasonId !== undefined) {
    lead_.rejectionReasonId = body.rejectionReasonId || null;
  }
  if (body.trialDate !== undefined) {
    lead_.trialDate = body.trialDate ? new Date(body.trialDate) : null;
  }
  if (body.notes !== undefined) lead_.notes = body.notes || "";
  if (body.assignedTo !== undefined) lead_.assignedToId = body.assignedTo || null;
  if (body.rejectionNote !== undefined) {
    lead_.rejectionNote = (body.rejectionNote || "").trim();
  }

  if (body.status !== undefined && body.status !== lead.status) {
    const wasRejected = lead.status === "rejected";
    lead_.status = body.status;
    // Json massivga qo'shish: `.push()` o'rniga yangi massiv.
    lead_.statusHistory = [
      ...(Array.isArray(lead.statusHistory) ? lead.statusHistory : []),
      { status: body.status, at: new Date().toISOString(), by: actorId },
    ];

    if (body.status === "rejected") {
      lead_.closedAt = new Date();
    } else if (wasRejected) {
      // QAYTA OCHILDI: yopilish izlarini tozalaymiz.
      //
      // Aks holda "yopilgan lidlar" hisobotida u hali ham yopiq sanaladi va
      // yo'qotish sababi statistikasi shishib ketardi - lid ikki marta
      // (bir marta yopilgan, bir marta qayta yopilgan) sanalardi.
      lead_.closedAt = null;
      lead_.rejectionNote = "";
      lead_.rejectionReasonId = null;
    }
  }

  await prisma.lead.update({ where: { id }, data: lead_ });
  return getById(id);
};

// Qayta bog'lanish eslatmasini o'rnatish/o'zgartirish/o'chirish
export const setReminder = async (id, { followUpAt, followUpNote }) => {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) throw new ApiError(404, "Lid topilmadi");

  await prisma.lead.update({
    where: { id },
    data: {
      followUpAt: followUpAt ? new Date(followUpAt) : null,
      followUpNote: followUpNote || "",
      // Yangi/yangilangan eslatma qayta yuborilishi uchun bayroq tozalanadi.
      followUpNotifiedAt: null,
    },
  });
  return getById(id);
};

// KO'P LIDGA BIR MARTADA eslatma.
//
// Amaliy holat: xodim ertalab ro'yxatdan 15 ta "javob bermadi" lidini
// belgilab, hammasiga "ertaga 10:00 da qayta qo'ng'iroq" qo'yadi. Buni
// bittalab qilish 15 marta oyna ochish demakdir - shuning uchun bitta amal.
//
// Har lid ALOHIDA ishlanadi: bittasi topilmasa (boshqa filial, o'chirilgan)
// qolganlari baribir o'rnatiladi va natijada nima yiqilgani qaytariladi.
export const setReminderBulk = async ({
  ids = [],
  followUpAt,
  followUpNote,
  assignedTo,
}) => {
  if (!ids.length) throw new ApiError(400, "Lid tanlanmagan");
  if (new Set(ids.map(String)).size !== ids.length) {
    throw new ApiError(400, "Ro'yxatda takrorlangan lid bor");
  }

  const updated = [];
  const failed = [];

  for (const id of ids) {
    try {
      // FILIAL: boshqa filial lidiga eslatma qo'yib bo'lmaydi.
      const lead = await prisma.lead.findFirst({
        where: { id, ...branchFilter() },
      });
      if (!lead) throw new ApiError(404, "Lid topilmadi");

      const patch = {
        followUpAt: followUpAt ? new Date(followUpAt) : null,
        followUpNote: followUpNote || "",
        // Yangi/yangilangan eslatma qayta yuborilishi uchun bayroq tozalanadi.
        followUpNotifiedAt: null,
      };
      // Mas'ul BERILGANDA almashtiriladi. Berilmasa lidning o'z mas'uli
      // saqlanadi - ommaviy eslatma tayinlashni bekor qilmasligi kerak.
      if (assignedTo !== undefined) patch.assignedToId = assignedTo || null;

      await prisma.lead.update({ where: { id: lead.id }, data: patch });
      updated.push(String(lead.id));
    } catch (err) {
      failed.push({
        leadId: String(id),
        message: err?.message || "Eslatma o'rnatilmadi",
      });
    }
  }

  return { updated, failed };
};

// Vaqti kelgan, hali bildirishnoma yuborilmagan eslatmalar (job uchun)
export const dueReminders = async (now = new Date()) =>
  prisma.lead.findMany({
    where: { followUpAt: { not: null, lte: now }, followUpNotifiedAt: null },
  });

// Kunlik yig'ma uchun: berilgan oraliqda vaqti kelgan/o'tib ketgan, hali
// yopilmagan lidlar. Yopilgan (rad etilgan/aylantirilgan) lid uchun
// "bog'laning" deyish - operatorni bekorga chalg'itish.
export const remindersUpTo = async (until = new Date()) => {
  const rows = await prisma.lead.findMany({
    where: {
      followUpAt: { not: null, lte: until },
      status: { notIn: ["enrolled", "rejected"] },
      studentId: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      followUpAt: true,
      followUpNote: true,
      assignedToId: true,
    },
    orderBy: { followUpAt: "asc" },
  });
  // Chaqiruvchi eski `assignedTo` nomini kutadi.
  return rows.map((r) => ({ ...withLegacyId(r), assignedTo: r.assignedToId }));
};

export const markReminderNotified = async (id, at = new Date()) => {
  await prisma.lead.update({
    where: { id: String(id) },
    data: { followUpNotifiedAt: at },
  });
};

export const remove = async (id) => {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) throw new ApiError(404, "Lid topilmadi");
  await prisma.lead.delete({ where: { id } });
  return { _id: id, id };
};

// Lidni aylantirishda ochiladigan o'quvchi HAM shu so'rov ko'lamida
// yaratiladi. Bu ko'lam berilmasa registerUser ichidagi
// assertCanAssignBranch() hech qanday ruxsat etilgan filial ko'rmaydi va
// aylantirish HAR DOIM 403 ("Bu filialga foydalanuvchi biriktira olmaysiz")
// bilan tugardi.
const registerScope = (currentUser) => ({
  allowedBranchIds: getAllowedBranchIds(),
  canSeeAllBranches: canSeeAllBranches(),
  userId: currentUser?.id || currentUser?._id || null,
});

// Guruh mavjudmi va so'rov ko'lamidami. Aylantirishdan OLDIN tekshiriladi:
// o'quvchi yaratilib bo'lgach xato chiqsa uni orqaga qaytarib bo'lmaydi.
const ensureGroupInScope = async (groupId, leadBranchId) => {
  if (!groupId) return null;
  const group = await prisma.group.findFirst({
    where: { id: String(groupId), isDeleted: false, ...branchFilter() },
  });
  if (!group) throw new ApiError(404, "Guruh topilmadi");
  if (leadBranchId && String(group.branchId) !== String(leadBranchId)) {
    throw new ApiError(400, "Guruh lid filialiga tegishli emas");
  }
  return group;
};

// Bitta lidni o'quvchiga aylantirish + (ixtiyoriy) guruhga qo'shish.
//
// Guruhga qo'shish XATOSI aylantirishni bekor QILMAYDI: o'quvchi allaqachon
// yaratilgan va tranzaksiya yo'q. Xato `groupError` sifatida qaytariladi -
// klient ogohlantirish ko'rsatadi, operator guruhga qo'lda qo'shadi.
const convertOne = async (lead, body, currentUser, groupId) => {
  // FILIAL: yaratilayotgan o'quvchi LID FILIALIGA biriktiriladi.
  //
  // Bu bo'lmasa o'quvchi filialsiz qolardi - va userBranchCondition()
  // qoidasi bo'yicha filialsiz foydalanuvchi FAQAT view_all egalariga
  // ko'rinadi, ya'ni lidni aylantirgan direktor o'zi yaratgan o'quvchini
  // ro'yxatda ko'rmay qolardi.
  const student = await authService.registerUser(
    {
      ...body,
      role: "student",
      homeBranchId: lead.branchId,
    },
    registerScope(currentUser),
  );

  const actorId = currentUser?.id || currentUser?._id || null;
  const studentId = student.id || student._id;
  const patch = { studentId };

  // ATRIBUTSIYA - KPI mukofoti kimga tegishli.
  //
  // Tartib: mas'ul xodim -> lidni yaratgan -> aylantirgan odam. Bir marta
  // yoziladi va keyin O'ZGARMAYDI: mas'ulni ertaga almashtirish o'tgan
  // oyning maoshini qayta yozib yuborishi mumkin emas.
  patch.creditedToId =
    lead.creditedToId || lead.assignedToId || lead.createdById || actorId || null;
  patch.convertedById = lead.convertedById || actorId || null;
  patch.convertedAt = lead.convertedAt || new Date();

  if (lead.status !== "enrolled") {
    patch.status = "enrolled";
    patch.statusHistory = [
      ...(Array.isArray(lead.statusHistory) ? lead.statusHistory : []),
      { status: "enrolled", at: new Date().toISOString(), by: actorId },
    ];
  }

  // O'QUVCHI -> LID havolasi. registerUser hujjatni QAT'IY oq ro'yxat
  // bo'yicha quradi, shuning uchun `leadId` ni body orqali uzatib bo'lmaydi -
  // u jimgina tushib qolardi. Alohida yozamiz (auth modulига tegmasdan).
  // Lid yangilanishi va o'quvchi havolasi BITTA TRANZAKSIYADA.
  //
  // Mongo'da bu ikki alohida yozuv edi: oradagi xato "lid aylantirilgan,
  // lekin o'quvchida leadId yo'q" holatini qoldirardi va konversiya
  // atributsiyasi (KPI mukofoti) jimgina yo'qolardi.
  await prisma.$transaction([
    prisma.lead.update({ where: { id: lead.id }, data: patch }),
    prisma.user.update({ where: { id: studentId }, data: { leadId: lead.id } }),
  ]);

  let groupError = null;
  if (groupId) {
    try {
      // `joinedAt` berilmaydi: addStudent guruh boshlangan sana bilan
      // o'quvchi ro'yxatga olingan sanadan kechrog'ini oladi - yangi
      // o'quvchida bu har doim to'g'ri va tekshiruvlardan o'tadi.
      await groupsService.addStudent(groupId, student._id);
    } catch (err) {
      groupError = err?.message || "Guruhga qo'shib bo'lmadi";
    }
  }

  return { student, groupError };
};

// Lidni o'quvchiga aylantirish: o'quvchi yaratiladi + lid bog'lanadi
export const convert = async (id, body, currentUser) => {
  // FILIAL: boshqa filial lidini aylantirib bo'lmaydi.
  const lead = await prisma.lead.findFirst({ where: { id, ...branchFilter() } });
  if (!lead) throw new ApiError(404, "Lid topilmadi");
  if (lead.studentId) {
    throw new ApiError(409, "Bu lid allaqachon o'quvchiga aylantirilgan");
  }

  await ensureGroupInScope(body.groupId, lead.branchId);

  const { student, groupError } = await convertOne(
    lead,
    body,
    currentUser,
    body.groupId,
  );
  return { lead: await getById(lead._id), student, groupError };
};

// KO'P LIDNI BIR MARTADA aylantirish (yangi sotuvlar oqimi).
//
// Har lid ALOHIDA ishlanadi: bittasi yiqilsa (login band, telefon
// takrorlangan, ...) qolganlari baribir o'tadi. Natijada har lid uchun
// javob qaytadi - operator kimga login berilganini ko'radi.
export const convertBulk = async ({ leads = [], groupId }, currentUser) => {
  if (!leads.length) throw new ApiError(400, "Lid tanlanmagan");

  const ids = leads.map((l) => l.id);
  if (new Set(ids.map(String)).size !== ids.length) {
    throw new ApiError(400, "Ro'yxatda takrorlangan lid bor");
  }
  const usernames = leads.map((l) => String(l.username).toLowerCase().trim());
  if (new Set(usernames).size !== usernames.length) {
    throw new ApiError(400, "Ro'yxatda bir xil login ikki marta ishlatilgan");
  }

  const converted = [];
  const failed = [];

  for (const item of leads) {
    const { id, ...body } = item;
    try {
      const lead = await prisma.lead.findFirst({
        where: { id, ...branchFilter() },
      });
      if (!lead) throw new ApiError(404, "Lid topilmadi");
      if (lead.studentId) {
        throw new ApiError(409, "Bu lid allaqachon o'quvchiga aylantirilgan");
      }

      // Guruh HAR LID uchun tekshiriladi: tanlovga turli filial lidlari
      // tushishi mumkin, va boshqa filial o'quvchisini bu guruhga qo'shib
      // bo'lmaydi.
      if (groupId) await ensureGroupInScope(groupId, lead.branchId);

      const { student, groupError } = await convertOne(
        lead,
        body,
        currentUser,
        groupId,
      );
      converted.push({
        leadId: String(lead.id),
        studentId: String(student.id || student._id),
        firstName: student.firstName,
        lastName: student.lastName,
        username: student.username,
        // Parol operatorga qaytariladi - u o'quvchiga aytishi kerak.
        password: body.password,
        addedToGroup: Boolean(groupId) && !groupError,
        groupError,
      });
    } catch (err) {
      failed.push({
        leadId: String(id),
        name: `${item.firstName || ""} ${item.lastName || ""}`.trim(),
        message: err?.message || "Aylantirib bo'lmadi",
      });
    }
  }

  return { converted, failed, groupId: groupId || null };
};

// Statistika: voronka, manba/yo'nalish samaradorligi, drop-off
export const stats = async ({ from, to } = {}) => {
  // FILIAL: voronka/manba statistikasi butun tashkilotni ko'rsatardi.
  const match = { ...branchFilter() };
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.gte = new Date(from);
    if (to) match.createdAt.lte = new Date(to);
  }

  const rows = await prisma.lead.findMany({
    where: match,
    select: {
      status: true,
      statusHistory: true,
      sourceId: true,
      directionId: true,
      // Yo'qotish tahlili uchun: sabab (tanlangan) + izoh (erkin matn).
      rejectionReasonId: true,
      rejectionNote: true,
      // "Aloqa qilinganmi?" savoliga javob beradigan maydonlar.
      followUpAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Pastdagi hisob mantig'i Mongo maydon nomlarini kutadi
  // (source/direction/rejectionReason). Formulalarga TEGMASLIK uchun
  // shu yerda faqat nomlarni moslashtiramiz - biznes qoidasi o'zgarmaydi.
  const leads = rows.map((l) => ({
    ...l,
    source: l.sourceId,
    direction: l.directionId,
    rejectionReason: l.rejectionReasonId,
    statusHistory: Array.isArray(l.statusHistory) ? l.statusHistory : [],
  }));

  // Faqat aktiv (o'chirilmagan) sozlamalar. O'chirilgan yoki yo'q bo'lib
  // ketgan manba/yo'nalishlar statistikada alohida ko'rinmasligi kerak -
  // ular "Noma'lum" guruhiga qo'shiladi.
  const options = await prisma.leadOption.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  const nameOf = new Map(options.map((o) => [String(o.id), o.name]));

  const total = leads.length;
  const pipeIndex = (s) => LEAD_PIPELINE.indexOf(s);

  // Har lid uchun voronkada erishilgan eng uzoq bosqich indeksi
  const furthestOf = (lead) => {
    let max = pipeIndex(lead.status);
    for (const h of lead.statusHistory || []) {
      const i = pipeIndex(h.status);
      if (i > max) max = i;
    }
    return max; // -1 agar pipeline'da bo'lmasa (mas. faqat rejected)
  };

  const byStatus = {};
  const funnelCounts = new Array(LEAD_PIPELINE.length).fill(0);
  const dropOff = new Array(LEAD_PIPELINE.length).fill(0);
  const srcAgg = new Map(); // id -> {total, enrolled}
  const dirAgg = new Map();

  // RAD ETISH SABABLARI: "nega mijozlar kelmayapti?" savoliga javob.
  // Voronka QAYERDA yo'qotayotganini ko'rsatadi, bu esa NEGA ekanini.
  const rejAgg = new Map(); // id -> { count, withNote }
  let rejectedTotal = 0;
  // Sababi umuman yozilmagan yopilgan lidlar - ma'lumot sifati ko'rsatkichi.
  let rejectedWithoutReason = 0;

  // ALOQA HOLATI.
  //
  // "Aloqa qilinmagan" ta'rifi: statusHistory'da FAQAT yaratilish yozuvi bor
  // va status hali "new". Ya'ni lid kelgan-u, hech kim uni qo'lga olmagan.
  //
  // Nega statusHistory bo'yicha, updatedAt bo'yicha emas: izoh yozilsa yoki
  // telefon tuzatilsa updatedAt yangilanadi, lekin bu ALOQA qilinganini
  // bildirmaydi. Status siljishi esa haqiqiy harakat belgisi.
  const engagement = { noContact: 0, contacted: 0, closed: 0 };
  let noContactOldestDays = 0;
  const nowMs = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  for (const lead of leads) {
    byStatus[lead.status] = (byStatus[lead.status] || 0) + 1;

    // ── Aloqa holati ──
    const isClosed = lead.status === "rejected" || lead.status === "enrolled";
    const touched = (lead.statusHistory || []).length > 1;
    if (isClosed) {
      engagement.closed += 1;
    } else if (!touched && lead.status === "new") {
      engagement.noContact += 1;
      const days = Math.floor((nowMs - new Date(lead.createdAt).getTime()) / DAY_MS);
      if (days > noContactOldestDays) noContactOldestDays = days;
    } else {
      engagement.contacted += 1;
    }

    // ── Rad etish sababi ──
    if (lead.status === "rejected") {
      rejectedTotal += 1;
      const rawRej = lead.rejectionReason ? String(lead.rejectionReason) : null;
      const rKey = rawRej && nameOf.has(rawRej) ? rawRej : "none";
      if (rKey === "none") rejectedWithoutReason += 1;
      if (!rejAgg.has(rKey)) rejAgg.set(rKey, { count: 0, withNote: 0 });
      const row = rejAgg.get(rKey);
      row.count += 1;
      if ((lead.rejectionNote || "").trim()) row.withNote += 1;
    }

    const furthest = furthestOf(lead);
    for (let i = 0; i <= furthest; i++) funnelCounts[i] += 1;

    if (lead.status === "rejected" && furthest >= 0) {
      dropOff[furthest] += 1;
    }

    const isEnrolled = lead.status === "enrolled";
    // Aktiv sozlamaga bog'lanmagan (o'chirilgan / yo'q) id'lar "none" -> Noma'lum
    const rawSrc = lead.source ? String(lead.source) : null;
    const rawDir = lead.direction ? String(lead.direction) : null;
    const sKey = rawSrc && nameOf.has(rawSrc) ? rawSrc : "none";
    const dKey = rawDir && nameOf.has(rawDir) ? rawDir : "none";
    if (!srcAgg.has(sKey)) srcAgg.set(sKey, { total: 0, enrolled: 0 });
    if (!dirAgg.has(dKey)) dirAgg.set(dKey, { total: 0, enrolled: 0 });
    srcAgg.get(sKey).total += 1;
    dirAgg.get(dKey).total += 1;
    if (isEnrolled) {
      srcAgg.get(sKey).enrolled += 1;
      dirAgg.get(dKey).enrolled += 1;
    }
  }

  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

  const toRows = (agg) =>
    Array.from(agg.entries())
      .map(([key, v]) => ({
        id: key === "none" ? null : key,
        name: key === "none" ? "Noma'lum" : nameOf.get(key),
        total: v.total,
        enrolled: v.enrolled,
        conversionRate: pct(v.enrolled, v.total),
      }))
      .sort((a, b) => b.total - a.total);

  const funnel = LEAD_PIPELINE.map((stage, i) => ({
    stage,
    count: funnelCounts[i],
    rate: pct(funnelCounts[i], total),
  }));

  const idxTrial = LEAD_PIPELINE.indexOf("trial");
  const idxTrialAttended = LEAD_PIPELINE.indexOf("trial_attended");
  const idxEnrolled = LEAD_PIPELINE.indexOf("enrolled");

  const dropOffByStage = LEAD_PIPELINE.map((stage, i) => ({
    stage,
    count: dropOff[i],
  }));

  return {
    total,
    byStatus,
    funnel,
    rates: {
      leadToTrial: pct(funnelCounts[idxTrial], total),
      trialToEnrolled: pct(
        funnelCounts[idxEnrolled],
        funnelCounts[idxTrialAttended],
      ),
      overallConversion: pct(funnelCounts[idxEnrolled], total),
    },
    bySource: toRows(srcAgg),
    byDirection: toRows(dirAgg),
    dropOffByStage,

    // RAD ETISH SABABLARI - eng ko'p uchraganidan boshlab.
    // `withNote` - nechtasida erkin izoh ham bor. Bu ma'lumot SIFATI
    // ko'rsatkichi: izohsiz sabab ("Boshqa") tahlil uchun deyarli foydasiz.
    byRejectionReason: Array.from(rejAgg.entries())
      .map(([key, v]) => ({
        id: key === "none" ? null : key,
        name: key === "none" ? "Sabab ko'rsatilmagan" : nameOf.get(key),
        count: v.count,
        withNote: v.withNote,
        share: pct(v.count, rejectedTotal),
      }))
      .sort((a, b) => b.count - a.count),

    rejection: {
      total: rejectedTotal,
      withoutReason: rejectedWithoutReason,
      // Izohi bor yopilgan lidlar ulushi - "nega?" tahlili qanchalik
      // ishonchli bo'lishini ko'rsatadi.
      noteCoverage: pct(
        Array.from(rejAgg.values()).reduce((s, v) => s + v.withNote, 0),
        rejectedTotal,
      ),
    },

    // ALOQA HOLATI - "umuman aloqaga chiqilmagan" lidlar shu yerda.
    engagement: {
      ...engagement,
      noContactOldestDays,
      // Ochiq (yopilmagan) lidlar ichida hech kim tegmaganlari ulushi.
      // Aynan shu raqam "sotuv nega o'lyapti" savoliga birinchi javob:
      // lid kelgan, lekin hech kim qo'ng'iroq qilmagan.
      noContactShare: pct(
        engagement.noContact,
        engagement.noContact + engagement.contacted,
      ),
    },
  };
};
