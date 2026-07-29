import { Outlet } from "react-router-dom";
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import ChurnedStudentsModal from "../components/ChurnedStudentsModal";
import { MODAL } from "@/shared/constants/modals";

const BASE = "/owner/students/chiqib-ketish";

// Layout: davr presetlari (Butun davr / 12 oy / 3 oy) route darajasida.
const StudentRetentionPage = () => {
  const items = [
    { to: BASE, label: "Butun davr", exact: true },
    { to: `${BASE}/12-oy`, label: "Oxirgi 12 oy" },
    { to: `${BASE}/3-oy`, label: "Oxirgi 3 oy" },
  ];

  return (
    <div className="space-y-4">
      {/* Sarlavha StudentsPage qobig'ida (tab nomi = "Chiqib ketish").
          Bu yerdagi tablar - davr presetlari, ya'ni ichki tab qatori. */}
      <TabsLinks items={items} />
      <Outlet />

      <ModalWrapper
        name={MODAL.CHURNED_STUDENTS}
        title="Chiqib ketgan o'quvchilar"
        className="max-w-3xl"
      >
        <ChurnedStudentsModal />
      </ModalWrapper>
    </div>
  );
};

export default StudentRetentionPage;
