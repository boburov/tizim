import { Outlet, useParams } from "react-router-dom";
import { Pencil, Trash2, Archive, Snowflake, Sun, Building2 } from "lucide-react";

import Button from "@/shared/components/ui/button/Button";
import Badge from "@/shared/components/ui/badge/Badge";
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";

import StudentAddToGroupModal from "@/owner/features/groups/components/modals/StudentAddToGroupModal";
import UserEditModal from "../components/UserEditModal";
import UserDeleteModal from "../components/UserDeleteModal";
import UserPermanentDeleteModal from "../components/UserPermanentDeleteModal";
import UserPasswordModal from "../components/UserPasswordModal";
import UserFreezeModal from "../components/UserFreezeModal";
import UserUnfreezeModal from "../components/UserUnfreezeModal";
import UserFreezeHistory from "../components/UserFreezeHistory";
import { TeacherCompensationCard } from "@/owner/features/teacherSalary";
import UserBranchModal from "../components/UserBranchModal";
import {
  ExemptionCreateModal,
  ExemptionDeleteModal,
} from "@/owner/features/attendanceExemptions";

import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";
import useActiveBranch from "@/shared/hooks/useActiveBranch";
import useGoBack from "@/shared/hooks/useGoBack";
import useUserDetailQuery from "../hooks/useUserDetailQuery";
import useUserGroupHistoryQuery from "../hooks/useUserGroupHistoryQuery";

import { MODAL } from "@/shared/constants/modals";
import { ROLES } from "@/shared/constants/roles";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { getRoleLabel, hasValidRole } from "@/shared/helpers/role.helpers";
import BackLink from "@/shared/components/ui/link/BackLink";

// Layout: tablar route darajasida (Outlet). O'quvchida 5 tab, boshqalarida faqat
// Profil. profile/history Outlet context orqali panellarga uzatiladi.
const UserDetailPage = () => {
  const { id } = useParams();
  // Fallback (tarix bo'sh bo'lsa) - profil hali yuklanmagan bo'lishi mumkin,
  // shuning uchun o'quvchilar ro'yxati.
  const goBack = useGoBack("/owner/students");
  const { openModal } = useModal();
  const { has } = usePermissions();
  const { hasMultipleBranches } = useActiveBranch();
  const { data: profile, isLoading, isError } = useUserDetailQuery(id);
  const isStudent = profile?.role === ROLES.STUDENT;
  const isTeacher = profile?.role === ROLES.TEACHER;

  // Ro'yxat endi rol bo'yicha ikkiga bo'lingan - qaysi biridan kelgan bo'lsa
  // o'shanga qaytaramiz.
  const listUrl = isStudent ? "/owner/students" : "/owner/teachers";

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
          className="text-blue-600 dark:text-blue-300 hover:underline cursor-pointer"
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
      { to: `${BASE}/depozit`, label: "To'lov" },
      { to: `${BASE}/tarix`, label: "Guruhlar tarixi" },
      { to: `${BASE}/arxiv`, label: "Arxiv" },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <BackLink to={listUrl} />
          <h1 className="text-2xl font-semibold truncate">
            {profile.firstName} {profile.lastName}
          </h1>
          <Badge variant={hasValidRole(profile.role) ? "secondary" : "destructive"}>
            {getRoleLabel(profile.role)}
          </Badge>
          {isStudent && profile.isFrozen && (
            <Badge className="bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300">Muzlatilgan</Badge>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => openModal(MODAL.USER_EDIT, { user: profile })}>
            <Pencil className="size-4" />
            Tahrirlash
          </Button>
          {/* Filial biriktiruvi - faqat ko'p filialli markazlarda va
              rol boshqarish huquqi borlar uchun */}
          {hasMultipleBranches && has(PERMISSIONS.ROLES_UPDATE) && (
            <Button
              variant="outline"
              onClick={() => openModal(MODAL.USER_BRANCH, { user: profile })}
            >
              <Building2 className="size-4" />
              Filial
            </Button>
          )}
          {isStudent && profile.isActive && (
            profile.isFrozen ? (
              <Button
                variant="outline"
                className="text-sky-600 dark:text-sky-300"
                onClick={() => openModal(MODAL.USER_UNFREEZE, { user: profile })}
              >
                <Sun className="size-4" />
                Muzlatishdan chiqarish
              </Button>
            ) : (
              <Button
                variant="outline"
                className="text-sky-600 dark:text-sky-300"
                onClick={() => openModal(MODAL.USER_FREEZE, { user: profile })}
              >
                <Snowflake className="size-4" />
                Muzlatish
              </Button>
            )
          )}
          {/* O'quvchi arxivlanmaydi - faqat o'qituvchi/boshqa rollar uchun */}
          {!isStudent && (
            <Button
              variant="outline"
              className="text-amber-600 dark:text-amber-300"
              onClick={() => openModal(MODAL.USER_DELETE, { user: profile })}
            >
              <Archive className="size-4" />
              Arxivlash
            </Button>
          )}
          <Button
            variant="outline"
            className="text-red-600 dark:text-red-300"
            onClick={() => openModal(MODAL.USER_PERMANENT_DELETE, { user: profile })}
          >
            <Trash2 className="size-4" />
            O'chirish
          </Button>
        </div>
      </div>

      {isStudent && <UserFreezeHistory studentId={id} />}

      {/* MAOSH STAVKASI - o'qituvchi profilining eng muhim moliyaviy bloki.
          Tab ichida emas, ATAYLAB yuqorida: stavkasiz o'qituvchi maoshi 0
          bo'lib hisoblanadi va bu darhol ko'zga tashlanishi kerak. */}
      {isTeacher && (
        <TeacherCompensationCard teacherId={id} hiredAt={profile.hiredAt} />
      )}

      <TabsLinks items={tabs} />
      <Outlet context={{ profile, historyData, historyLoading, noActiveGroup }} />

      {/* Profil modallari */}
      <ModalWrapper name={MODAL.USER_BRANCH} title="Filial biriktiruvi" className="max-w-xl">
        <UserBranchModal />
      </ModalWrapper>
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

      {/* Muzlatish modallari (faqat o'quvchi) */}
      {isStudent && (
        <>
          <ModalWrapper name={MODAL.USER_FREEZE} title="O'quvchini muzlatish">
            <UserFreezeModal />
          </ModalWrapper>
          <ModalWrapper
            name={MODAL.USER_UNFREEZE}
            title="Muzlatishdan chiqarish"
          >
            <UserUnfreezeModal />
          </ModalWrapper>
        </>
      )}

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
