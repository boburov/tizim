import {
  LayoutDashboard,
  Wallet,
  GraduationCap,
  Star,
  Target,
  CalendarDays,
  ClipboardCheck,
  BookOpen,
  Bell,
  User,
  TrendingUp,
  Briefcase,
} from "lucide-react";

import { WORKSPACES } from "./workspaces";
import ownerSidebar from "@/owner/navigation/sidebar.config";

/**
 * ══════════════════════════════════════════════════════════════════════
 * OPERATSION QOBIQNING MENYUSI (`AppSidebar` shu yerdan o'qiydi)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── BU FAYL NIMA QILADI VA NIMA QILMAYDI ──
 * U faqat BITTA savolga javob beradi: operatsion qobiqda turgan
 * odamga qaysi menyu ko'rsatiladi?
 *
 *   ega / administrator → Admin panelining o'z menyusi
 *                         (`owner/navigation/sidebar.config.js`)
 *   o'qituvchi          → `teacherNav`   (`/teacher/*` paneli)
 *   xodim               → `officeNav`    (`/work`)
 *   o'quvchi            → `studentNav`   (`/me`, `/student/*`)
 *
 * ── NIMA O'ZGARDI ──
 * Ilgari bu yerda TO'RTTA menyu bor edi va ulardan ikkitasi
 * (`superAdminNav`, `adminNav`) mavjud panellarning navigatsiyasini
 * ALMASHTIRARDI: Super Admin uchun sakkiz yozuvli ro'yxat, Admin
 * uchun esa boshqa ro'yxat — ikkalasi ham AYNI qobiqda, ayni
 * sidebar komponentida. Ya'ni ikki panel amalda bitta panel edi,
 * faqat massivi boshqacha.
 *
 * Endi Super Admin panelining o'z qobig'i bor
 * (`superadmin/layout/`) va u bu faylga umuman qaramaydi. Admin
 * paneli esa o'z menyusini o'zi belgilaydi.
 *
 * ── XAVFSIZLIK ──
 * Bu fayl FAQAT UX. Menyuda ko'rinmagan sahifaga URL orqali kirish
 * mumkin va bu normal: ma'lumotni server qo'riqlaydi (rol + ruxsat +
 * filial ko'lami, har so'rovda).
 */

// ══════════════════════════════════════════════════════════════════
// 3) STAFF — "MENGA BIRIKTIRILGAN ISH"
//
// Tashkilot moliyasi UMUMAN yo'q (talab 17).
// ══════════════════════════════════════════════════════════════════
/**
 * XODIM MAKONINING IKKI KO'RINISHI.
 *
 * "Xodim" bitta emas: o'qituvchi dars beradi, resepshin telefonga
 * javob beradi. Ikkalasi ham "menga biriktirilgan ish" bilan
 * yashaydi (shuning uchun BITTA makon), lekin ular OCHADIGAN
 * sahifalar boshqa.
 *
 * O'qituvchi uchun `/teacher/*` paneli allaqachon bor va u to'liq:
 * davomat belgilash, baho qo'yish, vazifa yuborish, o'z maoshi.
 * Uni takrorlash yoki tashlab yuborish — ikkalasi ham xato bo'lardi.
 * Shuning uchun makon bitta, manzillar esa ko'rinishga qarab.
 */
const teacherNav = [
  { title: "Bosh sahifa", icon: LayoutDashboard, url: "/work", end: true },
  { title: "Guruhlarim", icon: BookOpen, url: "/teacher/groups" },
  { title: "Davomat", icon: ClipboardCheck, url: "/teacher/attendance" },
  { title: "Baholash", icon: Star, url: "/teacher/grades" },
  { title: "Jadvalim", icon: CalendarDays, url: "/work/schedule" },
  { title: "Vazifalar", icon: Briefcase, url: "/teacher/assignments" },
  { title: "Maoshim", icon: Wallet, url: "/teacher/finance" },
  { title: "Xabarlar", icon: Bell, url: "/teacher/inbox" },
];

const officeNav = [
  { title: "Bosh sahifa", icon: LayoutDashboard, url: "/work", end: true },
  { title: "Guruhlarim", icon: BookOpen, url: "/work/groups", permission: "groups.read" },
  { title: "O'quvchilarim", icon: GraduationCap, url: "/work/students", permission: "groups.read" },
  { title: "Davomat", icon: ClipboardCheck, url: "/owner/attendance", permission: "attendance.read" },
  { title: "Jadval", icon: CalendarDays, url: "/work/schedule" },
  { title: "Lidlar", icon: Target, url: "/owner/leads", permission: "leads.read" },
  { title: "Vazifalar", icon: Briefcase, url: "/owner/assignments", permission: "assignments.read" },
  { title: "Xabarlar", icon: Bell, url: "/owner/inbox" },
];

// ══════════════════════════════════════════════════════════════════
// 4) STUDENT — "MENING SAHIFAM"
//
// Har bir nom O'QUVCHI TILIDA (talab 16): "Guruhlar" emas,
// "Mening guruhim". Tashkilot tushunchalari umuman yo'q.
// ══════════════════════════════════════════════════════════════════
const studentNav = [
  { title: "Bosh sahifa", icon: LayoutDashboard, url: "/me", end: true },
  { title: "O'qishim", icon: BookOpen, url: "/student/group" },
  { title: "Jadvalim", icon: CalendarDays, url: "/me/schedule" },
  { title: "Davomatim", icon: ClipboardCheck, url: "/student/attendance" },
  { title: "To'lovlarim", icon: Wallet, url: "/me/payments" },
  { title: "Natijalarim", icon: TrendingUp, url: "/student/rating" },
  { title: "Vazifalarim", icon: Briefcase, url: "/student/assignments", badge: "studentAssignments" },
  { title: "Xabarlarim", icon: Bell, url: "/student/inbox" },
  { title: "Profilim", icon: User, url: "/student/profile" },
];

export const WORKSPACE_NAV = Object.freeze({
  // SUPER ADMIN VA ADMIN — IKKALASI HAM ADMIN PANELINING MENYUSI.
  //
  // Bu qasddan. `AppSidebar` faqat OPERATSION qobiqda (`/owner/*`,
  // `/work`, `/me`) chiziladi — Super Admin panelining o'z sidebari
  // bor (`superadmin/layout/SuperAdminSidebar.jsx`) va u bu yerdan
  // hech narsa olmaydi.
  //
  // Ya'ni bu ikki qator faqat bitta savolga javob beradi: "ega yoki
  // direktor `/owner/students` sahifasini ochganda qanday menyu
  // ko'radi?" Javob — Admin panelining o'z menyusi, chunki u AYNAN
  // shu panelda turibdi.
  [WORKSPACES.SUPER_ADMIN]: ownerSidebar,
  [WORKSPACES.ADMIN]: ownerSidebar,
  [WORKSPACES.STAFF]: officeNav,
  [WORKSPACES.STUDENT]: studentNav,
});

/**
 * @param {string} workspace
 * @param {{ isTeacher?: boolean }} [opts] — xodim makonining ko'rinishi
 */
export const navFor = (workspace, { isTeacher = false } = {}) => {
  if (workspace === WORKSPACES.STAFF) return isTeacher ? teacherNav : officeNav;
  return WORKSPACE_NAV[workspace] || officeNav;
};

export default WORKSPACE_NAV;
