import {
  Pencil,
  Trash2,
  UserCheck,
  MoreVertical,
  Inbox,
  BellRing,
  Phone,
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
import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { MODAL } from "@/shared/constants/modals";
import { LEAD_STATUS_OPTIONS } from "@/shared/constants/leadStatus";
import { formatPhone } from "@/shared/utils/formatPhone";
import { formatDateUz } from "@/shared/utils/formatDate";
import { useLeadUpdateMutation } from "../hooks/useLeadMutations";

const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";
const dash = <span className="text-muted-foreground/50">-</span>;

// Telefonga bosilganda qo'ng'iroq. `tel:` uchun raqam TOZA bo'lishi kerak -
// ko'rinishdagi qavs/chiziqchalar ba'zi qurilmalarda terishni buzadi.
const telHref = (phone) => {
  const cleaned = String(phone || "").replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  return `tel:${cleaned.startsWith("+") ? cleaned : `+${cleaned}`}`;
};

const PhoneLink = ({ phone }) => {
  const href = telHref(phone);
  if (!href) return dash;
  return (
    <a
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary hover:underline"
      title="Qo'ng'iroq qilish"
    >
      <Phone className="size-3.5 shrink-0" />
      {formatPhone(phone)}
    </a>
  );
};

// `selectedIds` berilsa jadval tanlash rejimida ishlaydi (ko'p lidni birdan
// guruhga qabul qilish uchun). Aylantirilgan lidlar tanlanmaydi.
const LeadsTable = ({
  items = [],
  isLoading = false,
  selectedIds = null,
  onToggle,
  onToggleAll,
}) => {
  const { openModal } = useModal();
  const { mutate: updateLead } = useLeadUpdateMutation();

  const { has } = usePermissions();
  // RESEPSHIN ROLI: lid yaratadi va status siljitadi, LEKIN o'quvchiga
  // aylantira olmaydi (guruhga yozish = moliyaviy majburiyat) va o'chira
  // olmaydi. Server ham shuni rad etadi - bu yerda tugmalar YASHIRILADI,
  // aks holda foydalanuvchi bosib 403 xatosini olardi va nima uchun
  // ishlamayotganini tushunmasdi.
  const canUpdate = has(PERMISSIONS.LEADS_UPDATE);
  const canManage = has(PERMISSIONS.LEADS_MANAGE);

  // Tanlash faqat ommaviy AYLANTIRISH uchun kerak - u manage huquqi.
  const selectable =
    canManage && Boolean(selectedIds) && Boolean(onToggle);
  const selectedSet = new Set((selectedIds || []).map(String));
  const selectableItems = items.filter((l) => !l.studentId);
  const allSelected =
    selectableItems.length > 0 &&
    selectableItems.every((l) => selectedSet.has(String(l._id)));

  const checkbox = (l) => (
    <input
      type="checkbox"
      aria-label={`${l.firstName} ${l.lastName} ni tanlash`}
      checked={selectedSet.has(String(l._id))}
      disabled={Boolean(l.studentId)}
      title={l.studentId ? "Allaqachon o'quvchiga aylantirilgan" : undefined}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onToggle?.(l._id, e.target.checked)}
      className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
    />
  );

  const handleStatus = (lead, next) => {
    if (!next || next === lead.status) return;
    // YOPISH alohida modal orqali: sabab VA izoh majburiy (server ham
    // shuni talab qiladi). Boshqa statuslar bir bosishda o'zgaradi.
    if (next === "rejected") {
      openModal(MODAL.LEAD_CLOSE, { lead });
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
            className="size-8 text-muted-foreground hover:text-foreground"
            aria-label="Amallar"
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          {canUpdate && (
            <>
              <DropdownMenuItem
                onSelect={() => openModal(MODAL.LEAD_EDIT, { lead: l })}
              >
                <Pencil className="size-4" />
                Tahrirlash
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => openModal(MODAL.LEAD_REMINDER, { lead: l })}
              >
                <BellRing className="size-4" />
                Eslatma bildirishnomasi
              </DropdownMenuItem>
            </>
          )}
          {canManage && (
            <>
              <DropdownMenuItem
                disabled={!!l.studentId}
                onSelect={() => openModal(MODAL.LEAD_CONVERT, { lead: l })}
              >
                <UserCheck className="size-4" />
                {l.studentId ? "Aylantirilgan" : "O'quvchiga aylantirish"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 dark:text-red-300 focus:text-red-700 dark:focus:text-red-300"
                onSelect={() => openModal(MODAL.LEAD_DELETE, { lead: l })}
              >
                <Trash2 className="size-4" />
                O'chirish
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const statusCell = (l) => (
    <div onClick={(e) => e.stopPropagation()} className="max-w-[170px]">
      {/* Faqat KO'RISH huquqi bo'lganlar uchun o'chirilgan: jadval bir xil
          ko'rinadi, lekin status siljitib bo'lmaydi. Butunlay yashirsak
          ustun kengligi o'zgarib, jadval rollar bo'yicha har xil chiqardi. */}
      <Select
        value={l.status}
        onChange={(v) => handleStatus(l, v)}
        options={LEAD_STATUS_OPTIONS}
        triggerClassName="h-8"
        disabled={!canUpdate}
      />
    </div>
  );

  const columns = [
    ...(selectable
      ? [
          {
            key: "select",
            headerClassName: "px-4 py-2.5 w-10",
            className: "w-10",
            header: (
              <input
                type="checkbox"
                aria-label="Barchasini tanlash"
                checked={allSelected}
                disabled={!selectableItems.length}
                onChange={(e) =>
                  onToggleAll?.(
                    selectableItems.map((l) => l._id),
                    e.target.checked,
                  )
                }
                className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
              />
            ),
            cell: checkbox,
          },
        ]
      : []),
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
              className="size-3.5 shrink-0 text-amber-500 dark:text-amber-400"
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
      cell: (l) => <PhoneLink phone={l.phone} />,
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
        <div className="flex items-start gap-2">
          {selectable && <span className="pt-1">{checkbox(l)}</span>}
          <div>
            <p className="font-medium">
              {l.firstName} {l.lastName}
            </p>
            <p className="text-xs">
              <PhoneLink phone={l.phone} />
            </p>
          </div>
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
