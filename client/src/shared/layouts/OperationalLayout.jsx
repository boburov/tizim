// Router
import { lazy, Suspense } from "react";
import { Outlet } from "react-router-dom";

// Components
import {
  SidebarInset,
  SidebarProvider,
} from "@/shared/components/shadcn/sidebar";
import AppHeader from "@/shared/components/layout/AppHeader";
import AppSidebar from "@/shared/components/layout/AppSidebar";
import BranchModeBanner from "@/shared/components/layout/BranchModeBanner";
import { DrillProvider } from "@/shared/drill";

/**
 * DRILL PANELI — KERAK BO'LGANDA YUKLANADI.
 *
 * Panel qobiq darajasida mount qilinadi (istalgan ekrandagi jadval
 * uni ocha olishi kerak), lekin u OCHILMAGUNCHA hech narsa
 * ko'rsatmaydi. Statik import bo'lsa, u o'zi bilan birga tahlil
 * jadvallarini va grafik kutubxonasini ham kirish fayliga tortib
 * kelardi — o'quvchi hech qachon ko'rmaydigan kodni.
 *
 * Provider statik qoladi: u faqat holat (React konteksti), og'irligi
 * yo'q va u BO'LMASA jadvallardagi `useDrill()` ishlamay qolardi.
 */
const DrillDrawer = lazy(() => import("@/shared/drill/DrillDrawer"));

/**
 * OPERATSION QOBIQ - SIDEBAR BILAN.
 *
 * ═══════════════════════════════════════════════════════════════════
 * Bu `DashboardLayout` ning O'ZI, faqat nomi aniqlashtirildi.
 *
 * NEGA QAYTA NOMLANDI: ilovada ikkita qobiq bor va "Dashboard" nomi
 * ikkalasiga ham tegishli bo'lib qolgandi. Endi nom ISHNI aytadi:
 *
 *   OperationalLayout  - ADMIN PANELI (`/owner/*`): kundalik ish,
 *                        30+ havola, yig'iladigan sidebar
 *   SuperAdminLayout   - SUPER ADMIN PANELI (`/org/*`): tashkilot
 *                        boshqaruvi, uch yozuvli menyu, sarlavhada
 *                        MOLIYA (`superadmin/layout/`)
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
          {/* KOD BO'LAGI YUKLANISHI uchun chegara.
              Marshrut daraxtlari `lazy()` bilan yuklanadi
              (`app/routes.jsx`), ya'ni ular birinchi ochilishda
              kelmagan bo'lishi mumkin. Chegara SAHIFA o'rnida —
              qobiq (sidebar, sarlavha) joyida qoladi va faqat
              kontent kutadi.

              `fallback={null}`: qo'riqchilar allaqachon `null`
              qaytaradi, spinner esa ularning ketidan bir zumga
              chaqnab, ekran "sakragan"dek ko'rinardi. */}
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </div>
      </SidebarInset>
      {/* Panel bo'lagi birinchi drill'da keladi; shu paytgacha
          `fallback={null}` — ekranda hech narsa o'zgarmaydi. */}
      <Suspense fallback={null}>
        <DrillDrawer />
      </Suspense>
    </DrillProvider>
  </SidebarProvider>
);

export default OperationalLayout;
