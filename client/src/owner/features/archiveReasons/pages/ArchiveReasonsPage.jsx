import { Outlet } from "react-router-dom";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";
import { MODAL } from "@/shared/constants/modals";

import ArchiveReasonCreateModal from "../components/ArchiveReasonCreateModal";
import ArchiveReasonEditModal from "../components/ArchiveReasonEditModal";
import ArchiveReasonDeleteModal from "../components/ArchiveReasonDeleteModal";

const BASE = "/owner/archive-reasons";

const ArchiveReasonsPage = () => {
  const items = [
    { to: BASE, label: "Sabablar", exact: true },
    { to: `${BASE}/report`, label: "Hisobot" },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Arxiv sabablari</h1>
      </header>

      <TabsLinks items={items} />
      <div className="pt-3">
        <Outlet />
      </div>

      <ModalWrapper name={MODAL.ARCHIVE_REASON_CREATE} title="Yangi sabab">
        <ArchiveReasonCreateModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.ARCHIVE_REASON_EDIT} title="Sababni tahrirlash">
        <ArchiveReasonEditModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.ARCHIVE_REASON_DELETE} title="Sababni o'chirish">
        <ArchiveReasonDeleteModal />
      </ModalWrapper>
    </div>
  );
};

export default ArchiveReasonsPage;
