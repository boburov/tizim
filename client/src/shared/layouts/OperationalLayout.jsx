// Router
import { Outlet } from "react-router-dom";

// Components
import {
  SidebarInset,
  SidebarProvider,
} from "@/shared/components/shadcn/sidebar";
import AppHeader from "@/shared/components/layout/AppHeader";
import AppSidebar from "@/shared/components/layout/AppSidebar";
import BranchModeBanner from "@/shared/components/layout/BranchModeBanner";
import { DrillProvider, DrillDrawer } from "@/shared/drill";

/**
 * OPERATSION QOBIQ - SIDEBAR BILAN.
 *
 * ═══════════════════════════════════════════════════════════════════
 * Bu `DashboardLayout` ning O'ZI, faqat nomi aniqlashtirildi.
 *
 * NEGA QAYTA NOMLANDI: endi ikkita qobiq bor va "Dashboard" nomi
 * ikkalasiga ham tegishli bo'lib qoldi - rahbariyat ekrani ham
 * dashboard, operatsion panel ham. Fayl nomidan qaysi biri ekani
 * bilinmasdi va yangi sahifa qo'shayotgan odam noto'g'risini
 * tanlashi mumkin edi.
 *
 * Endi nom ISHNI aytadi:
 *   OperationalLayout - kundalik ish, 30+ havola, sidebar
 *   ExecutiveLayout   - rahbariyat kesimi, 5 bo'lim, sidebar YO'Q
 *
 * Eski nom (`DashboardLayout`) RE-EXPORT bo'lib qoladi - uni
 * ishlatayotgan kod buzilmasin.
 * ═══════════════════════════════════════════════════════════════════
 */
/**
 * ── DRILL PANELI QOBIQ DARAJASIDA ──
 *
 * `DrillProvider` shu yerda mount qilinadi, sahifada emas. Sabab:
 * panel zanjiri (daromad → guruh → o'quvchi → yozuv) sahifa
 * almashganda YO'QOLMASLIGI kerak va istalgan ekrandagi jadval uni
 * ocha olishi kerak. Har sahifa o'z provider'ini qo'ysa, "bosiladigan
 * raqam" ekranga qarab ishlaydigan-ishlamaydigan bo'lib qolardi —
 * aynan talab 35 taqiqlaydigan holat.
 *
 * Sahifa faqat O'Z FILTRLARINI e'lon qiladi (`useDrillFilters`).
 */
const OperationalLayout = () => (
  <SidebarProvider className="relative z-10">
    <DrillProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <AppHeader />
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:py-2">
          <BranchModeBanner />
          <Outlet />
        </div>
      </SidebarInset>
      <DrillDrawer />
    </DrillProvider>
  </SidebarProvider>
);

export default OperationalLayout;
