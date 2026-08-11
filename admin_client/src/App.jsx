import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardLayout from './components/DashboardLayout';
import TenantsPage from './pages/TenantsPage';
import CreateTenantPage from './pages/CreateTenantPage';
import TenantDetailPage from './pages/TenantDetailPage';
import SettingsPage from './pages/SettingsPage';
import PlansPage from './pages/PlansPage';
import UsagePage from './pages/UsagePage';
import UsersPage from './pages/UsersPage';
import ApiServicesPage from './pages/ApiServicesPage';
import ApiServiceDetailPage from './pages/ApiServiceDetailPage';
import BotsPage from './pages/BotsPage';
import CreateBotPage from './pages/CreateBotPage';
import BotDetailPage from './pages/BotDetailPage';

// Mijoz kabineti
import PortalSignupPage from './portal/pages/PortalSignupPage';
import PortalHomePage from './portal/pages/PortalHomePage';

function Loading() {
  return (
    <div className="flex h-screen items-center justify-center text-muted-foreground">
      Yuklanmoqda…
    </div>
  );
}

/**
 * Faqat super admin uchun. Mijoz kirsa — o'z kabinetiga qaytariladi
 * (login sahifasiga emas: u allaqachon kirgan).
 */
function AdminOnly({ children }) {
  const { isAdmin, isCustomer, loading } = useAuth();
  if (loading) return <Loading />;
  if (isCustomer) return <Navigate to="/portal" replace />;
  if (!isAdmin) return <Navigate to="/login" replace />;
  return children;
}

/** Faqat mijoz uchun. Admin kirsa — admin paneliga. */
function CustomerOnly({ children }) {
  const { isAdmin, isCustomer, loading } = useAuth();
  if (loading) return <Loading />;
  if (isAdmin) return <Navigate to="/" replace />;
  if (!isCustomer) return <Navigate to="/login" replace />;
  return children;
}

/** Kirgan foydalanuvchiga login/signup ko'rsatilmaydi. */
function GuestOnly({ children }) {
  const { isAdmin, isCustomer, loading } = useAuth();
  if (loading) return <Loading />;
  if (isAdmin) return <Navigate to="/" replace />;
  if (isCustomer) return <Navigate to="/portal" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Yagona kirish nuqtasi */}
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <GuestOnly>
            <PortalSignupPage />
          </GuestOnly>
        }
      />

      {/* Mijoz kabineti */}
      <Route
        path="/portal"
        element={
          <CustomerOnly>
            <PortalHomePage />
          </CustomerOnly>
        }
      />

      {/* Super admin paneli */}
      <Route
        path="/"
        element={
          <AdminOnly>
            <DashboardLayout />
          </AdminOnly>
        }
      >
        <Route index element={<TenantsPage />} />
        <Route path="tenants/new" element={<CreateTenantPage />} />
        <Route path="tenants/:id" element={<TenantDetailPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="api-services" element={<ApiServicesPage />} />
        <Route path="api-services/:id" element={<ApiServiceDetailPage />} />
        <Route path="bots" element={<BotsPage />} />
        <Route path="bots/new" element={<CreateBotPage />} />
        <Route path="bots/:id" element={<BotDetailPage />} />
        <Route path="usage" element={<UsagePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
