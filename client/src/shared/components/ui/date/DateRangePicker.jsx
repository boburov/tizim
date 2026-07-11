import { useMemo, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/shared/components/shadcn/popover";
import Button from "@/shared/components/ui/button/Button";
import { cn } from "@/shared/utils/cn";
import { formatDateUz } from "@/shared/utils/formatDate";

const UZ_MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];
const UZ_WEEK = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (v) => {
  if (!v) return null;
  const [y, m, d] = String(v).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) =>
  a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Dushanbadan boshlanadigan oy gridi (6 qator x 7 kun)
const buildGrid = (view) => {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Mon=0
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};

/**
 * DateRangePicker - brendga mos oy-grid kalendar (range tanlash). Dep yo'q.
 *
 * value: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
 * onChange(key, value): "from" | "to"
 * Birinchi klik - boshlanish (tugashni tozalaydi), ikkinchi klik - tugash.
 */
const DateRangePicker = ({
  value = { from: "", to: "" },
  onChange,
  onClear,
  placeholder = "Sanani tanlang",
  className = "",
}) => {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(null);

  const from = parse(value.from);
  const to = parse(value.to);
  const hasValue = from || to;

  const [view, setView] = useState(() => from || new Date());

  const grid = useMemo(() => buildGrid(view), [view]);

  const label = hasValue
    ? `${from ? formatDateUz(value.from) : "…"} - ${to ? formatDateUz(value.to) : "…"}`
    : placeholder;

  const handlePick = (day) => {
    const d = startOfDay(day);
    // Diapazon to'liq bo'lsa yoki yo'q bo'lsa -> yangi boshlanish
    if (!from || (from && to)) {
      onChange("from", toISO(d));
      onChange("to", "");
      setHover(null);
      return;
    }
    // Boshlanish bor, tugash yo'q -> tugashni belgilaymiz (tartibga solib)
    if (d < from) {
      onChange("from", toISO(d));
      onChange("to", toISO(from));
    } else {
      onChange("to", toISO(d));
    }
  };

  // Oraliqqa tushgan kunlar (hoverda preview ham)
  const rangeEnd = to || (from && hover && hover >= from ? hover : null);
  const inRange = (d) => {
    if (!from || !rangeEnd) return false;
    const t = startOfDay(d).getTime();
    return t > from.getTime() && t < rangeEnd.getTime();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm transition-colors hover:border-foreground/20",
            !hasValue && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[300px] p-3">
        {/* Oy navigatsiyasi */}
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            aria-label="Oldingi oy"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm font-semibold">
            {UZ_MONTHS[view.getMonth()]} {view.getFullYear()}
          </span>
          <button
            type="button"
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            aria-label="Keyingi oy"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {/* Hafta kunlari */}
        <div className="mb-1 grid grid-cols-7 text-center">
          {UZ_WEEK.map((w) => (
            <span key={w} className="text-[11px] font-medium text-muted-foreground">
              {w}
            </span>
          ))}
        </div>

        {/* Kunlar gridi */}
        <div className="grid grid-cols-7 gap-y-1" onMouseLeave={() => setHover(null)}>
          {grid.map((d, i) => {
            const isOtherMonth = d.getMonth() !== view.getMonth();
            const isStart = sameDay(d, from);
            const isEnd = sameDay(d, to);
            const isEdge = isStart || isEnd;
            const between = inRange(d);
            const today = sameDay(d, new Date());

            return (
              <div
                key={i}
                className={cn(
                  "flex justify-center",
                  // oraliq fonini uzluksiz qilish uchun
                  between && "bg-primary/10",
                  isStart && to && "rounded-l-full bg-primary/10",
                  isEnd && from && "rounded-r-full bg-primary/10",
                )}
              >
                <button
                  type="button"
                  onClick={() => handlePick(d)}
                  onMouseEnter={() => setHover(startOfDay(d))}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-sm transition-colors",
                    isOtherMonth ? "text-muted-foreground/40" : "text-foreground",
                    !isEdge && !between && "hover:bg-muted",
                    between && "text-primary",
                    isEdge && "bg-primary font-medium text-primary-foreground hover:bg-primary",
                    today && !isEdge && "font-semibold ring-1 ring-inset ring-primary/40",
                  )}
                >
                  {d.getDate()}
                </button>
              </div>
            );
          })}
        </div>

        {/* Pastki amallar */}
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
          {onClear ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClear}
              disabled={!hasValue}
              className="text-muted-foreground"
            >
              <X className="size-3.5" />
              Tozalash
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Tayyor
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DateRangePicker;
