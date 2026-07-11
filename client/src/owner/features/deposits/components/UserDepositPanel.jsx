import { useOutletContext } from "react-router-dom";
import { Plus, Minus, HandCoins, Wallet } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import StatCard from "@/shared/components/ui/card/StatCard";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { formatMoney } from "@/shared/utils/formatMoney";
import {
  useDepositSummaryQuery,
  useDepositHistoryQuery,
} from "../hooks/useDepositQueries";
import { useDepositApplyMutation } from "../hooks/useDepositMutations";
import DepositFormModal from "./modals/DepositFormModal";
import DepositHistoryList from "./DepositHistoryList";

// O'quvchi detail "Depozit" tabi - profile Outlet context'dan keladi.
const UserDepositPanel = () => {
  const { profile } = useOutletContext();
  const { openModal } = useModal();
  const student = profile;
  const studentId = profile?._id;

  const { data: summary } = useDepositSummaryQuery(studentId);
  const { data: history = [], isLoading } = useDepositHistoryQuery(studentId);
  const applyMut = useDepositApplyMutation();

  const balance = summary?.balance ?? 0;

  return (
    <div className="space-y-4 pt-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Balans" value={balance} icon={Wallet} isMoney tone={balance ? "positive" : "default"} />
        <StatCard label="Jami kirim" value={summary?.totalTopup ?? 0} icon={Plus} isMoney />
        <StatCard label="Jami chiqim" value={summary?.totalWithdraw ?? 0} icon={Minus} isMoney />
        <StatCard label="Qoplangan" value={summary?.totalApplied ?? 0} icon={HandCoins} isMoney />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => openModal(MODAL.DEPOSIT_ADD, { mode: "add", student })}>
          <Plus className="size-4" />
          Depozit qo'shish
        </Button>
        <Button
          variant="outline"
          onClick={() => openModal(MODAL.DEPOSIT_WITHDRAW, { mode: "withdraw", student })}
        >
          <Minus className="size-4" />
          Yechib olish
        </Button>
        <Button
          variant="outline"
          disabled={applyMut.isPending || balance <= 0}
          onClick={() => applyMut.mutate({ studentId })}
        >
          <HandCoins className="size-4" />
          Qarzga qoplash
        </Button>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Tranzaksiyalar tarixi</p>
        <DepositHistoryList rows={history} isLoading={isLoading} />
      </div>

      <ModalWrapper name={MODAL.DEPOSIT_ADD} title="Depozit qo'shish" className="max-w-md">
        <DepositFormModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.DEPOSIT_WITHDRAW} title="Depozitdan yechib olish" className="max-w-md">
        <DepositFormModal />
      </ModalWrapper>
    </div>
  );
};

export default UserDepositPanel;
