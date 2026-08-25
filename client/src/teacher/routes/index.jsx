// Router
import { Routes, Route, Navigate } from "react-router-dom";

// Pages
import {
  MyGroupsPage,
  MyGroupDetailPage,
  MyStudentDetailPage,
  MyStudentAttendancePanel,
  MyStudentExemptionsPanel,
} from "@/teacher/features/groups";
import { TeacherProfilePage } from "@/teacher/features/profile";
import {
  TeacherAttendancePage,
  TeacherAttendanceMarkPage,
} from "@/teacher/features/attendance";
import {
  TeacherGradesPage,
  TeacherGradesMarkPage,
} from "@/teacher/features/grades";
import {
  TeacherNotificationsListPage,
  TeacherNotificationDetailPage,
  MyInboxPage,
} from "@/teacher/features/notifications";
import {
  TeacherAssignmentsListPage,
  TeacherAssignmentDetailPage,
} from "@/teacher/features/assignments";
import { MyFeedbackPage } from "@/teacher/features/feedback";
import { TeacherFinancePage } from "@/teacher/features/finance";
import { TeacherCoinsPage } from "@/teacher/features/market";
import CoinGuard from "@/shared/components/guards/CoinGuard";
import NotFoundPage from "@/shared/components/ui/feedback/NotFoundPage";

const TeacherRoutes = () => (
  <Routes>
    <Route index element={<Navigate to="groups" replace />} />
    <Route path="groups" element={<MyGroupsPage />} />
    <Route path="groups/:id" element={<MyGroupDetailPage />} />
    <Route
      path="groups/:id/students/:studentId"
      element={<MyStudentDetailPage />}
    >
      <Route index element={<MyStudentAttendancePanel />} />
      <Route path="ozod" element={<MyStudentExemptionsPanel />} />
    </Route>
    <Route path="attendance" element={<TeacherAttendancePage />} />
    <Route path="attendance/:groupId" element={<TeacherAttendanceMarkPage />} />
    <Route path="grades" element={<TeacherGradesPage />} />
    <Route path="grades/:groupId" element={<TeacherGradesMarkPage />} />
    <Route path="assignments" element={<TeacherAssignmentsListPage />} />
    <Route path="assignments/:id" element={<TeacherAssignmentDetailPage />} />
    <Route path="notifications" element={<TeacherNotificationsListPage />} />
    <Route
      path="notifications/:id"
      element={<TeacherNotificationDetailPage />}
    />
    <Route path="inbox" element={<MyInboxPage />} />
    <Route path="feedback" element={<MyFeedbackPage />} />
    <Route path="finance" element={<TeacherFinancePage />} />
    {/* Tanga — o'qituvchi uni O'ZI chiqaradi (davomat va baho), lekin
        natijani ko'rmasa rag'bat u uchun ko'rinmas bo'lib qoladi. */}
    <Route
      path="coins"
      element={
        <CoinGuard fallback="/teacher/groups">
          <TeacherCoinsPage />
        </CoinGuard>
      }
    />
    <Route path="profile" element={<TeacherProfilePage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);

export default TeacherRoutes;
