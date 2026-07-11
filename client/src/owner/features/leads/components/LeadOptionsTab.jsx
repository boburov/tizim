import { Plus, Pencil, Trash2, Tags } from "lucide-react";
import DataTable from "@/shared/components/ui/table/DataTable";
import Button from "@/shared/components/ui/button/Button";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import useLeadOptionsQuery from "../hooks/useLeadOptionsQuery";

const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";

const LeadOptionsTab = ({ kind, addLabel = "Yangi" }) => {
  const { openModal } = useModal();
  const { data, isLoading } = useLeadOptionsQuery({ kind });
  const items = data?.data || [];

  const actions = (o) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => openModal(MODAL.LEAD_OPTION_EDIT, { option: o })}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-red-600 hover:bg-red-50 hover:text-red-700"
        onClick={() => openModal(MODAL.LEAD_OPTION_DELETE, { option: o })}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );

  const columns = [
    {
      key: "name",
      header: "Nom",
      headerClassName: th,
      cell: (o) => <span className="font-medium">{o.name}</span>,
    },
    {
      key: "actions",
      header: "",
      headerClassName: th,
      className: "text-right",
      cell: actions,
    },
  ];

  return (
    <div className="pt-3 space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => openModal(MODAL.LEAD_OPTION_CREATE, { kind })}>
          <Plus className="size-4" />
          {addLabel}
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={items}
        isLoading={isLoading}
        renderCard={(o) => (
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{o.name}</span>
            {actions(o)}
          </div>
        )}
        empty={
          <EmptyState
            icon={Tags}
            title="Hozircha bo'sh"
            description="Yangi qo'shish uchun yuqoridagi tugmadan foydalaning."
          />
        }
      />
    </div>
  );
};

export default LeadOptionsTab;
