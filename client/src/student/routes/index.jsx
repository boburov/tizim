// Router
import { Routes, Route, Navigate } from "react-router-dom";

// Pages
import { MyGroupPage, StudentRemovedNoticeGate } from "@/student/features/group";
import { StudentProfilePage } from "@/student/features/profile";
import { MyAttendancePage } from "@/student/features/attendance";
import { MyRatingPage } from "@/student/features/rating";
import { MyInboxPage } from "@/student/features/notifications";
import { MyAssignmentsPage } from "@/student/features/assignments";
import { MyFeedbackPage } from "@/student/features/feedback";
import { MyMarketPage, MyCoinsPage } from "@/student/features/market";
import CoinGuard from "@/shared/components/guards/CoinGuard";
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
      <Route path="assignments" element={<MyAssignmentsPage />} />
      <Route path="inbox" element={<MyInboxPage />} />
      <Route path="feedback" element={<MyFeedbackPage />} />

      {/* ══ TANGALAR VA MARKET ══

          `CoinGuard` — ega bo'limni o'chirsa manzil ochilmaydi va
          o'quvchi bosh sahifaga qaytariladi. Server ham 404 beradi;
          qo'riqchi faqat uni bo'sh xato ekraniga tushirmaslik uchun.

          ⚠ MARKET `requireMarket` BILAN, TANGALAR EMAS. Ega faqat
          do'konni yopishi mumkin — o'shanda o'quvchi hisobini va
          tarixini KO'RISHDA DAVOM ETADI. Ikkalasiga bir xil shart
          qo'yilsa, do'kon yopilgan kuni o'quvchi o'z tangasini ham
          yo'qotgandek his qilardi. */}
      <Route
        path="market"
        element={
          <CoinGuard requireMarket fallback="/student/group">
            <MyMarketPage />
          </CoinGuard>
        }
      />
      <Route
        path="coins"
        element={
          <CoinGuard fallback="/student/group">
            <MyCoinsPage />
          </CoinGuard>
        }
      />
      <Route path="profile" element={<StudentProfilePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </>
);

export default StudentRoutes;
