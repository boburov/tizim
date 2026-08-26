import { LayoutDashboard, Building2, MonitorCog, Wallet, Store } from "lucide-react";

import { PERMISSIONS } from "@/shared/constants/permissions";

/**
 * ══════════════════════════════════════════════════════════════════════
 * SUPER ADMIN NAVIGATSIYASI — MINIMAL RO'YXAT, BOSHQA HECH NARSA
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA SHUNCHA KAM ──
 * Bu menyu KATALOG EMAS. O'quvchi, o'qituvchi, guruh, xona, chiqim,
 * to'lov — bularning hammasi tashkilot darajasida "yozuv" emas, balki
 * biror KONTEKST ICHIDAGI narsa: xona filialning ichida, to'lov
 * moliyaning ichida. Ularni sidebar'ga chiqarish yigirma qatorli menyu
 * yasaydi va Super Admin panelini "tugmalari ko'paytirilgan Admin
 * paneli"ga aylantiradi — aynan taqiqlangan natija.
 *
 * Har bir yozuv bitta savolga javob beradi:
 *
 *   ASOSIY        "biznes umuman qanday ketyapti?"   → SARLAVHADA
 *   FILIALLAR     "qaysi filial qanday ishlayapti?"  → chap ustun
 *   TIZIM TAHLILI "nimaga e'tibor berishim kerak?"   → chap ustun
 *
 * ── NEGA ASOSIY SARLAVHAGA CHIQDI ──
 * U bo'lim emas, BOSH SAHIFA: panel har safar o'sha yerdan ochiladi va
 * qolgan hamma yo'l unga QAYTADI. Chap ustunning birinchi qatori
 * bo'lganida u "Filiallar bilan bir xil darajadagi bo'lim" bo'lib
 * o'qilardi. Sarlavhada esa u Moliya va Market bilan bitta qatorda —
 * ya'ni panelning yuqori darajadagi yo'nalishlari BITTA joyda turadi,
 * ikki ustunga bo'linmaydi.
 *
 * ── MOLIYA VA MARKET BU YERDA YO'Q — ULAR SARLAVHADA ──
 * Moliya sidebar'ning to'rtinchi qatori bo'lsa, u qolgan uchtasi bilan
 * bir xil og'irlikda ko'rinardi. Amalda esa markaz egasi panelni eng
 * ko'p PUL uchun ochadi. Shuning uchun u yuqori darajadagi alohida
 * yo'nalish (`SuperAdminHeader`), hisobot menyusining ichida emas.
 *
 * Market ham AYNI toifada: u "biznes qanday ketyapti" degan savolga
 * javob bermaydi, u ALOHIDA ish. Sidebarga qo'shilsa chap ustun
 * minimal bo'lish qoidasi buzilardi (`panelAcceptance.mjs` uni
 * tekshiradi).
 *
 * ── RUXSAT ──
 * Bu yerdagi `permission` faqat MENYUNI kesadi. Ma'lumot himoyasi
 * serverda: har so'rovda rol + ruxsat + filial ko'lami tekshiriladi.
 */
export const SUPER_ADMIN_NAV = Object.freeze([
  {
    key: "filiallar",
    title: "Filiallar",
    icon: Building2,
    url: "/org/filiallar",
    permission: PERMISSIONS.BRANCHES_READ,
  },
  {
    key: "tahlil",
    title: "Tizim tahlili",
    icon: MonitorCog,
    url: "/org/tahlil",
    permissionAnyOf: [
      PERMISSIONS.AI_READ,
      PERMISSIONS.ADMIN_DASHBOARD_READ,
      PERMISSIONS.FINANCE_VIEW_PROFITABILITY,
    ],
  },
]);

/**
 * SARLAVHADAGI YO'NALISHLAR: ASOSIY · MOLIYA · MARKET.
 *
 * Tartib TASODIFIY EMAS — chapdan o'ngga "qayerdan boshlanadi" dan
 * "alohida ish" ga qarab: Asosiy (bosh manzara) → Moliya (panelni
 * ochishning eng ko'p sababi) → Market (alohida ish).
 */
export const SUPER_ADMIN_HEADER_NAV = Object.freeze([
  {
    key: "asosiy",
    title: "Asosiy",
    icon: LayoutDashboard,
    url: "/org",
    // ⚠ `end` — `/org` BARCHA `/org/*` yo'llarining prefiksi. Usiz
    // NavLink "Asosiy" ni Moliya va Filiallar ochilganda ham faol deb
    // bo'yardi, ya'ni sarlavhada BIR VAQTDA ikki faol yozuv turardi.
    end: true,
  },
  {
    key: "moliya",
    title: "Moliya",
    icon: Wallet,
    url: "/org/moliya",
    permission: PERMISSIONS.FINANCE_READ,
  },
  {
    key: "market",
    title: "Market",
    icon: Store,
    url: "/org/market",
    permissionAnyOf: [
      PERMISSIONS.MARKET_READ,
      PERMISSIONS.MARKET_MANAGE,
      PERMISSIONS.COIN_SETTINGS,
    ],
    // ⚠ RUXSAT YETARLI EMAS — BO'LIM O'CHIRILGAN BO'LISHI MUMKIN.
    //
    // `capability: "coin"` `SuperAdminHeader` ga "bu yozuvni
    // `useCoinConfig().enabled` ham tasdiqlashi kerak" deydi. Faqat
    // ruxsatga tayanilsa, ega bo'limni o'chirgandan keyin ham
    // sarlavhada "Market" turaverardi va bosilganda `/org` ga
    // qaytarardi — o'zi yasagan yolg'on eshik.
    capability: "coin",
  },
]);

export default SUPER_ADMIN_NAV;
