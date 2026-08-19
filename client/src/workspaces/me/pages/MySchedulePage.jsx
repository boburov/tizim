import { CalendarDays } from "lucide-react";

import useMyGroupQuery from "@/student/features/group/hooks/useMyGroupQuery";
import { LoadingBlock } from "@/shared/components/analytics";
import WorkspacePage from "@/shared/components/page/PageShell";
import EmptyState from "@/shared/components/page/EmptyState";

/**
 * JADVALIM.
 *
 * MAVJUD `/students/my-group` ma'lumotidan quriladi — yangi endpoint
 * yaratilmadi (talab 30). O'quvchi guruhida jadval allaqachon bor,
 * u shu paytgacha faqat "Mening guruhim" sahifasining bir qismi
 * bo'lib turardi va alohida savol sifatida ko'rinmasdi.
 */
const DAYS = [
  { key: "mon", label: "Dushanba" },
  { key: "tue", label: "Seshanba" },
  { key: "wed", label: "Chorshanba" },
  { key: "thu", label: "Payshanba" },
  { key: "fri", label: "Juma" },
  { key: "sat", label: "Shanba" },
  { key: "sun", label: "Yakshanba" },
];

const MySchedulePage = () => {
  const { data, isLoading } = useMyGroupQuery();
  const schedule = data?.group?.schedule || [];

  return (
    <WorkspacePage title="Jadvalim" subtitle="Haftaning qaysi kunlari darsingiz bor">
      {isLoading ? (
        <LoadingBlock rows={3} />
      ) : schedule.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Jadval belgilanmagan"
          hint="Guruhingizga hali dars kunlari kiritilmagan. Administrator bilan bog'laning."
        />
      ) : (
        <ul className="space-y-2">
          {DAYS.map((d) => {
            const slots = schedule.filter((s) => s.day === d.key);
            if (!slots.length) return null;
            return (
              <li
                key={d.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-3"
              >
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <CalendarDays className="size-4 text-muted-foreground" />
                  {d.label}
                </span>
                <span className="flex flex-wrap gap-2">
                  {slots.map((s, i) => (
                    <span
                      key={i}
                      className="rounded-lg bg-primary/10 px-2 py-1 text-sm font-medium tabular-nums text-primary"
                    >
                      {s.startTime}–{s.endTime}
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {data?.group?.name && (
        <p className="text-xs text-muted-foreground">
          Guruh: {data.group.name}
        </p>
      )}
    </WorkspacePage>
  );
};

export default MySchedulePage;
