// Icons
import { Plus } from "lucide-react";

// Components
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import Button from "@/shared/components/ui/button/Button";
import BranchCard from "../components/BranchCard";
import BranchCreateModal from "../components/modals/BranchCreateModal";
import BranchEditModal from "../components/modals/BranchEditModal";
import BranchDeleteModal from "../components/modals/BranchDeleteModal";

// Hooks
import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";
import useBranchesQuery from "../hooks/useBranchesQuery";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";

const BranchesPage = () => {
  const { openModal } = useModal();
  const { has } = usePermissions();
  const { data, isLoading } = useBranchesQuery({ includeInactive: true });

  const branches = data?.data || [];
  const canCreate = has(PERMISSIONS.BRANCHES_CREATE);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Filiallar</h1>
          <p className="text-sm opacity-60">
            Har bir filialning moliyasi, davomati va xodimlari alohida yuritiladi
          </p>
        </div>

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

      <ModalWrapper name={MODAL.BRANCH_CREATE} title="Yangi filial">
        <BranchCreateModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.BRANCH_EDIT} title="Filialni tahrirlash">
        <BranchEditModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.BRANCH_DELETE} title="Filialni o'chirish">
        <BranchDeleteModal />
      </ModalWrapper>
    </div>
  );
};

export default BranchesPage;
