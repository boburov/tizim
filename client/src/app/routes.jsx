// Router
import { Routes as RoutesWrapper, Route, Navigate } from "react-router-dom";

// Guards
import AuthGuard from "@/shared/components/guards/AuthGuard";
import GuestGuard from "@/shared/components/guards/GuestGuard";
import RoleGuard from "@/shared/components/guards/RoleGuard";
import AccessDenied from "@/shared/components/guards/AccessDenied";

// Components
import NotFoundPage from "@/shared/components/ui/feedback/NotFoundPage";

// Layouts
import AuthLayout from "@/features/auth/layouts/AuthLayout";
import OperationalLayout from "@/shared/layouts/OperationalLayout";

// Hooks
import useAuth from "@/shared/hooks/useAuth";

// Constants
import { ROLES, resolveHomePath } from "@/shared/constants/roles";

// Features
import { LoginPage, BotAuthPage } from "@/features/auth";

// Role panels
import { OwnerRoutes } from "@/owner";
import { TeacherRoutes } from "@/teacher";
import { StudentRoutes } from "@/student";

// Rahbariyat qobig'i (rol emas - qarash nuqtasi, qarang admin/index.js)
import { AdminRoutes, ExecutiveLayout } from "@/admin";

const RoleHomeRedirect = () => {
  const { role, roleType, homePath, isLoading } = useAuth();
  if (isLoading) return null;
  if (!role) return <Navigate to="/login" replace />;

  const target = resolveHomePath({ defaultPath: homePath, role, roleType });
  // Landing sahifa "/" ning o'zi bo'lsa - bu sahifa o'zini o'zi cheksiz
  // qayta chaqirardi ("*" -> "/" -> "/" -> ...). WebKit bunday halqani
  // SecurityError bilan uzadi va ilova qulaydi.
  if (target === "/") return <AccessDenied />;

  return <Navigate to={target} replace />;
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
      {/* ═══ RAHBARIYAT QOBIG'I - SIDEBAR YO'Q ═══

          `OperationalLayout` DAN TASHQARIDA turishi SHART. U
          `SidebarProvider` bilan o'raladi va `AppHeader` `useSidebar()`
          ni chaqiradi - ya'ni ichkarida "sidebar'ni yashirish" degan
          narsa yo'q, provider baribir qoladi (Ctrl+B ko'rinmas panelni
          ochib yuborardi, `SidebarRail` esa chetda bosiladigan zona
          bo'lib turardi).

          Ikkalasi ham `AuthGuard` ICHIDA: kirmagan foydalanuvchi
          rahbariyat ekraniga ham tushmasligi kerak. Bo'lim ruxsatlari
          esa `admin/routes/index.jsx` da (har bo'lim alohida). */}
      <Route element={<ExecutiveLayout />}>
        <Route path="/admin/*" element={<AdminRoutes />} />
      </Route>

      <Route element={<OperationalLayout />}>
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

    {/* 404.
        DIQQAT: bu yerda `<Navigate to="/">` BO'LMASIN. Rolning landing
        sahifasi (`roleMeta.defaultPath`) hech qaysi route'ga to'g'ri
        kelmasa - masalan "/dashboard" deb yozilgan bo'lsa - halqa yopilardi:
          "/" -> RoleHomeRedirect -> "/dashboard" -> "*" -> "/" -> ...
        Har qadam `history.replaceState()`, WebKit esa 10 soniyada 100 tadan
        keyin SecurityError otib butun ilovani yiqitadi (Telegram mini ilova
        aynan shundan qulagan; Chrome xuddi shu halqani jimgina aylantiradi).
        404 sahifasi halqani uzadi va yo'l noto'g'ri ekanini ochiq aytadi. */}
    <Route path="*" element={<NotFoundPage />} />
  </RoutesWrapper>
);

export default Routes;
