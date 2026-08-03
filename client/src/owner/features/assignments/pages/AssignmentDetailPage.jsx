// React
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

// Icons
import {
  Users,
  Check,
  Ban,
  UserX,
  Clock,
  Download,
  Trash2,
  CalendarClock,
  ClipboardList,
} from "lucide-react";

// Components
import Card from "@/shared/components/ui/card/Card";
import Button from "@/shared/components/ui/button/Button";
import BackLink from "@/shared/components/ui/link/BackLink";
import Skeleton from "@/shared/components/ui/feedback/Skeleton";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import AssignmentRecipientsTable from "../components/AssignmentRecipientsTable";
import AssignmentDeleteModal from "../components/modals/AssignmentDeleteModal";

// Hooks
import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";
import { formatBytes } from "@/shared/hooks/useStorageUsage";
import {
  useAssignmentDetailQuery,
  useAssignmentRecipientsQuery,
} from "../hooks/useAssignmentsQuery";
import { useDownloadAttachmentMutation } from "../hooks/useAssignmentMutations";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";

// Utils
import { cn } from "@/shared/utils/cn";
import { formatDateUz, formatDateTimeUz } from "@/shared/utils/formatDate";

const LIMIT = 50;

// Holat filtrlari. "Yetmaganlar" alohida tugma sifatida ATAYLAB yo'q:
// har bir sabab o'z yechimini talab qiladi, ularni bitta savatga
// yig'ish o'qituvchiga nima qilishni aytmasdi.
const FILTERS = [
  { key: "", label: "Hammasi" },
  { key: "delivered", label: "Yetkazildi" },
  { key: "blocked", label: "Bloklagan" },
  { key: "no_bot", label: "Botga kirmagan" },
  { key: "pending", label: "Navbatda" },
  { key: "failed", label: "Xato" },
];

const Stat = ({ icon: Icon, value, label, tone }) => (
  <div className="flex items-center gap-2.5 rounded-md border bg-card px-3 py-2.5">
    <Icon className={cn("size-4 shrink-0", tone)} />
    <div className="min-w-0">
      <p className="text-lg font-semibold leading-none tabular-nums">
        {value ?? 0}
      </p>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
    </div>
  </div>
);

const InfoRow = ({ label, children }) => (
  <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
    <span className="shrink-0 text-muted-foreground">{label}</span>
    <span className="text-right font-medium">{children || "-"}</span>
  </div>
);

const AssignmentDetailPage = ({ basePath = "/owner/assignments" }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { openModal } = useModal();
  const { has } = usePermissions();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");

  const { data: a, isLoading, isError } = useAssignmentDetailQuery(id);
  const { data: recipients, isLoading: recipientsLoading } =
    useAssignmentRecipientsQuery(id, { page, limit: LIMIT, status });
  const { mutate: download, isPending: downloading } =
    useDownloadAttachmentMutation();

  const items = recipients?.data || [];
  const total = recipients?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !a) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Vazifa topilmadi"
        description="Vazifa o'chirilgan bo'lishi mumkin."
      />
    );
  }

  const senderName = a.sender
    ? `${a.sender.firstName} ${a.sender.lastName}`
    : "-";
  const groupNames =
    (a.groups || []).map((g) => g?.name).filter(Boolean).join(", ") || "-";

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackLink to={basePath} />
          <div>
            <h1 className="text-xl font-semibold">{a.title}</h1>
            <p className="text-sm text-muted-foreground">{groupNames}</p>
          </div>
        </div>

        {has(PERMISSIONS.ASSIGNMENTS_SEND) && (
          <Button
            variant="outline"
            onClick={() => openModal(MODAL.ASSIGNMENT_DELETE, { id: a._id })}
          >
            <Trash2 className="size-4" />
            O'chirish
          </Button>
        )}
      </header>

      {/* Yetkazish xulosasi */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          icon={Users}
          value={a.recipientsCount}
          label="Jami o'quvchi"
          tone="text-muted-foreground"
        />
        <Stat
          icon={Check}
          value={a.deliveredCount}
          label="Yetkazildi"
          tone="text-emerald-600 dark:text-emerald-300"
        />
        <Stat
          icon={Ban}
          value={a.blockedCount}
          label="Botni bloklagan"
          tone="text-red-600 dark:text-red-300"
        />
        <Stat
          icon={UserX}
          value={a.noBotCount}
          label="Botga kirmagan"
          tone="text-amber-600 dark:text-amber-300"
        />
        <Stat
          icon={Clock}
          value={
            (a.recipientsCount || 0) -
            (a.deliveredCount || 0) -
            (a.blockedCount || 0) -
            (a.noBotCount || 0) -
            (a.failedCount || 0)
          }
          label="Navbatda"
          tone="text-sky-600 dark:text-sky-300"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Vazifa matni + fayl */}
        <Card className="lg:col-span-2">
          <h2 className="mb-2 font-semibold">Vazifa matni</h2>
          {a.body ? (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
              {a.body}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Matn kiritilmagan</p>
          )}

          {a.file && (
            <div className="mt-4 flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {a.file.originalName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(a.file.size)}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={downloading}
                onClick={() =>
                  download({ id: a._id, fileName: a.file.originalName })
                }
              >
                <Download className="size-4" />
                Yuklab olish
              </Button>
            </div>
          )}
        </Card>

        {/* Meta */}
        <Card>
          <h2 className="mb-1 font-semibold">Ma'lumot</h2>
          <InfoRow label="Yuborgan">{senderName}</InfoRow>
          <InfoRow label="Guruh">{groupNames}</InfoRow>
          <InfoRow label="Yuborilgan">{formatDateTimeUz(a.sentAt)}</InfoRow>
          <InfoRow label="Muddat">
            {a.dueDate ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-3.5" />
                {formatDateUz(a.dueDate)}
              </span>
            ) : null}
          </InfoRow>
        </Card>
      </div>

      {/* O'quvchilar bo'yicha holat */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">O'quvchilar holati</h2>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key || "all"}
                type="button"
                onClick={() => {
                  setStatus(f.key);
                  setPage(1);
                }}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  status === f.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card hover:bg-muted",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <AssignmentRecipientsTable
          items={items}
          isLoading={recipientsLoading}
        />

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

      <ModalWrapper name={MODAL.ASSIGNMENT_DELETE} title="Vazifani o'chirish">
        <AssignmentDeleteModal onDeleted={() => navigate(basePath)} />
      </ModalWrapper>
    </div>
  );
};

export default AssignmentDetailPage;
