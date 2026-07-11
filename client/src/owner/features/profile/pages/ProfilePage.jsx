import { Pencil, KeyRound, UserRound } from "lucide-react";

import useAuth from "@/shared/hooks/useAuth";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";

import Card from "@/shared/components/ui/card/Card";
import Button from "@/shared/components/ui/button/Button";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";

import { formatDateUz } from "@/shared/utils/formatDate";
import { getRoleLabel } from "@/shared/helpers/role.helpers";

import ProfileEditModal from "../components/ProfileEditModal";
import ProfilePasswordModal from "../components/ProfilePasswordModal";

const InfoRow = ({ label, value }) => (
  <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2 py-2 border-b last:border-b-0">
    <span className="text-sm text-muted-foreground sm:w-44 shrink-0">
      {label}
    </span>
    <span className="text-sm font-medium text-gray-900">{value || "-"}</span>
  </div>
);

const ProfilePage = () => {
  const { user, role } = useAuth();
  const { openModal } = useModal();

  if (!user) {
    return (
      <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>
    );
  }

  const fullName = `${user.firstName} ${user.lastName}`.trim();

  return (
    <div className="space-y-4 mx-auto w-full max-w-3xl py-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Profil</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => openModal(MODAL.PROFILE_CHANGE_PASSWORD)}
          >
            <KeyRound className="size-4" />
            Parolni o'zgartirish
          </Button>
          <Button onClick={() => openModal(MODAL.PROFILE_EDIT, { user })}>
            <Pencil className="size-4" />
            Tahrirlash
          </Button>
        </div>
      </header>

      <Card>
        <div className="flex items-center gap-3 pb-4 border-b">
          <div className="flex items-center justify-center size-14 rounded-full bg-primary/10 text-primary">
            <UserRound className="size-7" />
          </div>
          <div>
            <p className="font-semibold text-lg text-gray-900">{fullName}</p>
            <p className="text-sm text-muted-foreground">
              {getRoleLabel(role)}
            </p>
          </div>
        </div>

        <div className="pt-2">
          <InfoRow label="Ism" value={user.firstName} />
          <InfoRow label="Familiya" value={user.lastName} />
          <InfoRow label="Foydalanuvchi nomi" value={user.username} />
          <InfoRow label="Rol" value={getRoleLabel(role)} />
          <InfoRow
            label="Ro'yxatdan o'tgan sana"
            value={formatDateUz(user.createdAt)}
          />
        </div>
      </Card>

      <ModalWrapper name={MODAL.PROFILE_EDIT} title="Profilni tahrirlash">
        <ProfileEditModal />
      </ModalWrapper>
      <ModalWrapper
        name={MODAL.PROFILE_CHANGE_PASSWORD}
        title="Parolni o'zgartirish"
      >
        <ProfilePasswordModal />
      </ModalWrapper>
    </div>
  );
};

export default ProfilePage;
