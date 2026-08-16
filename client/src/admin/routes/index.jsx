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

    <Route
      path="tavsiyalar"
      element={
        <PermissionGuard required={PERMISSIONS.AI_READ} fallback={OPS_HOME}>
          <InsightsPage />
        </PermissionGuard>
      }
    />

    {/* Noto'g'ri /admin/* manzili. `Navigate` ATAYLAB EMAS: u halqa
        xavfini qaytarardi (qarang yuqoridagi izoh va app/routes.jsx). */}
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);

export default AdminRoutes;
