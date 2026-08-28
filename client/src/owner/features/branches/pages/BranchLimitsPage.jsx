// React
import { useState } from "react";

// Icons
import { Check, SlidersHorizontal } from "lucide-react";

// Components
import DataTable from "@/shared/components/ui/table/DataTable";
import Button from "@/shared/components/ui/button/Button";
import InputMoney from "@/shared/components/ui/input/InputMoney";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import BranchDelegationModal from "../components/modals/BranchDelegationModal";

// Hooks
import useModal from "@/shared/hooks/useModal";
import useBranchesQuery from "../hooks/useBranchesQuery";
import { useBranchUpdateMutation } from "../hooks/useBranchMutations";

// Constants
import { MODAL } from "@/shared/constants/modals";

/**
 * Bitta qator uchun limit tahriri.
 *
 * Har qator o'z holatini saqlaydi: sahifa darajasida bitta obyektda
 * saqlansa, bitta filialni tahrirlash boshqasining kiritilgan qiymatini
 * o'chirib yuborardi.
 */
const LimitRow = ({ branch }) => {
  const [value, setValue] = useState(
    branch.expenseApprovalThreshold ?? "",
  );

  const { mutate, isPending } = useBranchUpdateMutation();

  const current = branch.expenseApprovalThreshold ?? "";
  const dirty = String(value) !== String(current);

  const save = () => {
    const trimmed = String(value).trim();
    mutate({
      id: branch._id,
      // Bo'sh qiymat = "limit yo'q" (null), 0 emas. Server null'ni
      // "tasdiq talab qilinmaydi" deb o'qiydi.
      body: { expenseApprovalThreshold: trimmed === "" ? null : Number(trimmed) },
    });
  };

  return (
    <div className="flex items-center gap-2">
      <InputMoney
        value={value}
        disabled={isPending}
        placeholder="Limitsiz"
        className="max-w-[180px]"
        onChange={(e) => setValue(e.target.value)}
      />
      {dirty && (
        <Button
          type="button"
          size="icon"
          onClick={save}
          disabled={isPending}
          aria-label="Saqlash"
          className="size-9 shrink-0"
        >
          <Check size={16} strokeWidth={2} />
        </Button>
      )}
    </div>
  );
};

/**
 * Cheklovlar ustuni: filial rahbariga qo'yilgan cheklovlar soni.
 *
 * DIQQAT - SON CHEKLOVNI bildiradi, ruxsatni EMAS. Standart holatda
 * rahbar hamma sozlamani o'zi hal qiladi, matritsaga esa faqat undan
 * OLIB QO'YILGAN amallar yoziladi. Shuning uchun 0 = "to'liq erkin",
 * ko'p = "ko'p narsa cheklangan".
 *
 * Faqat SON ko'rsatiladi, ro'yxat emas - jadval qatoriga 5 ta tur
 * sig'masdi va eng kerakli savol baribir "umuman cheklanganmi" degani.
 */
const DelegationCell = ({ branch }) => {
  const { openModal } = useModal();
  const count = Object.keys(branch.delegation || {}).length;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={() => openModal(MODAL.BRANCH_DELEGATION, { branch })}
    >
      <SlidersHorizontal size={14} strokeWidth={2} />
      {count > 0 ? `${count} ta cheklov` : "Cheklovsiz"}
    </Button>
  );
};

/**
 * Filiallarning chiqim tasdiq limitlari va ishonch darajasi bitta jadvalda.
 *
 * Ilgari bu maydon faqat filialni tahrirlash modalida edi - "qaysi
 * filialda limit qancha" degan savolga javob berish uchun har birini
 * navbatma-navbat ochish kerak edi.
 */
const BranchLimitsPage = () => {
  const { data, isLoading } = useBranchesQuery({ includeInactive: false });
  const branches = data?.data || [];

  const columns = [
    {
      key: "name",
      header: "Filial",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (row) => <span className="text-sm font-medium">{row.name}</span>,
    },
    {
      key: "threshold",
      header: "Tasdiq limiti",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (row) => <LimitRow branch={row} />,
    },
    {
      key: "delegation",
      header: "Cheklovlar",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (row) => <DelegationCell branch={row} />,
    },
  ];

  const renderCard = (row) => (
    <div className="space-y-2">
      <p className="text-sm font-medium">{row.name}</p>
      <LimitRow branch={row} />
      <DelegationCell branch={row} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Limitlar va cheklovlar</h1>
        {/* OQIBATI EKRANDAN KO'RINMAYDI: bo'sh maydon "cheksiz" degani.
            Moliyaviy nazorat sozlamasi, shuning uchun izoh qoladi. */}
        <p className="mt-1 text-sm text-muted-foreground">
          Limitdan oshgan chiqim tasdiqdan o'tadi; bo'sh qoldirilsa — tasdiqsiz
        </p>
      </div>

      <DataTable
        rows={branches}
        columns={columns}
        isLoading={isLoading}
        renderCard={renderCard}
        empty={
          <p className="py-8 text-center text-sm opacity-60">
            Filiallar topilmadi
          </p>
        }
      />

      <ModalWrapper name={MODAL.BRANCH_DELEGATION} title="Ishonch darajasi">
        <BranchDelegationModal />
      </ModalWrapper>
    </div>
  );
};

export default BranchLimitsPage;
