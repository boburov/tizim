import { Pencil, Trash2, CalendarHeart, Repeat, Calendar } from "lucide-react";
import DataTable from "@/shared/components/ui/table/DataTable";
import Button from "@/shared/components/ui/button/Button";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import {
  HOLIDAY_AUDIENCE_LABEL,
  MONTH_OPTIONS,
} from "@/shared/constants/notification";

const monthName = (m) => MONTH_OPTIONS.find((o) => o.value === m)?.label || m;
const dateLabel = (h) =>
  `${h.day} ${monthName(h.month)}${h.year ? ` ${h.year}` : ""}`;

const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";

const TypeBadge = ({ recurring }) =>
  recurring ? (
    <StatusBadge tone="info" icon={Repeat}>
      Yillik
    </StatusBadge>
  ) : (
    <StatusBadge tone="neutral" icon={Calendar}>
      Bir martalik
    </StatusBadge>
  );

const HolidaysTable = ({ items = [], isLoading = false }) => {
  const { openModal } = useModal();

  const actions = (h) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => openModal(MODAL.HOLIDAY_EDIT, { holiday: h })}
      >
        <Pencil className="size-4" />
      </Button>
      {h.isActive && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={() => openModal(MODAL.HOLIDAY_DELETE, { holiday: h })}
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );

  const columns = [
    {
      key: "date",
      header: "Sana",
      headerClassName: th,
      cell: (h) => (
        <span className="whitespace-nowrap font-medium">{dateLabel(h)}</span>
      ),
    },
    {
      key: "name",
      header: "Nom",
      headerClassName: th,
      cell: (h) => h.name,
    },
    {
      key: "type",
      header: "Tur",
      headerClassName: th,
      cell: (h) => <TypeBadge recurring={h.isRecurring} />,
    },
    {
      key: "audience",
      header: "Auditoriya",
      headerClassName: th,
      cell: (h) => (
        <span className="text-muted-foreground">
          {HOLIDAY_AUDIENCE_LABEL[h.audience] || h.audience}
        </span>
      ),
    },
    {
      key: "status",
      header: "Holat",
      headerClassName: th,
      cell: (h) =>
        h.isActive ? (
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

  const renderCard = (h) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{h.name}</p>
          <p className="text-xs text-muted-foreground">{dateLabel(h)}</p>
        </div>
        {actions(h)}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <TypeBadge recurring={h.isRecurring} />
        {h.isActive ? (
          <StatusBadge tone="success">Faol</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Arxiv</StatusBadge>
        )}
        <span className="text-xs text-muted-foreground">
          {HOLIDAY_AUDIENCE_LABEL[h.audience] || h.audience}
        </span>
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
          icon={CalendarHeart}
          title="Bayramlar topilmadi"
          description="Yangi bayram qo'shib, avtomatik tabriklarni sozlang."
        />
      }
    />
  );
};

export default HolidaysTable;
