// React
import { useState } from "react";

// Icons
import {
  ClipboardList,
  Download,
  CalendarClock,
  Paperclip,
  FileX,
} from "lucide-react";

// Components
import Card from "@/shared/components/ui/card/Card";
import Button from "@/shared/components/ui/button/Button";
import Skeleton from "@/shared/components/ui/feedback/Skeleton";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import Pagination from "@/shared/components/ui/pagination/Pagination";

// Hooks
import { formatBytes } from "@/shared/hooks/useStorageUsage";
import { useDownloadAttachmentMutation } from "@/owner/features/assignments";
import {
  useMyAssignmentsQuery,
  useMarkAssignmentReadMutation,
} from "../hooks/useMyAssignmentsQuery";

// Utils
import { cn } from "@/shared/utils/cn";
import { formatDateUz, formatDateTimeUz } from "@/shared/utils/formatDate";

const LIMIT = 20;

// Muddat o'tganmi. Kun boshiga tenglashtirilmaydi: "bugun" muddat bo'lsa
// kun oxirigacha vaqt bor deb hisoblaymiz.
const isOverdue = (dueDate) => {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  d.setHours(23, 59, 59, 999);
  return d.getTime() < Date.now();
};

const AssignmentCard = ({ row, onOpen, onDownload, downloading }) => {
  const a = row.assignment;
  const overdue = isOverdue(a.dueDate);
  const unread = !row.readAt;

  return (
    <Card
      className={cn(
        "space-y-3",
        // O'qilmagani chap chiziq bilan ajratiladi - ro'yxatda birinchi
        // qaraladigan narsa aynan shu.
        unread && "border-l-2 border-l-primary",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">{a.title}</h3>
          <p className="text-xs text-muted-foreground">
            {row.group?.name ? `${row.group.name} · ` : ""}
            {a.sender ? `${a.sender.firstName} ${a.sender.lastName} · ` : ""}
            {formatDateTimeUz(a.sentAt)}
          </p>
        </div>
        {a.dueDate && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
              overdue
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                : "bg-muted text-muted-foreground",
            )}
          >
            <CalendarClock className="size-3.5" />
            {formatDateUz(a.dueDate)}
          </span>
        )}
      </div>

      {a.body && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{a.body}</p>
      )}

      {!a.file && a.fileRemovedAt && (
        <p className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <FileX className="size-3.5 shrink-0" />
          Biriktirilgan fayl o'chirilgan
        </p>
      )}

      {a.file && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
          <Paperclip className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{a.file.originalName}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(a.file.size)}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={downloading}
            onClick={() =>
              onDownload({ id: a._id, fileName: a.file.originalName })
            }
          >
            <Download className="size-4" />
            Yuklab olish
          </Button>
        </div>
      )}

      {unread && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpen(row._id)}>
            O'qidim
          </Button>
        </div>
      )}
    </Card>
  );
};

/**
 * VAZIFALARIM (o'quvchi paneli).
 *
 * Botni bloklagan o'quvchi vazifani AYNAN shu yerda ko'radi - shuning
 * uchun sahifa bot yetkazish holatidan mutlaqo mustaqil ishlaydi.
 */
const MyAssignmentsPage = () => {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMyAssignmentsQuery({ page, limit: LIMIT });
  const { mutate: markRead } = useMarkAssignmentReadMutation();
  const { mutate: download, isPending: downloading } =
    useDownloadAttachmentMutation();

  const items = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Vazifalarim</h1>
        <p className="text-sm text-muted-foreground">
          O'qituvchi yuborgan vazifalar va biriktirilgan fayllar
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-md" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Vazifa yo'q"
          description="Hozircha sizga vazifa yuborilmagan."
        />
      ) : (
        <div className="space-y-3">
          {items.map((row) => (
            <AssignmentCard
              key={row._id}
              row={row}
              onOpen={markRead}
              onDownload={download}
              downloading={downloading}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          onPageChange={setPage}
          totalPages={totalPages}
          hasNextPage={page < totalPages}
          hasPrevPage={page > 1}
        />
      )}
    </div>
  );
};

export default MyAssignmentsPage;
