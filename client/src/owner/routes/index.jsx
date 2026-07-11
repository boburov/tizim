// Router
import { Routes, Route, Navigate } from "react-router-dom";

// Pages
import {
  GroupsListPage,
  GroupDetailPage,
  GroupInfoPanel,
  GroupStudentsPanel,
  GroupAttendancePanel,
} from "@/owner/features/groups";
import {
  UsersListPage,
  UsersTab,
  UserDetailPage,
  UserProfilePanel,
  UserAttendancePanel,
  UserGradesPanel,
  UserExemptionsPanel,
  UserHistoryPanel,
} from "@/owner/features/users";
import { ROLES } from "@/shared/constants/roles";
import {
  ArchiveReasonsPage,
  ReasonsTab,
  ArchiveReasonReportTab,
} from "@/owner/features/archiveReasons";
import {
  LeadsListPage,
  LeadsStatsPage,
  LeadsSettingsPage,
  LeadOptionsTab,
} from "@/owner/features/leads";
import {
  AttendanceMarkPage,
  AttendanceDashboardPage,
  AttendanceOverallPanel,
  AttendancePerGroupPanel,
  AttendanceSettingsPage,
} from "@/owner/features/attendance";
import { TeacherAttendancePage } from "@/owner/features/teacherAttendance";
import { GradesGivePage } from "@/owner/features/grades";
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
import {
  FeedbackListPage,
  FeedbackDetailPage,
  FeedbackDashboardPage,
  FeedbackTypesListPage,
} from "@/owner/features/feedback";
import { AdminDashboardPage } from "@/owner/features/adminDashboard";
import { ActivityLogsPage } from "@/owner/features/activityLogs";
import {
  StudentPaymentsPage,
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
  TeacherSalariesPage,
  TeacherSalariesPanel,
  TeacherObligationsPage,
  TeacherSalaryHistoryPage,
  SalaryConfigsPage,
  SalaryGroupDetailPage,
} from "@/owner/features/teacherSalary";
import { FinanceReportPage } from "@/owner/features/financeReport";
import { ProfilePage } from "@/owner/features/profile";
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
    <Route path="activity-logs" element={<ActivityLogsPage />} />

    <Route path="groups" element={<GroupsListPage />} />
    <Route path="groups/:id" element={<GroupDetailPage />}>
      <Route index element={<GroupInfoPanel />} />
      <Route path="o-quvchilar" element={<GroupStudentsPanel />} />
      <Route path="davomat" element={<GroupAttendancePanel />} />
    </Route>

    {/* Foydalanuvchilar - tablar route darajasida (static 'students' ObjectId :id dan ustun) */}
    <Route path="users" element={<UsersListPage />}>
      <Route index element={<UsersTab role={ROLES.STUDENT} />} />
      <Route path="teachers" element={<UsersTab role={ROLES.TEACHER} />} />
    </Route>
    <Route path="users/:id" element={<UserDetailPage />}>
      <Route index element={<UserProfilePanel />} />
      <Route path="davomat" element={<UserAttendancePanel />} />
      <Route path="baholar" element={<UserGradesPanel />} />
      <Route path="ozod" element={<UserExemptionsPanel />} />
      <Route path="depozit" element={<UserDepositPanel />} />
      <Route path="tarix" element={<UserHistoryPanel />} />
    </Route>
    <Route path="students/stats" element={<StudentStatsPage />} />
    <Route path="students/retention" element={<StudentRetentionPage />}>
      <Route index element={<RetentionContent preset="all" />} />
      <Route path="12-oy" element={<RetentionContent preset="12m" />} />
      <Route path="3-oy" element={<RetentionContent preset="3m" />} />
    </Route>
    <Route path="archive-reasons" element={<ArchiveReasonsPage />}>
      <Route index element={<ReasonsTab />} />
      <Route path="report" element={<ArchiveReasonReportTab />} />
    </Route>

    {/* Lidlar (CRM) */}
    <Route path="leads" element={<LeadsListPage />} />
    <Route path="leads/stats" element={<LeadsStatsPage />} />
    <Route path="leads/settings" element={<LeadsSettingsPage />}>
      <Route index element={<LeadOptionsTab kind="source" addLabel="Yangi manba" />} />
      <Route
        path="direction"
        element={<LeadOptionsTab kind="direction" addLabel="Yangi yo'nalish" />}
      />
      <Route
        path="rejection"
        element={<LeadOptionsTab kind="rejection" addLabel="Yangi sabab" />}
      />
    </Route>

    {/* Davomat - hisobot tablari route darajasida */}
    <Route path="attendance" element={<AttendanceDashboardPage />}>
      <Route index element={<AttendanceOverallPanel />} />
      <Route path="guruh-boyicha" element={<AttendancePerGroupPanel />} />
    </Route>
    <Route path="attendance/mark" element={<AttendanceMarkPage />} />
    <Route path="attendance/teachers" element={<TeacherAttendancePage />} />

    {/* Baholash */}
    <Route path="grades" element={<GradesGivePage />} />
    <Route path="rating" element={<RatingPage />}>
      <Route index element={<RatingLeaderboardPanel scope="all" />} />
      <Route path="guruh" element={<RatingLeaderboardPanel scope="group" />} />
    </Route>
    <Route path="settings/rating" element={<RatingSettingsPage />} />

    {/* Aloqa: Notifications + Feedback */}
    <Route path="notifications" element={<NotificationsListPage />} />
    <Route path="notifications/:id" element={<NotificationDetailPage />} />
    <Route path="inbox" element={<OwnerInboxPage />} />
    <Route path="notification-templates" element={<NotificationTemplatesListPage />} />
    <Route path="holidays" element={<HolidaysListPage />} />
    <Route path="feedback/dashboard" element={<FeedbackDashboardPage />} />
    <Route path="feedback" element={<FeedbackListPage />} />
    <Route path="feedback/:id" element={<FeedbackDetailPage />} />
    <Route path="feedback-types" element={<FeedbackTypesListPage />} />

    <Route path="settings/attendance" element={<AttendanceSettingsPage />} />

    {/* Moliya - bazaviy URL moliyaviy hisob-kitobga yo'naltiriladi */}
    <Route path="finance" element={<Navigate to="/owner/finance/accounting" replace />} />

    {/* Moliyaviy hisob-kitob - umumiy hisobot sahifasi */}
    <Route path="finance/accounting" element={<FinanceReportPage />} />

    {/* O'quvchi to'lovlari - tablar route darajasida */}
    <Route path="finance/student-payments" element={<StudentPaymentsPage />}>
      <Route index element={<StudentPaymentsPanel />} />
      <Route path="debtors" element={<StudentObligationsPanel />} />
    </Route>
    <Route
      path="finance/student-payments/student/:studentId"
      element={<StudentPaymentHistoryPage />}
    />

    <Route path="finance/group-fees" element={<GroupFeesPage />} />
    <Route path="finance/group-fees/:groupId" element={<GroupFeeDetailPage />} />
    <Route path="finance/discounts" element={<DiscountsPage />} />

    {/* Depozitlar - 2 tab (tranzaksiyalar + hisobotlar) */}
    <Route path="finance/deposits" element={<DepositsPage />}>
      <Route index element={<DepositsTransactionsPanel />} />
      <Route path="hisobotlar" element={<DepositsReportPanel />} />
    </Route>

    {/* O'qituvchi maoshlari - tablar route darajasida */}
    <Route path="finance/teacher-salaries" element={<TeacherSalariesPage />}>
      <Route index element={<TeacherSalariesPanel />} />
      <Route path="qoldiqlar" element={<TeacherObligationsPage />} />
      <Route path="maosh-belgilash" element={<SalaryConfigsPage />} />
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

    {/* Eski havolalar (redirect) */}
    <Route
      path="finance/salary-configs"
      element={<Navigate to="/owner/finance/teacher-salaries/maosh-belgilash" replace />}
    />
    <Route
      path="finance/obligations"
      element={<Navigate to="/owner/finance/student-payments/debtors" replace />}
    />

    <Route path="profile" element={<ProfilePage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);

export default OwnerRoutes;
