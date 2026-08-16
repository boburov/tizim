// Router
import { Routes, Route } from "react-router-dom";

// Guards
import PermissionGuard from "@/shared/components/guards/PermissionGuard";

// Pages
import OverviewPage from "../features/overview/pages/OverviewPage";
import FinancePage from "../features/finance/pages/FinancePage";
import AcademicPage from "../features/academic/pages/AcademicPage";
import TeamPage from "../features/team/pages/TeamPage";
import InsightsPage from "../features/insights/pages/InsightsPage";
import ComparePage from "../features/compare/pages/ComparePage";
// TIZIM TAHLILI - operatsion paneldan KO'CHIRILDI.
//
// Sahifalar `owner/features/ai` da QOLADI va o'sha yerdan public API
// orqali olinadi: ular ishlaydigan kod, ularni ko'chirish yoki
// ikkilantirish sababsiz xavf bo'lardi. Bu yerda faqat MARSHRUT
// ko'chadi - ya'ni endi ular sidebar'siz rahbariyat qobig'ida
// ochiladi.
import {
  OperationsCenterPage,
  ActionCenterPage,
  AiReportsPage,
  AiReportDetailPage,
} from "@/owner/features/ai";

// Components
import NotFoundPage from "@/shared/components/ui/feedback/NotFoundPage";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";

/**
 * RAHBARIYAT MARSHRUTLARI (/admin).
 *
 * ═══════════════════════════════════════════════════════════════════
 * HAR BO'LIM QO'RIQLANADI, menyuda yashirish YETARLI EMAS.
 *
 * `executiveNav.config.js` ruxsati yo'q bo'limni menyuda ko'rsatmaydi,
 * lekin URL'ni qo'lda yozib kirish mumkin. Shu sababli bu yerdagi
 * `PermissionGuard` ruxsat kalitlari nav konfiguratsiyasidagi
 * kalitlar bilan AYNAN BIR XIL.
 *
 * (Bu qoida kodbazada allaqachon o'rnatilgan - `owner/routes/index.jsx`
 * dagi "menyuda yashirish yetarli emas" izohiga qarang.)
 * ═══════════════════════════════════════════════════════════════════
 *
 * `fallback="/owner"` - ruxsati yo'q foydalanuvchi operatsion panelga
 * tushadi, "/" GA EMAS. "/" `RoleHomeRedirect` ga boradi, u esa
 * roleMeta.defaultPath ni o'qiydi va agar u "/admin" bo'lsa halqa
 * paydo bo'lardi: /admin -> / -> /admin -> ...
 * (`app/routes.jsx` va `RoleGuard` dagi halqa izohlariga qarang -
 * WebKit bunday halqani SecurityError bilan uzadi.)
 */
const OPS_HOME = "/owner";

const AdminRoutes = () => (
  <Routes>
    <Route
      index
      element={
        <PermissionGuard
          required={PERMISSIONS.ADMIN_DASHBOARD_READ}
          fallback={OPS_HOME}
        >
          <OverviewPage />
        </PermissionGuard>
      }
    />

    <Route
      path="moliya"
      element={
        <PermissionGuard required={PERMISSIONS.FINANCE_READ} fallback={OPS_HOME}>
          <FinancePage />
        </PermissionGuard>
      }
    />

    <Route
      path="oquv"
      element={
        <PermissionGuard
          required={PERMISSIONS.ADMIN_DASHBOARD_READ}
          fallback={OPS_HOME}
        >
          <AcademicPage />
        </PermissionGuard>
      }
    />

    <Route
      path="jamoa"
      element={
        <PermissionGuard required={PERMISSIONS.SALARY_READ} fallback={OPS_HOME}>
          <TeamPage />
        </PermissionGuard>
      }
    />

    {/* FILIALLAR KESIMI. Menyuda yakka markazda ko'rinmaydi
        (`multiBranchOnly`), lekin MARSHRUT qo'riqlanmaydi-yu o'chirilmaydi
        ham: bitta filialli markazda sahifa bo'sh emas, o'sha filialning
        moliya/o'qituvchi/sotuv kesimini ko'rsatadi. */}
    <Route
      path="filiallar"
      element={
        <PermissionGuard required={PERMISSIONS.BRANCHES_READ} fallback={OPS_HOME}>
          <ComparePage />
        </PermissionGuard>
      }
    />

    <Route
      path="tavsiyalar"
      element={
        <PermissionGuard required={PERMISSIONS.AI_READ} fallback={OPS_HOME}>
          <InsightsPage />
        </PermissionGuard>
      }
    />

    <Route
      path="tahlil"
      element={
        <PermissionGuard required={PERMISSIONS.AI_READ} fallback={OPS_HOME}>
          <OperationsCenterPage />
        </PermissionGuard>
      }
    />
    {/* To'liq vazifalar ro'yxati - brifing faqat eng muhimlarini
        ko'rsatadi. */}
    <Route
      path="tahlil/vazifalar"
      element={
        <PermissionGuard required={PERMISSIONS.AI_READ} fallback={OPS_HOME}>
          <ActionCenterPage />
        </PermissionGuard>
      }
    />
    <Route
      path="tahlil/hisobotlar"
      element={
        <PermissionGuard required={PERMISSIONS.AI_READ} fallback={OPS_HOME}>
          <AiReportsPage />
        </PermissionGuard>
      }
    />
    <Route
      path="tahlil/hisobotlar/:id"
      element={
        <PermissionGuard required={PERMISSIONS.AI_READ} fallback={OPS_HOME}>
          <AiReportDetailPage />
        </PermissionGuard>
      }
    />

    {/* Noto'g'ri /admin/* manzili. `Navigate` ATAYLAB EMAS: u halqa
        xavfini qaytarardi (qarang yuqoridagi izoh va app/routes.jsx). */}
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);

export default AdminRoutes;
