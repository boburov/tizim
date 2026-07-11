import { useMemo } from "react";
import { STATUS_BADGE_CLASS, STATUS_EMOJI, STATUS_LABEL } from "@/shared/constants/attendance";
import AttendanceLegend from "./AttendanceLegend";

const WEEK_HEAD = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

// JS Sunday=0 → biz Monday=0 ga o'tkazamiz
const dowMonFirst = (d) => {
  const v = new Date(d).getUTCDay();
  return (v + 6) % 7;
};

// Berilgan oy uchun barcha sanalarni qaytaradi (UTC kalendar bo'yicha)
const buildMonthDays = (year, month) => {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const days = [];
  for (let d = 1; d <= end.getUTCDate(); d += 1) {
    const date = new Date(Date.UTC(year, month - 1, d));
    days.push({
      day: d,
      date,
      dateKey: date.toISOString().slice(0, 10),
      dow: dowMonFirst(date),
    });
  }
  // Front-pad bo'sh hujayralar (oyning birinchi kuni qaysi haftaning kuniga to'g'ri kelishiga qarab)
  const padFront = days.length > 0 ? days[0].dow : 0;
  return { days, padFront };
};

// data: { groups: [{group, days: [{dateKey, attendance, defaultStatus}]}] }
// Map quramiz: dateKey → eng dolzarb status (multi-group bo'lsa ham bitta hujayrada
// "complex" rejim - barcha guruhlar uchun statuslar massiv)
const aggregateByDateKey = (data) => {
  const map = new Map();
  for (const g of data?.groups || []) {
    for (const d of g.days || []) {
      const cur = map.get(d.dateKey) || [];
      cur.push({
        groupName: g.group?.name,
        status: d.attendance?.status || d.defaultStatus || null,
      });
      map.set(d.dateKey, cur);
    }
  }
  return map;
};

const cellTitle = (entries) =>
  entries
    .map((e) => `${e.groupName}: ${e.status ? STATUS_LABEL[e.status] : "-"}`)
    .join("\n");

const cellColor = (entries) => {
  // Birinchi belgilangan statusning rangini qaytaradi (yoki belgilanmagan)
  for (const e of entries) {
    if (e.status) return STATUS_BADGE_CLASS[e.status] || "";
  }
  return "bg-white border";
};

const MonthlyAttendanceCalendar = ({ data, year, month, onPrevMonth, onNextMonth }) => {
  const { days, padFront } = useMemo(
    () => buildMonthDays(year, month),
    [year, month],
  );
  const map = useMemo(() => aggregateByDateKey(data), [data]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">
          {month}.{year}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevMonth}
            className="size-8 rounded-md border bg-white hover:bg-gray-50 text-sm"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            className="size-8 rounded-md border bg-white hover:bg-gray-50 text-sm"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-xs text-center text-muted-foreground">
        {WEEK_HEAD.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: padFront }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map((d) => {
          const entries = map.get(d.dateKey) || [];
          const hasClass = entries.length > 0;
          return (
            <div
              key={d.dateKey}
              title={hasClass ? cellTitle(entries) : "Dars kuni emas"}
              className={`aspect-square rounded text-sm flex items-center justify-center ${
                hasClass ? cellColor(entries) : "bg-gray-50 text-gray-400"
              }`}
            >
              <div className="flex flex-col items-center justify-center leading-tight">
                <span className="text-xs">{d.day}</span>
                {hasClass && entries[0]?.status && (
                  <span className="text-[10px]">
                    {STATUS_EMOJI[entries[0].status]}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AttendanceLegend />
    </div>
  );
};

export default MonthlyAttendanceCalendar;
