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
import SuperAdminGuard from "@/shared/components/guards/SuperAdminGuard";
import AdminPanelGuard from "@/shared/components/guards/AdminPanelGuard";
import SuperAdminLayout from "@/superadmin/layout/SuperAdminLayout";
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

const SuperAdminRoutes = lazy(() => import("@/superadmin/routes"));
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

/**
 * ESKI `/admin/tahlil` — TIZIM TAHLILIGA, LEKIN QAYSI PANELDA?
 *
 * Bu manzil ikkala auditoriyaga ham tegishli: ega ham, direktor ham
 * "tizim tahlili" ni ochmoqchi. Lekin ular BOSHQA panelda ishlaydi va
 * bir-birinikiga kira olmaydi.
 *
 * Qat'iy manzil yozilsa, ulardan bittasi HAR DOIM noto'g'ri joyga
 * tushardi: `/owner/tahlil` yozilsa ega `AdminPanelGuard` dan
 * qaytarilardi, `/org/tahlil` yozilsa direktor `SuperAdminGuard` dan.
 * Ikkala holatda ham odam bosh sahifada paydo bo'lib, nima
 * bo'lganini tushunmasdi.
 *
 * Shuning uchun yo'nalish ODAMGA qarab tanlanadi. Sahifa mazmuni
 * ikkalasida ham AYNI (`SystemAnalysisTabs`) — faqat ko'lam boshqa.
 */
/**
 * ⚠ ENDI DOIM `/owner/tahlil`.
 *
 * Ilgari bu yerda odam tashkilot darajasidami deb tekshirilardi va ega
 * `/org/tahlil` ga yuborilardi — chunki `/owner/*` unga YOPIQ edi.
 * Endi yopiq emas: ega `/owner` da yashaydi (`resolveWorkspace`), ya'ni
 * bu ayirish faqat qo'shimcha sakrash bo'lib qolardi.
 *
 * Sahifa mazmuni ikkalasida ham AYNI (`SystemAnalysisTabs`) — faqat
 * ko'lam boshqa, uni esa server aniqlaydi.
 */
/**
 * `/admin/tahlil` — kimga qarab ayriladi.
 *
 * ⚠ Filialli tarifdagi ega uchun `/org/tahlil`: u `/owner/*` ga kira
 * olmaydi (`AdminPanelGuard`), ya'ni `/owner/tahlil` ga yuborsak odam
 * darhol `/org` ga qaytarilardi — IKKI SAKRASH va noto'g'ri sahifa.
 * Qolgan hamma uchun `/owner/tahlil` (bir xil komponent, ko'lami
 * serverda qo'llanadi).
 */
