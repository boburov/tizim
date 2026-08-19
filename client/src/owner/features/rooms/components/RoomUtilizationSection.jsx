import { useState } from "react";
import { TriangleAlert, CircleAlert, Lightbulb, Clock } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import { AnalyticsTable, QueryState } from "@/shared/components/analytics";

import useRoomUtilizationQuery from "../hooks/useRoomUtilizationQuery";

/**
 * ══════════════════════════════════════════════════════════════════════
 * XONA TAHLILI — "QAYSI XONA BO'SH, QAYSI BIRI TO'LIB KETGAN"
 * ══════════════════════════════════════════════════════════════════════
 *
 * Talab 13, 14, 27 aynan shu savollarni beradi va ular bitta manbadan
 * javob oladi: `/branch-analytics/rooms`.
 *
 * ── BU YERDA HISOB-KITOB YO'Q ──
 * Bandlik, bo'sh oyna, to'qnashuv va tavsiyalar — hammasi SERVERDA
 * hisoblanadi. Bu komponent faqat chizadi. Sabab oddiy: bir xil raqam
 * ikki joyda hisoblansa, ular ALBATTA ajralib ketadi va keyin qaysi
 * biri to'g'ri ekanini hech kim ayta olmaydi.
 *
 * ── TAVSIYA "TIZIM SHUNDAY DEYDI" DEMAYDI ──
 * Har tavsiya yonida DALIL turadi (qaysi xona, qaysi soat, necha foiz).
 * Foydalanuvchi qarorni o'zi qabul qiladi — tizim faqat jadvaldan
 * o'qilgan faktni ko'rsatadi.
 *
 * ── IKKI PANELDA BIR XIL ──
 * Super Admin `/org/tahlil` da (tashkilot yoki filial ko'lamida),
 * administrator `/owner/tahlil` da (o'z filiali) — ayni komponent.
 * Ko'lamni server hal qiladi.
 */

const DAY_LABEL = {
  mon: "Dushanba", tue: "Seshanba", wed: "Chorshanba", thu: "Payshanba",
  fri: "Juma", sat: "Shanba", sun: "Yakshanba",
};

const SEVERITY = {
  high: { icon: TriangleAlert, cls: "text-destructive" },
  medium: { icon: CircleAlert, cls: "text-warning" },
  low: { icon: Lightbulb, cls: "text-muted-foreground" },
};

/** Bandlik ustuni — raqam + ingichka chiziq. Diagramma emas, o'lchov. */
const UtilizationBar = ({ value }) => {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="tabular-nums">{value}%</span>
      <span className="hidden h-1 w-12 overflow-hidden rounded-full bg-muted sm:inline-block">
        <span
          className={cn(
            "block h-full rounded-full",
            value >= 75 ? "bg-warning" : value <= 25 ? "bg-muted-foreground/40" : "bg-primary",
          )}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </span>
    </span>
  );
};

/**
 * KUN × SOAT ISSIQLIK QATORI.
 *
 * Har katak — bitta soat. To'qroq katak — ko'proq xona band. Bu
 * "faol soatlar / bo'sh soatlar" savoliga bitta qarashda javob beradi
 * (talab 14) va uni jadval bilan ifodalab bo'lmasdi.
 */
