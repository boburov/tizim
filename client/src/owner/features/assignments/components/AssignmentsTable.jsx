import { Link } from "react-router-dom";
import { Paperclip, Ban, Check, ClipboardList } from "lucide-react";
import DataTable from "@/shared/components/ui/table/DataTable";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import { formatDateTimeUz } from "@/shared/utils/formatDate";
import { formatBytes } from "@/shared/hooks/useStorageUsage";

const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";

const groupNames = (a) =>
  (a.groups || []).map((g) => g?.name).filter(Boolean).join(", ") || "-";

const FileCell = ({ a }) =>
  a.file ? (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="max-w-[160px] truncate">{a.file.originalName}</span>
      <span className="shrink-0 text-muted-foreground">
        {formatBytes(a.file.size)}
      </span>
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">Faylsiz</span>
  );

// Yetkazish xulosasi: yetgan / yetmagan. Yetmaganlar (bloklagan + botga
// kirmagan + xato) BITTA raqamga yig'iladi - qatorda uch xil hisoblagich
// ko'rsatish jadvalni o'qib bo'lmas holga keltirardi, tafsilot esa
// tafsilot sahifasida bor.
const DeliveryCell = ({ a }) => {
  const missed =
    (a.blockedCount || 0) + (a.noBotCount || 0) + (a.failedCount || 0);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs">
      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
        <Check className="size-3.5" />
        {a.deliveredCount || 0}
      </span>
      {missed > 0 && (
        <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-300">
          <Ban className="size-3.5" />
          {missed}
        </span>
      )}
      <span className="text-muted-foreground">/ {a.recipientsCount || 0}</span>
    </span>
  );
};

const AssignmentsTable = ({
  items = [],
  isLoading = false,
  basePath = "/owner/assignments",
  rowClassName = "",
}) => {
  const columns = [
    {
      key: "title",
      header: "Vazifa",
      headerClassName: th,
      cell: (a) => (
        <Link
          to={`${basePath}/${a._id}`}
          className="font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {a.title}
        </Link>
      ),
    },
    {
      key: "groups",
      header: "Guruh",
      headerClassName: th,
      cell: (a) => (
        <span className="text-muted-foreground">{groupNames(a)}</span>
      ),
    },
    {
      key: "file",
      header: "Fayl",
      headerClassName: th,
      cell: (a) => <FileCell a={a} />,
    },
    {
      key: "delivery",
      header: "Yetkazildi",
      headerClassName: th,
      cell: (a) => <DeliveryCell a={a} />,
    },
    {
      key: "sentAt",
      header: "Yuborilgan",
      headerClassName: th,
      cell: (a) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDateTimeUz(a.sentAt)}
        </span>
      ),
    },
  ];

  const renderCard = (a) => (
    <div className="space-y-2">
      <Link to={`${basePath}/${a._id}`} className="font-medium hover:underline">
        {a.title}
      </Link>
      <p className="text-xs text-muted-foreground">{groupNames(a)}</p>
      <div className="flex flex-wrap items-center gap-3">
        <FileCell a={a} />
        <DeliveryCell a={a} />
      </div>
      <p className="text-xs text-muted-foreground">
        {formatDateTimeUz(a.sentAt)}
      </p>
    </div>
  );

  return (
    <DataTable
      columns={columns}
      rows={items}
      isLoading={isLoading}
      renderCard={renderCard}
      rowClassName={rowClassName}
      empty={
        <EmptyState
          icon={ClipboardList}
          title="Vazifa yuborilmagan"
          description="Guruh o'quvchilariga matn va fayl ko'rinishida vazifa yuboring."
        />
      }
    />
  );
};

export default AssignmentsTable;
