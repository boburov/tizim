import { Pencil, Trash2, FileText } from "lucide-react";
import DataTable from "@/shared/components/ui/table/DataTable";
import Button from "@/shared/components/ui/button/Button";
import Badge from "@/shared/components/ui/badge/Badge";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { TEMPLATE_CATEGORY_LABEL } from "@/shared/constants/notification";

const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";

const TemplatesTable = ({ items = [], isLoading = false }) => {
  const { openModal } = useModal();

  const actions = (t) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => openModal(MODAL.NOTIFICATION_TEMPLATE_EDIT, { template: t })}
      >
        <Pencil className="size-4" />
      </Button>
      {t.isActive && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={() =>
            openModal(MODAL.NOTIFICATION_TEMPLATE_DELETE, { template: t })
          }
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );

  const columns = [
    {
      key: "idx",
      header: "#",
      headerClassName: th,
      className: "text-muted-foreground",
      cell: (_t, i) => i + 1,
    },
    {
      key: "name",
      header: "Nom",
      headerClassName: th,
      cell: (t) => <span className="font-medium">{t.name}</span>,
    },
    {
      key: "category",
      header: "Kategoriya",
      headerClassName: th,
      cell: (t) => (
        <Badge variant="outline">
          {TEMPLATE_CATEGORY_LABEL[t.category] || t.category}
        </Badge>
      ),
    },
    {
      key: "body",
      header: "Matn",
      headerClassName: th,
      className: "max-w-[320px]",
      cell: (t) => (
        <div className="truncate text-muted-foreground" title={t.body}>
          {t.body}
        </div>
      ),
    },
    {
      key: "status",
      header: "Holat",
      headerClassName: th,
      cell: (t) =>
        t.isActive ? (
          <StatusBadge tone="success">Faol</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Arxiv</StatusBadge>
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

  const renderCard = (t) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{t.name}</p>
        {actions(t)}
      </div>
      <p className="line-clamp-2 text-sm text-muted-foreground">{t.body}</p>
      <div className="flex items-center gap-1.5">
        <Badge variant="outline">
          {TEMPLATE_CATEGORY_LABEL[t.category] || t.category}
        </Badge>
        {t.isActive ? (
          <StatusBadge tone="success">Faol</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Arxiv</StatusBadge>
        )}
      </div>
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
          icon={FileText}
          title="Shablonlar topilmadi"
          description="Tez-tez yuboriladigan xabarlar uchun shablon yarating."
        />
      }
    />
  );
};

export default TemplatesTable;
