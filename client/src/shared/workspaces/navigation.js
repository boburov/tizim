import {
  LayoutDashboard,
  Building2,
  Users,
  Wallet,
  GraduationCap,
  ChartColumnBig,
  ShieldCheck,
  Star,
  Settings,
  Target,
  CalendarDays,
  ClipboardCheck,
  HandCoins,
  BookOpen,
  Bell,
  User,
  TrendingUp,
  Briefcase,
} from "lucide-react";

import { WORKSPACES } from "./workspaces";

/**
 * ══════════════════════════════════════════════════════════════════════
 * TO'RTTA NAVIGATSIYA — TO'RTTA AXBOROT ARXITEKTURASI
 * ══════════════════════════════════════════════════════════════════════
 *
 * Bu FILTRLANGAN BITTA MENYU EMAS. Har ish makonining tuzilishi
 * boshqacha, chunki savol boshqacha:
 *
 *   SUPER_ADMIN → "qaysi filial, qayerda foyda, kimga ishonaman"
 *   ADMIN       → "bugun filialimda nima bo'lyapti"
 *   STAFF       → "menga nima biriktirilgan"
 *   STUDENT     → "mening o'qishim va to'lovim"
 *
 * ── CHUQURLIK QOIDASI (talab 20, 25) ──
 * Ko'pi bilan IKKI daraja. Uchinchi daraja kerak bo'lsa — u sahifa
 * ichidagi tab yoki panel bo'ladi, menyuda emas. Menyu "qayerdaman"
 * degan savolga javob beradi, katalog bo'lib xizmat qilmaydi.
 *
 * ── MANZILLAR ──
 * Yangi ekranlar o'z makonining ildizida (`/org`, `/branch`, `/work`,
 * `/me`). Mavjud ishlaydigan sahifalar esa O'Z MANZILIDA qoladi
 * (`/owner/...`) va shu yerdan havola qilinadi — ikkinchi nusxa
 * yaratilmaydi. Qobiq (sidebar) ish makonidan kelib chiqadi, ya'ni
 * o'sha sahifa direktor uchun FILIAL menyusi bilan, ega uchun
 * TASHKILOT menyusi bilan ochiladi. Bitta sahifa, ikkita kontekst.
 */

// ══════════════════════════════════════════════════════════════════
// 1) SUPER ADMIN — TASHKILOT BOSHQARUV MARKAZI
// ══════════════════════════════════════════════════════════════════
const superAdminNav = [
  {
    title: "Umumiy holat",
    icon: LayoutDashboard,
    url: "/org",
    end: true,
  },
  {
    // FILIAL — TASHKILOTNING ASOSIY O'LCHOVI.
    //
    // Ilgari filial bilan bog'liq narsalar UCH joyga sochilgandi:
    // ro'yxat "Filiallar" da, xonalar "Katalog" da, P&L esa
    // "Filiallar > Tahlil" da. Ega xona qo'shish uchun filial
    // kontekstidan CHIQIB ketishi kerak edi.
    //
    // Endi filial — KONTEYNER: ichida xonalar, odamlar, moliya,
    // guruhlar. Talab 2 aynan shuni so'raydi.
    title: "Filiallar",
    icon: Building2,
    url: "/org/branches",
    permission: "branches.read",
  },
  {
    title: "Odamlar",
    icon: Users,
    url: "/org/people",
    permission: "users.read",
  },
  {
    // MOLIYA — YASHIRIN HISOBOT EMAS, ASOSIY BO'LIM (talab 8).
    title: "Moliya",
    icon: Wallet,
    url: "/org/finance",
    permission: "finance.read",
  },
  {
    // OPERATSIYA — kundalik ish. Ega bu yerga kamdan-kam tushadi,
    // lekin tushganda hamma narsa bitta joyda bo'lishi kerak.
    title: "Operatsiya",
    icon: GraduationCap,
    url: "/org/operations",
    permissionAnyOf: ["students.read", "groups.read", "attendance.read", "leads.read"],
  },
  {
    title: "Tahlil",
    icon: ChartColumnBig,
    url: "/org/analytics",
    permissionAnyOf: ["finance.view_profitability", "ai.read", "admin_dashboard.read"],
  },
  {
    // VAKOLATLAR — "kim nima qila oladi" degan savolning YAGONA joyi.
    title: "Vakolatlar",
    icon: ShieldCheck,
    url: "/org/permissions",
    permission: "roles.read",
  },
  {
    title: "Sozlamalar",
    icon: Settings,
    url: "/owner/settings",
  },
];

// ══════════════════════════════════════════════════════════════════
// 2) ADMIN — FILIAL ISH MAKONI
//
// SUPER_ADMIN bilan bir xil DIZAYN TILI, boshqa TUZILISH.
// Filial tanlagich YO'Q: uning filiali bitta va u shundoq ham
// hamma sahifada ko'rinib turadi.
// ══════════════════════════════════════════════════════════════════
const adminNav = [
  { title: "Bugun", icon: LayoutDashboard, url: "/branch", end: true },
  { title: "O'quvchilar", icon: GraduationCap, url: "/owner/students", permission: "students.read" },
  { title: "Guruhlar", icon: BookOpen, url: "/owner/groups", permission: "groups.read" },
  { title: "O'qituvchilar", icon: Users, url: "/owner/teachers", permission: "teachers.read" },
  { title: "Davomat", icon: ClipboardCheck, url: "/owner/attendance", permission: "attendance.read" },
  { title: "Jadval", icon: CalendarDays, url: "/branch/schedule", permission: "classes.read" },
  { title: "Lidlar", icon: Target, url: "/owner/leads", permission: "leads.read" },
  {
    // UNDIRISH — "kim qarzdor va nima qilamiz". Ilgari bu
    // "Moliya > Hisobot" ichidagi tab edi va filial direktori uni
    // moliyaviy hisobot deb o'ylab ochmasdi. Bu esa uning ENG
    // kundalik ishi.
    title: "Undirish",
    icon: HandCoins,
    url: "/branch/collections",
    permissionAnyOf: ["finance.view_receivables", "finance.read"],
  },
  {
    title: "Filial moliyasi",
    icon: Wallet,
    url: "/branch/finance",
    permission: "finance.read",
  },
  { title: "Sozlamalar", icon: Settings, url: "/owner/settings" },
];

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
  [WORKSPACES.SUPER_ADMIN]: superAdminNav,
  [WORKSPACES.ADMIN]: adminNav,
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
