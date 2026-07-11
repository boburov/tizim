import { useMemo } from "react";
import { Plus, Minus, Trash2 } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import DataTable from "@/shared/components/ui/table/DataTable";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import useModal from "@/shared/hooks/useModal";
import useObjectState from "@/shared/hooks/useObjectState";
import { MODAL } from "@/shared/constants/modals";
import { ROLES } from "@/shared/constants/roles";
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateUz } from "@/shared/utils/formatDate";
import useUsersListQuery from "@/owner/features/users/hooks/useUsersListQuery";
import { useDepositTransactionsQuery } from "../hooks/useDepositQueries";
import { useDepositTxnRemoveMutation } from "../hooks/useDepositMutations";
import DepositFormModal from "./modals/DepositFormModal";
import { kindMeta, methodLabel } from "../utils/labels";

const TYPE_OPTIONS = [
  { value: "", label: "Barchasi" },
  { value: "topup", label: "Kirim" },
  { value: "withdraw", label: "Chiqim" },
  { value: "refund", label: "Qaytarim" },
];
const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";
const fullName = (s) => `${s?.firstName || ""} ${s?.lastName || ""}`.trim() || "-";

const DepositsTransactionsPanel = () => {
  const { openModal } = useModal();
  const filters = useObjectState({ studentId: "", from: "", to: "", type: "" });
  const removeMut = useDepositTxnRemoveMutation();

  const { data: studentsData } = useUsersListQuery({ role: ROLES.STUDENT, limit: 200 });
  const studentOptions = useMemo(
    () => [
      { value: "", label: "Barcha o'quvchilar" },
      ...(studentsData?.data || []).map((s) => ({ value: s._id, label: fullName(s) })),
    ],
    [studentsData],
  );

  const { data, isLoading } = useDepositTransactionsQuery({
    studentId: filters.studentId || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    type: filters.type || undefined,
    limit: 200,
  });
  const rows = data?.data || [];

  const columns = [
    {
      key: "student",
      header: "O'quvchi",
      headerClassName: th,
      cell: (r) => <span className="font-medium">{fullName(r.student)}</span>,
    },
    {
      key: "type",
      header: "Tur",
      headerClassName: th,
      cell: (r) => {
        const meta = kindMeta(r.type);
        return <span className={`font-medium ${meta.tone}`}>{meta.label}</span>;
      },
    },
    {
      key: "amount",
      header: "Summa",
      headerClassName: th,
      cell: (r) => {
        const meta = kindMeta(r.type);
        return (
          <span className={`tabular-nums ${meta.tone}`}>
            {meta.sign}
            {formatMoney(r.amount)}
          </span>
        );
      },
    },
    { key: "method", header: "Usul", headerClassName: th, cell: (r) => methodLabel(r.method) },
    { key: "paidAt", header: "Sana", headerClassName: th, cell: (r) => formatDateUz(r.paidAt) },
    {
      key: "action",
      header: "",
      headerClassName: th,
      className: "text-right",
      cell: (r) =>
        r.type !== "refund" ? (
          <button
            type="button"
            disabled={removeMut.isPending}
            onClick={() => removeMut.mutate(r._id)}
            aria-label="O'chirish"
          >
            <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
          </button>
        ) : null,
    },
  ];

  const renderCard = (r) => {
    const meta = kindMeta(r.type);
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-medium">{fullName(r.student)}</span>
          <span className={`font-semibold tabular-nums ${meta.tone}`}>
            {meta.sign}
            {formatMoney(r.amount)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {meta.label} · {methodLabel(r.method)} · {formatDateUz(r.paidAt)}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <SelectField
            searchable
            label="O'quvchi"
            value={filters.studentId}
            onChange={(v) => filters.setField("studentId", v)}
            options={studentOptions}
          />
          <InputField
            name="from"
            type="date"
            label="Boshlanish"
            value={filters.from}
            onChange={(e) => filters.setField("from", e.target.value)}
          />
          <InputField
            name="to"
            type="date"
            label="Tugash"
            value={filters.to}
            onChange={(e) => filters.setField("to", e.target.value)}
          />
          <SelectField
            label="Tur"
            value={filters.type}
            onChange={(v) => filters.setField("type", v)}
            options={TYPE_OPTIONS}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => openModal(MODAL.DEPOSIT_ADD, { mode: "add" })}>
            <Plus className="size-4" />
            Depozit qo'shish
          </Button>
          <Button variant="outline" onClick={() => openModal(MODAL.DEPOSIT_WITHDRAW, { mode: "withdraw" })}>
            <Minus className="size-4" />
            Yechib olish
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        rowKey={(r) => r._id}
        renderCard={renderCard}
        empty={<EmptyState title="Tranzaksiyalar yo'q" />}
      />

      <ModalWrapper name={MODAL.DEPOSIT_ADD} title="Depozit qo'shish" className="max-w-md">
        <DepositFormModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.DEPOSIT_WITHDRAW} title="Depozitdan yechib olish" className="max-w-md">
        <DepositFormModal />
      </ModalWrapper>
    </div>
  );
};

export default DepositsTransactionsPanel;