const AnalysisRedirect = () => {
  const auth = useAuth();
  if (auth.isLoading) return null;

  const type = auth.roleType || auth.role;
  const toOrg = auth.branchesEnabled && type === ROLES.OWNER;

  return <Navigate to={toOrg ? "/org/tahlil" : "/owner/tahlil"} replace />;
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
      <Route path="/admin/moliya" element={<Navigate to="/org/filiallar?tab=pnl" replace />} />
      <Route path="/admin/filiallar" element={<Navigate to="/org/filiallar?tab=cross" replace />} />
      <Route path="/admin/oquv" element={<Navigate to="/org/tahlil?tab=academic" replace />} />
      <Route path="/admin/jamoa" element={<Navigate to="/org/tahlil?tab=team" replace />} />
      <Route path="/admin/tavsiyalar" element={<Navigate to="/org/tahlil?tab=insights" replace />} />
      {/* TAHLIL — foydalanuvchiga qarab ayriladi (`AnalysisRedirect`).
          `/owner/ai*` marshrutlari O'Z JOYIDA qoladi. */}
      <Route path="/admin/tahlil" element={<AnalysisRedirect />} />
      <Route path="/admin/tahlil/vazifalar" element={<Navigate to="/owner/ai/tasks" replace />} />
      <Route path="/admin/tahlil/hisobotlar" element={<Navigate to="/owner/ai/reports" replace />} />
      <Route path="/admin/tahlil/hisobotlar/:id" element={<AiReportRedirect />} />
      {/* Noma'lum `/admin/...` — tashkilot makoniga. */}
      <Route path="/admin/*" element={<Navigate to="/org" replace />} />

      {/* ══════════════════════════════════════════════════════════════
          SUPER ADMIN PANELI — ALOHIDA QOBIQ
          ══════════════════════════════════════════════════════════════

          `OperationalLayout` DAN TASHQARIDA turishi SHART. U hamma
          narsani `SidebarProvider` ichiga o'raydi va `AppHeader`
          `useSidebar()` ni chaqiradi — ya'ni sidebarni "ichkaridan
          yashirish" mumkin emas: provider ham, `Ctrl+B` ham,
          `SidebarRail` ham joyida qolardi.

          Bu ikki panelning HAQIQATAN alohida ekanini ta'minlaydigan
          yagona joy. Ular bir xil qobiqda tursa, qancha menyu
          o'zgartirilmasin, natija "tugmalari boshqacha Admin paneli"
          bo'lardi. */}
      <Route
        path="/org/*"
        element={
          <SuperAdminGuard>
            <SuperAdminLayout>
              <SuperAdminRoutes />
            </SuperAdminLayout>
          </SuperAdminGuard>
        }
      />

      <Route element={<OperationalLayout />}>
        {/* ═══ ISH MAKONLARI — YANGI AXBOROT ARXITEKTURASI ═══

            To'rt makon, to'rt tuzilma. Qobiq (sidebar) `useWorkspace`
            dan keladi, ya'ni bu marshrutlar ham, eski `/owner/*`
            sahifalari ham AYNI menyu bilan ochiladi — foydalanuvchi
            qayerdaligini yo'qotmaydi.

            `WorkspaceGuard` — xushmuomalalik qatlami: boshqa makon
            manzilini ochgan odam o'z sahifasiga qaytariladi. Ma'lumot
            himoyasi serverda. */}
        {/* ═══ ESKI `/branch` QOBIG'I — ADMIN PANELIGA QAYTARILDI ═══

            `/branch/*` Admin panelini ALMASHTIRISHGA urinardi: o'z
            "Bugun" ekrani, o'z undirish sahifasi, o'z jadvali — lekin
            o'quvchi, guruh, davomat va sozlamalar baribir `/owner/*`
            da qolardi. Ya'ni bitta administrator IKKITA yarim panel
            bilan ishlardi va qaysi biri "asosiy" ekani noaniq edi.

            Admin paneli — `/owner/*`. Uning sahifalari o'sha yerda va
            o'sha nomda qoladi; bu yerdagi manzillar esa xatcho'q va
            eski havolalar uchun yo'naltiriladi. */}
        <Route path="/branch" element={<Navigate to="/owner/dashboard" replace />} />
        <Route path="/branch/collections" element={<Navigate to="/owner/finance/undirish" replace />} />
        <Route path="/branch/finance" element={<Navigate to="/owner/finance" replace />} />
        <Route path="/branch/schedule" element={<Navigate to="/owner/jadval" replace />} />
        <Route path="/branch/*" element={<Navigate to="/owner/dashboard" replace />} />

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
        {/* ═══ ADMIN PANELI — DIREKTORLAR UCHUN ═══

            `AdminPanelGuard` tashkilot vakolatiga ega odamni (ega,
            `branches.view_all` + `system.admin_access`) bu yerdan
            `/org` ga qaytaradi. Devor IKKI TOMONLAMA: `/org/*` da
            `SuperAdminGuard` teskarisini qiladi.

            NEGA: ikki panel bir-birining ichiga kirsa, ular amalda
            bitta panel bo'lib qoladi — Super Admin operatsion
            ekranlarda ishlay boshlaydi, Admin paneli esa "kattaroq
            panelning bo'lagi" bo'lib o'qiladi. */}
        <Route
          path="/owner/*"
          element={
            <AdminPanelGuard>
              <OwnerRoutes />
            </AdminPanelGuard>
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
