import { useEffect, useMemo, useRef, useState } from "react";
import Button from "@/shared/components/ui/button/Button";
import Badge from "@/shared/components/ui/badge/Badge";
import AttendanceMarker from "./AttendanceMarker";
import AttendanceLegend from "./AttendanceLegend";
import BulkStatusSlider from "./BulkStatusSlider";
import { formatPhone } from "@/shared/utils/formatPhone";
import { formatDateTimeUz } from "@/shared/utils/formatDate";
import { cn } from "@/shared/utils/cn";
import { STATUS_LABEL, ATTENDANCE_STATUSES } from "@/shared/constants/attendance";
import { scheduleActiveOn } from "@/shared/utils/formatSchedule";

// Davomat o'zgartirilgan bo'lsa (history > 1) audit izohini matn ko'rinishida quradi
const editHistoryTitle = (attendance) => {
  const hist = attendance?.history || [];
  if (hist.length <= 1) return "";
  return hist
    .map((h) => {
      const ts = formatDateTimeUz(h.at);
      const from = h.from ? STATUS_LABEL[h.from] || h.from : "-";
      const to = STATUS_LABEL[h.to] || h.to;
      return `${ts}: ${from} → ${to}`;
    })
    .join("\n");
};

const DEFAULT_STATUS = "absent";

// Hafta kunlari (uz) - "dars kuni emas" ogohlantirishida guruh jadvalini ko'rsatish uchun
const DAY_LABELS_UZ = {
  mon: "Dushanba",
  tue: "Seshanba",
  wed: "Chorshanba",
  thu: "Payshanba",
  fri: "Juma",
  sat: "Shanba",
  sun: "Yakshanba",
};
const WEEK_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// Avval mavjud attendance rowsdan boshlangich qiymatlarni quradi.
// Yangi yozuvlar default ravishda "absent" (Kelmadi) bo'ladi.
const buildInitialRow = (row) => {
  const a = row.attendance;
  if (a) {
    return {
      status: a.status,
      reason: a.reason || "",
      lateMinutes: a.lateMinutes || 0,
    };
  }
  if (row.defaultStatus === "exempt") {
    return { status: "exempt", reason: "", lateMinutes: 0 };
  }
  return { status: DEFAULT_STATUS, reason: "", lateMinutes: 0 };
};

const isSame = (a, b) =>
  a.status === b.status &&
  String(a.reason || "") === String(b.reason || "") &&
  Number(a.lateMinutes || 0) === Number(b.lateMinutes || 0);

// Range sudralayotganda qator yorqin bo'yaladi (fon rangi)
const STATUS_ROW_PREVIEW = {
  present: "bg-green-100",
  absent: "bg-red-100",
  excused: "bg-amber-100",
  exempt: "bg-gray-200",
  "": "bg-gray-100",
};

// ...va chap chetida rangli chiziq
const STATUS_ACCENT = {
  present: "border-l-4 border-green-500",
  absent: "border-l-4 border-red-500",
  excused: "border-l-4 border-amber-500",
  exempt: "border-l-4 border-gray-500",
  "": "border-l-4 border-gray-400",
};

