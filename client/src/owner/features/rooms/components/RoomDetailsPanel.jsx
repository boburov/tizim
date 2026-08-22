import { X, DoorOpen, Users, Clock, CalendarDays, BarChart3 } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { QueryState } from "@/shared/components/analytics";
import Button from "@/shared/components/ui/button/Button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/shadcn/sheet";
import { useRoomDetailsQuery } from "../hooks/useRoomAnalytics";

const RoomDetailsPanel = ({ roomId, branchId, from, to, open, onClose }) => {
  const query = useRoomDetailsQuery(roomId, { branchId, from, to }, { enabled: open && !!roomId });

  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent className="w-full sm:w-[600px] !max-w-[600px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Xona tafsilotlari</SheetTitle>
        </SheetHeader>
        <QueryState query={query}>
        {(data) => {
          if (!data) return null;
          return (
          <div className="space-y-6 pb-8">
            <div className="flex items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <DoorOpen className="size-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold">{data.name}</h3>
                <p className="text-sm text-muted-foreground">
                  Sig'im: {data.capacity || "Noma'lum"} o'rin
                  {data.areaM2 ? ` · ${data.areaM2} m²` : ""}
                </p>
              </div>
            </div>

            {data.equipment?.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">Jihozlar</h4>
                <div className="flex flex-wrap gap-2">
                  {data.equipment.map((eq, idx) => (
                    <span key={idx} className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
                      {eq}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <BarChart3 className="size-4" /> Haftalik bandlik
                </div>
                <div className="text-2xl font-bold">{data.stats?.utilizationPercent ?? 0}%</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {data.stats?.busyHours ?? 0} soat band / {data.stats?.freeHours ?? 0} soat bo'sh
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <CalendarDays className="size-4" /> Darslar
                </div>
                <div className="text-2xl font-bold">{data.stats?.lessonsPerWeek ?? 0}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {data.stats?.groupCount ?? 0} ta guruh haftasiga
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Users className="size-4" /> O'quvchilar
                </div>
                <div className="text-2xl font-bold">{data.studentsCount}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Haftalik umumiy qamrov
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Users className="size-4" /> O'qituvchilar
                </div>
                <div className="text-2xl font-bold">{data.teachersCount}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Dars o'tadigan o'qituvchilar
                </div>
              </div>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold">Bugungi bo'sh vaqtlar</h4>
              {data.freeToday?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {data.freeToday.map((w, idx) => (
                    <span key={idx} className="flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-sm font-medium text-success">
                      <Clock className="size-3.5" />
                      {w.from} – {w.to}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Bugun bo'sh vaqt yo'q.</p>
              )}
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold">Yaqin kundagi darslar</h4>
              {data.lessons?.length > 0 ? (
                <div className="space-y-3">
                  {data.lessons.slice(0, 10).map((l, idx) => (
                    <div key={idx} className={cn(
                      "flex items-center justify-between rounded-lg border border-border p-3",
                      l.isCanceled && "opacity-50 bg-muted"
                    )}>
                      <div>
                        <div className="font-medium">{l.startTime} – {l.endTime}</div>
                        <div className="text-sm text-muted-foreground">{l.date} ({l.day})</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-primary">{l.groupName}</div>
                        <div className="text-sm text-muted-foreground">{l.subjectName} · {l.teacherName}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Yaqin orada darslar topilmadi.</p>
              )}
            </div>
          </div>
          );
        }}
      </QueryState>
      </SheetContent>
    </Sheet>
  );
};

export default RoomDetailsPanel;
