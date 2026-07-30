// Router
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
  UsersTab,
  UserDetailPage,
  UserProfilePanel,
  UserAttendancePanel,
  UserGradesPanel,
  UserExemptionsPanel,
  UserHistoryPanel,
  UserArchivePanel,
} from "@/owner/features/users";
import { ROLES } from "@/shared/constants/roles";
import {
  ArchiveReasonsPage,
  ReasonsTab,
  ArchiveReasonReportTab,
} from "@/owner/features/archiveReasons";
import {
  LeadsPage,
  LeadsListPage,
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
import { NotificationTemplatesListPage } from "@/owner/features/notificationTemplates";
import { HolidaysListPage } from "@/owner/features/holidays";
import { RolesPage, RoleFormPage } from "@/owner/features/roles";
import {
  BranchesPage,
  BranchComparePage,
  BranchStatsPage,
  BranchLimitsPage,
} from "@/owner/features/branches";
import { ExpenseApprovalsPage } from "@/owner/features/expenseApprovals";
import { ActionCenterPage } from "@/owner/features/ai";
import {
  FeedbackPage,
  FeedbackListPage,
  FeedbackDetailPage,
  FeedbackDashboardPage,
  FeedbackTypesListPage,
} from "@/owner/features/feedback";
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
import { ProfilePage } from "@/owner/features/profile";
import { SettingsPage } from "@/owner/features/settings";
import { StudentStatsPage } from "@/owner/features/studentStats";
import {
  StudentRetentionPage,
  RetentionContent,
} from "@/owner/features/studentRetention";
import NotFoundPage from "@/shared/components/ui/feedback/NotFoundPage";

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

    <Route path="users/:id" element={<UserDetailPage />}>
      <Route index element={<UserProfilePanel />} />
      <Route path="davomat" element={<UserAttendancePanel />} />
      <Route path="baholar" element={<UserGradesPanel />} />
      <Route path="ozod" element={<UserExemptionsPanel />} />
      <Route path="depozit" element={<UserDepositPanel />} />
      <Route path="tarix" element={<UserHistoryPanel />} />
      <Route path="arxiv" element={<UserArchivePanel />} />
    </Route>

    {/* LIDLAR - ro'yxat + statistika. Sozlamalari /owner/settings/lidlar da. */}
    <Route path="leads" element={<LeadsPage />}>
      <Route index element={<LeadsListPage />} />
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

    {/* AI vazifalar markazi - kunlik prioritetli ro'yxat. Alohida chatbot
        sahifasi ATAYLAB yo'q: AI modullar ichiga o'rnatiladi, bu sahifa
        esa faqat "bugun nima qilish kerak" savoliga javob beradi. */}
    <Route
      path="ai"
      element={
        <PermissionGuard required="ai.read" fallback="/owner">
          <ActionCenterPage />
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

      <Route
        path="loglar"
        element={
          <PermissionGuard
            required="activity_logs.read"
            fallback="/owner/settings"
          >
            <ActivityLogsPage />
          </PermissionGuard>
        }
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

    {/* Moliya - bazaviy URL moliyaviy hisob-kitobga yo'naltiriladi */}
    <Route path="finance" element={<Navigate to="/owner/finance/accounting" replace />} />

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
      path="activity-logs"
      element={<Navigate to="/owner/settings/loglar" replace />}
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
