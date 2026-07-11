import { Pencil, Trash2, Tags } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import Switch from "@/shared/components/ui/switch/Switch";
import DataTable from "@/shared/components/ui/table/DataTable";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/shared/components/shadcn/tooltip";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";

// Bog'langan feedback soni (count badge)
const CountBadge = ({ count }) => (
  <StatusBadge tone={count > 0 ? "info" : "neutral"}>
    {count} ta
  </StatusBadge>
);

const IconButton = ({ label, tone = "default", onClick, icon: Icon }) => (
  <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClick}
          aria-label={label}
          className={
            tone === "danger"
              ? "size-8 text-red-600 hover:bg-red-50 hover:text-red-700"
              : "size-8 text-muted-foreground hover:text-foreground"
          }
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const FeedbackTypesTable = ({
  items = [],
  counts = {},
  isLoading = false,
  onToggle,
  onCreate,
}) => {
  const { openModal } = useModal();

  const columns = [
    {
      key: "index",
      header: "#",
      className: "w-12 text-muted-foreground tabular-nums",
      cell: (_, i) => i + 1,
    },
    {
      key: "name",
      header: "Nom",
      className: "font-medium",
      cell: (t) => t.name,
    },
    {
      key: "count",
      header: "Feedback'lar",
      className: "w-32",
      cell: (t) => <CountBadge count={counts[String(t._id)] || 0} />,
    },
    {
      key: "status",
      header: "Holat",
      className: "w-40",
      cell: (t) => (
        <label className="flex cursor-pointer items-center gap-2">
          <Switch
            checked={t.isActive}
            onChange={(v) => onToggle?.(t, v)}
            aria-label="Holatni o'zgartirish"
          />
          <span className="text-sm text-muted-foreground">
            {t.isActive ? "Faol" : "Nofaol"}
          </span>
        </label>
      ),
    },
    {
      key: "actions",
      header: <span className="block text-right">Amallar</span>,
      headerClassName: "text-right",
      className: "w-28",
      cell: (t) => (
        <div className="flex items-center justify-end gap-0.5">
          <IconButton
            label="Tahrirlash"
            icon={Pencil}
            onClick={() =>
              openModal(MODAL.FEEDBACK_TYPE_EDIT, { feedbackType: t })
            }
          />
          <IconButton
            label="O'chirish"
            tone="danger"
            icon={Trash2}
            onClick={() =>
              openModal(MODAL.FEEDBACK_TYPE_DELETE, { feedbackType: t })
            }
          />
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      isLoading={isLoading}
      rowKey={(t) => t._id}
      skeletonRows={5}
      empty={
        <EmptyState
          icon={Tags}
          title="Turlar topilmadi"
          description="Hozircha feedback turlari yo'q. Birinchi turni qo'shing."
          action={
            onCreate && (
              <Button size="sm" onClick={onCreate}>
                Yangi tur
              </Button>
            )
          }
        />
      }
      renderCard={(t, i) => (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium">
              <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
              {t.name}
            </span>
            <CountBadge count={counts[String(t._id)] || 0} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2">
              <Switch
                checked={t.isActive}
                onChange={(v) => onToggle?.(t, v)}
                aria-label="Holatni o'zgartirish"
              />
              <span className="text-sm text-muted-foreground">
                {t.isActive ? "Faol" : "Nofaol"}
              </span>
            </label>
            <div className="flex items-center gap-0.5">
              <IconButton
                label="Tahrirlash"
                icon={Pencil}
                onClick={() =>
                  openModal(MODAL.FEEDBACK_TYPE_EDIT, { feedbackType: t })
                }
              />
              <IconButton
                label="O'chirish"
                tone="danger"
                icon={Trash2}
                onClick={() =>
                  openModal(MODAL.FEEDBACK_TYPE_DELETE, { feedbackType: t })
                }
              />
            </div>
          </div>
        </div>
      )}
    />
  );
};

export default FeedbackTypesTable;