const AttendanceGrid = ({ data, onSubmit, isSubmitting = false }) => {
  const initial = useMemo(() => {
    const map = {};
    for (const r of data?.rows || []) {
      map[String(r.student._id)] = buildInitialRow(r);
    }
    return map;
  }, [data]);

  // Guruhning dars kunlari (ogohlantirish matni uchun)
  const classDaysLabel = useMemo(() => {
    const days = [
      ...new Set(scheduleActiveOn(data?.group?.schedule).map((s) => s.day)),
    ];
    days.sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
    return days.map((d) => DAY_LABELS_UZ[d] || d).join(", ");
  }, [data]);

  const [state, setState] = useState(initial);
  // Data o'zgarsa state'ni reset qilamiz - render-time sync (effekt'siz)
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setState(initial);
  }

  // Bosib-sudrab (range) belgilash holati: { status, start, end } (indekslar)
  const [drag, setDrag] = useState(null);

  // Klaviatura navigatsiyasi uchun: hozir fokusda turgan o'quvchi qatori (-1 = yo'q)
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef(null);

  // Sudrash (mouse + touch): pointer eventlar bilan ishlaydi. Barmoq/sichqoncha
  // qaysi qator ustida ekanini elementFromPoint orqali aniqlaymiz; qo'yib
  // yuborilganda oraliqdagi barcha o'quvchiga status beriladi.
  // drag o'zgarganda qayta obuna bo'lamiz - handler eng so'nggi qiymatlarni ko'radi.
  useEffect(() => {
    if (!drag || !data) return undefined;
    const idxAt = (x, y) => {
      const el = document.elementFromPoint(x, y)?.closest?.("[data-idx]");
      const i = el ? Number(el.dataset.idx) : NaN;
      return Number.isNaN(i) ? null : i;
    };
    const onMove = (e) => {
      if (e.cancelable) e.preventDefault(); // touch'da sahifa scroll bo'lmasin
      const i = idxAt(e.clientX, e.clientY);
      if (i !== null) setDrag((d) => (d && d.end !== i ? { ...d, end: i } : d));
    };
    const onUp = () => {
      const lo = Math.min(drag.start, drag.end);
      const hi = Math.max(drag.start, drag.end);
      setState((prev) => {
        const next = { ...prev };
        for (let i = lo; i <= hi && i < data.rows.length; i++) {
          const r = data.rows[i];
          // auto-exempt qatorlarga tegmaymiz (setAll bilan bir xil)
          if (!r || r.defaultStatus === "exempt") continue;
          next[String(r.student._id)] = {
            status: drag.status,
            reason: "",
            lateMinutes: 0,
          };
        }
        return next;
      });
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, data]);

  // Klaviatura yorliqlari (desktop reception uchun tezkor belgilash):
  //  ↑/↓ - qatorlar bo'ylab harakat,  1-4 - fokusdagi qatorga status,
  //  P - hammaga "Keldi",  ⌘/Ctrl+Enter - saqlash.
  // Early-return'lardan oldin turishi shart (Hooks tartibi) - shuning uchun
  // ichkarida `data`/`isClassDay` guard'lari bilan himoyalangan.
  useEffect(() => {
    const rows = data?.rows || [];
    if (rows.length === 0 || !data?.isClassDay) return undefined;

    // Fokusdagi qatorga bitta status beradi (exempt qatorlarga tegmaydi)
    const setStatusAt = (index, status) => {
      const r = rows[index];
      if (!r || r.defaultStatus === "exempt") return;
      const sid = String(r.student._id);
      setState((prev) => ({
        ...prev,
        [sid]: { status, reason: "", lateMinutes: 0 },
      }));
    };
    // Hammaga bitta status (setAll bilan bir xil mantiq)
    const applyAll = (status) =>
      setState((prev) => {
        const next = { ...prev };
        for (const r of rows) {
          if (r.defaultStatus === "exempt") continue;
          next[String(r.student._id)] = { status, reason: "", lateMinutes: 0 };
        }
        return next;
      });

    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (isSubmitting) return;
        // handleSubmit bilan bir xil: o'zgargan/yangi yozuvlarni yig'ib yuboramiz
        setState((cur) => {
          const items = [];
          for (const r of rows) {
            const sid = String(r.student._id);
            const c = cur[sid] || { status: "" };
            if (!c.status) continue;
            if (r.attendance && isSame(initial[sid], c)) continue;
            items.push({
              studentId: sid,
              status: c.status,
              reason: c.reason || "",
              lateMinutes: Number(c.lateMinutes || 0),
            });
          }
          if (items.length > 0) onSubmit(items);
          return cur;
        });
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(rows.length - 1, i < 0 ? 0 : i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(0, i < 0 ? 0 : i - 1));
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        applyAll("present");
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        setFocusedIndex((idx) => {
          if (idx >= 0) {
            const status = ATTENDANCE_STATUSES[Number(e.key) - 1];
            if (status) setStatusAt(idx, status);
          }
          return idx;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, isSubmitting, initial, onSubmit]);

  // Fokus o'zgarganda shu qatorni ko'rinishga olib keladi
  useEffect(() => {
    if (focusedIndex < 0 || !containerRef.current) return;
    const el = containerRef.current.querySelector(
      `[data-idx="${focusedIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  if (!data) return null;
  // Dars kuni bo'lmasa ham belgilash mumkin - pastda ogohlantirish ko'rsatiladi
  if ((data.rows || []).length === 0) {
    return (
      <div className="border rounded-md p-8 text-center text-muted-foreground bg-white">
        Bu sanaga active o'quvchilar yo'q.
      </div>
    );
  }

  // Dars kuni bo'lmasa belgilash bloklanadi (faqat dars kunlari belgilanadi)
  const locked = !data.isClassDay;

  // Statusni bosib-sudrashni boshlaydi
  const startDrag = (index, status) => {
    if (locked || isSubmitting) return;
    setDrag({ status, start: index, end: index });
  };
  const dragLo = drag ? Math.min(drag.start, drag.end) : -1;
  const dragHi = drag ? Math.max(drag.start, drag.end) : -1;

  const dirtyCount = (data.rows || []).reduce((acc, r) => {
    const sid = String(r.student._id);
    return isSame(initial[sid] || {}, state[sid] || {}) ? acc : acc + 1;
  }, 0);

  // Hammasiga bitta status berish
  const setAll = (status) => {
    setState((prev) => {
      const next = { ...prev };
      for (const r of data.rows) {
        const sid = String(r.student._id);
        // exempt default o'quvchilarga tegmaymiz
        if (r.defaultStatus === "exempt") continue;
        next[sid] = {
          status,
          reason: "",
          lateMinutes: 0,
        };
      }
      return next;
    });
  };

  // Saqlanmagan o'zgarishlarni bekor qilib, boshlang'ich holatga qaytaradi
  const resetAll = () => setState(initial);

  const handleSubmit = () => {
    const items = [];
    for (const r of data.rows) {
      const sid = String(r.student._id);
      const cur = state[sid] || { status: "" };
      if (!cur.status) continue;
      if (r.attendance && isSame(initial[sid], cur)) continue;
      items.push({
        studentId: sid,
        status: cur.status,
        reason: cur.reason || "",
        lateMinutes: Number(cur.lateMinutes || 0),
      });
    }
    onSubmit(items);
  };

  return (
    <div className="space-y-3">
      {data.isHoliday ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          Bu kun bayram/dam olish kuni - davomat belgilanmaydi va davomat foiziga
          ta'sir qilmaydi.
        </div>
      ) : (
        !data.isClassDay && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
            Bu kun guruh jadvalida dars kuni emas
            {classDaysLabel ? ` (dars kunlari: ${classDaysLabel})` : ""}. Davomat
            faqat dars kunlari belgilanadi.
          </div>
        )
      )}
      {/* Sticky action panel */}
      <div className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex basis-full sm:basis-auto sm:flex-1 flex-wrap items-center gap-2 min-w-0">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Hammaga:
            </span>
            <BulkStatusSlider onPick={setAll} disabled={isSubmitting || locked} />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {dirtyCount > 0 && (
              <Badge variant="outline" className="text-amber-600">
                {dirtyCount} ta o'zgartirish
              </Badge>
            )}
            <Button
              variant="outline"
              onClick={resetAll}
              disabled={isSubmitting || dirtyCount === 0}
            >
              Bekor qilish
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || locked || dirtyCount === 0}
            >
              {isSubmitting ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </div>
        </div>
        {/* Legend (faqat sm+) + maslahatlar */}
        <div className="mt-2 hidden flex-wrap items-center gap-x-3 gap-y-1 sm:flex">
          <AttendanceLegend />
          {!locked && (
            <span className="text-xs text-muted-foreground">
              Klaviatura: <kbd className="rounded border bg-white px-1">P</kbd> hammasi keldi
              · <kbd className="rounded border bg-white px-1">↑↓</kbd> o'tish
              · <kbd className="rounded border bg-white px-1">1–4</kbd> status
              · <kbd className="rounded border bg-white px-1">⌘↵</kbd> saqlash
            </span>
          )}
        </div>
        {/* Mobil/tablet uchun qisqa maslahat (drag funksiyasini bilishi uchun) */}
        {!locked && (
          <p className="mt-2 text-xs text-muted-foreground sm:hidden">
            Maslahat: statusni bosib turib qatorlar ustidan suring - bir nechta
            o'quvchini birdaniga belgilaysiz
          </p>
        )}
      </div>

      <div
        ref={containerRef}
        className={cn(
          "border rounded-md overflow-hidden bg-white divide-y text-sm",
          drag && "select-none touch-none",
        )}
      >
        {data.rows.map((r, i) => {
          const sid = String(r.student._id);
          const cur = state[sid] || {};
          const isFocused = i === focusedIndex;
          // Sudrash oralig'idami (auto-exempt qatorlar chiqariladi)
          const inDrag =
            !!drag &&
            i >= dragLo &&
            i <= dragHi &&
            r.defaultStatus !== "exempt";
          return (
            <div
              key={sid}
              data-idx={i}
              onMouseDown={() => !locked && setFocusedIndex(i)}
              className={cn(
                "flex flex-col gap-2 p-3 transition-colors sm:flex-row sm:items-center sm:gap-4",
                inDrag
                  ? cn(STATUS_ROW_PREVIEW[drag.status], STATUS_ACCENT[drag.status])
                  : "hover:bg-gray-50",
                isFocused && !inDrag && "bg-sky-50 ring-1 ring-inset ring-sky-300",
              )}
            >
              <div className="flex items-center gap-3 sm:w-60 sm:shrink-0">
                <span className="w-5 shrink-0 text-xs text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {r.student.firstName} {r.student.lastName}
                    {editHistoryTitle(r.attendance) && (
                      <span
                        title={editHistoryTitle(r.attendance)}
                        aria-label="Tahrirlangan"
                        className="ml-1 cursor-help text-amber-500"
                      >
                        ✎
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatPhone(r.student.phone) || "-"}
                  </div>
                </div>
              </div>
              <div className="sm:flex-1">
                <AttendanceMarker
                  value={cur}
                  onChange={(v) => setState((prev) => ({ ...prev, [sid]: v }))}
                  onRangeStart={(s) => startDrag(i, s)}
                  previewStatus={inDrag ? drag.status : null}
                  disabled={isSubmitting || locked}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AttendanceGrid;
