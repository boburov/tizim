import { NotificationDetailPage } from "@/owner/features/notifications";

// Owner detail sahifasini teacher route'iga moslab ishlatamiz -
// faqat "orqaga" yo'nalishi teacher ro'yxatiga qaytadi.
const TeacherNotificationDetailPage = () => (
  <NotificationDetailPage backTo="/teacher/notifications" />
);

export default TeacherNotificationDetailPage;
