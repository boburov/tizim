import { useMemo } from "react";
import { CalendarDays } from "lucide-react";

import useAuth from "@/shared/hooks/useAuth";
import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { QueryState } from "@/shared/components/analytics";
import useGroupsListQuery from "@/owner/features/groups/hooks/useGroupsListQuery";
import WorkspacePage from "@/shared/components/page/PageShell";
import EmptyState from "@/shared/components/page/EmptyState";

/**
 * MENING JADVALIM.
 *
 * Filial jadvalidan farqi: bu yerda TO'QNASHUV tahlili YO'Q va xona
 * bandligi ham yo'q. O'qituvchining savoli oddiy — "bugun qaysi
 * darsim bor?". Filial to'qnashuvi uning muammosi emas: uni hal
 * qiladigan odam boshqa (direktor) va u boshqa ekranda ko'radi.
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

const WorkSchedulePage = () => {
  const { user } = useAuth();
  const { has } = usePermissions();
  const groups = useGroupsListQuery(
    { teacherId: user?.id, limit: 200 },
    { enabled: Boolean(user?.id) && has(PERMISSIONS.GROUPS_READ) },
  );

  const byDay = useMemo(() => {
    const out = Object.fromEntries(DAYS.map((d) => [d.key, []]));
    for (const g of groups.data?.data || []) {
      if (g.isActive === false) continue;
      for (const s of g.schedule || []) {
        if (!out[s.day]) continue;
        out[s.day].push({ ...s, groupId: g.id, groupName: g.name });
      }
    }
    for (const k of Object.keys(out)) {
      out[k].sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    }
    return out;
  }, [groups.data]);

  const total = DAYS.reduce((acc, d) => acc + byDay[d.key].length, 0);

  return (
    <WorkspacePage title="Jadvalim">
      <QueryState
        query={groups}
        empty={total === 0}
        emptyTitle="Jadvalingiz bo'sh"
        emptyHint="Sizga biriktirilgan guruhlarga dars kunlari belgilanmagan."
        loadingRows={3}
      >
        {() => (
          <div className="space-y-2">
            {DAYS.filter((d) => byDay[d.key].length > 0).map((d) => (
              <section key={d.key} className="rounded-2xl border border-border bg-card p-3">
                <h2 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <CalendarDays className="size-3.5 text-muted-foreground" />
                  {d.label}
                </h2>
                <ul className="mt-2 space-y-1">
                  {byDay[d.key].map((s, i) => (
                    <li
                      key={`${s.groupId}-${i}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm"
                    >
                      <span className="text-foreground">{s.groupName}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {s.startTime}–{s.endTime}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </QueryState>

      {!has(PERMISSIONS.GROUPS_READ) && (
        <EmptyState
          icon={CalendarDays}
          title="Jadval yopiq"
          hint="Jadvalni ko'rish uchun guruhlarni ko'rish ruxsati kerak."
        />
      )}
    </WorkspacePage>
  );
};

export default WorkSchedulePage;
