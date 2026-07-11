import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";
import UserStatusFilter from "../components/UserStatusFilter";
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
  const [status, setStatus] = useState("active");
  const { openModal } = useModal();

  // Joriy rol (yaratish tugmasi uchun): teachers/students, "Hammasi"da - o'quvchi.
  const currentRole = pathname.endsWith("/teachers")
    ? ROLES.TEACHER
    : pathname.endsWith("/students")
      ? ROLES.STUDENT
      : ROLES.STUDENT;

  const items = [
    { to: BASE, label: "Hammasi", exact: true },
    { to: `${BASE}/students`, label: "O'quvchilar" },
    { to: `${BASE}/teachers`, label: "O'qituvchilar" },
  ];

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Foydalanuvchilar</h1>
        {status !== "archived" && (
          <Button onClick={() => openModal(MODAL.USER_CREATE, { defaultRole: currentRole })}>
            <Plus className="size-4" />
            Yangi foydalanuvchi
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsLinks items={items} />
        <UserStatusFilter value={status} onChange={setStatus} />
      </div>
      <Outlet context={{ status }} />

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
