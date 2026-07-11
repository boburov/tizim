import { useState } from "react";
import {
  Bell,
  CheckCheck,
  Inbox,
  Check,
  Wallet,
  AlertTriangle,
  CalendarX,
  Megaphone,
  Mail,
  GraduationCap,
  MessageSquare,
  PartyPopper,
  ClipboardList,
  FileText,
} from "lucide-react";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import { cn } from "@/shared/utils/cn";
import { formatDateUz } from "@/shared/utils/formatDate";
import {
  CATEGORY_LABEL,
  CATEGORY_BADGE_CLASS,
} from "@/shared/constants/notification";

// Kategoriya -> vektor ikona (emoji/sticker o'rniga)
const CATEGORY_ICON = {
  payment_reminder: Wallet,
  debt_warning: AlertTriangle,
  class_cancel: CalendarX,
  announcement: Megaphone,
  admin_personal: Mail,
  teacher_message: GraduationCap,
  feedback_status: MessageSquare,
  holiday: PartyPopper,
  attendance: ClipboardList,
  template_based: FileText,
  other: Bell,
};
import {
  useInboxQuery,
  useMarkReadMutation,
  useMarkAllReadMutation,
  useUnreadCountQuery,
} from "@/owner/features/notifications/hooks/useInboxQuery";

const InboxItem = ({ recipient, onMarkRead }) => {
  const n = recipient.notification;
  if (!n) return null;
  const isUnread = !recipient.readAt;
  const Icon = CATEGORY_ICON[n.category] || Bell;
  const categoryLabel = CATEGORY_LABEL[n.category];
  const badgeClass = CATEGORY_BADGE_CLASS[n.category] || CATEGORY_BADGE_CLASS.other;

  const markRead = () => isUnread && onMarkRead(recipient._id);

  return (
    <div
      role={isUnread ? "button" : undefined}
      tabIndex={isUnread ? 0 : undefined}
      onClick={markRead}
      onKeyDown={(e) => {
        if (isUnread && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          markRead();
        }
      }}
      className={cn(
        "relative flex gap-3 rounded-2xl border p-3.5 transition-colors",
        isUnread
          ? "cursor-pointer border-primary/20 bg-primary/5 hover:bg-primary/10"
          : "border-border/60 bg-white",
      )}
    >
      {/* O'qilmagan indikatori */}
      {isUnread && (
        <span className="absolute right-3 top-3 size-2 rounded-full bg-primary" />
      )}

      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
        <Icon className="size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {categoryLabel && (
            <span
              className={cn(
                "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                badgeClass,
              )}
            >
              {categoryLabel}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">
            {formatDateUz(n.sentAt)}
          </span>
        </div>

        {n.title && (
          <p
            className={cn(
              "mt-1 truncate text-sm",
              isUnread ? "font-semibold text-foreground" : "font-medium",
            )}
          >
            {n.title}
          </p>
        )}

        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground/90">
          {n.body}
        </p>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">
            {n.sender ? `${n.sender.firstName} ${n.sender.lastName}` : "Tizim"}
          </span>
          {isUnread && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMarkRead(recipient._id);
              }}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Check className="size-3.5" />
              O'qilgan deb belgilash
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const FilterTab = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition",
      active
        ? "bg-white text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </button>
);

const InboxList = () => {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useInboxQuery({ page, limit, unreadOnly });
  // Kesh qiymati { count } yoki optimistik holatda oddiy son bo'lishi mumkin
  const { data: unreadRaw } = useUnreadCountQuery();
  const unreadCount =
    typeof unreadRaw === "number" ? unreadRaw : unreadRaw?.count || 0;
  const { mutate: markRead } = useMarkReadMutation();
  const { mutate: markAllRead, isPending } = useMarkAllReadMutation();

  const items = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const setFilter = (only) => {
    setUnreadOnly(only);
    setPage(1);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 pb-4">
      {/* Sarlavha */}
      <header className="sticky top-0 z-10 -mx-1 bg-background/80 px-1 pb-2 pt-1 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Bell className="size-5 text-primary" />
            Bildirishnomalar
            {unreadCount > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </h1>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllRead()}
              disabled={isPending}
              className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline disabled:opacity-50"
            >
              <CheckCheck className="size-4" />
              <span className="hidden sm:inline">Hammasini o'qildi</span>
              <span className="sm:hidden">O'qildi</span>
            </button>
          )}
        </div>

        {/* Filtr segmenti */}
        <div className="mt-3 flex gap-1 rounded-xl bg-muted/60 p-1">
          <FilterTab active={!unreadOnly} onClick={() => setFilter(false)}>
            Hammasi
          </FilterTab>
          <FilterTab active={unreadOnly} onClick={() => setFilter(true)}>
            O'qilmagan{unreadCount > 0 ? ` (${unreadCount})` : ""}
          </FilterTab>
        </div>
      </header>

      {isLoading ? (
        <div className="grid gap-2.5 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-border/60 bg-muted/40"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 bg-white py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-muted/60">
            <Inbox className="size-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {unreadOnly
              ? "O'qilmagan xabarlar yo'q"
              : "Hozircha xabarlar yo'q"}
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-2.5 md:grid-cols-2">
          {items.map((r) => (
            <InboxItem
              key={r._id}
              recipient={r}
              onMarkRead={(id) => markRead(id)}
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

export default InboxList;
