import { LayoutDashboard, Building2, MonitorCog, Wallet, Store } from "lucide-react";

import { PERMISSIONS } from "@/shared/constants/permissions";

/**
 * ══════════════════════════════════════════════════════════════════════
 * SUPER ADMIN NAVIGATSIYASI — UCHTA YOZUV, BOSHQA HECH NARSA
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA FAQAT UCHTA ──
 * Bu menyu KATALOG EMAS. O'quvchi, o'qituvchi, guruh, xona, chiqim,
 * to'lov — bularning hammasi tashkilot darajasida "yozuv" emas, balki
 * biror KONTEKST ICHIDAGI narsa: xona filialning ichida, to'lov
 * moliyaning ichida. Ularni sidebar'ga chiqarish yigirma qatorli menyu
 * yasaydi va Super Admin panelini "tugmalari ko'paytirilgan Admin
 * paneli"ga aylantiradi — aynan taqiqlangan natija.
 *
 * Uchta yozuv uchta savolga javob beradi:
 *
 *   ASOSIY        "biznes umuman qanday ketyapti?"
 *   FILIALLAR     "qaysi filial qanday ishlayapti?"
 *   TIZIM TAHLILI "nimaga e'tibor berishim kerak?"
 *
 * ── MOLIYA VA MARKET BU YERDA YO'Q — ULAR SARLAVHADA ──
 * Moliya sidebar'ning to'rtinchi qatori bo'lsa, u qolgan uchtasi bilan
 * bir xil og'irlikda ko'rinardi. Amalda esa markaz egasi panelni eng
 * ko'p PUL uchun ochadi. Shuning uchun u yuqori darajadagi alohida
 * yo'nalish (`SuperAdminHeader`), hisobot menyusining ichida emas.
 *
 * Market ham AYNI toifada: u "biznes qanday ketyapti" degan savolga
 * javob bermaydi, u ALOHIDA ish. Sidebarga qo'shilsa uchta yozuv
 * qoidasi buzilardi (`panelAcceptance.mjs` uni tekshiradi).
 *
 * ── RUXSAT ──
 * Bu yerdagi `permission` faqat MENYUNI kesadi. Ma'lumot himoyasi
 * serverda: har so'rovda rol + ruxsat + filial ko'lami tekshiriladi.
 */
export const SUPER_ADMIN_NAV = Object.freeze([
  {
    key: "asosiy",
    title: "Asosiy",
    icon: LayoutDashboard,
    url: "/org",
    end: true,
  },
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
 * SARLAVHADAGI YO'NALISH — hozircha bitta: MOLIYA.
 *
 * Ro'yxat sifatida saqlanadi, chunki sarlavha darajasidagi yo'nalish
 * keyin ko'payishi mumkin va u paytda tuzilma tayyor bo'lishi kerak.
 */
export const SUPER_ADMIN_HEADER_NAV = Object.freeze([
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
