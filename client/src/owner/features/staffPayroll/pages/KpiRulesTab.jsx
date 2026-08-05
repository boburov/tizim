// Icons
import { Pencil, Plus, Target, Trash2 } from "lucide-react";

// Components
import Badge from "@/shared/components/ui/badge/Badge";
import Button from "@/shared/components/ui/button/Button";
import DataTable from "@/shared/components/ui/table/DataTable";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import KpiRuleModal from "../components/modals/KpiRuleModal";

// Hooks
import useModal from "@/shared/hooks/useModal";
import {
  useKpiRulesQuery,
  useKpiTriggersQuery,
  useKpiRuleRemoveMutation,
} from "../hooks/useStaffPayroll";

// Constants
import { MODAL } from "@/shared/constants/modals";

// Utils
import { formatMoney } from "@/shared/utils/formatMoney";

const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";

/**
 * KPI QOIDALARI - konfiguratsiya ro'yxati.
 *
 * Yangi mukofot qo'shish uchun kod o'zgartirilmaydi: qoida shu yerda
 * yaratiladi va keyingi hisobda ishlaydi.
 */
const KpiRulesTab = () => {
  const { openModal } = useModal();
  const { data: rules = [], isLoading } = useKpiRulesQuery();
  const { data: triggers = [] } = useKpiTriggersQuery();
  const { mutate: removeRule } = useKpiRuleRemoveMutation();

  const triggerLabel = (key) =>
    triggers.find((t) => t.key === key)?.label || key;

  const rewardText = (r) => {
    if (r.rewardType === "percent") return `${r.rewardValue}%`;
    if (r.rewardType === "per_unit") return `${formatMoney(r.rewardValue)} / birlik`;
    return formatMoney(r.rewardValue);
  };

  const conditionText = (r) => {
    const c = r.conditions || {};
    const parts = [];
    if (c.minDays) parts.push(`${c.minDays} kun`);
    if (c.minAttendanceRate) parts.push(`davomat ≥ ${c.minAttendanceRate}%`);
    if (c.minAmount) parts.push(`summa ≥ ${formatMoney(c.minAmount)}`);
    return parts.join(" · ") || "Shartsiz";
  };

  const columns = [
    {
      key: "name",
      header: "Qoida",
      headerClassName: th,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {triggerLabel(r.trigger)}
          </p>
        </div>
      ),
    },
    {
      key: "conditions",
      header: "Shart",
      headerClassName: th,
      className: "text-muted-foreground",
      cell: conditionText,
    },
    {
      key: "reward",
      header: "Mukofot",
      headerClassName: `${th} text-right`,
      className: "text-right font-medium tabular-nums",
      cell: rewardText,
    },
    {
      key: "roles",
      header: "Rollar",
      headerClassName: th,
      cell: (r) =>
        r.applicableRoles?.length ? (
          <div className="flex flex-wrap gap-1">
            {r.applicableRoles.map((role) => (
              <Badge key={role} variant="secondary">
                {role}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">Hamma xodim</span>
        ),
    },
    {
      key: "status",
      header: "Holat",
      headerClassName: th,
      cell: (r) =>
        r.enabled ? (
          <Badge className="bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
            Yoqilgan
          </Badge>
        ) : (
          <Badge className="bg-accent text-foreground">O'chirilgan</Badge>
        ),
    },
    {
      key: "actions",
      header: "Amallar",
      headerClassName: `${th} text-right`,
      className: "text-right",
      cell: (r) => (
        <div
          className="flex items-center justify-end gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => openModal(MODAL.KPI_RULE_FORM, { rule: r })}
            aria-label="Tahrirlash"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300"
            onClick={() => removeRule(r._id)}
            aria-label="O'chirish"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  const renderCard = (r) => (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{r.name}</p>
        <span className="shrink-0 font-medium tabular-nums">{rewardText(r)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {triggerLabel(r.trigger)} · {conditionText(r)}
      </p>
    </div>
  );

  return (
    <div className="space-y-4 pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Qoida - sozlama: yangi mukofot qo'shish uchun dasturchi kerak emas.
        </p>
        <Button onClick={() => openModal(MODAL.KPI_RULE_FORM, { rule: null })}>
          <Plus className="size-4" />
          Yangi qoida
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={rules}
        isLoading={isLoading}
        rowKey={(r) => r._id}
        renderCard={renderCard}
        empty={
          <EmptyState
            icon={Target}
            title="KPI qoidasi yo'q"
            description="Masalan: 'Lid o'quvchiga aylandi' triggeri bilan resepshinga 50 000 so'm mukofot."
          />
        }
      />

      <ModalWrapper
        name={MODAL.KPI_RULE_FORM}
        title="KPI qoidasi"
        className="max-w-lg"
      >
        <KpiRuleModal />
      </ModalWrapper>
    </div>
  );
};

export default KpiRulesTab;
