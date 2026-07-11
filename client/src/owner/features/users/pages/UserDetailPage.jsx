import { Outlet, useParams } from "react-router-dom";
import { Pencil, Trash2, Archive } from "lucide-react";

import Button from "@/shared/components/ui/button/Button";
import Badge from "@/shared/components/ui/badge/Badge";
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";

import StudentAddToGroupModal from "@/owner/features/groups/components/modals/StudentAddToGroupModal";
import UserEditModal from "../components/UserEditModal";
import UserDeleteModal from "../components/UserDeleteModal";
import UserPermanentDeleteModal from "../components/UserPermanentDeleteModal";
import UserPasswordModal from "../components/UserPasswordModal";
import {
  ExemptionCreateModal,
  ExemptionDeleteModal,
} from "@/owner/features/attendanceExemptions";

import useModal from "@/shared/hooks/useModal";
import useGoBack from "@/shared/hooks/useGoBack";
import useUserDetailQuery from "../hooks/useUserDetailQuery";
import useUserGroupHistoryQuery from "../hooks/useUserGroupHistoryQuery";

import { MODAL } from "@/shared/constants/modals";
import { ROLES } from "@/shared/constants/roles";
import { getRoleLabel, hasValidRole } from "@/shared/helpers/role.helpers";
import BackLink from "@/shared/components/ui/link/BackLink";

// Layout: tablar route darajasida (Outlet). O'quvchida 5 tab, boshqalarida faqat
// Profil. profile/history Outlet context orqali panellarga uzatiladi.
const UserDetailPage = () => {
  const { id } = useParams();
  const goBack = useGoBack("/owner/users");
  const { openModal } = useModal();
  const { data: profile, isLoading, isError } = useUserDetailQuery(id);
  const isStudent = profile?.role === ROLES.STUDENT;

  const { data: historyData, isLoading: historyLoading } = useUserGroupHistoryQuery(
    isStudent ? id : null,
    { limit: 50 },
  );

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>;
  }

  if (isError || !profile) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground mb-4">Foydalanuvchi topilmadi</p>
        <button
          type="button"
          onClick={goBack}
          className="text-blue-600 hover:underline cursor-pointer"
        >
          Foydalanuvchilar ro'yxatiga qaytish
        </button>
      </div>
    );
  }

  // O'quvchi hech qaysi guruhda emas - to'lov/ozod amallari bloklanadi.
  const noActiveGroup = isStudent && (profile.activeGroups?.length ?? 0) === 0;

  const BASE = `/owner/users/${id}`;
  const tabs = [{ to: BASE, label: "Profil", exact: true }];
  if (isStudent) {
    tabs.push(
      { to: `${BASE}/davomat`, label: "Davomat" },
      { to: `${BASE}/baholar`, label: "Baholar" },
      { to: `${BASE}/ozod`, label: "Davomatdan ozod" },
      { to: `${BASE}/depozit`, label: "Depozit" },
      { to: `${BASE}/tarix`, label: "Guruhlar tarixi" },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <BackLink to="/owner/users" />
          <h1 className="text-2xl font-semibold truncate">
            {profile.firstName} {profile.lastName}
          </h1>
          <Badge variant={hasValidRole(profile.role) ? "secondary" : "destructive"}>
            {getRoleLabel(profile.role)}
          </Badge>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => openModal(MODAL.USER_EDIT, { user: profile })}>
            <Pencil className="size-4" />
            Tahrirlash
          </Button>
          <Button
            variant="outline"
            className="text-amber-600"
            onClick={() => openModal(MODAL.USER_DELETE, { user: profile })}
          >
            <Archive className="size-4" />
            Arxivlash
          </Button>
          <Button
            variant="outline"
            className="text-red-600"
            onClick={() => openModal(MODAL.USER_PERMANENT_DELETE, { user: profile })}
          >
            <Trash2 className="size-4" />
            O'chirish
          </Button>
        </div>
      </div>

      <TabsLinks items={tabs} />
      <Outlet context={{ profile, historyData, historyLoading, noActiveGroup }} />

      {/* Profil modallari */}
      <ModalWrapper name={MODAL.USER_EDIT} title="Profilni tahrirlash" className="max-w-xl">
        <UserEditModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.USER_DELETE} title="Foydalanuvchini arxivlash">
        <UserDeleteModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.USER_PERMANENT_DELETE} title="Butunlay o'chirish">
        <UserPermanentDeleteModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.USER_PASSWORD} title="Foydalanuvchi paroli">
        <UserPasswordModal />
      </ModalWrapper>

      {/* O'quvchini guruhga qo'shish */}
      {isStudent && (
        <ModalWrapper name={MODAL.STUDENT_ADD_TO_GROUP} title="O'quvchini guruhga qo'shish">
          <StudentAddToGroupModal />
        </ModalWrapper>
      )}

      {/* Davomatdan ozod modallari */}
      {isStudent && (
        <>
          <ModalWrapper name={MODAL.ATTENDANCE_EXEMPTION_CREATE} title="Davomatdan ozod qilish">
            <ExemptionCreateModal />
          </ModalWrapper>
          <ModalWrapper name={MODAL.ATTENDANCE_EXEMPTION_DELETE} title="Davrni o'chirish">
            <ExemptionDeleteModal />
          </ModalWrapper>
        </>
      )}
    </div>
  );
};

export default UserDetailPage;
