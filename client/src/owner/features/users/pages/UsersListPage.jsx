import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Plus, UserCog } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";
import UserStatusFilter from "../components/UserStatusFilter";
import { allowedStatusesForTab } from "../utils/userStatusFilter";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import UserCreateModal from "../components/UserCreateModal";
import StaffCreateModal from "../components/StaffCreateModal";
import UserDeleteModal from "../components/UserDeleteModal";
import UserPermanentDeleteModal from "../components/UserPermanentDeleteModal";
import UserRestoreModal from "../components/UserRestoreModal";
import UserEditModal from "../components/UserEditModal";
import UserPasswordModal from "../components/UserPasswordModal";
import UserFreezeModal from "../components/UserFreezeModal";
import UserUnfreezeModal from "../components/UserUnfreezeModal";
import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";
import { MODAL } from "@/shared/constants/modals";
import { ROLES } from "@/shared/constants/roles";
import { PERMISSIONS } from "@/shared/constants/permissions";

const BASE = "/owner/users";

// Layout: tablar (O'qituvchilar/O'quvchilar) route darajasida. archived va modallar
// shu yerda - Outlet context orqali tab panellariga uzatiladi.
const UsersListPage = () => {
  const { pathname } = useLocation();
  const [status, setStatus] = useState("active");
  const { openModal } = useModal();
  const { has } = usePermissions();

  // Joriy rol (yaratish tugmasi uchun): teachers/students, "Hammasi"da - o'quvchi.
  const currentRole = pathname.endsWith("/teachers")
    ? ROLES.TEACHER
    : pathname.endsWith("/students")
      ? ROLES.STUDENT
      : ROLES.STUDENT;

  // Joriy tab (holat filtri variantlari uchun).
  const tab = pathname.endsWith("/teachers")
    ? "teachers"
    : pathname.endsWith("/students")
      ? "students"
      : "all";

  // Status shu tabga mos kelmasa (masalan o'quvchida "Arxiv") - render vaqtida
  // "Faol"ga tushiramiz. State'ni saqlaymiz: boshqa tabga qaytganda tiklanadi.
  const effectiveStatus = allowedStatusesForTab(tab).includes(status)
    ? status
    : "active";

  const items = [
    { to: BASE, label: "Hammasi", exact: true },
    { to: `${BASE}/students`, label: "O'quvchilar" },
    { to: `${BASE}/teachers`, label: "O'qituvchilar" },
  ];

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Foydalanuvchilar</h1>
        {effectiveStatus !== "archived" && (
          <div className="flex items-center gap-2">
            {/* Xodim - direktor/administrator (custom rol + filial) */}
            {has(PERMISSIONS.ROLES_UPDATE) && (
              <Button
                variant="outline"
                onClick={() => openModal(MODAL.STAFF_CREATE)}
              >
                <UserCog className="size-4" />
                Xodim qo'shish
              </Button>
            )}
            <Button
              onClick={() => openModal(MODAL.USER_CREATE, { defaultRole: currentRole })}
            >
              <Plus className="size-4" />
              Yangi foydalanuvchi
            </Button>
          </div>
        )}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsLinks items={items} />
        <UserStatusFilter value={effectiveStatus} onChange={setStatus} tab={tab} />
      </div>
      <Outlet context={{ status: effectiveStatus }} />

      <ModalWrapper name={MODAL.USER_CREATE} title="Yangi foydalanuvchi">
        <UserCreateModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.STAFF_CREATE} title="Xodim qo'shish">
        <StaffCreateModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.USER_DELETE} title="Foydalanuvchini arxivlash">
        <UserDeleteModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.USER_PERMANENT_DELETE} title="Butunlay o'chirish">
        <UserPermanentDeleteModal />
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
      <ModalWrapper name={MODAL.USER_FREEZE} title="O'quvchini muzlatish">
        <UserFreezeModal />
      </ModalWrapper>
      <ModalWrapper
        name={MODAL.USER_UNFREEZE}
        title="Muzlatishdan chiqarish"
      >
        <UserUnfreezeModal />
      </ModalWrapper>
    </div>
  );
};

export default UsersListPage;
