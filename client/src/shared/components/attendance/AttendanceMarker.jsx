import { useRef } from "react";
import {
  ATTENDANCE_STATUSES,
  STATUS_LABEL,
  STATUS_BADGE_CLASS,
} from "@/shared/constants/attendance";
import { cn } from "@/shared/utils/cn";

const BTN_BASE =
  "flex-1 min-w-[80px] select-none inline-flex items-center justify-center gap-1 px-2 py-2 rounded-md text-xs font-medium border transition-colors disabled:opacity-50";

const LONG_PRESS_MS = 300;
const MOVE_TOLERANCE = 10;

// Bitta o'quvchi qatori uchun: 1 click/tap bilan status tanlash.
// onRangeStart berilsa - statusni bosib-sudrab (range) belgilash boshlanadi (pointerdown - mouse + touch).
// previewStatus berilsa - sudrash paytida shu status faol ko'rinadi (ranglar o'zgaradi).
const AttendanceMarker = ({
  value = {},
  onChange,
  onRangeStart,
  previewStatus = null,
  disabled = false,
}) => {
  const { status = "" } = value;
  // Sudrash paytida ko'rsatiladigan status (haqiqiy statusni vaqtincha bosib turadi)
  const shown = previewStatus !== null ? previewStatus : status;

  // Bitta clickda status o'rnatadi (qo'shimcha maydonlarsiz)
  const pickStatus = (s) =>
    onChange({ ...value, status: s, reason: "", lateMinutes: 0 });

  // Long-press (touch) holatini kuzatish: tezda surilsa scroll, uzoq bossa range tanlash
  const pressTimer = useRef(null);
  const pressStart = useRef(null);
  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  // click - klaviatura/yakka tanlov; sichqonchada darrov, touchda uzoq bosishda range
  const handlers = (s) => {
    const base = { onClick: () => pickStatus(s) };
    if (!onRangeStart) return base;
    return {
      ...base,
      onPointerDown: (e) => {
        if (e.pointerType === "mouse") {
          e.preventDefault();
          onRangeStart(s);
          return;
        }
        // touch/pen: uzoq bosishda range tanlash boshlanadi (aks holda - sahifa scroll)
        pressStart.current = { x: e.clientX, y: e.clientY };
        clearPress();
        pressTimer.current = setTimeout(() => {
          pressTimer.current = null;
          onRangeStart(s);
        }, LONG_PRESS_MS);
      },
      onPointerMove: (e) => {
        if (!pressTimer.current || !pressStart.current) return;
        const dx = Math.abs(e.clientX - pressStart.current.x);
        const dy = Math.abs(e.clientY - pressStart.current.y);
        if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) clearPress();
      },
      onPointerUp: clearPress,
      onPointerCancel: clearPress,
    };
  };

  return (
    <div className="flex flex-wrap items-stretch gap-1.5 w-full">
      {ATTENDANCE_STATUSES.map((s) => {
        const active = shown === s;
        return (
          <button
            key={s}
            type="button"
            disabled={disabled}
            {...handlers(s)}
            aria-pressed={active}
            title={STATUS_LABEL[s]}
            className={cn(
              BTN_BASE,
              active
                ? cn(
                    STATUS_BADGE_CLASS[s],
                    "border-transparent font-semibold ring-1 ring-black/10 shadow-sm",
                  )
                : "bg-white border-gray-200 text-muted-foreground hover:bg-gray-50",
            )}
          >
            {STATUS_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
};

export default AttendanceMarker;
