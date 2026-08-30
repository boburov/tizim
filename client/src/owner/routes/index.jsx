// Router
import { lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

// Guards
import PermissionGuard from "@/shared/components/guards/PermissionGuard";
import MultiBranchGuard from "@/shared/components/guards/MultiBranchGuard";

// Pages
import {
  GroupsPage,
  GroupsListPage,
  GroupDetailPage,
  GroupInfoPanel,
  GroupStudentsPanel,
  GroupAttendancePanel,
  GroupArchivePanel,
} from "@/owner/features/groups";
import {
  StudentsPage,
  TeachersPage,
  StaffPage,
  StaffListTab,
  UsersTab,
  UserDetailPage,
  UserProfilePanel,
  UserAttendancePanel,
  UserGradesPanel,
  UserExemptionsPanel,
  UserHistoryPanel,
  UserArchivePanel,
} from "@/owner/features/users";
import { StaffPayrollTab, KpiRulesTab } from "@/owner/features/staffPayroll";
import { ROLES } from "@/shared/constants/roles";
import {
  ArchiveReasonsPage,
  ReasonsTab,
  ArchiveReasonReportTab,
} from "@/owner/features/archiveReasons";
import {
  LeadsPage,
  LeadsListPage,
  LeadsKanbanPage,
  LeadRoutingTab,
  LeadsStatsPage,
  LeadsSettingsPage,
  LeadOptionsTab,
} from "@/owner/features/leads";
import {
  AttendancePage,
  AttendanceMarkPage,
  AttendanceOverallPanel,
  AttendancePerGroupPanel,
  AttendanceSettingsPage,
} from "@/owner/features/attendance";
import { TeacherAttendancePage } from "@/owner/features/teacherAttendance";
import { GradesPage, GradesGivePage } from "@/owner/features/grades";
import {
  RatingPage,
  RatingLeaderboardPanel,
  RatingSettingsPage,
} from "@/owner/features/rating";
import {
  NotificationsListPage,
  NotificationDetailPage,
  MyInboxPage as OwnerInboxPage,
} from "@/owner/features/notifications";
import {
  AssignmentsListPage,
  AssignmentDetailPage,
} from "@/owner/features/assignments";
import { NotificationTemplatesListPage } from "@/owner/features/notificationTemplates";
import { HolidaysListPage } from "@/owner/features/holidays";
import {
  BranchesPage,
  BranchComparePage,
  BranchStatsPage,
  BranchLimitsPage,
} from "@/owner/features/branches";
import { CashDeskPage } from "@/owner/features/journal";
import { CatalogPage } from "@/owner/features/catalog";
import { RoomsPage, SchedulePage, RoomAnalyticsPage } from "@/owner/features/rooms";
import { SystemAnalysisPage } from "@/owner/features/systemAnalysis";
import { BranchPnlPage } from "@/owner/features/branchAnalytics";
import { ExpenseApprovalsPage } from "@/owner/features/expenseApprovals";
import { ExpensesPage } from "@/owner/features/expenses";
import {
  FeedbackPage,
  FeedbackListPage,
  FeedbackDetailPage,
  FeedbackDashboardPage,
  FeedbackTypesListPage,
} from "@/owner/features/feedback";
import { MarketPage, UserCoinPanel } from "@/owner/features/market";
import CoinGuard from "@/shared/components/guards/CoinGuard";
import FeatureGuard from "@/shared/components/guards/FeatureGuard";
import { AdminDashboardPage } from "@/owner/features/adminDashboard";
import { ActivityLogsPage } from "@/owner/features/activityLogs";
import {
  StudentPaymentsPanel,
  StudentObligationsPanel,
  StudentPaymentHistoryPage,
  GroupFeesPage,
  GroupFeeDetailPage,
  DiscountsPage,
} from "@/owner/features/finance";
import {
  DepositsPage,
  DepositsTransactionsPanel,
  DepositsReportPanel,
  UserDepositPanel,
} from "@/owner/features/deposits";
import {
  TeacherSalariesPanel,
  TeacherObligationsPage,
  TeacherSalaryHistoryPage,
  SalaryConfigsPage,
  SalaryGroupDetailPage,
} from "@/owner/features/teacherSalary";
import { FinanceReportPage, WriteOffsPage } from "@/owner/features/financeReport";
import {
  FinanceCommandPage,
  CollectionsPage,
  CashFlowPage,
  AccountsPage,
} from "@/owner/features/financeAnalytics";
import { ProfilePage } from "@/owner/features/profile";
import { SettingsPage } from "@/owner/features/settings";
import { StudentStatsPage } from "@/owner/features/studentStats";
import {
  StudentRetentionPage,
  RetentionContent,
} from "@/owner/features/studentRetention";
import NotFoundPage from "@/shared/components/ui/feedback/NotFoundPage";

/**
 * ══════════════════════════════════════════════════════════════════════
 * KAMDAN-KAM OCHILADIGAN, LEKIN OG'IR BO'LIMLAR — ALOHIDA BO'LAKDA
 * ══════════════════════════════════════════════════════════════════════
 *
 * Sozlamalar, rollar, import va tahlil markazi kunlik ish emas:
 * ular oyda bir necha marta ochiladi. Statik import bo'lsa, ular
 * HAR SAFAR — o'quvchilar ro'yxatini ochgan odamga ham — yuklanadi.
 *
 * `Suspense` chegarasi qobiqda (`OperationalLayout`): yuklanish
 * paytida sidebar va sarlavha joyida qoladi, faqat kontent kutadi.
 */
const StorageAdminPage = lazy(() => import("@/owner/features/storage").then((m) => ({ default: m.StorageAdminPage })));
const ImportPage = lazy(() => import("@/owner/features/imports").then((m) => ({ default: m.ImportPage })));
const RolesPage = lazy(() => import("@/owner/features/roles").then((m) => ({ default: m.RolesPage })));
const RoleFormPage = lazy(() => import("@/owner/features/roles").then((m) => ({ default: m.RoleFormPage })));
const OperationsCenterPage = lazy(() => import("@/owner/features/ai").then((m) => ({ default: m.OperationsCenterPage })));
const ActionCenterPage = lazy(() => import("@/owner/features/ai").then((m) => ({ default: m.ActionCenterPage })));
const AiReportsPage = lazy(() => import("@/owner/features/ai").then((m) => ({ default: m.AiReportsPage })));
const AiReportDetailPage = lazy(() => import("@/owner/features/ai").then((m) => ({ default: m.AiReportDetailPage })));


const OwnerRoutes = () => (
  <Routes>
    <Route index element={<Navigate to="dashboard" replace />} />

    {/* Boshqaruv paneli (Bo'lak 9) */}
    <Route path="dashboard" element={<AdminDashboardPage />} />

    {/* Guruhlar: ro'yxat + guruh to'lovi bitta qobiqda.
        'tolov' static segment 'groups/:id' dan ustun turadi (v6 ranking). */}
    <Route path="groups" element={<GroupsPage />}>
      <Route index element={<GroupsListPage />} />
      <Route
        path="tolov"
        element={
          <PermissionGuard required="finance.read" fallback="/owner/groups">
            <GroupFeesPage />
          </PermissionGuard>
        }
      />
    </Route>
    <Route path="groups/:id" element={<GroupDetailPage />}>
      <Route index element={<GroupInfoPanel />} />
      <Route path="o-quvchilar" element={<GroupStudentsPanel />} />
      <Route path="davomat" element={<GroupAttendancePanel />} />
      <Route path="arxiv" element={<GroupArchivePanel />} />
    </Route>

    {/* O'QUVCHILAR - o'quvchiga tegishli hamma narsa bitta qobiqda.
        Har bir tab o'z ruxsati bilan qo'riqlanadi: menyuda yashirish yetarli
        emas, URL'ni qo'lda yozib kirishning ham oldi olinadi. */}
    <Route path="students" element={<StudentsPage />}>
      <Route index element={<UsersTab role={ROLES.STUDENT} />} />

      <Route
        element={
          <PermissionGuard required="finance.read" fallback="/owner/students" />
        }
      >
        <Route path="tolovlar" element={<StudentPaymentsPanel />} />
        <Route path="qarzdorlar" element={<StudentObligationsPanel />} />
        <Route path="chegirmalar" element={<DiscountsPage />} />
      </Route>

      <Route
        element={
          <PermissionGuard
            required="admin_dashboard.read"
            fallback="/owner/students"
          />
        }
      >
        <Route path="statistika" element={<StudentStatsPage />} />
        <Route path="chiqib-ketish" element={<StudentRetentionPage />}>
          <Route index element={<RetentionContent preset="all" />} />
          <Route path="12-oy" element={<RetentionContent preset="12m" />} />
          <Route path="3-oy" element={<RetentionContent preset="3m" />} />
        </Route>
      </Route>
    </Route>

    {/* O'QITUVCHILAR - ro'yxat + maosh + davomat bitta qobiqda. */}
    <Route path="teachers" element={<TeachersPage />}>
      <Route index element={<UsersTab role={ROLES.TEACHER} />} />

      <Route
        element={
          <PermissionGuard required="salary.read" fallback="/owner/teachers" />
        }
      >
        <Route path="maoshlar" element={<TeacherSalariesPanel />} />
        <Route path="qoldiqlar" element={<TeacherObligationsPage />} />
      </Route>

      <Route
        path="maosh-belgilash"
        element={
          <PermissionGuard required="groups.update" fallback="/owner/teachers">
            <SalaryConfigsPage />
          </PermissionGuard>
        }
      />
      <Route
        path="davomat"
        element={
          <PermissionGuard
            required="attendance.record"
            fallback="/owner/teachers"
          >
            <TeacherAttendancePage />
          </PermissionGuard>
        }
      />
    </Route>

    {/* XODIMLAR - ega, o'qituvchilar va custom rollar bitta ro'yxatda.
        Tab yo'q: sahifa yakka ro'yxat, tafsilot esa umumiy
        /owner/users/:id sahifasida ochiladi. */}
    <Route
      path="staff"
      element={
        <PermissionGuard required="users.read" fallback="/owner">
          <StaffPage />
        </PermissionGuard>
      }
    >
      <Route index element={<StaffListTab />} />
      <Route
        path="maoshlar"
        element={
          <PermissionGuard required="payroll.read" fallback="/owner/staff">
            <StaffPayrollTab />
          </PermissionGuard>
        }
      />
      <Route
        path="kpi"
        element={
          <PermissionGuard required="payroll.manage" fallback="/owner/staff">
            <KpiRulesTab />
          </PermissionGuard>
        }
      />
    </Route>

    <Route path="users/:id" element={<UserDetailPage />}>
      <Route index element={<UserProfilePanel />} />
      <Route path="davomat" element={<UserAttendancePanel />} />
      <Route path="baholar" element={<UserGradesPanel />} />
      <Route path="ozod" element={<UserExemptionsPanel />} />
      <Route path="depozit" element={<UserDepositPanel />} />
      {/* Tanga hamyoni — `owner/features/market` da yashaydi
          (`UserDepositPanel` bilan bir naqsh: karta chizish joyi,
          egalik emas). Bo'lim o'chirilgan bo'lsa panel o'zi sababni
          ko'rsatadi — shuning uchun bu yerda `CoinGuard` YO'Q: u
          foydalanuvchini butun o'quvchi kartasidan uloqtirib
          yuborardi. */}
      <Route path="tangalar" element={<UserCoinPanel />} />
      <Route path="tarix" element={<UserHistoryPanel />} />
      <Route path="arxiv" element={<UserArchivePanel />} />
    </Route>

    {/* LIDLAR - ro'yxat + statistika. Sozlamalari /owner/settings/lidlar da. */}
    <Route path="leads" element={<LeadsPage />}>
      <Route index element={<LeadsListPage />} />
      {/* KANBAN - voronka bosqichlari bo'yicha doska.
          Ruxsat ro'yxat bilan bir xil: doska boshqa ko'rinish, boshqa
          ma'lumot emas. Status o'zgartirish serverda `leads.update`
          bilan himoyalangan. */}
      <Route path="doska" element={<LeadsKanbanPage />} />
      <Route path="statistika" element={<LeadsStatsPage />} />
    </Route>

    {/* DAVOMAT - hisobot tablari + belgilash bitta qobiqda.
        URL'lar o'zgarmadi: index = umumiy hisobot, /mark = belgilash. */}
    <Route path="attendance" element={<AttendancePage />}>
      <Route index element={<AttendanceOverallPanel />} />
      <Route path="guruh-boyicha" element={<AttendancePerGroupPanel />} />
      <Route
        path="mark"
        element={
          <PermissionGuard
            required="attendance.record"
            fallback="/owner/attendance"
          >
            <AttendanceMarkPage />
          </PermissionGuard>
        }
      />
    </Route>

    {/* BAHOLASH - baho qo'yish + reyting. Reyting o'z ichki tablarini
        saqlaydi (markaz / guruh), ular filtr paneli ichida turadi. */}
    <Route path="grades" element={<GradesPage />}>
      <Route index element={<GradesGivePage />} />
      <Route
        path="reyting"
        element={
          <PermissionGuard required="rating.read" fallback="/owner/grades">
            <RatingPage />
          </PermissionGuard>
        }
      >
        <Route index element={<RatingLeaderboardPanel scope="all" />} />
        <Route path="guruh" element={<RatingLeaderboardPanel scope="group" />} />
      </Route>
    </Route>

    {/* ALOQA: bildirishnomalar + feedback */}
    <Route path="notifications" element={<NotificationsListPage />} />
    <Route path="notifications/:id" element={<NotificationDetailPage />} />
    <Route path="inbox" element={<OwnerInboxPage />} />

    {/* Vazifalar - matn + fayl, guruh o'quvchilariga bot orqali */}
    <Route
      path="assignments"
      element={
        <PermissionGuard required="assignments.read">
          <AssignmentsListPage />
        </PermissionGuard>
      }
    />
    <Route
      path="assignments/:id"
      element={
        <PermissionGuard required="assignments.read">
          <AssignmentDetailPage />
        </PermissionGuard>
      }
    />

    {/* OMMAVIY IMPORT - o'quvchi/o'qituvchi/xodim uchun bitta sahifa.
        Sidebar'da yo'q: ro'yxat sahifalaridagi "Excel'dan yuklash"
        tugmasi olib keladi. Ruxsat shu yerda tekshirilmaydi - importerlar
        ro'yxati serverda filtrlanadi va yozish yo'li ham qayta
        qo'riqlanadi (requireImporterPermission).

        ⚠ `FeatureGuard` ESA KERAK: tarifda import bo'lmasa chuqur
        havola (`/owner/import/students`) sahifani ochib, keyin bo'sh
        xato ko'rsatardi. Ruxsatdan farqli o'laroq bu savol "bo'lim
        UMUMAN bormi" — shuning uchun tashqarida turadi. */}
    <Route
      path="import/:importerKey"
      element={
        <FeatureGuard feature="imports">
          <ImportPage />
        </FeatureGuard>
      }
    />

    {/* Fayl saqlagich boshqaruvi - sidebar'dagi kvota ko'rsatkichi
        shu sahifaga olib keladi. */}
    <Route
      path="storage"
      element={
        <PermissionGuard required="storage.manage">
          <StorageAdminPage />
        </PermissionGuard>
      }
    />

    {/* ══ MARKET VA TANGALAR ══

        IKKI QAVATLI QO'RIQCHI, VA IKKALASI HAM KERAK:

          `CoinGuard`       — bo'lim UMUMAN mavjudmi (ega o'chirganmi).
          `PermissionGuard` — MENDA huquq bormi.

        Faqat ruxsatga tayanilsa o'chirilgan bo'lim menyuda qolib,
        bosilganda 404 berardi. Faqat o'chirgichga tayanilsa esa
        ruxsatsiz xodim ham sahifani ochardi (server 403 qaytarardi,
        lekin odam buni faqat bosgandan keyin bilardi).

        `market.read` VA `market.manage` — ikkovidan biri yetarli:
        buyurtmalarni bajaruvchi xodimda mahsulot tahrirlash huquqi
        bo'lmasligi mumkin. */}
    <Route
      path="market"
      element={
        <CoinGuard fallback="/owner">
          <PermissionGuard
            anyOf={["market.read", "market.manage", "market.fulfill"]}
            fallback="/owner"
          >
            <MarketPage />
          </PermissionGuard>
        </CoinGuard>
      }
    />

    <Route path="feedback" element={<FeedbackPage />}>
      <Route index element={<FeedbackListPage />} />
      <Route path="hisobot" element={<FeedbackDashboardPage />} />
    </Route>
    <Route path="feedback/:id" element={<FeedbackDetailPage />} />

    {/* Tasdiqlar - limitdan oshgan chiqimlar VA sozlama o'zgarishlari
        (maosh stavkasi, chegirma, ishga olish). Ikki xil ruxsat egasi
        ham kiradi; ro'yxatni server kategoriya bo'yicha kesadi. */}
    <Route
      path="expense-approvals"
      element={
        <PermissionGuard
          anyOf={["finance.read", "approvals.decide_config"]}
          fallback="/owner"
        >
          <ExpenseApprovalsPage />
        </PermissionGuard>
      }
    />

    {/* AI OPERATSIYALAR MARKAZI. Alohida chatbot sahifasi ATAYLAB yo'q:
        AI modullar ichiga o'rnatiladi, bu sahifa esa kunning hikoyasini
        aytadi — kecha nima bo'ldi, bugun nima bo'layapti, keyin nima
        bo'lishi mumkin va hozir nima qilish kerak.

        DIQQAT: "reports/:id" dan OLDIN "reports" turishi shart emas
        (React Router aniqlik bo'yicha tanlaydi), lekin static "tasks" va
        "reports" segmentlari indeks route bilan to'qnashmasligi uchun
        alohida yozilgan. */}
    <Route
      path="ai"
      element={
        <PermissionGuard required="ai.read" fallback="/owner">
          <OperationsCenterPage />
        </PermissionGuard>
      }
    />
    {/* To'liq vazifalar ro'yxati - operatsiyalar markazi faqat eng
        muhimlarini ko'rsatadi. */}
    <Route
      path="ai/tasks"
      element={
        <PermissionGuard required="ai.read" fallback="/owner">
          <ActionCenterPage />
        </PermissionGuard>
      }
    />
    <Route
      path="ai/reports"
      element={
        <PermissionGuard required="ai.read" fallback="/owner">
          <AiReportsPage />
        </PermissionGuard>
      }
    />

    {/* AUDIT LOGLARI - sidebarda alohida bo'lim, shuning uchun marshrut
        ham Sozlamalar qobig'idan TASHQARIDA. Ilgari /settings/loglar edi
        va SettingsPage'ning chap ustunli navigatsiyasi bilan birga
        ochilardi - "alohida bo'lim" bo'la olmasdi. Eski manzil quyida
        redirect bo'lib qoldi. */}
    <Route
      path="activity-logs"
      element={
        <PermissionGuard required="activity_logs.read" fallback="/owner">
          <ActivityLogsPage />
        </PermissionGuard>
      }
    />
    <Route
      path="ai/reports/:id"
      element={
        <PermissionGuard required="ai.read" fallback="/owner">
          <AiReportDetailPage />
        </PermissionGuard>
      }
    />

    {/* KASSA - qo'sh yozuv jurnali (qoldiq, smena, inkassatsiya).
        `finance.read` yetarli: filial direktori o'z kassasini ko'rishi
        va yuritishi kerak. Amal tugmalari serverda `finance.pay` bilan
        himoyalangan. */}
    <Route
      path="cash-desk"
      element={
        <PermissionGuard required="finance.read" fallback="/owner">
          <CashDeskPage />
        </PermissionGuard>
      }
    />

    {/* KATALOG - kurslar (global) va narx matritsasi.
        XONALAR bu yerdan CHIQARILDI: ular `/owner/rooms` da, o'z
        sahifasida. Sabab — talab 35: "odam xona qo'shishni qidirib
        yurmasin". Katalog ichidagi ikkinchi jadval eng yomon joy edi. */}
    <Route
      path="catalog"
      element={
        <PermissionGuard required="courses.read" fallback="/owner">
          <CatalogPage />
        </PermissionGuard>
      }
    />

    {/* ══════════════════════════════════════════════════════════════
        XONALAR — ADMIN PANELIDA (talab 11, 32)
        ══════════════════════════════════════════════════════════════

        Filial administratori o'z filialining xonalarini shu yerda
        ko'radi va (ruxsati bo'lsa) qo'shadi. Filial TANLANMAYDI:
        ro'yxatni server ko'lam bo'yicha kesadi, yangi xonani esa
        o'zi administratorning filialiga bog'laydi. Boshqa filialga
        xona qo'shish yo'li YO'Q va bu serverda ta'minlangan
        (`rooms.service.js`), bu yerda emas. */}
    <Route path="rooms">
      <Route
        index
        element={
          <PermissionGuard required="classes.read" fallback="/owner">
            <RoomsPage />
          </PermissionGuard>
        }
      />
      <Route
        path="analytics"
        element={
          <PermissionGuard required="classes.read" fallback="/owner/rooms">
            <RoomAnalyticsPage />
          </PermissionGuard>
        }
      />
    </Route>

    {/* HAFTALIK JADVAL — "seshanba 14:00 da 201-xona bo'shmi?".
        Xonalar sahifasidan havola qilinadi; menyuda alohida yozuv
        YO'Q, chunki u xona savolining davomi. */}
    <Route
      path="jadval"
      element={
        <PermissionGuard required="groups.read" fallback="/owner">
          <SchedulePage />
        </PermissionGuard>
      }
    />

    {/* ══════════════════════════════════════════════════════════════
        TIZIM TAHLILI — MAVJUD DVIGATEL, YANGI JOY (talab 28, 31)
        ══════════════════════════════════════════════════════════════

        `/owner/ai*` marshrutlari O'Z JOYIDA qoladi: tavsiya
        kartalaridagi havolalar, hisobot linklari va eski xatcho'plar
        ishlashda davom etadi. Bu sahifa ularni ALMASHTIRMAYDI —
        u tahlilga tushunarli nom va xona kesimini qo'shadi. */}
    <Route
      path="tahlil"
      element={
        <PermissionGuard anyOf={["ai.read", "classes.read"]} fallback="/owner">
          <SystemAnalysisPage />
        </PermissionGuard>
      }
    />

    {/* FILIAL TAHLILI - P&L, normalizatsiya, anomaliyalar. */}
    <Route
      path="branch-analytics"
      element={
        <PermissionGuard required="finance.read" fallback="/owner">
          <BranchPnlPage />
        </PermissionGuard>
      }
    />

    {/* Filiallar - faqat branches.read ruxsati borlar uchun.
        DIQQAT: static segmentlar ("compare", "stats", "limits") oddiy
        "branches" dan keyin, lekin hech qanday ":id" route'idan OLDIN
        turishi shart - aks holda ular filial ID deb o'qilardi. */}
    {/* Yakka markaz rejimida bu uchtasi Sozlamalar > Markaz ma'lumotlari'ga
        yo'naltiriladi - sidebarda ular yo'q, lekin eski xatcho'p baribir
        ochib yuborardi. */}
    <Route element={<MultiBranchGuard />}>
      <Route
        path="branches"
        element={
          <PermissionGuard required="branches.read" fallback="/owner">
            <BranchesPage />
          </PermissionGuard>
        }
      />
      <Route
        path="branches/compare"
        element={
          <PermissionGuard required="branches.read" fallback="/owner">
            <BranchComparePage />
          </PermissionGuard>
        }
      />
      <Route
        path="branches/stats"
        element={
          <PermissionGuard required="branches.read" fallback="/owner">
            <BranchStatsPage />
          </PermissionGuard>
        }
      />
    </Route>
    {/* SOZLAMALAR - ilgari 6 xil sidebar guruhiga sochilgan 11 ta konfiguratsiya
        sahifasi. Chap ustunli yagona qobiq; har bir yozuv o'z ruxsati bilan
        ham menyuda kesiladi, ham route darajasida qo'riqlanadi.

        DIQQAT: "rollar/new" static segment "rollar/:value" dan OLDIN. */}
    <Route path="settings" element={<SettingsPage />}>
      <Route index element={<ProfilePage />} />

      <Route
        path="rollar"
        element={
          <PermissionGuard required="roles.read" fallback="/owner/settings">
            <RolesPage />
          </PermissionGuard>
        }
      />
      <Route
        path="rollar/new"
        element={
          <PermissionGuard
            required="roles.create"
            fallback="/owner/settings/rollar"
          >
            <RoleFormPage mode="create" />
          </PermissionGuard>
        }
      />
      <Route
        path="rollar/:value"
        element={
          <PermissionGuard required="roles.read" fallback="/owner/settings">
            <RoleFormPage mode="edit" />
          </PermissionGuard>
        }
      />

      {/* Audit loglari yuqoriga, /owner/activity-logs ga ko'chdi. Eski
          manzil saqlanadi - saqlangan havolalar va xatcho'plar uchun.
          Sozlamalar BOLASI bo'lib qoladi: shunda `/settings/*` shoxi
          o'zi bilan o'zi ziddiyatga tushmaydi. */}
      <Route
        path="loglar"
        element={<Navigate to="/owner/activity-logs" replace />}
      />

      {/* YAKKA MARKAZ: sidebarda "Filiallar" bo'limi yo'q, markaz ma'lumoti
          shu yerdan tahrirlanadi. BranchesPage bitta karta ko'rsatadi va
          "Yangi filial" tugmasini yashiradi. */}
      <Route
        path="markaz"
        element={
          <PermissionGuard required="branches.read" fallback="/owner/settings">
            <BranchesPage />
          </PermissionGuard>
        }
      />
      {/* Limit o'zgartirish - yozish huquqi. Serverda bu amal
          system.admin_access + branches.update talab qiladi. */}
      <Route
        path="limitlar"
        element={
          <PermissionGuard required="branches.update" fallback="/owner/settings">
            <BranchLimitsPage />
          </PermissionGuard>
        }
      />
      <Route
        path="arxiv-sabablari"
        element={
          <PermissionGuard
            required="archive_reasons.manage"
            fallback="/owner/settings"
          >
            <ArchiveReasonsPage />
          </PermissionGuard>
        }
      >
        <Route index element={<ReasonsTab />} />
        <Route path="hisobot" element={<ArchiveReasonReportTab />} />
      </Route>
      <Route
        path="bayramlar"
        element={
          <PermissionGuard
            required="holidays.manage"
            fallback="/owner/settings"
          >
            <HolidaysListPage />
          </PermissionGuard>
        }
      />

      <Route
        path="davomat"
        element={
          <PermissionGuard
            required="attendance.manage"
            fallback="/owner/settings"
          >
            <AttendanceSettingsPage />
          </PermissionGuard>
        }
      />
      <Route
        path="reyting"
        element={
          <PermissionGuard required="rating.manage" fallback="/owner/settings">
            <RatingSettingsPage />
          </PermissionGuard>
        }
      />
      <Route
        path="lidlar"
        element={
          <PermissionGuard required="leads.manage" fallback="/owner/settings">
            <LeadsSettingsPage />
          </PermissionGuard>
        }
      >
        <Route
          index
          element={<LeadOptionsTab kind="source" addLabel="Yangi manba" />}
        />
        <Route
          path="yonalish"
          element={<LeadOptionsTab kind="direction" addLabel="Yangi yo'nalish" />}
        />
        <Route
          path="rad-etish"
          element={<LeadOptionsTab kind="rejection" addLabel="Yangi sabab" />}
        />
        {/* YO'NALTIRISH - qaysi manbadan kelgan lid qaysi filialga.
            Qoida butun markazga ta'sir qiladi, shuning uchun serverda
            `leads.manage` bilan himoyalangan (ota-route ham shu). */}
        <Route path="yonaltirish" element={<LeadRoutingTab />} />
      </Route>
      <Route
        path="shablonlar"
        element={
          <PermissionGuard
            required="notification_templates.manage"
            fallback="/owner/settings"
          >
            <NotificationTemplatesListPage />
          </PermissionGuard>
        }
      />
      <Route
        path="feedback-turlari"
        element={
          <PermissionGuard
            required="feedback_types.manage"
            fallback="/owner/settings"
          >
            <FeedbackTypesListPage />
          </PermissionGuard>
        }
      />
    </Route>

    {/* MOLIYA BOSHQARUV MARKAZI (STEP 6).
        Bazaviy `/owner/finance` endi shu yerga tushadi — u barcha
        moliyaviy savolning boshlang'ich nuqtasi.

        ESKI MARSHRUTLAR JOYIDA QOLADI: `/finance/accounting` va
        boshqalar ishlashda davom etadi. Ular ichida havolalar,
        xatcho'plar va hisobot eksportlari bor — ularni birdan
        uzish foydalanuvchini yo'qotib qo'yardi.

        Ruxsat: `finance.read`. Sezgir bo'limlar (foydalilik, pul
        oqimi, qarzdorlik) sahifa ICHIDA alohida tekshiriladi —
        server ham aynan shunday qo'riqlaydi. */}
    <Route path="finance" element={<FinanceCommandPage />} />

    {/* ══════════════════════════════════════════════════════════════
        MOLIYANING TO'RT KIRISH NUQTASI

          /finance             — umumiy manzara + tranzaksiyalar
          /finance/expenses    — chiqim yozish va ro'yxati
          /finance/cash-flow   — pul oqimi
          /finance/accounts    — hisob qoldiqlari va harakatlari

        Ular menyudagi to'rt yozuvga BIR-BIR mos keladi. Har biri
        alohida savolga javob beradi, ya'ni "moliya" degan bitta
        katta ekranni tab bo'ylab kovlash shart emas.

        Ruxsat: chiqim `expenses.read` (u `finance.read` GA
        KIRMAYDI), pul oqimi va hisoblar `finance.view_cashflow`.
        Tekshiruv sahifa ICHIDA — server ham aynan shunday
        qo'riqlaydi va bir joyda ikkita to'siq bo'lishi shart emas.
        ══════════════════════════════════════════════════════════ */}
    <Route
      path="finance/expenses"
      element={
        <PermissionGuard required="expenses.read" fallback="/owner/finance">
          <ExpensesPage />
        </PermissionGuard>
      }
    />
    <Route path="finance/cash-flow" element={<CashFlowPage />} />
    <Route path="finance/accounts" element={<AccountsPage />} />

    {/* UNDIRISH — "kim qarzdor, qancha vaqtdan beri".
        Ilgari bu "Moliya > Boshqaruv markazi > Qarzdorlik" tabida,
        uch qadam ichkarida edi va "moliyaviy tahlil" yorlig'i ostida
        turardi — administrator uchun esa bu TAHLIL emas, kundalik
        qo'ng'iroqlar ro'yxati. */}
    <Route
      path="finance/undirish"
      element={
        <PermissionGuard
          anyOf={["finance.view_receivables", "finance.read"]}
          fallback="/owner/finance"
        >
          <CollectionsPage />
        </PermissionGuard>
      }
    />

    {/* O'ZBEKCHA MANZIL — YO'NALTIRISH, IKKINCHI SAHIFA EMAS.

        Chiqim sahifasining KANONIK manzili `/owner/finance/expenses`:
        serverdagi tranzaksiya tafsiloti manba hujjatga aynan shu
        yo'lni qaytaradi (`entry-detail.service.ts` → `resolveSource`)
        va "Tez amallar" ham o'sha yerga olib boradi. Ikkita ishlaydigan
        URL bo'lsa, ikkalasi ham xatcho'plarga tushib, biri keyin
        jimgina eskirardi. */}
    <Route
      path="finance/chiqimlar"
      element={<Navigate to="/owner/finance/expenses" replace />}
    />

    {/* Moliyaviy hisob-kitob - umumiy hisobot sahifasi */}
    <Route path="finance/accounting" element={<FinanceReportPage />} />

    {/* Undirilmagan to'lovlar (hisobdan chiqarilgan qarzlar) - oy/yil/guruh filtri */}
    <Route path="finance/write-offs" element={<WriteOffsPage />} />

    {/* Detal sahifalar o'z URL'ida qoldi - ro'yxatlardagi havolalar ishlaydi. */}
    <Route
      path="finance/student-payments/student/:studentId"
      element={<StudentPaymentHistoryPage />}
    />
    <Route path="finance/group-fees/:groupId" element={<GroupFeeDetailPage />} />

    {/* Depozitlar - 2 tab (tranzaksiyalar + hisobotlar) */}
    <Route path="finance/deposits" element={<DepositsPage />}>
      <Route index element={<DepositsTransactionsPanel />} />
      <Route path="hisobotlar" element={<DepositsReportPanel />} />
    </Route>

    <Route
      path="finance/teacher-salaries/teacher/:teacherId"
      element={<TeacherSalaryHistoryPage />}
    />
    {/* Guruh maosh-davri detali (Maosh belgilash ro'yxatidan ochiladi) */}
    <Route
      path="finance/teacher-salaries/group/:groupId"
      element={<SalaryGroupDetailPage />}
    />

    {/* ESKI HAVOLALAR.
        Ro'yxat sahifalari o'quvchi/o'qituvchi/guruh qobiqlariga ko'chdi -
        eski URL, xatcho'p va tashqi havolalar ishlashda davom etadi. */}
    <Route path="users" element={<Navigate to="/owner/students" replace />} />
    <Route
      path="users/students"
      element={<Navigate to="/owner/students" replace />}
    />
    <Route
      path="users/teachers"
      element={<Navigate to="/owner/teachers" replace />}
    />
    <Route
      path="students/stats"
      element={<Navigate to="/owner/students/statistika" replace />}
    />
    <Route
      path="students/retention/*"
      element={<Navigate to="/owner/students/chiqib-ketish" replace />}
    />
    <Route
      path="finance/student-payments"
      element={<Navigate to="/owner/students/tolovlar" replace />}
    />
    <Route
      path="finance/student-payments/debtors"
      element={<Navigate to="/owner/students/qarzdorlar" replace />}
    />
    <Route
      path="finance/discounts"
      element={<Navigate to="/owner/students/chegirmalar" replace />}
    />
    <Route
      path="finance/obligations"
      element={<Navigate to="/owner/students/qarzdorlar" replace />}
    />
    <Route
      path="finance/teacher-salaries"
      element={<Navigate to="/owner/teachers/maoshlar" replace />}
    />
    <Route
      path="finance/teacher-salaries/qoldiqlar"
      element={<Navigate to="/owner/teachers/qoldiqlar" replace />}
    />
    <Route
      path="finance/teacher-salaries/maosh-belgilash"
      element={<Navigate to="/owner/teachers/maosh-belgilash" replace />}
    />
    <Route
      path="finance/salary-configs"
      element={<Navigate to="/owner/teachers/maosh-belgilash" replace />}
    />
    <Route
      path="finance/group-fees"
      element={<Navigate to="/owner/groups/tolov" replace />}
    />
    <Route
      path="attendance/teachers"
      element={<Navigate to="/owner/teachers/davomat" replace />}
    />

    {/* Sozlamalarga ko'chgan sahifalar */}
    <Route path="profile" element={<Navigate to="/owner/settings" replace />} />
    <Route
      path="roles"
      element={<Navigate to="/owner/settings/rollar" replace />}
    />
    <Route
      path="roles/new"
      element={<Navigate to="/owner/settings/rollar/new" replace />}
    />
    <Route
      path="branches/limits"
      element={<Navigate to="/owner/settings/limitlar" replace />}
    />
    <Route
      path="archive-reasons/*"
      element={<Navigate to="/owner/settings/arxiv-sabablari" replace />}
    />
    <Route
      path="holidays"
      element={<Navigate to="/owner/settings/bayramlar" replace />}
    />
    <Route
      path="settings/attendance"
      element={<Navigate to="/owner/settings/davomat" replace />}
    />
    <Route
      path="settings/rating"
      element={<Navigate to="/owner/settings/reyting" replace />}
    />
    <Route
      path="leads/settings/*"
      element={<Navigate to="/owner/settings/lidlar" replace />}
    />
    <Route
      path="notification-templates"
      element={<Navigate to="/owner/settings/shablonlar" replace />}
    />
    <Route
      path="feedback-types"
      element={<Navigate to="/owner/settings/feedback-turlari" replace />}
    />

    {/* Bo'limlar ichiga ko'chgan sahifalar */}
    <Route
      path="leads/stats"
      element={<Navigate to="/owner/leads/statistika" replace />}
    />
    <Route
      path="rating/*"
      element={<Navigate to="/owner/grades/reyting" replace />}
    />
    <Route
      path="feedback/dashboard"
      element={<Navigate to="/owner/feedback/hisobot" replace />}
    />

    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);

export default OwnerRoutes;
