import prisma from "../config/prisma.js";
import { ROLE_TYPES } from "../constants/roles.js";

// PAROL ENDPOINT'LARI UCHUN KO'LAM.
//
// MUAMMO: `branches.view_all` - HISOBOT ruxsati ("barcha filiallarni
// birdan ko'rish"). assertTargetInScope esa uni `canSeeAll` sifatida
// qabul qiladi va tekshiruvni BUTUNLAY o'tkazib yuboradi
// (`if (canSeeAll) return;`).
//
// Natijada `branches.view_all` + `system.admin_access` juftligi bo'lgan
// har qanday rol BOSHQA filial xodimining PAROLINI ochiq matnda o'qiy
// olardi: requireRole(OWNER) admin_access'ni qabul qiladi, ko'lam
// tekshiruvi esa view_all sabab ishlamas edi.
// (tests/privEscalation.test.js "A) DRIFT" ssenariysi shu edi.)
//
// YECHIM: parol o'qish/o'rnatish uchun `view_all` YETARLI EMAS.
// Faqat HAQIQIY owner (roleType === "owner") cheklovsiz ishlaydi;
// qolgan hamma - jumladan admin_access + view_all bo'lgan rol ham -
// faqat O'ZIGA BIRIKTIRILGAN filiallar doirasida.
//
// NEGA `view_all` ni umuman olib tashlamaymiz: u hisobotlar uchun
// haqiqatan kerak (konsolidatsiya, filiallarni taqqoslash). Muammo
// uning MAVJUDLIGIDA emas, uni maxfiy ma'lumotga ham tatbiq etishda.
//
// NEGA route qatlamida emas: requireRole(OWNER) ataylab admin_access'ni
// qabul qiladi (middleware/requireRole.js) va uni o'zgartirish boshqa
// 30 ta owner-only route'ga ta'sir qilardi. Bu yerda esa faqat
// parolga tegishli qaror.

/**
 * Parol amallari uchun aktyor ma'lumoti.
 *
 * `allowedBranchIds` ham, `canSeeAllBranches` ham ATAYLAB
 * QAYTARILMAYDI. Sabab: `branches.view_all` faqat bayroqni emas,
 * RO'YXATNING O'ZINI ham kengaytiradi - resolveBranchScope() view_all
 * bo'lsa `allowedBranchIds` ga BARCHA filiallarni soladi. Ya'ni
 * bayroqni o'chirish yetarli emas edi: ro'yxatda baribir B filial
 * turar va kesishuv tekshiruvi o'tib ketardi.
 *
 * Shuning uchun servis uzatilgan ro'yxatga UMUMAN ishonmaydi -
 * aktyorning HAQIQIY biriktirilgan filiallarini (homeBranchId +
 * branchAssignments) o'zi bazadan o'qiydi.
 *
 * @param {object} req - requireAuth to'ldirgan so'rov
 * @returns {{actorId: string|null, isOwner: boolean}}
 */
export const credentialScope = (req) => ({
  actorId: req?.user?._id ? String(req.user._id) : null,
  isOwner:
    req?.role?.roleType === ROLE_TYPES.OWNER ||
    req?.baseRole?.roleType === ROLE_TYPES.OWNER,
});

/**
 * Aktyorning HAQIQIY filiallari (homeBranchId + branchAssignments).
 *
 * ── NEGA `req.allowedBranchIds` ISHLATILMAYDI ──
 * `resolveBranchScope()` `branches.view_all` bo'lganda o'sha ro'yxatga
 * BARCHA filialni soladi. Ya'ni "bayroqni e'tiborsiz qoldirish"
 * yetarli emas edi — ro'yxatning O'ZI kengaygan bo'lardi va kesishuv
 * tekshiruvi jimgina o'tib ketardi.
 *
 * Shuning uchun bazadan qayta o'qiladi.
 */
export const resolveActorBranchIds = async (actorId) => {
  if (!actorId) return [];
  const actor = await prisma.user.findUnique({
    where: { id: String(actorId) },
    select: {
      homeBranchId: true,
      branchAssignments: { select: { branchId: true } },
    },
  });
  if (!actor) return [];

  const ids = new Set();
  if (actor.homeBranchId) ids.add(String(actor.homeBranchId));
  for (const a of actor.branchAssignments || []) {
    if (a?.branchId) ids.add(String(a.branchId));
  }
  return [...ids];
};

/**
 * Shu filialdagi odamning PAROLINI ko'rsa bo'ladimi.
 *
 * Qoida `getPassword` dagi bilan AYNI: haqiqiy owner cheklovsiz,
 * qolgan hamma faqat O'ZIGA biriktirilgan filial doirasida.
 * `branches.view_all` bu yerda o'tkazgich EMAS.
 */
export const canReadCredentialsIn = (actorBranchIds, isOwner, branchId) =>
  Boolean(isOwner) || actorBranchIds.includes(String(branchId));

export default credentialScope;
