// Router
import { lazy } from "react";
import { Routes as RoutesWrapper, Route, Navigate, useParams } from "react-router-dom";

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
import useWorkspace from "@/shared/hooks/useWorkspace";

// Constants
import { ROLES } from "@/shared/constants/roles";

// Features
import { LoginPage, BotAuthPage } from "@/features/auth";

import WorkspaceGuard from "@/shared/components/guards/WorkspaceGuard";
import { WORKSPACES } from "@/shared/workspaces";

/**
 * ══════════════════════════════════════════════════════════════════════
 * MARSHRUT DARAJASIDA KOD BO'LAKLARGA AJRATILADI
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA ──
 * Butun ilova bitta faylda edi. O'quvchi "qarzim bormi?" degan bitta
 * savolga javob olish uchun ham moliya tahlilini, rol tahrirlagichini
 * va filial taqqoslashni yuklab olardi — u hech qachon ko'rmaydigan
 * ekranlarni. Telegram mini ilovada (mobil internet) bu birinchi
 * ekrangacha bo'lgan kutishni sezilarli uzaytiradi.
 *
 * ── NEGA AYNAN SHU CHEGARADA ──
 * Ish makoni — TABIIY chegara: foydalanuvchi bir vaqtda faqat
 * BITTASIDA bo'ladi va boshqasiga o'ta olmaydi (`WorkspaceGuard`).
 * Ya'ni yuklanmagan bo'lak unga umuman kerak emas.
 *
 * ── `fallback={null}` NEGA ──
 * Qo'riqchilar (`AuthGuard`, `WorkspaceGuard`) yuklanish paytida
 * allaqachon `null` qaytaradi. Spinner qo'shilsa, u qo'riqchi
 * `null` idan KEYIN bir zumga chaqnab, ekran "sakragan"dek
 * ko'rinardi. Bo'lak mahalliy tarmoqda ~10ms da keladi.
 */
const OwnerRoutes = lazy(() => import("@/owner/routes"));
const TeacherRoutes = lazy(() => import("@/teacher/routes"));
const StudentRoutes = lazy(() => import("@/student/routes"));

const OrgRoutes = lazy(() =>
  import("@/workspaces/routes").then((m) => ({ default: m.OrgRoutes })));
const BranchRoutes = lazy(() =>
  import("@/workspaces/routes").then((m) => ({ default: m.BranchRoutes })));
const WorkRoutes = lazy(() =>
  import("@/workspaces/routes").then((m) => ({ default: m.WorkRoutes })));
const MeRoutes = lazy(() =>
  import("@/workspaces/routes").then((m) => ({ default: m.MeRoutes })));


/**
 * BOSH SAHIFA — ENDI ISH MAKONIDAN ANIQLANADI.
 *
 * ── NEGA `roleMeta.defaultPath` EMAS ──
 * U ROLGA yozilgan qiymat va u rol yaratilganda tanlanadi. Lekin
 * odamning ish makoni RUXSATLARIDAN kelib chiqadi va u keyin
 * o'zgarishi mumkin: egasi direktorga `admin_dashboard.read` bersa,
 * u filial makoniga o'tadi — lekin `defaultPath` eski holicha
 * qolardi va odam har login'dan keyin noto'g'ri joyga tushardi.
 *
 * Ish makoni HISOBLANADI, ya'ni u har doim ruxsatlarga mos keladi.
 *
 * `AccessDenied` — makon aniqlanmagan holat uchun zaxira. Halqa
 * xavfi yo'q: makon home'lari ("/org", "/branch", "/work", "/me")
 * "/" ga hech qachon teng bo'lmaydi.
 */
/**
 * `/admin/tahlil/hisobotlar/:id` → `/owner/ai/reports/:id`.
 *
 * `Navigate` parametrni o'zi ko'chira olmaydi — shuning uchun kichik
 * komponent. Hisobot havolasi elektron pochtada va Telegram'da
 * yuborilgan bo'lishi mumkin, ya'ni u ishlashda davom etishi kerak.
 */
const AiReportRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/owner/ai/reports/${id}`} replace />;
};

const RoleHomeRedirect = () => {
  const { role } = useAuth();
  const { home, isLoading } = useWorkspace();
  if (isLoading) return null;
  if (!role) return <Navigate to="/login" replace />;
  if (!home || home === "/") return <AccessDenied />;

  return <Navigate to={home} replace />;
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
      {/* ═══ ESKI RAHBARIYAT QOBIG'I (`/admin`) — YO'NALTIRILDI ═══

          Qobiq O'CHIRILDI, manzillar QOLDI (talab 32): eski xatcho'q,
          eski hisobotdagi havola va brauzer tarixi ishlashda davom
          etadi.

          NEGA QOBIQ O'CHIRILDI: u ikkinchi axborot arxitekturasi edi —
          o'z navigatsiyasi, o'z sarlavhasi, sidebari yo'q. Ilovada
          ikkita tuzilma bo'lgani uchun foydalanuvchi qaysi birida
          ekanini yo'qotardi va ikkalasida ham «asosiy ekran» bor edi.
          Uning barcha bo'limlari endi TASHKILOT makonining tab'lari.

          `/admin/tahlil*` esa `/owner/ai*` ga ketadi: o'sha sahifalar
          ALLAQACHON o'sha manzilda yashaydi (bu yerda faqat marshrut
          takrorlangan edi), ya'ni yo'naltirish nusxani ham yo'q
          qiladi. */}
      <Route path="/admin" element={<Navigate to="/org" replace />} />
      <Route path="/admin/moliya" element={<Navigate to="/org/branches?tab=pnl" replace />} />
      <Route path="/admin/filiallar" element={<Navigate to="/org/branches?tab=cross" replace />} />
      <Route path="/admin/oquv" element={<Navigate to="/org/analytics?tab=academic" replace />} />
      <Route path="/admin/jamoa" element={<Navigate to="/org/analytics?tab=team" replace />} />
      <Route path="/admin/tavsiyalar" element={<Navigate to="/org/analytics?tab=insights" replace />} />
      <Route path="/admin/tahlil" element={<Navigate to="/owner/ai" replace />} />
      <Route path="/admin/tahlil/vazifalar" element={<Navigate to="/owner/ai/tasks" replace />} />
      <Route path="/admin/tahlil/hisobotlar" element={<Navigate to="/owner/ai/reports" replace />} />
      <Route path="/admin/tahlil/hisobotlar/:id" element={<AiReportRedirect />} />
      {/* Noma'lum `/admin/...` — tashkilot makoniga. */}
      <Route path="/admin/*" element={<Navigate to="/org" replace />} />

      <Route element={<OperationalLayout />}>
        {/* ═══ ISH MAKONLARI — YANGI AXBOROT ARXITEKTURASI ═══

            To'rt makon, to'rt tuzilma. Qobiq (sidebar) `useWorkspace`
            dan keladi, ya'ni bu marshrutlar ham, eski `/owner/*`
            sahifalari ham AYNI menyu bilan ochiladi — foydalanuvchi
            qayerdaligini yo'qotmaydi.

            `WorkspaceGuard` — xushmuomalalik qatlami: boshqa makon
            manzilini ochgan odam o'z sahifasiga qaytariladi. Ma'lumot
            himoyasi serverda. */}
        <Route
          path="/org/*"
          element={
            <WorkspaceGuard allow={WORKSPACES.SUPER_ADMIN}>
              <OrgRoutes />
            </WorkspaceGuard>
          }
        />
        <Route
          path="/branch/*"
          element={
            /* Ega ham filial ekranini ochishi mumkin: u bitta filialga
               "kirib" ishlashi normal holat. Teskarisi emas. */
            <WorkspaceGuard allow={[WORKSPACES.ADMIN, WORKSPACES.SUPER_ADMIN]}>
              <BranchRoutes />
            </WorkspaceGuard>
          }
        />
        <Route
          path="/work/*"
          element={
            <WorkspaceGuard
              allow={[WORKSPACES.STAFF, WORKSPACES.ADMIN, WORKSPACES.SUPER_ADMIN]}
            >
              <WorkRoutes />
            </WorkspaceGuard>
          }
        />
        <Route
          path="/me/*"
          element={
            <WorkspaceGuard allow={WORKSPACES.STUDENT}>
              <MeRoutes />
            </WorkspaceGuard>
          }
        />

        {/* ═══ OPERATSION SAHIFALAR (eski manzillar, talab 32) ═══

            Bu marshrutlar O'CHIRILMADI: o'quvchi kartasi, guruh
            kartasi, sozlamalar va o'nlab chuqur sahifa shu yerda
            yashaydi va ish makonlari ularga HAVOLA qiladi — nusxa
            yaratilmaydi.

            QO'RIQCHI ROLDAN ISH MAKONIGA KO'CHDI. Eski `RoleGuard`
            `roleMeta.defaultPath` satriga tayanardi: direktor
            "/owner" ga faqat defaultPath aynan shunday yozilgani
            uchun kirardi. Rol sozlamasidagi bitta satr o'zgarsa,
            butun panel yopilib qolardi — va buni hech qanday
            tekshiruv tutmasdi.

            O'qituvchi ATAYLAB chiqarilgan: unda o'z paneli bor
            (`/teacher/*`) va operatsion panel unga ilgari ham
            yopiq edi. */}
        <Route
          path="/owner/*"
          element={
            <WorkspaceGuard
              allow={[WORKSPACES.SUPER_ADMIN, WORKSPACES.ADMIN, WORKSPACES.STAFF]}
              excludeTeacher
            >
              <OwnerRoutes />
            </WorkspaceGuard>
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
