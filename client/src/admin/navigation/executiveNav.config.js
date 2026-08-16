import {
  Banknote,
  Building2,
  ChartColumnBig,
  GraduationCap,
  LayoutGrid,
  Lightbulb,
  Users,
} from "lucide-react";

import { PERMISSIONS } from "@/shared/constants/permissions";

/**
 * EXECUTIVE NAVIGATSIYASI.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA SIDEBAR YO'Q
 *
 * Sidebar - IJROCHI asbob: u 30 ta manzilni doim ko'z oldida tutadi,
 * chunki operator kun bo'yi ular orasida sakraydi. Executive ekranda
 * esa maqsad teskari: kamroq tanlov, ko'proq javob. Doimiy 30 havola
 * ekranning uchdan birini yeydi va "nima muhim" degan savolga
 * "hammasi" deb javob beradi.
 *
 * Shuning uchun bu yerda bir hovuch bo'lim bor, ular gorizontal tab
 * bo'lib turadi, tafsilotga esa DRILL-DOWN orqali tushiladi:
 * executive karta -> operatsion sahifa (/owner/...).
 * ═══════════════════════════════════════════════════════════════════
 *
 * YOZUV SHAKLI:
 *   to              - aniq manzil (NavLink `end` bilan solishtiriladi)
 *   permission      - ruxsat kaliti; yo'q bo'lsa bo'lim MENYUDA
 *                     ko'rinmaydi VA marshrut ham qo'riqlanadi
 *                     (ikkalasi bir manbadan)
 *   end             - `false` bo'lsa ichki sahifalarda ham faol qoladi
 *   multiBranchOnly - yakka markazda menyuda ko'rsatilmaydi
 *
 * YANGI RUXSAT KALITI QO'SHILMAGAN. Har bo'lim mavjud kalitlarga
 * tayanadi - aks holda serverdagi `permissions.seed.js` va rol
 * matritsasi o'zgarishi kerak bo'lardi, u yerda esa hozir
 * MongoDB -> PostgreSQL ko'chishi ketmoqda.
 */
const executiveNav = [
  {
    key: "overview",
    title: "Umumiy",
    hint: "Bugungi holat bir ekranda",
    icon: LayoutGrid,
    to: "/admin",
    end: true,
    permission: PERMISSIONS.ADMIN_DASHBOARD_READ,
  },
  {
    key: "finance",
    title: "Moliya",
    hint: "Tushum, qarzdorlik, chiqim",
    icon: Banknote,
    to: "/admin/moliya",
    permission: PERMISSIONS.FINANCE_READ,
  },
  {
    key: "academic",
    title: "O'quv jarayoni",
    hint: "Guruhlar, davomat, o'zlashtirish",
    icon: GraduationCap,
    to: "/admin/oquv",
    permission: PERMISSIONS.ADMIN_DASHBOARD_READ,
  },
  {
    key: "team",
    title: "Jamoa",
    hint: "O'qituvchilar va xodimlar",
    icon: Users,
    to: "/admin/jamoa",
    permission: PERMISSIONS.SALARY_READ,
  },
  {
    key: "compare",
    title: "Filiallar",
    hint: "Moliya, o'qituvchi va sotuv — filiallar kesimida",
    icon: Building2,
    to: "/admin/filiallar",
    // YAKKA MARKAZDA KO'RSATILMAYDI: bitta filialni o'zi bilan
    // taqqoslash ma'nosiz. `owner/navigation/sidebar.config.js` dagi
    // `multiBranchOnly` bilan bir xil qoida.
    multiBranchOnly: true,
    // Sahifa uchta manbadan oziqlanadi (moliya/maosh/lid) va har biri
    // O'Z ruxsati bilan kesiladi. Kirish uchun esa filial ro'yxatini
    // ko'rish huquqi yetarli - sahifaning mohiyati filiallarni
    // yonma-yon qo'yish. Bloklar ichida ruxsat yana tekshiriladi.
    permission: PERMISSIONS.BRANCHES_READ,
  },
  {
    key: "insights",
    title: "Tavsiyalar",
    hint: "AI ogohlantirishlari va imkoniyatlari",
    icon: Lightbulb,
    to: "/admin/tavsiyalar",
    permission: PERMISSIONS.AI_READ,
  },
  {
    key: "analysis",
    title: "Tizim tahlili",
    hint: "Kunlik brifing: kecha, bugun, keyin, hozir",
    icon: ChartColumnBig,
    to: "/admin/tahlil",
    // Ichki sahifalari ham bor (vazifalar, hisobotlar) - tab faol qoladi.
    end: false,
    permission: PERMISSIONS.AI_READ,
  },
];

export default executiveNav;

/**
 * Ruxsat bo'yicha kesish.
 *
 * MENYU VA MARSHRUT BITTA MANBADAN. Ilgari kodbazada menyuda yashirish
 * bilan cheklanilgan joylar bo'lgan (`owner/routes/index.jsx` dagi
 * izohda aynan shu yozilgan: "menyuda yashirish yetarli emas"), shuning
 * uchun bu yerda ham har bo'lim `PermissionGuard` bilan qo'riqlanadi -
 * bu funksiya faqat KO'RINISH uchun.
 */
export const visibleNav = (has, { multiBranch = true } = {}) =>
  executiveNav.filter((item) => {
    if (item.permission && !has(item.permission)) return false;
    // YAKKA MARKAZ: filial tushunchasi umuman yo'q, ya'ni filiallararo
    // bo'lim ham bo'lmasligi kerak. Marshrut o'z joyida qoladi (manzilni
    // qo'lda yozgan odam bo'sh emas, MA'NOLI ekran ko'radi: bitta
    // filialning o'z raqamlari), faqat menyuda ko'rinmaydi.
    if (item.multiBranchOnly && !multiBranch) return false;
    return true;
  });

/** Joriy manzilga mos bo'limni topadi (sarlavha va `hint` uchun). */
export const activeNavItem = (pathname) => {
  const exact = executiveNav.find((i) => i.to === pathname);
  if (exact) return exact;
  return (
    executiveNav
      .filter((i) => !i.end)
      .find((i) => pathname.startsWith(`${i.to}/`)) || null
  );
};
