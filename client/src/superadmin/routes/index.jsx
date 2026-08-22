import { Routes, Route, Navigate, useParams } from "react-router-dom";

import PermissionGuard from "@/shared/components/guards/PermissionGuard";
import NotFoundPage from "@/shared/components/ui/feedback/NotFoundPage";
import { PERMISSIONS } from "@/shared/constants/permissions";

import AsosiyPage from "../pages/AsosiyPage";
import MoliyaPage from "../pages/MoliyaPage";
import FiliallarPage from "../pages/FiliallarPage";
import BranchDetailPage from "../pages/BranchDetailPage";
import TizimTahliliPage from "../pages/TizimTahliliPage";
import VakolatlarPage from "../pages/VakolatlarPage";
import RoomAnalyticsPage from "../pages/RoomAnalyticsPage";
import { MyInboxPage } from "@/owner/features/notifications";

/**
 * ══════════════════════════════════════════════════════════════════════
 * SUPER ADMIN MARSHRUTLARI
 * ══════════════════════════════════════════════════════════════════════
 *
 * Beshta manzil, boshqa hech narsa:
 *
 *   /org               Asosiy         — biznes qanday ketyapti
 *   /org/moliya        Moliya         — sarlavhadagi yo'nalish
 *   /org/filiallar     Filiallar      — ro'yxat + taqqoslash
 *   /org/filiallar/:id Filial ichi    — xonalar, odamlar, moliya, tahlil
 *   /org/tahlil        Tizim tahlili  — tashkilot ko'lamida
 *   /org/vakolatlar    Vakolatlar     — sarlavha menyusidan
 *
 * ── QO'RIQCHI XAVFSIZLIK EMAS ──
 * `PermissionGuard` odamni tushunarli joyga olib boradi, xolos.
 * Ma'lumotni server qo'riqlaydi: har so'rovda rol + ruxsat + filial
 * ko'lami tekshiriladi va ruxsatsiz so'rov 403 qaytaradi.
 *
 * ── ESKI MANZILLAR ──
 * `/org/branches`, `/org/finance`, `/org/analytics` va boshqalar bir
 * necha kun ishlagan va xatcho'p qilingan bo'lishi mumkin. Ular
 * yo'naltiriladi, o'chirilmaydi: buzilgan havola foydalanuvchiga
 * "tizim ishonchsiz" degan xabar beradi, yo'naltirish esa hech kimga
 * zarar qilmaydi.
 */

const ORG_HOME = "/org";

const G = ({ required, anyOf, children }) => (
  <PermissionGuard required={required} anyOf={anyOf} fallback={ORG_HOME}>
    {children}
  </PermissionGuard>
);

/** Eski `/org/branches/:id` — parametr bilan birga ko'chiriladi. */
const BranchRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/org/filiallar/${id}`} replace />;
};

const SuperAdminRoutes = () => (
  <Routes>
    <Route index element={<AsosiyPage />} />

    <Route
      path="moliya"
      element={<G required={PERMISSIONS.FINANCE_READ}><MoliyaPage /></G>}
    />

    <Route
      path="filiallar"
      element={<G required={PERMISSIONS.BRANCHES_READ}><FiliallarPage /></G>}
    />
    <Route
      path="filiallar/:id"
      element={<G required={PERMISSIONS.BRANCHES_READ}><BranchDetailPage /></G>}
    />

    <Route
      path="tahlil"
      element={
        <G
          anyOf={[
            PERMISSIONS.AI_READ,
            PERMISSIONS.ADMIN_DASHBOARD_READ,
            PERMISSIONS.FINANCE_VIEW_PROFITABILITY,
          ]}
        >
          <TizimTahliliPage />
        </G>
      }
    />

    <Route
      path="vakolatlar"
      element={<G required={PERMISSIONS.ROLES_READ}><VakolatlarPage /></G>}
    />

    <Route
      path="rooms/analytics"
      element={<G required={PERMISSIONS.CLASSES_READ}><RoomAnalyticsPage /></G>}
    />

    {/* XABARLAR — sarlavhadagi qo'ng'iroq shu yerga olib keladi.
        Ilgari u `/owner/inbox` ga ketardi, ya'ni Super Admin uchun
        O'LIK havola edi: `AdminPanelGuard` uni darhol qaytarardi.
        Sahifa AYNI o'sha — nusxa yaratilmadi. */}
    <Route path="xabarlar" element={<MyInboxPage />} />

    {/* ── ESKI MANZILLAR ── */}
    <Route path="branches" element={<Navigate to="/org/filiallar" replace />} />
    <Route path="branches/:id" element={<BranchRedirect />} />
    <Route path="finance" element={<Navigate to="/org/moliya" replace />} />
    <Route path="analytics" element={<Navigate to="/org/tahlil" replace />} />
    <Route path="permissions" element={<Navigate to="/org/vakolatlar" replace />} />
    {/* ODAMLAR VA OPERATSIYA — Admin panelining ishi, lekin Super
        Admin u yerga kira olmaydi (`AdminPanelGuard`). Shuning uchun
        bu manzillar `/org` ICHIDA qoladi: filial jamoasi filial
        kartasining "Odamlar" tabida. */}
    <Route path="people" element={<Navigate to="/org/filiallar" replace />} />
    <Route path="operations" element={<Navigate to="/org" replace />} />

    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);

export default SuperAdminRoutes;
