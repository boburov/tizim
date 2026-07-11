import { Outlet } from "react-router-dom";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";
import { MODAL } from "@/shared/constants/modals";

import LeadOptionCreateModal from "../components/LeadOptionCreateModal";
import LeadOptionEditModal from "../components/LeadOptionEditModal";
import LeadOptionDeleteModal from "../components/LeadOptionDeleteModal";

const BASE = "/owner/leads/settings";

const LeadsSettingsPage = () => {
  const items = [
    { to: BASE, label: "Manba", exact: true },
    { to: `${BASE}/direction`, label: "Yo'nalish" },
    { to: `${BASE}/rejection`, label: "Rad etish sabablari" },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Lid sozlamalari</h1>
      </header>

      <TabsLinks items={items} />
      <div className="pt-3">
        <Outlet />
      </div>

      <ModalWrapper name={MODAL.LEAD_OPTION_CREATE} title="Qo'shish">
        <LeadOptionCreateModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.LEAD_OPTION_EDIT} title="Tahrirlash">
        <LeadOptionEditModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.LEAD_OPTION_DELETE} title="O'chirish">
        <LeadOptionDeleteModal />
      </ModalWrapper>
    </div>
  );
};

export default LeadsSettingsPage;
