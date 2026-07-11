import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";
import ArchiveToggle from "@/shared/components/ui/archive/ArchiveToggle";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import UserCreateModal from "../components/UserCreateModal";
import UserDeleteModal from "../components/UserDeleteModal";
import UserRestoreModal from "../components/UserRestoreModal";
import UserEditModal from "../components/UserEditModal";
import UserPasswordModal from "../components/UserPasswordModal";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { ROLES } from "@/shared/constants/roles";

const BASE = "/owner/users";

// Layout: tablar (O'qituvchilar/O'quvchilar) route darajasida. archived va modallar
// shu yerda - Outlet context orqali tab panellariga uzatiladi.
const UsersListPage = () => {
  const { pathname } = useLocation();
  const [archived, setArchived] = useState(false);
  const { openModal } = useModal();

  const currentRole = pathname.endsWith("/teachers") ? ROLES.TEACHER : ROLES.STUDENT;

  const items = [
    { to: BASE, label: "O'quvchilar", exact: true },
    { to: `${BASE}/teachers`, label: "O'qituvchilar" },
  ];

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Foydalanuvchilar</h1>
        {!archived && (
          <Button onClick={() => openModal(MODAL.USER_CREATE, { defaultRole: currentRole })}>
            <Plus className="size-4" />
            Yangi foydalanuvchi
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsLinks items={items} />
        <ArchiveToggle value={archived} onChange={setArchived} />
      </div>
      <Outlet context={{ archived }} />

      <ModalWrapper name={MODAL.USER_CREATE} title="Yangi foydalanuvchi">
        <UserCreateModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.USER_DELETE} title="Foydalanuvchini arxivlash">
        <UserDeleteModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.USER_RESTORE} title="Foydalanuvchini tiklash">
        <UserRestoreModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.USER_EDIT} title="Profilni tahrirlash" className="max-w-xl">
        <UserEditModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.USER_PASSWORD} title="Foydalanuvchi paroli">
        <UserPasswordModal />
      </ModalWrapper>
    </div>
  );
};

export default UsersListPage;
