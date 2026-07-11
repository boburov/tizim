// Router
import { Routes, Route, Navigate } from "react-router-dom";

// Pages
import { MyGroupPage, StudentRemovedNoticeGate } from "@/student/features/group";
import { StudentProfilePage } from "@/student/features/profile";
import { MyAttendancePage } from "@/student/features/attendance";
import { MyRatingPage } from "@/student/features/rating";
import { MyInboxPage } from "@/student/features/notifications";
import { MyFeedbackPage } from "@/student/features/feedback";
import NotFoundPage from "@/shared/components/ui/feedback/NotFoundPage";

const StudentRoutes = () => (
  <>
    {/* Guruhdan chiqarilgan bo'lsa - login qilganda bir marta modal ko'rsatadi */}
    <StudentRemovedNoticeGate />

    <Routes>
      <Route index element={<Navigate to="group" replace />} />
      <Route path="group" element={<MyGroupPage />} />
      <Route path="attendance" element={<MyAttendancePage />} />
      <Route path="rating" element={<MyRatingPage />} />
      <Route path="inbox" element={<MyInboxPage />} />
      <Route path="feedback" element={<MyFeedbackPage />} />
      <Route path="profile" element={<StudentProfilePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </>
);

export default StudentRoutes;
