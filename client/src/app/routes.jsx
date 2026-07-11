// Router
import { Routes as RoutesWrapper, Route, Navigate } from "react-router-dom";

// Guards
import AuthGuard from "@/shared/components/guards/AuthGuard";
import GuestGuard from "@/shared/components/guards/GuestGuard";
import RoleGuard from "@/shared/components/guards/RoleGuard";

// Layouts
import AuthLayout from "@/features/auth/layouts/AuthLayout";
import DashboardLayout from "@/shared/layouts/DashboardLayout";

// Hooks
import useAuth from "@/shared/hooks/useAuth";

// Constants
import { ROLES, ROLE_HOME } from "@/shared/constants/roles";

// Features
import { LoginPage, BotAuthPage } from "@/features/auth";

// Role panels
import { OwnerRoutes } from "@/owner";
import { TeacherRoutes } from "@/teacher";
import { StudentRoutes } from "@/student";

const RoleHomeRedirect = () => {
  const { role } = useAuth();
  return <Navigate to={ROLE_HOME[role] || "/login"} replace />;
};

const Routes = () => (
  <RoutesWrapper>
    {/* Telegram Mini App auto-login (public, no guards) */}
    <Route path="/bot-auth" element={<BotAuthPage />} />

    {/* Guest Guard (Auth) */}
    <Route element={<GuestGuard />}>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
    </Route>

    {/* Auth Guard Routes */}
    <Route element={<AuthGuard />}>
      <Route element={<DashboardLayout />}>
        {/* Owner */}
        <Route
          path="/owner/*"
          element={
            <RoleGuard roles={ROLES.OWNER}>
              <OwnerRoutes />
            </RoleGuard>
          }
        />

        {/* Teacher */}
        <Route
          path="/teacher/*"
          element={
            <RoleGuard roles={ROLES.TEACHER}>
              <TeacherRoutes />
            </RoleGuard>
          }
        />

        {/* Student */}
        <Route
          path="/student/*"
          element={
            <RoleGuard roles={ROLES.STUDENT}>
              <StudentRoutes />
            </RoleGuard>
          }
        />
        <Route path="/" element={<RoleHomeRedirect />} />
      </Route>
    </Route>

    {/* 404 */}
    <Route path="*" element={<Navigate to="/" replace />} />
  </RoutesWrapper>
);

export default Routes;
