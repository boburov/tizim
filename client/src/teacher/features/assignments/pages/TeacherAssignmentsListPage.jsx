// Sahifa owner panelidagi bilan BIR XIL komponentdan quriladi - server
// ko'lamni o'zi kesadi (o'qituvchiga faqat o'zi yuborganlari qaytadi),
// shuning uchun nusxa olishning ma'nosi yo'q.
import { AssignmentsListPage } from "@/owner/features/assignments";

const TeacherAssignmentsListPage = () => (
  <AssignmentsListPage basePath="/teacher/assignments" />
);

export default TeacherAssignmentsListPage;
