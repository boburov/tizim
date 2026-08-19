import { useMemo } from "react";
import { CalendarDays, AlertTriangle, DoorOpen } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { QueryState } from "@/shared/components/analytics";
import { useRoomsQuery } from "@/owner/features/catalog/hooks/useCatalogQueries";
import useGroupsListQuery from "@/owner/features/groups/hooks/useGroupsListQuery";
import WorkspacePage from "@/workspaces/shared/WorkspacePage";
import EmptyState from "@/workspaces/shared/EmptyState";

/**
 * ══════════════════════════════════════════════════════════════════════
 * HAFTALIK JADVAL — "KIM QAYERDA, QACHON"
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA KERAK ──
 * Guruh sahifasida har guruhning jadvali bor, lekin "seshanba soat
 * 14:00 da 201-xona bo'shmi?" degan savolga javob YO'Q edi. Direktor
 * yangi guruh ochayotganda aynan shu savolni beradi va uni javobsiz
 * qoldirish ikkita guruhni bitta xonaga yozib qo'yishga olib keladi.
 *
 * ── TO'QNASHUV ANIQLASH: TA'RIF ──
 * Ikki guruh BIR XIL kun, BIR XIL xona va vaqt oralig'i KESISHSA —
 * to'qnashuv. Oddiy interval kesishishi:
 *      A.start < B.end  VA  B.start < A.end
 * Chegara tegib turishi (11:00 tugadi, 11:00 boshlandi) to'qnashuv
 * EMAS — bu odatiy ketma-ket dars.
 *
 * ── BU YERDA HISOB QILINADI, VA BU JOIZ ──
 * Moliyaviy raqamlarni frontendda hisoblash taqiqlangan (talab 28),
 * chunki ular JURNALdan kelishi kerak. Jadval to'qnashuvi esa pul
 * emas: u guruhlarning e'lon qilingan jadvalidan kelib chiqadigan
 * KO'RINISH. Server uchun alohida endpoint qo'shish bir xil
 * ma'lumotni ikkinchi marta hisoblash bo'lardi.
 */

const DAYS = [
  { key: "mon", label: "Du" },
  { key: "tue", label: "Se" },
  { key: "wed", label: "Ch" },
  { key: "thu", label: "Pa" },
  { key: "fri", label: "Ju" },
  { key: "sat", label: "Sh" },
  { key: "sun", label: "Ya" },
];

const toMinutes = (t) => {
  const [h, m] = String(t || "").split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

const overlaps = (a, b) => {
  const as = toMinutes(a.startTime);
  const ae = toMinutes(a.endTime);
  const bs = toMinutes(b.startTime);
  const be = toMinutes(b.endTime);
  if ([as, ae, bs, be].some((v) => v === null)) return false;
  return as < be && bs < ae;
};

const BranchSchedulePage = () => {
  const { has } = usePermissions();
  const groups = useGroupsListQuery({ limit: 500 });
  const rooms = useRoomsQuery({}, { enabled: has(PERMISSIONS.CLASSES_READ) });

  const roomName = useMemo(() => {
    const map = new Map();
    for (const r of rooms.data?.data || rooms.data || []) map.set(r.id, r.name);
    return map;
  }, [rooms.data]);

  /** Kun → dars qatorlari (vaqt bo'yicha tartiblangan). */
  const byDay = useMemo(() => {
    const list = groups.data?.data || [];
    const out = Object.fromEntries(DAYS.map((d) => [d.key, []]));
    for (const g of list) {
      if (g.isActive === false) continue;
      for (const slot of g.schedule || []) {
        if (!out[slot.day]) continue;
        out[slot.day].push({
          groupId: g.id,
          groupName: g.name,
          roomId: g.roomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          students: g.studentsCount,
        });
      }
    }
    for (const key of Object.keys(out)) {
      out[key].sort((a, b) => (toMinutes(a.startTime) || 0) - (toMinutes(b.startTime) || 0));
    }
    return out;
  }, [groups.data]);

  /** Bir xil xona + kesishuvchi vaqt = to'qnashuv. */
  const conflicts = useMemo(() => {
    const found = [];
    for (const day of DAYS) {
      const slots = byDay[day.key] || [];
      for (let i = 0; i < slots.length; i += 1) {
        for (let j = i + 1; j < slots.length; j += 1) {
          const a = slots[i];
          const b = slots[j];
          if (!a.roomId || a.roomId !== b.roomId) continue;
          if (overlaps(a, b)) found.push({ day: day.label, a, b });
        }
      }
    }
    return found;
  }, [byDay]);

  const total = DAYS.reduce((acc, d) => acc + (byDay[d.key]?.length || 0), 0);

  return (
    <WorkspacePage
      title="Haftalik jadval"
      subtitle="Qaysi guruh, qaysi kuni, qaysi xonada — va xona to'qnashuvlari"
    >
      {conflicts.length > 0 && (
        <div className="space-y-1 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4" />
            Xona to'qnashuvi: {conflicts.length} ta
          </p>
          <ul className="space-y-0.5 text-xs text-foreground">
            {conflicts.slice(0, 8).map((c, i) => (
              <li key={`${c.a.groupId}-${c.b.groupId}-${i}`}>
                {c.day} · {roomName.get(c.a.roomId) || "xona"} ·{" "}
                <b>{c.a.groupName}</b> ({c.a.startTime}–{c.a.endTime}) va{" "}
                <b>{c.b.groupName}</b> ({c.b.startTime}–{c.b.endTime})
              </li>
            ))}
          </ul>
        </div>
      )}

      <QueryState
        query={groups}
        empty={total === 0}
        emptyTitle="Jadval bo'sh"
        emptyHint="Guruhlarga dars kunlari va vaqti belgilanmagan."
        loadingRows={4}
      >
        {() => (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {DAYS.map((day) => {
              const slots = byDay[day.key] || [];
              return (
                <section
                  key={day.key}
                  className="rounded-2xl border border-border bg-card p-3"
                >
                  <h2 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <CalendarDays className="size-3.5 text-muted-foreground" />
                    {day.label}
                    {slots.length > 0 && (
                      <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                        {slots.length}
                      </span>
                    )}
                  </h2>

                  {slots.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">Dars yo'q</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {slots.map((sl, i) => (
                        <li
                          key={`${sl.groupId}-${i}`}
                          className={cn(
                            "rounded-lg border border-border/70 px-2 py-1.5 text-xs",
                            conflicts.some(
                              (c) =>
                                c.day === day.label &&
                                (c.a.groupId === sl.groupId || c.b.groupId === sl.groupId),
                            ) && "border-destructive/50 bg-destructive/5",
                          )}
                        >
                          <p className="font-medium text-foreground">{sl.groupName}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-muted-foreground">
                            <span className="tabular-nums">
                              {sl.startTime}–{sl.endTime}
                            </span>
                            {sl.roomId && (
                              <span className="inline-flex items-center gap-0.5">
                                <DoorOpen className="size-2.5" />
                                {roomName.get(sl.roomId) || "xona"}
                              </span>
                            )}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </QueryState>

      {!has(PERMISSIONS.CLASSES_READ) && (
        <EmptyState
          icon={DoorOpen}
          title="Xona nomlari ko'rinmaydi"
          hint="Jadval ko'rinyapti, lekin xona nomlarini ko'rsatish uchun xonalarni ko'rish ruxsati kerak."
        />
      )}
    </WorkspacePage>
  );
};

export default BranchSchedulePage;
