import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { STATUS_LABEL } from "@/shared/constants/attendance";

const MONTHS = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentabr",
  "Oktabr",
  "Noyabr",
  "Dekabr",
];

// Ustunlar uchun sana belgilari (faqat shu kunlarda raqam ko'rsatamiz)
const DAY_TICKS = [1, 5, 10, 15, 20, 25, 31];

// status → to'q rangli katak (heatmap)
const HEAT_CLASS = {
  present: "bg-emerald-500",
  absent: "bg-rose-500",
  excused: "bg-amber-400",
  exempt: "bg-gray-300",
};

// Bir kunda bir nechta guruh statusi bo'lsa, ko'rinadigan rang ustuvorligi
// (kelmagan kun ko'zga tashlanishi uchun absent eng yuqorida)
const PRIORITY = ["absent", "excused", "present", "exempt"];

const pad2 = (n) => String(n).padStart(2, "0");
const keyFor = (year, month, day) => `${year}-${pad2(month + 1)}-${pad2(day)}`;
const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

// data: { groups: [{group, days: [{dateKey, attendance, defaultStatus, dayOfWeek}]}] }
const buildMap = (data) => {
  const map = new Map();
  for (const g of data?.groups || []) {
    for (const d of g.days || []) {
      const status = d.attendance?.status || d.defaultStatus || null;
      const cur = map.get(d.dateKey) || [];
      cur.push({ groupName: g.group?.name, status });
      map.set(d.dateKey, cur);
    }
  }
  return map;
};

const aggStatus = (entries) => {
  for (const s of PRIORITY) {
    if (entries.some((e) => e.status === s)) return s;
  }
  return null; // dars kuni bor, lekin hali belgilanmagan
};

const cellTitle = (year, month, day, entries) => {
  const head = `${day}-${MONTHS[month].toLowerCase()}, ${year}`;
  const lines = entries.map(
    (e) =>
      `${e.groupName || "Guruh"}: ${e.status ? STATUS_LABEL[e.status] : "Belgilanmagan"}`,
  );
  return [head, ...lines].join("\n");
};

const LEGEND = [
  { cls: "bg-emerald-500", label: STATUS_LABEL.present },
  { cls: "bg-rose-500", label: STATUS_LABEL.absent },
  { cls: "bg-amber-400", label: STATUS_LABEL.excused },
  { cls: "bg-gray-300", label: STATUS_LABEL.exempt },
  { cls: "bg-white ring-1 ring-inset ring-gray-300", label: "Belgilanmagan" },
  { cls: "bg-gray-100", label: "Dars kuni emas" },
];

const StatPill = ({ label, value, className }) => (
  <span className="inline-flex items-baseline gap-1">
    <span className={`font-semibold ${className || ""}`}>{value}</span>
    <span className="text-muted-foreground">{label}</span>
  </span>
);

const AttendanceYearHeatmap = ({ data, year, onPrevYear, onNextYear }) => {
  const map = useMemo(() => buildMap(data), [data]);

  const todayKey = useMemo(() => {
    const n = new Date();
    return keyFor(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);

  const stats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let excused = 0;
    let exempt = 0;
    let unmarked = 0;
    for (const [, entries] of map) {
      const s = aggStatus(entries);
      if (s === "present") present += 1;
      else if (s === "absent") absent += 1;
      else if (s === "excused") excused += 1;
      else if (s === "exempt") exempt += 1;
      else unmarked += 1;
    }
    const graded = present + absent + excused;
    const rate = graded > 0 ? Math.round((present / graded) * 100) : null;
    return { present, absent, excused, exempt, unmarked, total: map.size, rate };
  }, [map]);

  return (
    <div className="space-y-4">
      {/* Sarlavha + yil navigatsiyasi */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{year}-yil davomati</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevYear}
            aria-label="Oldingi yil"
            className="grid size-8 place-items-center rounded-md border bg-white hover:bg-gray-50"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={onNextYear}
            aria-label="Keyingi yil"
            className="grid size-8 place-items-center rounded-md border bg-white hover:bg-gray-50"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* Yillik xulosa */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <StatPill label="keldi" value={stats.present} className="text-emerald-600" />
        <StatPill label="kelmadi" value={stats.absent} className="text-rose-600" />
        <StatPill label="sababli" value={stats.excused} className="text-amber-600" />
        <StatPill label="jami dars kuni" value={stats.total} />
      </div>

      {/* Heatmap: qatorlar = oylar, ustunlar = 1..31 kun */}
      <div className="overflow-x-auto">
        <div className="min-w-max space-y-[3px]">
          {/* Ustun sarlavhasi (sana belgilari) */}
          <div className="flex items-center gap-[3px]">
            <div className="w-16 shrink-0" />
            {Array.from({ length: 31 }, (_, i) => {
              const day = i + 1;
              return (
                <div
                  key={day}
                  className="w-3.5 text-center text-[8px] leading-none text-muted-foreground"
                >
                  {DAY_TICKS.includes(day) ? day : ""}
                </div>
              );
            })}
          </div>

          {MONTHS.map((monthName, month) => {
            const dim = daysInMonth(year, month);
            return (
              <div key={monthName} className="flex items-center gap-[3px]">
                <div className="w-16 shrink-0 pr-1 text-right text-[11px] text-muted-foreground">
                  {monthName}
                </div>
                {Array.from({ length: 31 }, (_, i) => {
                  const day = i + 1;
                  // Oyda bunday kun yo'q (masalan 31-fevral) → bo'sh joy
                  if (day > dim) {
                    return <div key={day} className="size-3.5" />;
                  }
                  const dKey = keyFor(year, month, day);
                  const entries = map.get(dKey);
                  const isToday = dKey === todayKey;

                  // Dars kuni emas
                  if (!entries) {
                    return (
                      <div
                        key={day}
                        title={`${day}-${monthName.toLowerCase()}, ${year}\nDars kuni emas`}
                        className={`size-3.5 rounded-[3px] bg-gray-100 ${
                          isToday ? "ring-2 ring-sky-400" : ""
                        }`}
                      />
                    );
                  }

                  const status = aggStatus(entries);
                  const color = status
                    ? HEAT_CLASS[status]
                    : "bg-white ring-1 ring-inset ring-gray-300";
                  return (
                    <div
                      key={day}
                      title={cellTitle(year, month, day, entries)}
                      className={`size-3.5 rounded-[3px] ${color} ${
                        isToday ? "ring-2 ring-sky-400" : ""
                      }`}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Izoh */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className={`inline-block size-3 rounded-[3px] ${l.cls}`} />
            <span>{l.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default AttendanceYearHeatmap;
