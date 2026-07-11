import {
  Pencil,
  Trash2,
  UserCheck,
  MoreVertical,
  Inbox,
  BellRing,
} from "lucide-react";
import DataTable from "@/shared/components/ui/table/DataTable";
import Button from "@/shared/components/ui/button/Button";
import Select from "@/shared/components/ui/select/Select";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/shared/components/shadcn/dropdown-menu";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { LEAD_STATUS_OPTIONS } from "@/shared/constants/leadStatus";
import { formatPhone } from "@/shared/utils/formatPhone";
import { formatDateUz } from "@/shared/utils/formatDate";
import { useLeadUpdateMutation } from "../hooks/useLeadMutations";

const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";
const dash = <span className="text-muted-foreground/50">-</span>;

const LeadsTable = ({ items = [], isLoading = false }) => {
  const { openModal } = useModal();
  const { mutate: updateLead } = useLeadUpdateMutation();

  const handleStatus = (lead, next) => {
    if (!next || next === lead.status) return;
    // Rad etish sababi kerak -> tahrirlash modali
    if (next === "rejected") {
      openModal(MODAL.LEAD_EDIT, { lead });
      return;
    }
    updateLead({ id: lead._id, body: { status: next } });
  };

  const actions = (l) => (
    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-gray-500 hover:text-gray-700"
            aria-label="Amallar"
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          <DropdownMenuItem onSelect={() => openModal(MODAL.LEAD_EDIT, { lead: l })}>
            <Pencil className="size-4" />
            Tahrirlash
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => openModal(MODAL.LEAD_REMINDER, { lead: l })}
          >
            <BellRing className="size-4" />
            Eslatma bildirishnomasi
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!!l.studentId}
            onSelect={() => openModal(MODAL.LEAD_CONVERT, { lead: l })}
          >
            <UserCheck className="size-4" />
            {l.studentId ? "Aylantirilgan" : "O'quvchiga aylantirish"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-red-600 focus:text-red-700"
            onSelect={() => openModal(MODAL.LEAD_DELETE, { lead: l })}
          >
            <Trash2 className="size-4" />
            O'chirish
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const statusCell = (l) => (
    <div onClick={(e) => e.stopPropagation()} className="max-w-[170px]">
      <Select
        value={l.status}
        onChange={(v) => handleStatus(l, v)}
        options={LEAD_STATUS_OPTIONS}
        triggerClassName="h-8"
      />
    </div>
  );

  const columns = [
    {
      key: "name",
      header: "Ism",
      headerClassName: th,
      cell: (l) => (
        <div className="flex items-center gap-1.5">
          <span className="font-medium">
            {l.firstName} {l.lastName}
          </span>
          {l.followUpAt && !l.followUpNotifiedAt && (
            <BellRing
              className="size-3.5 shrink-0 text-amber-500"
              title={`Qayta bog'lanish: ${formatDateUz(l.followUpAt)}`}
            />
          )}
        </div>
      ),
    },
    {
      key: "phone",
      header: "Telefon",
      headerClassName: th,
      cell: (l) => (
        <span className="text-gray-600">{formatPhone(l.phone) || "-"}</span>
      ),
    },
    {
      key: "source",
      header: "Manba",
      headerClassName: th,
      cell: (l) => l.source?.name || dash,
    },
    {
      key: "direction",
      header: "Yo'nalish",
      headerClassName: th,
      cell: (l) => l.direction?.name || dash,
    },
    {
      key: "status",
      header: "Status",
      headerClassName: th,
      cell: statusCell,
    },
    {
      key: "date",
      header: "Sana",
      headerClassName: th,
      cell: (l) => (
        <span className="text-xs text-muted-foreground">
          {formatDateUz(l.createdAt)}
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

  const renderCard = (l) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {l.firstName} {l.lastName}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatPhone(l.phone) || "-"}
          </p>
        </div>
        {actions(l)}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {l.source?.name && (
          <span className="rounded bg-muted px-1.5 py-0.5">{l.source.name}</span>
        )}
        {l.direction?.name && <span>· {l.direction.name}</span>}
        <span>· {formatDateUz(l.createdAt)}</span>
      </div>
      {statusCell(l)}
    </div>
  );

  return (
    <DataTable
      columns={columns}
      rows={items}
      isLoading={isLoading}
      rowKey={(l) => l._id}
      renderCard={renderCard}
      empty={
        <EmptyState
          icon={Inbox}
          title="Lid topilmadi"
          description="Tanlangan filtrlar bo'yicha lid yo'q. Yangi lid qo'shing."
        />
      }
    />
  );
};

export default LeadsTable;
