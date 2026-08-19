import { Routes, Route, Navigate } from "react-router-dom";

import PermissionGuard from "@/shared/components/guards/PermissionGuard";
import NotFoundPage from "@/shared/components/ui/feedback/NotFoundPage";
import { PERMISSIONS } from "@/shared/constants/permissions";

// ── TASHKILOT (Super Admin) ──
import OrgOverviewPage from "./org/pages/OrgOverviewPage";
import OrgBranchesPage from "./org/pages/OrgBranchesPage";
import OrgBranchDetailPage from "./org/pages/OrgBranchDetailPage";
import OrgPeoplePage from "./org/pages/OrgPeoplePage";
import OrgFinancePage from "./org/pages/OrgFinancePage";
import OrgOperationsPage from "./org/pages/OrgOperationsPage";
import OrgAnalyticsPage from "./org/pages/OrgAnalyticsPage";
import OrgPermissionsPage from "./org/pages/OrgPermissionsPage";

// ── FILIAL (Admin) ──
import BranchTodayPage from "./branch/pages/BranchTodayPage";
import BranchCollectionsPage from "./branch/pages/BranchCollectionsPage";
import BranchFinancePage from "./branch/pages/BranchFinancePage";
import BranchSchedulePage from "./branch/pages/BranchSchedulePage";

// ── ISH JOYI (Staff) ──
import WorkHomePage from "./work/pages/WorkHomePage";
import WorkGroupsPage from "./work/pages/WorkGroupsPage";
import WorkStudentsPage from "./work/pages/WorkStudentsPage";
import WorkSchedulePage from "./work/pages/WorkSchedulePage";

// ── MENING SAHIFAM (Student) ──
import MyHomePage from "./me/pages/MyHomePage";
import MyPaymentsPage from "./me/pages/MyPaymentsPage";
import MySchedulePage from "./me/pages/MySchedulePage";

/**
 * ══════════════════════════════════════════════════════════════════════
 * ISH MAKONLARI MARSHRUTLARI
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── QO'RIQLASH: MENYUDA YASHIRISH YETARLI EMAS ──
 * Har bo'lim `PermissionGuard` ostida va kalitlar navigatsiyadagilar
 * bilan AYNAN bir xil. Menyu ko'rsatmasligi mumkin, lekin URL ni
 * qo'lda yozib kirish har doim mumkin.
 *
 * VA BU HAM XAVFSIZLIK EMAS — bu faqat xushmuomalalik: server har
 * so'rovni o'zi tekshiradi va 403 qaytaradi. Qo'riqchi shunchaki
 * foydalanuvchini bo'sh ekranga emas, tushunarli joyga olib boradi.
 *
 * ── `fallback` NEGA ANIQ MANZIL ──
 * "/" ga yuborish HALQA xavfini tug'diradi: "/" `RoleHomeRedirect` ga
 * boradi, u esa rolning landing sahifasini o'qiydi — agar u aynan
 * shu qo'riqlangan sahifa bo'lsa, aylanish boshlanadi. WebKit bunday
 * halqani SecurityError bilan uzadi (qarang app/routes.jsx).
 */

const ORG_HOME = "/org";
const G = ({ required, anyOf, fallback = ORG_HOME, children }) => (
  <PermissionGuard required={required} anyOf={anyOf} fallback={fallback}>
    {children}
  </PermissionGuard>
);

export const OrgRoutes = () => (
  <Routes>
    <Route index element={<OrgOverviewPage />} />

    <Route
      path="branches"
      element={<G required={PERMISSIONS.BRANCHES_READ}><OrgBranchesPage /></G>}
    />
    <Route
      path="branches/:id"
      element={<G required={PERMISSIONS.BRANCHES_READ}><OrgBranchDetailPage /></G>}
    />
    <Route
      path="people"
      element={<G required={PERMISSIONS.USERS_READ}><OrgPeoplePage /></G>}
    />
    <Route
      path="finance"
      element={<G required={PERMISSIONS.FINANCE_READ}><OrgFinancePage /></G>}
    />
    <Route
      path="operations"
      element={
        <G anyOf={[
          PERMISSIONS.STUDENTS_READ, PERMISSIONS.GROUPS_READ,
          PERMISSIONS.ATTENDANCE_READ, PERMISSIONS.LEADS_READ,
        ]}>
          <OrgOperationsPage />
        </G>
      }
    />
    <Route
      path="analytics"
      element={
        <G required={PERMISSIONS.FINANCE_VIEW_PROFITABILITY}><OrgAnalyticsPage /></G>
      }
    />
    <Route
      path="permissions"
      element={<G required={PERMISSIONS.ROLES_READ}><OrgPermissionsPage /></G>}
    />

    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);

export const BranchRoutes = () => (
  <Routes>
    <Route index element={<BranchTodayPage />} />
    <Route
      path="collections"
      element={
        <G required={PERMISSIONS.FINANCE_VIEW_RECEIVABLES} fallback="/branch">
          <BranchCollectionsPage />
        </G>
      }
    />
    <Route
      path="finance"
      element={
        <G required={PERMISSIONS.FINANCE_READ} fallback="/branch">
          <BranchFinancePage />
        </G>
      }
    />
    <Route
      path="schedule"
      element={
        <G required={PERMISSIONS.GROUPS_READ} fallback="/branch">
          <BranchSchedulePage />
        </G>
      }
    />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);

export const WorkRoutes = () => (
  <Routes>
    <Route index element={<WorkHomePage />} />
    <Route
      path="groups"
      element={
        <G required={PERMISSIONS.GROUPS_READ} fallback="/work"><WorkGroupsPage /></G>
      }
    />
    <Route
      path="students"
      element={
        <G required={PERMISSIONS.GROUPS_READ} fallback="/work"><WorkStudentsPage /></G>
      }
    />
    <Route path="schedule" element={<WorkSchedulePage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);

export const MeRoutes = () => (
  <Routes>
    <Route index element={<MyHomePage />} />
    <Route path="payments" element={<MyPaymentsPage />} />
    <Route path="schedule" element={<MySchedulePage />} />
    {/* O'quvchi paneli sahifalari o'z manzilida qoladi (talab 32) —
        bu yerdan ularga YO'NALTIRILADI, nusxa yaratilmaydi. */}
    <Route path="learning" element={<Navigate to="/student/group" replace />} />
    <Route path="attendance" element={<Navigate to="/student/attendance" replace />} />
    <Route path="progress" element={<Navigate to="/student/rating" replace />} />
    <Route path="profile" element={<Navigate to="/student/profile" replace />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);
