// Icons
import { Plus } from "lucide-react";

// Components
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import Button from "@/shared/components/ui/button/Button";
import BranchCard from "../components/BranchCard";
import BranchCreateModal from "../components/modals/BranchCreateModal";
import BranchEditModal from "../components/modals/BranchEditModal";
import BranchDeleteModal from "../components/modals/BranchDeleteModal";
import BranchFreezeModal from "../components/modals/BranchFreezeModal";
import UserPasswordModal from "@/owner/features/users/components/UserPasswordModal";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";
import useBranchesQuery from "../hooks/useBranchesQuery";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";

// Ikki rejimda ishlaydi:
//   • ko'p filialli - "Filiallar" ro'yxati, yangi filial ochish mumkin
//   • yakka markaz  - Sozlamalar ichida "Markaz" sifatida ochiladi, ro'yxatda
//     bitta karta bo'ladi va yangi filial ochish tugmasi yo'q (serverda ham
//     POST /branches 403 qaytaradi)
const BranchesPage = () => {
  const { openModal } = useModal();
  const { hasAll } = usePermissions();
  const { multiBranch } = useAuth();
  const { data, isLoading } = useBranchesQuery({ includeInactive: true });

  const branches = data?.data || [];
  // SYSTEM_ADMIN_ACCESS - serverdagi POST /branches shuni ham talab qiladi.
  const canCreate =
    multiBranch &&
    hasAll([PERMISSIONS.SYSTEM_ADMIN_ACCESS, PERMISSIONS.BRANCHES_CREATE]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {multiBranch ? "Filiallar" : "Markaz ma'lumotlari"}
        </h1>

        {canCreate && (
          <Button onClick={() => openModal(MODAL.BRANCH_CREATE)}>
            <Plus size={18} strokeWidth={1.5} />
            Yangi filial
          </Button>
        )}
      </header>

      {isLoading && <p className="text-sm opacity-60">Yuklanmoqda...</p>}

      {!isLoading && branches.length === 0 && (
        <p className="text-sm opacity-60">Filiallar topilmadi</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {branches.map((branch) => (
          <BranchCard key={branch._id} branch={branch} />
        ))}
      </div>

      <ModalWrapper
        name={MODAL.BRANCH_CREATE}
        title="Yangi filial"
        className="max-w-2xl"
      >
        <BranchCreateModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.BRANCH_EDIT} title="Filialni tahrirlash">
        <BranchEditModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.BRANCH_FREEZE} title="Filial holati">
        <BranchFreezeModal />
      </ModalWrapper>
      {/* Filial rahbarining login/paroli - kartadagi kalit tugmasidan */}
      <ModalWrapper name={MODAL.USER_PASSWORD} title="Foydalanuvchi paroli">
        <UserPasswordModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.BRANCH_DELETE} title="Filialni o'chirish">
        <BranchDeleteModal />
      </ModalWrapper>
    </div>
  );
};

export default BranchesPage;
