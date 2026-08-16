// Router
import { Outlet } from "react-router-dom";

// Components
import ExecutiveHeader from "./ExecutiveHeader";
import BranchModeBanner from "@/shared/components/layout/BranchModeBanner";

/**
 * EXECUTIVE QOBIG'I - SIDEBAR YO'Q.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA `DashboardLayout` DAN FOYDALANILMAYDI
 *
 * `DashboardLayout` `SidebarProvider` bilan o'raladi va butun sahifa
 * tuzilishini shunga qurdiradi (`SidebarInset` -> `AppHeader` ->
 * kontent). `AppHeader` esa `useSidebar()` ni chaqiradi, ya'ni
 * provider'siz u YIQILADI.
 *
 * "Sidebar'ni yashirish" yo'li ham to'g'ri emas edi: provider baribir
 * qoladi, klaviatura yorlig'i (Ctrl+B) ko'rinmas panelni ochib
 * yuboradi, `SidebarRail` esa chetda bosiladigan zona bo'lib turadi.
 * Ya'ni "yo'q" emas, "yashirilgan" bo'lardi.
 *
 * Shuning uchun bu qobiq mustaqil: provider yo'q, rail yo'q, yorliq
 * yo'q. Kontekst elementlari (filial, mavzu, profil, bildirishnoma)
 * `ExecutiveHeader` da qayta yig'ilgan - ular sidebar'ga bog'liq
 * bo'lmagan mustaqil komponentlar (`BranchBadge`, `NotificationBell`).
 * ═══════════════════════════════════════════════════════════════════
 *
 * KENGLIK CHEGARASI (`max-w-[1600px]`): rahbariyat ekrani ko'pincha
 * katta monitorda ochiladi. Chegarasiz KPI plitalari 2500px ga
 * cho'zilib, ko'z bir plitadan ikkinchisiga yetib borolmaydi.
 */
const ExecutiveLayout = () => (
  <div className="flex min-h-svh flex-col bg-background">
    <ExecutiveHeader />

    <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-5 sm:py-6">
      {/* Filial rejimi ogohlantirishi operatsion paneldagi bilan bir xil -
          "hamma filial" rejimida yozilgan raqam qaysi filialga tegishli
          ekani noaniq bo'lib qolmasligi uchun. */}
      <BranchModeBanner />
      <Outlet />
    </main>
  </div>
);

export default ExecutiveLayout;
