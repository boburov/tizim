import { LayoutDashboard, Building2, MonitorCog, Wallet, ScrollText } from "lucide-react";

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
 *   AUDIT LOGLARI "kim nima qildi?"                  → chap ustun
 *
 * ── NEGA AUDIT LOGLARI SHU YERDA ──
 * U yuqoridagi qoidani BUZMAYDI: "kim nima qildi" — entitet emas,
 * TASHKILOT DARAJASIDAGI savol, va boshqa hech qaysi bo'limning ichida
 * javobi yo'q. Admin panelidagi (`/owner/activity-logs`) egizagi
 * FILIAL ko'lamida ishlaydi; ega esa aynan filiallararo ko'rinishni
 * so'raydi ("administrator bugun nima qildi"), ya'ni bu ikkinchi nusxa
 * emas — AYNI komponent, ko'lami serverda kengaytirilgan.
 *
 * ── NEGA ASOSIY SARLAVHAGA CHIQDI ──
 * U bo'lim emas, BOSH SAHIFA: panel har safar o'sha yerdan ochiladi va
 * qolgan hamma yo'l unga QAYTADI. Chap ustunning birinchi qatori
 * bo'lganida u "Filiallar bilan bir xil darajadagi bo'lim" bo'lib
 * o'qilardi. Sarlavhada esa u Moliya bilan bitta qatorda —
 * ya'ni panelning yuqori darajadagi yo'nalishlari BITTA joyda turadi,
 * ikki ustunga bo'linmaydi.
 *
 * ── MOLIYA BU YERDA YO'Q — U SARLAVHADA ──
 * Moliya sidebar'ning to'rtinchi qatori bo'lsa, u qolganlar bilan
 * bir xil og'irlikda ko'rinardi. Amalda esa markaz egasi panelni eng
 * ko'p PUL uchun ochadi. Shuning uchun u yuqori darajadagi alohida
 * yo'nalish (`SuperAdminHeader`), hisobot menyusining ichida emas.
 *
 * ── MARKET BU PANELDAN OLIB TASHLANDI ──
 * U sarlavhada turardi. Lekin Market — FILIAL OPERATSIYASI: buyurtma
 * yig'ish va berish filial xodimining kunlik ishi, "biznes qanday
 * ketyapti" degan savolga javob bermaydi. Ko'p filialli ega uni
 * kunlik ochmaydi, ochsa ham qaysi filial nomidan ish qilayotgani
 * noaniq edi (bu qobiqda filial tanlagich YO'Q).
 *
 * Ega uchun market DAROMADI yo'qolmaydi — u Moliya va filial P&L
 * ichida qoladi. Market boshqaruvi esa admin panelida
 * (`/owner/market`) va filial sahifasida.
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
  {
    key: "audit",
    title: "Audit loglari",
    icon: ScrollText,
    url: "/org/audit",
    permission: PERMISSIONS.ACTIVITY_LOGS_READ,
    capability: "activity-logs",
  },
]);

/**
 * SARLAVHADAGI YO'NALISHLAR: ASOSIY · MOLIYA.
 *
 * Tartib TASODIFIY EMAS: Asosiy (bosh manzara) → Moliya (panelni
 * ochishning eng ko'p sababi).
 *
 * ⚠ MARKET BU YERDA EDI, OLIB TASHLANDI — sababi yuqorida.
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
]);

export default SUPER_ADMIN_NAV;
