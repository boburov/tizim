import { Pencil, Trash2, Tags } from "lucide-react";
import DataTable from "@/shared/components/ui/table/DataTable";
import Button from "@/shared/components/ui/button/Button";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { formatDateUzLong } from "@/shared/utils/formatDate";

const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";

const ArchiveReasonsTable = ({ items = [], isLoading = false }) => {
  const { openModal } = useModal();

  const actions = (r) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => openModal(MODAL.ARCHIVE_REASON_EDIT, { reason: r })}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-red-600 hover:bg-red-50 hover:text-red-700"
        onClick={() => openModal(MODAL.ARCHIVE_REASON_DELETE, { reason: r })}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );

  const columns = [
    {
      key: "title",
      header: "Sarlavha",
      headerClassName: th,
      cell: (r) => <span className="font-medium">{r.title}</span>,
    },
    {
      key: "createdAt",
      header: "Qo'shilgan",
      headerClassName: th,
      cell: (r) => (
        <span className="text-muted-foreground">
          {r.createdAt ? formatDateUzLong(r.createdAt) : "-"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      headerClassName: th,
      className: "text-right",
      cell: actions,
    },
  ];

  const renderCard = (r) => (
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="font-medium">{r.title}</p>
        <p className="text-xs text-muted-foreground">
          {r.createdAt ? formatDateUzLong(r.createdAt) : "-"}
        </p>
      </div>
      {actions(r)}
    </div>
  );

  return (
    <DataTable
      columns={columns}
      rows={items}
      isLoading={isLoading}
      renderCard={renderCard}
      empty={
        <EmptyState
          icon={Tags}
          title="Sabablar topilmadi"
          description="Arxivlash/qaytarish uchun yangi sabab qo'shing."
        />
      }
    />
  );
};

export default ArchiveReasonsTable;