const DemandGrid = ({ demand, window: win }) => {
  const days = win?.days || Object.keys(demand || {});
  const hours = demand?.[days[0]] || [];
  if (!hours.length) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="w-24 text-left font-medium text-muted-foreground" />
            {hours.map((h) => (
              <th key={h.hour} className="font-normal text-muted-foreground">
                {h.hour}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day}>
              <td className="pr-2 text-muted-foreground">{DAY_LABEL[day] || day}</td>
              {(demand[day] || []).map((h) => (
                <td key={h.hour}>
                  <span
                    title={`${DAY_LABEL[day]} ${h.label} — ${h.busyRooms} xona band, ${h.freeRooms} bo'sh`}
                    className={cn(
                      "block h-5 rounded-sm",
                      h.busyRooms === 0
                        ? "bg-muted"
                        : h.loadPercent >= 75
                          ? "bg-warning"
                          : h.loadPercent >= 40
                            ? "bg-primary/60"
                            : "bg-primary/25",
                    )}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        To'q katak — o'sha soatda xonalarning ko'pi band. Katak ustiga
        borsangiz nechta xona bo'shligi ko'rinadi.
      </p>
    </div>
  );
};

/** Bitta xonaning haftalik bo'sh oynalari. */
const FreeWindows = ({ room }) => {
  const days = Object.entries(room.freeWindows || {}).filter(([, w]) => w.length);
  if (!days.length) {
    return (
      <p className="text-xs text-muted-foreground">
        Ish vaqti ichida bir soatdan uzun bo'sh oyna yo'q.
      </p>
    );
  }
  return (
    <ul className="space-y-1 text-xs">
      {days.map(([day, windows]) => (
        <li key={day} className="flex flex-wrap gap-x-2 gap-y-1">
          <span className="w-20 shrink-0 text-muted-foreground">{DAY_LABEL[day]}</span>
          {windows.map((w) => (
            <span
              key={`${day}-${w.from}`}
              className="rounded bg-muted px-1.5 py-0.5 tabular-nums text-foreground"
            >
              {w.from}–{w.to}
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
};

const RoomUtilizationSection = ({ branchId, enabled = true }) => {
  const [openRoom, setOpenRoom] = useState(null);

  const params = branchId ? { branchId } : {};
  const query = useRoomUtilizationQuery(params, { enabled });

  const d = query.data;
  const selected = d?.rooms?.find((r) => r.roomId === openRoom);

  return (
    <section className="space-y-5">
      <QueryState
        query={query}
        empty={!d?.rooms?.length}
        emptyTitle="Xona yo'q"
        emptyHint="Bandlik hisobi uchun avval xona qo'shilishi kerak."
        loadingRows={4}
      >
        {(data) => (
          <>
            {/* ── NIMAGA NISBATAN HISOBLANGAN ──
                Bandlik foizi maxrajga bog'liq. Uni aytmaslik — raqamni
                tekshirib bo'lmaydigan qilib qo'yish degani. */}
            <p className="text-xs text-muted-foreground">{data.window?.note}</p>

            {/* ── TAVSIYALAR ── */}
            {data.recommendations?.length > 0 && (
              <ul className="space-y-1.5">
                {data.recommendations.slice(0, 8).map((rec, i) => {
                  const s = SEVERITY[rec.severity] || SEVERITY.low;
                  return (
                    <li
                      key={`${rec.kind}-${rec.roomId || rec.groupId || i}`}
                      className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2"
                    >
                      <s.icon className={cn("mt-0.5 size-4 shrink-0", s.cls)} />
                      <span className="text-sm text-foreground">{rec.text}</span>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* ── XONALAR JADVALI ── */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">Xonalar bo'yicha</h3>
              <AnalyticsTable
                rows={data.rooms}
                rowKey={(r) => r.roomId}
                defaultSort={{ key: "utilizationPercent", dir: "desc" }}
                onRowClick={(r) => setOpenRoom(openRoom === r.roomId ? null : r.roomId)}
                columns={[
                  { key: "name", label: "Xona" },
                  ...(branchId ? [] : [{ key: "branchName", label: "Filial" }]),
                  { key: "capacity", label: "Sig'im", align: "right", kind: "number" },
                  { key: "groupCount", label: "Guruh", align: "right", kind: "number" },
                  { key: "busyHours", label: "Band soat", align: "right", kind: "number" },
                  {
                    key: "utilizationPercent",
                    label: "Bandlik",
                    align: "right",
                    render: (r) => <UtilizationBar value={r.utilizationPercent} />,
                  },
                ]}
              />
            </div>

            {/* ── TANLANGAN XONANING BO'SH OYNALARI ──
                Jadval "qaysi xona bo'sh" ni aytadi, bu esa "QACHON
                bo'sh" ni — guruh ko'chirish qarori aynan shunga
                tayanadi. */}
            {selected && (
              <div className="space-y-2 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">
                    {selected.name} — bo'sh oynalar
                  </h3>
                </div>
                <FreeWindows room={selected} />

                {selected.conflicts?.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-border pt-3">
                    <p className="text-xs font-medium text-destructive">
                      To'qnashuv ({selected.conflicts.length})
                    </p>
                    {selected.conflicts.map((c, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        {DAY_LABEL[c.day]}: {c.a.name} ({c.a.from}–{c.a.to}) ⨯{" "}
                        {c.b.name} ({c.b.from}–{c.b.to})
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── FAOL SOATLAR ── */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">
                Faol kunlar va soatlar
              </h3>
              <DemandGrid demand={data.demand} window={data.window} />
            </div>

            {/* ── XONASIZ GURUHLAR ── */}
            {data.unassignedGroups?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">
                  Xonasi biriktirilmagan guruhlar
                </h3>
                <p className="text-xs text-muted-foreground">
                  Bu guruhlar bandlik hisobiga KIRMAYDI — ya'ni yuqoridagi
                  foizlar ular hisobga olinmagan holda ko'rsatilgan.
                </p>
                <AnalyticsTable
                  rows={data.unassignedGroups}
                  rowKey={(r) => r.groupId}
                  columns={[
                    { key: "name", label: "Guruh" },
                    { key: "lessonsPerWeek", label: "Haftalik dars", align: "right", kind: "number" },
                  ]}
                />
              </div>
            )}
          </>
        )}
      </QueryState>
    </section>
  );
};

export default RoomUtilizationSection;
