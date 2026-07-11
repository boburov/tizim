import { useEffect, useMemo, useRef, useState } from "react";
import SelectField from "@/shared/components/ui/select/SelectField";
import { cn } from "@/shared/utils/cn";

const UZ_MONTHS = [
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

const pad = (n) => String(n).padStart(2, "0");
const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

const THUMB = 24;
const INSET = THUMB / 2;
// Thumb chetlardan INSETpx ichkarida; ruler/fill shu o'lchamga moslanadi
const posLeft = (frac) => `calc(${INSET}px + (100% - ${THUMB}px) * ${frac})`;

const parseISO = (v) => {
  if (!v) return null;
  const [y, m, d] = String(v).split("-").map(Number);
  if (y && m && d) return { y, m: m - 1, d };
  return null;
};

// A (boshlanish) va B (tugash) bitta oy ichida, bitta ruler ustida
const DateRangeSlider = ({
  startValue,
  endValue,
  onChange,
  disabled = false,
  yearsBack = 1,
  yearsForward = 4,
}) => {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(null); // "start" | "end" | null
  const now = useMemo(() => new Date(), []);

  const s = parseISO(startValue) || {
    y: now.getFullYear(),
    m: now.getMonth(),
    d: now.getDate(),
  };
  const year = s.y;
  const month = s.m;
  const maxDay = daysInMonth(year, month);
  const startDay = clamp(s.d, 1, maxDay);

  const eParsed = parseISO(endValue);
  let endDay =
    eParsed && eParsed.y === year && eParsed.m === month ? eParsed.d : startDay;
  endDay = clamp(Math.max(endDay, startDay), 1, maxDay);

  const emit = (y, m, sd, ed) => {
    const md = daysInMonth(y, m);
    const a = clamp(sd, 1, md);
    const b = clamp(ed, 1, md);
    onChange?.({
      startDate: toISO(y, m, Math.min(a, b)),
      endDate: toISO(y, m, Math.max(a, b)),
    });
  };

  const frac = (d) => (maxDay > 1 ? (d - 1) / (maxDay - 1) : 0);

  const dayFromClientX = (clientX) => {
    const el = trackRef.current;
    if (!el) return startDay;
    const rect = el.getBoundingClientRect();
    const usable = rect.width - THUMB;
    const f = usable > 0 ? clamp((clientX - rect.left - INSET) / usable, 0, 1) : 0;
    return Math.round(1 + f * (maxDay - 1));
  };

  useEffect(() => {
    if (!dragging) return undefined;
    const move = (e) => {
      const d = dayFromClientX(e.clientX);
      if (dragging === "start") emit(year, month, Math.min(d, endDay), endDay);
      else emit(year, month, startDay, Math.max(d, startDay));
    };
    const up = () => setDragging(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, year, month, startDay, endDay, maxDay]);

  const onTrackDown = (e) => {
    if (disabled) return;
    const d = dayFromClientX(e.clientX);
    const which =
      Math.abs(d - startDay) <= Math.abs(d - endDay) ? "start" : "end";
    if (which === "start") emit(year, month, Math.min(d, endDay), endDay);
    else emit(year, month, startDay, Math.max(d, startDay));
    setDragging(which);
  };

  const onThumbDown = (which) => (e) => {
    if (disabled) return;
    e.stopPropagation();
    setDragging(which);
  };

  const onThumbKey = (which) => (e) => {
    if (disabled) return;
    let delta = 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -1;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = 1;
    else return;
    e.preventDefault();
    if (which === "start")
      emit(year, month, Math.min(startDay + delta, endDay), endDay);
    else emit(year, month, startDay, Math.max(endDay + delta, startDay));
  };

  const yearOptions = useMemo(() => {
    const base = now.getFullYear();
    const list = [];
    for (let y = base - yearsBack; y <= base + yearsForward; y += 1) {
      list.push({ value: String(y), label: String(y) });
    }
    return list;
  }, [now, yearsBack, yearsForward]);

  const monthOptions = UZ_MONTHS.map((m, i) => ({ value: String(i), label: m }));
  const isLabeled = (d) => d === 1 || d % 5 === 0;
  const monthName = UZ_MONTHS[month].toLowerCase();

  const renderThumb = (which, day, letter) => (
    <div
      className="absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
      style={{ left: posLeft(frac(day)) }}
    >
      <div className="relative flex flex-col items-center">
        <span className="absolute -top-7 rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary-foreground shadow-sm">
          {day}
        </span>
        <button
          type="button"
          data-which={which}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={which === "start" ? "Boshlanish (A)" : "Tugash (B)"}
          aria-valuemin={1}
          aria-valuemax={maxDay}
          aria-valuenow={day}
          onPointerDown={onThumbDown(which)}
          onKeyDown={onThumbKey(which)}
          className="flex size-6 touch-none items-center justify-center rounded-full border-2 border-white bg-primary text-[10px] font-bold text-primary-foreground shadow outline-none ring-primary/30 focus-visible:ring-2"
          style={{ cursor: disabled ? "not-allowed" : "grab" }}
        >
          {letter}
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-muted/20 p-4",
        disabled && "opacity-60",
      )}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground/80">Davr</span>
        <span className="text-sm font-semibold tabular-nums text-primary">
          {startDay === endDay
            ? `${startDay}-${monthName}, ${year}`
            : `${startDay}–${endDay}-${monthName}, ${year}`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SelectField
          value={String(month)}
          onChange={(v) => emit(year, Number(v), startDay, endDay)}
          options={monthOptions}
          disabled={disabled}
        />
        <SelectField
          value={String(year)}
          onChange={(v) => emit(Number(v), month, startDay, endDay)}
          options={yearOptions}
          disabled={disabled}
        />
      </div>

      <div className="select-none px-1 pb-1 pt-9">
        <div
          ref={trackRef}
          onPointerDown={onTrackDown}
          className="relative h-6"
          style={{ touchAction: "none" }}
        >
          <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-muted" />
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary/40"
            style={{
              left: posLeft(frac(startDay)),
              width: `calc((100% - ${THUMB}px) * ${frac(endDay) - frac(startDay)})`,
            }}
          />
          {renderThumb("start", startDay, "A")}
          {renderThumb("end", endDay, "B")}
        </div>

        <div className="relative mt-2 h-6">
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => {
            const active = d === startDay || d === endDay;
            const labeled = isLabeled(d);
            return (
              <div
                key={d}
                className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                style={{ left: posLeft(frac(d)) }}
              >
                <span
                  className={cn(
                    "w-px rounded-full",
                    active
                      ? "h-3 bg-primary"
                      : labeled
                        ? "h-2.5 bg-muted-foreground/50"
                        : "h-1.5 bg-muted-foreground/25",
                  )}
                />
                {labeled && (
                  <span
                    className={cn(
                      "mt-0.5 text-[10px] tabular-nums",
                      active
                        ? "font-semibold text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    {d}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DateRangeSlider;
