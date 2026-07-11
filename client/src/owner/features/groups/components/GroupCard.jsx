// Router
import { Link } from "react-router-dom";

// Icons
import { MoreHorizontal, Pencil, Trash2, CalendarX } from "lucide-react";

// Components
import Card from "@/shared/components/ui/card/Card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/shared/components/shadcn/dropdown-menu";

// Hooks
import useModal from "@/shared/hooks/useModal";

// Constants
import { MODAL } from "@/shared/constants/modals";

// Utils
import { sortSchedule, DAY_LABELS_UZ } from "@/shared/utils/formatSchedule";
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateUzLong } from "@/shared/utils/formatDate";

const GroupCard = ({ group, archived = false }) => {
  const { openModal } = useModal();

  const teachers = (group.teachers || [])
    .map((t) => `${t.firstName} ${t.lastName || ""}`.trim())
    .join(", ");

  const schedule = sortSchedule(group.schedule);

  // Kurs yakunlanganmi (arxiv, isActive=false yoki tugash sanasi o'tgan).
  const todayKey = new Date().toISOString().slice(0, 10);
  const endKey = group.endDate ? String(group.endDate).slice(0, 10) : null;
  const isEnded = archived || !group.isActive || (endKey && endKey <= todayKey);
  // O'chirish faqat: o'quvchi bo'lmasa (0 ta) YOKI kurs yakunlangan bo'lsa.
  const canDelete = (group.studentsCount || 0) === 0 || isEnded;

  // Amallar menyusi Link ichida - bosilganda kartochka ochilib ketmasin.
  const stopNav = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Link to={`/owner/groups/${group._id}`} className="block group">
      <Card className="h-full flex flex-col gap-3 transition-colors group-hover:border-primary">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-base">{group.name}</h3>

          <span onClick={stopNav} className="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Amallar"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                <DropdownMenuItem
                  onSelect={() => openModal(MODAL.GROUP_EDIT, { group })}
                >
                  <Pencil className="size-4" />
                  Tahrirlash
                </DropdownMenuItem>
                {!isEnded && (
                  <DropdownMenuItem
                    onSelect={() => openModal(MODAL.GROUP_FINISH, { group })}
                  >
                    <CalendarX className="size-4" />
                    Kursni yakunlash
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-700"
                      onSelect={() =>
                        openModal(MODAL.GROUP_PERMANENT_DELETE, { group })
                      }
                    >
                      <Trash2 className="size-4" />
                      O'chirish
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </div>

        <div className="text-sm text-muted-foreground space-y-2">
          <div className="space-y-1.5">
            {schedule.length ? (
              <div className="flex flex-wrap gap-1.5">
                {schedule.map((s, i) => (
                  <span
                    key={`${s.day}-${i}`}
                    className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs"
                  >
                    <span className="font-medium text-foreground">
                      {DAY_LABELS_UZ[s.day] || s.day}
                    </span>
                    <span>
                      {s.startTime}–{s.endTime}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <span> -</span>
            )}
          </div>

          <div>
            <span className="font-medium text-foreground">O'qituvchi:</span>{" "}
            {teachers || "-"}
          </div>

          <div>
            <span className="font-medium text-foreground">O'quvchilar:</span>{" "}
            {group.studentsCount || 0} ta
          </div>

          <div>
            <span className="font-medium text-foreground">Oylik to'lov:</span>{" "}
            {group.monthlyFee != null ? (
              formatMoney(group.monthlyFee)
            ) : (
              <span className="text-amber-600">Belgilanmagan</span>
            )}
          </div>

          {archived && (
            <div className="pt-1 mt-1 border-t space-y-0.5">
              <div>
                <span className="font-medium text-foreground">Boshlagan:</span>{" "}
                {formatDateUzLong(group.startDate || group.createdAt)}
              </div>
              {group.endDate && (
                <div>
                  <span className="font-medium text-foreground">Tugagan:</span>{" "}
                  {formatDateUzLong(group.endDate)}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
};

export default GroupCard;
