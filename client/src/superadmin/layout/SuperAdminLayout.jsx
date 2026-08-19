import { lazy, Suspense } from "react";

import { DrillProvider } from "@/shared/drill";

import SuperAdminHeader from "./SuperAdminHeader";
import SuperAdminSidebar from "./SuperAdminSidebar";

/**
 * ══════════════════════════════════════════════════════════════════════
 * SUPER ADMIN QOBIG'I — ALOHIDA ILOVA QOBIG'I
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA `OperationalLayout` EMAS ──
 * Operatsion qobiq (Admin paneli) — `SidebarProvider` + `AppSidebar` +
 * `AppHeader`: yig'iladigan menyu, filial tanlagich, qidiruv, yaratish
 * tugmasi, saqlagich kvotasi, tasdiqlar qo'ng'irog'i. Bularning hammasi
 * KUNDALIK ISH uchun.
 *
 * Agar Super Admin ham shu qobiqda tursa — u qanchalik boshqa menyu
 * ko'rsatilmasin — natija "tugmalari boshqacha Admin paneli" bo'lardi.
 * Foydalanuvchi qaysi panelda ekanini SHAKLDAN bilishi kerak, menyu
 * matnini o'qib emas.
 *
 * ── NIMASI BOSHQA ──
 *   • Sarlavha butun kenglikda va u yerda MOLIYA turadi
 *   • Chap ustun uch yozuvli, yig'ilmaydi, filial tanlagichi yo'q
 *   • Yaratish menyusi/qidiruv yo'q — bular operatsion amallar
 *
 * ── NIMASI BIR XIL VA NEGA ──
 * Drill paneli (`DrillProvider` + `DrillDrawer`) IKKALA qobiqda ham
 * bor. Bu takror emas: "bu raqam qayerdan keldi?" — panelga bog'liq
 * savol emas. Zanjir bitta reyestrdan (`shared/drill/drillNodes.js`)
 * quriladi, ya'ni ikkala panelda AYNAN bir xil yo'l ochiladi.
 *
 * Yaratish MODALLARI ham shu yerda mount qilinadi: filial va xona
 * qo'shish Super Admin panelining o'z ishi (talab 7, 10). Ular
 * `shared/components/create` da — Admin paneli bilan bitta forma,
 * ikkinchi nusxa emas.
 */
const DrillDrawer = lazy(() => import("@/shared/drill/DrillDrawer"));
const CreateModals = lazy(() => import("@/shared/components/create/CreateModals"));

const SuperAdminLayout = ({ children }) => (
  <DrillProvider>
    {/* Sarlavha BUTUN kenglikda, menyu esa uning OSTIDA. Bu tartib
        Admin panelidan ko'zga tashlanadigan darajada boshqa: u yerda
        sidebar to'liq balandlikda, sarlavha esa faqat mobil ekranda
        chiqadi. */}
    <div className="flex min-h-dvh flex-col bg-background">
      <SuperAdminHeader />

      <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
        <SuperAdminSidebar />
        <main className="min-w-0 flex-1 p-4 sm:p-5">
          {/* Marshrut daraxti `lazy()` bilan keladi; chegara SAHIFA
              o'rnida — sarlavha va menyu joyida qoladi. */}
          <Suspense fallback={null}>{children}</Suspense>
        </main>
      </div>
    </div>

    <Suspense fallback={null}>
      <CreateModals />
      <DrillDrawer />
    </Suspense>
  </DrillProvider>
);

export default SuperAdminLayout;
