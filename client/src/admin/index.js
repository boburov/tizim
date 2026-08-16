/**
 * RAHBARIYAT QOBIG'I (`/admin`) - PUBLIC API.
 *
 * ═══════════════════════════════════════════════════════════════════
 * BU ROL EMAS, QARASH NUQTASI.
 *
 * `owner/`, `teacher/`, `student/` - ROL panellari: kim ekaningizga
 * qarab tanlanadi. `admin/` esa boshqacha - u bir xil ma'lumotning
 * BOSHQA KESIMI: operatsion panel "nima qilay" uchun, rahbariyat
 * qobig'i "qanday ketyapti" uchun.
 *
 * Shuning uchun u ROL bilan emas, RUXSAT bilan qo'riqlanadi
 * (`admin_dashboard.read`, `finance.read`, ...) va yangi ruxsat
 * kaliti KIRITILMAGAN: filial direktori ham, ega ham o'z ruxsatlari
 * doirasida kiradi.
 * ═══════════════════════════════════════════════════════════════════
 */
export { default as AdminRoutes } from "./routes";
export { default as ExecutiveLayout } from "./layout/ExecutiveLayout";
export { default as executiveNav } from "./navigation/executiveNav.config";
export { visibleNav, activeNavItem } from "./navigation/executiveNav.config";
export { DRILLDOWN, userHref, groupHref, branchHref } from "./navigation/drilldown";
