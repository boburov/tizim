import { Link } from "react-router-dom";
import { Trash2, FileX } from "lucide-react";
import DataTable from "@/shared/components/ui/table/DataTable";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import Button from "@/shared/components/ui/button/Button";
import { formatBytes } from "@/shared/hooks/useStorageUsage";
import { formatDateUz } from "@/shared/utils/formatDate";

const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";

const uploader = (f) =>
  f.uploadedBy
    ? `${f.uploadedBy.firstName} ${f.uploadedBy.lastName}`
    : "-";

/**
 * Saqlagichdagi fayllar.
 *
 * Standart tartib - KATTASIDAN kichigiga: "joy qayoqqa ketdi?" degan
 * savolga javob birinchi qatorda turishi kerak.
 *
 * Har qatorda fayl QAYSI vazifaga tegishli ekani ko'rsatiladi - admin
 * kontekstsiz o'chirib yubormasin.
 */
const StoredFilesTable = ({ items = [], isLoading = false, onDelete }) => {
  const columns = [
    {
      key: "name",
      header: "Fayl",
      headerClassName: th,
      cell: (f) => (
        <span className="block max-w-[260px] truncate font-medium">
          {f.originalName}
        </span>
      ),
    },
    {
      key: "size",
      header: "Hajm",
      headerClassName: th,
      cell: (f) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatBytes(f.size)}
        </span>
      ),
    },
    {
      key: "assignment",
      header: "Vazifa",
      headerClassName: th,
      cell: (f) =>
        f.assignment ? (
          <Link
            to={`/owner/assignments/${f.assignment._id}`}
            className="block max-w-[220px] truncate hover:underline"
          >
            {f.assignment.title}
          </Link>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: "uploadedBy",
      header: "Yuklagan",
      headerClassName: th,
      cell: (f) => (
        <span className="text-muted-foreground">{uploader(f)}</span>
      ),
    },
    {
      key: "createdAt",
      header: "Sana",
      headerClassName: th,
      cell: (f) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDateUz(f.createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      headerClassName: th,
      cell: (f) => (
        <Button
          variant="outline"
          className="size-8 p-0"
          aria-label="Faylni o'chirish"
          onClick={() => onDelete?.(f)}
        >
          <Trash2 className="size-4" />
        </Button>
      ),
    },
  ];

  const renderCard = (f) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">
          {f.originalName}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatBytes(f.size)}
        </span>
      </div>
      {f.assignment && (
        <Link
          to={`/owner/assignments/${f.assignment._id}`}
          className="block truncate text-xs hover:underline"
        >
          {f.assignment.title}
        </Link>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {uploader(f)} · {formatDateUz(f.createdAt)}
        </span>
        <Button
          variant="outline"
          className="size-8 p-0"
          aria-label="Faylni o'chirish"
          onClick={() => onDelete?.(f)}
        >
          <Trash2 className="size-4" />
        </Button>
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
          icon={FileX}
          title="Fayl yo'q"
          description="Saqlagich bo'sh - hali biror fayl yuklanmagan."
        />
      }
    />
  );
};

export default StoredFilesTable;
