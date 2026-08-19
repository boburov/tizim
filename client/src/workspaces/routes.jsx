import { Routes, Route, Navigate } from "react-router-dom";

import PermissionGuard from "@/shared/components/guards/PermissionGuard";
import NotFoundPage from "@/shared/components/ui/feedback/NotFoundPage";
import { PERMISSIONS } from "@/shared/constants/permissions";

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
 * XODIM VA O'QUVCHI SAHIFALARI
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── BU YERDA NIMA QOLDI ──
 * Faqat `/work` (xodim) va `/me` (o'quvchi). Ular o'zgartirilmadi va
 * bu ATAYLAB: ikkalasi ham ishlab turibdi, ularni qayta ko'rib chiqish
 * boshqa ishning mavzusi.
 *
 * ── NIMA KETDI VA QAYERGA ──
 *   `/org/*`     → Super Admin paneli, o'z qobig'i bilan
 *                  (`superadmin/`) — u endi "ish makoni" emas,
 *                  ALOHIDA ilova qobig'i.
 *   `/branch/*`  → Admin paneliga qaytarildi (`/owner/*`). U mavjud
 *                  panelni almashtirishga urinardi va natijada
 *                  administrator ikkita yarim panel bilan qolgandi.
 *                  Manzillar `app/routes.jsx` da yo'naltiriladi.
 *
 * ── QO'RIQLASH ──
 * Har bo'lim `PermissionGuard` ostida. BU XAVFSIZLIK EMAS — server
 * har so'rovni o'zi tekshiradi va 403 qaytaradi. Qo'riqchi faqat
 * foydalanuvchini bo'sh ekranga emas, tushunarli joyga olib boradi.
 *
 * ── `fallback` NEGA ANIQ MANZIL ──
 * "/" ga yuborish HALQA xavfini tug'diradi: "/" `RoleHomeRedirect` ga
 * boradi, u esa rolning bosh sahifasini o'qiydi — agar u aynan shu
 * qo'riqlangan sahifa bo'lsa, aylanish boshlanadi. WebKit bunday
 * halqani SecurityError bilan uzadi (qarang app/routes.jsx).
 */

const G = ({ required, anyOf, fallback, children }) => (
  <PermissionGuard required={required} anyOf={anyOf} fallback={fallback}>
    {children}
  </PermissionGuard>
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
    {/* O'quvchi paneli sahifalari o'z manzilida qoladi — bu yerdan
        ularga YO'NALTIRILADI, nusxa yaratilmaydi. */}
    <Route path="learning" element={<Navigate to="/student/group" replace />} />
    <Route path="attendance" element={<Navigate to="/student/attendance" replace />} />
    <Route path="progress" element={<Navigate to="/student/rating" replace />} />
    <Route path="profile" element={<Navigate to="/student/profile" replace />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);
