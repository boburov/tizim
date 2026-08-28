// React
import { useState } from "react";

// Icons
import { Trash2, Files, Clock, Database } from "lucide-react";

// Components
import Card from "@/shared/components/ui/card/Card";
import Button from "@/shared/components/ui/button/Button";
import Skeleton from "@/shared/components/ui/feedback/Skeleton";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import CleanupPolicyCard from "../components/CleanupPolicyCard";
import StoredFilesTable from "../components/StoredFilesTable";
import StorageCleanupModal from "../components/modals/StorageCleanupModal";
import StoredFileDeleteModal from "../components/modals/StoredFileDeleteModal";

// Hooks
import useModal from "@/shared/hooks/useModal";
import { formatBytes } from "@/shared/hooks/useStorageUsage";
import {
  useStorageSettingsQuery,
  useStorageFilesQuery,
} from "../hooks/useStorageAdmin";

// Constants
import { MODAL } from "@/shared/constants/modals";

// Utils
import { cn } from "@/shared/utils/cn";

const LIMIT = 20;

// Qo'lda tozalash uchun tayyor tanlovlar. Oxirgisi - to'liq tozalash,
// u ATAYLAB ro'yxatning eng oxirida va boshqa rangda turadi.
const QUICK_CLEANUPS = [
  { days: 365, label: "1 yildan eski" },
  { days: 180, label: "6 oydan eski" },
  { days: 90, label: "3 oydan eski" },
  { days: 30, label: "1 oydan eski" },
];

const Stat = ({ icon: Icon, value, label, tone }) => (
  <div className="flex items-center gap-3 rounded-md border bg-card px-4 py-3">
    <Icon className={cn("size-5 shrink-0", tone)} />
    <div className="min-w-0">
      <p className="text-lg font-semibold leading-tight tabular-nums">{value}</p>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
    </div>
  </div>
);

/**
 * FAYL SAQLAGICHI - boshqaruv sahifasi.
 *
 * Uch bo'lim, aynan shu tartibda:
 *   1) HOLAT      - qancha band, qancha qolgan (avval nima bo'layotganini bilish);
 *   2) TOZALASH   - qo'lda va avtomatik (keyin nima qilish mumkinligi);
 *   3) FAYLLAR    - kattasidan kichigiga (oxirida - aniq nishonlar).
 */
const StorageAdminPage = () => {
  const { openModal } = useModal();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("size");

  const { data, isLoading } = useStorageSettingsQuery();
  const { data: filesData, isLoading: filesLoading } = useStorageFilesQuery({
    page,
    limit: LIMIT,
    sort,
  });

  const usage = data?.usage;
  const settings = data?.settings;
  const files = filesData?.data || [];
  const total = filesData?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const percent = Math.round(usage?.percent || 0);
  const barTone = usage?.isFull
    ? "bg-destructive"
    : percent >= 80
      ? "bg-amber-500"
      : "bg-primary";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Fayl saqlagich</h1>
      </header>

      {/* --- 1) HOLAT --- */}
      {isLoading || !usage ? (
        <Skeleton className="h-32 w-full rounded-md" />
      ) : (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-2xl font-semibold tabular-nums">
                {formatBytes(usage.usedBytes)}
                <span className="text-base font-normal text-muted-foreground">
                  {" "}
                  / {formatBytes(usage.quotaBytes)}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {formatBytes(usage.freeBytes)} bo'sh
              </p>
            </div>
            <span className="text-2xl font-semibold tabular-nums">{percent}%</span>
          </div>

          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Band qilingan joy"
            className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn("h-full rounded-full transition-all", barTone)}
              style={{ width: `${Math.max(percent, percent > 0 ? 2 : 0)}%` }}
            />
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <Stat
              icon={Files}
              value={usage.fileCount}
              label="Saqlanayotgan fayl"
              tone="text-muted-foreground"
            />
            <Stat
              icon={Database}
              value={formatBytes(usage.maxUploadBytes)}
              label="Bitta fayl chegarasi"
              tone="text-muted-foreground"
            />
            <Stat
              icon={Clock}
              value={settings?.autoCleanupEnabled ? "Yoqilgan" : "O'chiq"}
              label="Avto-tozalash"
              tone={
                settings?.autoCleanupEnabled
                  ? "text-emerald-600 dark:text-emerald-300"
                  : "text-muted-foreground"
              }
            />
          </div>

          {usage.isFull && (
            <p className="rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              Joy tugadi - yangi fayl qabul qilinmayapti. Vazifalar faqat matn
              sifatida yuborilmoqda. Quyidan tozalang.
            </p>
          )}
        </Card>
      )}

      {/* --- 2) TOZALASH --- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4">
          <div>
            <h2 className="font-semibold">Hozir tozalash</h2>
            <p className="text-sm text-muted-foreground">
              Tanlangan muddatdan eski fayllar o'chiriladi
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_CLEANUPS.map((c) => (
              <Button
                key={c.days}
                variant="outline"
                onClick={() =>
                  openModal(MODAL.STORAGE_CLEANUP, { olderThanDays: c.days })
                }
              >
                {c.label}
              </Button>
            ))}
          </div>

          {/* To'liq tozalash ATAYLAB ajratilgan: boshqa rang, alohida
              qator va tushuntirish - tasodifan bosilmasin. */}
          <div className="border-t pt-3">
            <Button
              variant="destructive"
              onClick={() => openModal(MODAL.STORAGE_CLEANUP, { all: true })}
            >
              <Trash2 className="size-4" />
              Hamma fayllarni o'chirish
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Vazifalar matni saqlanadi, faqat biriktirilgan fayllar o'chadi.
            </p>
          </div>
        </Card>

        <CleanupPolicyCard settings={settings} />
      </div>

      {/* --- 3) FAYLLAR --- */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            Fayllar{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({total})
            </span>
          </h2>
          <div className="flex gap-1.5">
            {[
              { key: "size", label: "Kattaligi bo'yicha" },
              { key: "date", label: "Sanasi bo'yicha" },
            ].map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  setSort(s.key);
                  setPage(1);
                }}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  sort === s.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card hover:bg-muted",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <StoredFilesTable
          items={files}
          isLoading={filesLoading}
          onDelete={(file) => openModal(MODAL.STORAGE_FILE_DELETE, { file })}
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

      <ModalWrapper name={MODAL.STORAGE_CLEANUP} title="Tozalashni tasdiqlang">
        <StorageCleanupModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.STORAGE_FILE_DELETE} title="Faylni o'chirish">
        <StoredFileDeleteModal />
      </ModalWrapper>
    </div>
  );
};

export default StorageAdminPage;
