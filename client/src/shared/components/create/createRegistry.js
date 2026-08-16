import {
  BadgePercent,
  Building2,
  DoorOpen,
  GraduationCap,
  Target,
  User,
  UserCog,
  Users,
} from "lucide-react";

import { MODAL } from "@/shared/constants/modals";
import { ROLES } from "@/shared/constants/roles";
import { PERMISSIONS } from "@/shared/constants/permissions";

/**
 * YARATISH REGISTRI - "nima yaratish mumkin" degan YAGONA ro'yxat.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA `shared` DA, `owner` DA EMAS
 *
 * Ilgari bu ro'yxat `owner/components/CreateMenu.jsx` ichida edi.
 * Endi uni IKKI qobiq ishlatadi: operatsion sidebar va rahbariyat
 * sarlavhasi. Ikki nusxa vaqt o'tib ajralib ketardi - bir qobiqda
 * "Xona" bor, ikkinchisida yo'q bo'lib qolardi.
 *
 * Har yozuv o'z RUXSATI bilan kesiladi: ruxsati yo'q odam uni
 * ko'rmaydi (menyuda yashirish yetarli emas - modal ochilganda
 * server baribir rad etadi, lekin foydalanuvchini behuda urinishga
 * majburlash yomon tajriba).
 * ═══════════════════════════════════════════════════════════════════
 */
export const CREATE_GROUPS = [
  {
    label: "Odamlar",
    items: [
      {
        key: "student",
        icon: GraduationCap,
        label: "O'quvchi",
        hint: "Profil, guruh, ro'yxat sanasi",
        permission: PERMISSIONS.STUDENTS_CREATE,
        modal: MODAL.USER_CREATE,
        data: { defaultRole: ROLES.STUDENT },
      },
      {
        key: "teacher",
        icon: User,
        label: "O'qituvchi",
        hint: "Profil va ishga olingan sana",
        permission: PERMISSIONS.TEACHERS_CREATE,
        modal: MODAL.USER_CREATE,
        data: { defaultRole: ROLES.TEACHER },
      },
      {
        key: "staff",
        icon: UserCog,
        label: "Xodim",
        hint: "Rol va filial biriktiriladi",
        // Xodim yaratish ikkita ruxsat talab qiladi (serverda ham shunday):
        // odam yaratish VA rol biriktirish.
        permissions: [PERMISSIONS.TEACHERS_CREATE, PERMISSIONS.ROLES_UPDATE],
        modal: MODAL.STAFF_CREATE,
        data: null,
      },
    ],
  },
  {
    label: "Ish",
    items: [
      {
        key: "group",
        icon: Users,
        label: "Guruh",
        hint: "Jadval, o'qituvchi, narx",
        permission: PERMISSIONS.GROUPS_CREATE,
        modal: MODAL.GROUP_CREATE,
        data: null,
      },
      {
        key: "lead",
        icon: Target,
        label: "Lid",
        hint: "Potensial mijoz",
        permission: PERMISSIONS.LEADS_CREATE,
        modal: MODAL.LEAD_CREATE,
        data: null,
      },
      {
        key: "discount",
        icon: BadgePercent,
        label: "Chegirma",
        hint: "O'quvchiga imtiyoz",
        permission: PERMISSIONS.FINANCE_MANAGE,
        modal: MODAL.DISCOUNT_CREATE,
        data: null,
      },
    ],
  },
  {
    label: "Tuzilma",
    items: [
      {
        key: "room",
        icon: DoorOpen,
        label: "Xona",
        hint: "Filial resursi, guruhga biriktiriladi",
        // `classes.create` - XONA ruxsati aynan shu nom bilan yuradi.
        // `rooms.*` degan kalit UMUMAN YO'Q: model va marshrut keyin
        // qo'shilgan, ruxsat guruhi esa avvaldan `classes.*` edi
        // (server: `rooms.routes.js` -> PERMISSIONS.CLASSES_CREATE).
        //
        // Bu MUHIM: mavjud bo'lmagan kalit yozilsa `has(undefined)`
        // egadan boshqa HAMMAGA `false` qaytaradi - ya'ni resepshin
        // xona qo'sha olmay qolardi va sabab hech qayerda ko'rinmasdi.
        permission: PERMISSIONS.CLASSES_CREATE,
        modal: MODAL.ROOM_CREATE,
        data: null,
      },
      {
        key: "branch",
        icon: Building2,
        label: "Filial",
        hint: "Nom + direktor hisobi",
        // SERVERDAGI TEKSHIRUV BILAN AYNAN BIR XIL: `POST /branches`
        // ikkita ruxsat talab qiladi - `system.admin_access` VA
        // `branches.create` (`branches.routes.js`).
        //
        // `system.admin_access` ATAYLAB: filial yaratishni faqat
        // `branches.create` ga bog'lash imtiyoz oshirish yo'li bo'lardi -
        // filial direktori o'ziga yangi filial ochib, keyin o'zini unga
        // biriktirib, ko'lamini kengaytira olardi (serverdagi izoh).
        permissions: [
          PERMISSIONS.SYSTEM_ADMIN_ACCESS,
          PERMISSIONS.BRANCHES_CREATE,
        ],
        modal: MODAL.BRANCH_CREATE,
        data: null,
      },
    ],
  },
];

/** Tekis ro'yxat - `key` bo'yicha qidirish uchun. */
export const CREATE_ITEMS = CREATE_GROUPS.flatMap((g) => g.items);

export const findCreateItem = (key) =>
  CREATE_ITEMS.find((i) => i.key === key) || null;

/** Ruxsat bo'yicha kesilgan guruhlar (bo'sh guruh tushib qoladi). */
export const visibleCreateGroups = ({ has, hasAll }) =>
  CREATE_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) =>
      i.permissions ? hasAll(i.permissions) : has(i.permission),
    ),
  })).filter((g) => g.items.length > 0);
