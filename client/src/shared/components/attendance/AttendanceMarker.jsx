import { useRef } from "react";
import {
  STATUS_LABEL,
  STATUS_BADGE_CLASS,
  STATUS_DOT_CLASS,
} from "@/shared/constants/attendance";
import {
  Select as SelectRoot,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/shared/components/shadcn/select";
import { cn } from "@/shared/utils/cn";

const BTN_BASE =
  "flex-1 select-none inline-flex items-center justify-center gap-1 px-3 py-2 rounded-md text-xs font-medium border transition-colors disabled:opacity-50";

// Keldi/Kelmadi - alohida tugma; Sababli/Ozod - dropdown ichida
const BUTTON_STATUSES = ["present", "absent"];
const DROPDOWN_STATUSES = ["excused", "exempt"];

// Tanlangan statusga qarab dropdown trigger rangi (ko'rinarli bo'lsin)
const TRIGGER_STATUS_CLASS = {
  excused: "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100",
  exempt: "border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200",
};

// Rangli nuqta (dropdown ichida va triggerda status ko'rsatkichi)
const StatusDot = ({ status }) => (
  <span
    className={cn("size-2.5 shrink-0 rounded-full", STATUS_DOT_CLASS[status])}
  />
);

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
  const { status = "", reason = "" } = value;
  // Sudrash paytida ko'rsatiladigan status (haqiqiy statusni vaqtincha bosib turadi)
  const shown = previewStatus !== null ? previewStatus : status;
  // Dropdown qiymati: faqat Sababli/Ozod bo'lsa - shu status, aks holda placeholder
  const dropdownValue = DROPDOWN_STATUSES.includes(shown) ? shown : "";
  // "Sababli" tanlansa - sababini izoh qilib qoldirish uchun maydon ochiladi
  const showReason = status === "excused" && previewStatus === null;

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
  // pointerdown: sichqonchada darrov range, touchda uzoq bosishda range boshlanadi
  const beginPress = (e, s) => {
    if (e.pointerType === "mouse") {
      e.preventDefault();
      onRangeStart(s);
      return;
    }
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearPress();
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      onRangeStart(s);
    }, LONG_PRESS_MS);
  };
  const trackPress = (e) => {
    if (!pressTimer.current || !pressStart.current) return;
    const dx = Math.abs(e.clientX - pressStart.current.x);
    const dy = Math.abs(e.clientY - pressStart.current.y);
    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) clearPress();
  };

  // Keldi/Kelmadi - bir xil o'lchamli tugmalar (bosib-sudrab ham belgilash mumkin)
  const renderStatusButton = (s) => {
    const active = shown === s;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => pickStatus(s)}
        onPointerDown={onRangeStart ? (e) => beginPress(e, s) : undefined}
        onPointerMove={onRangeStart ? trackPress : undefined}
        onPointerUp={onRangeStart ? clearPress : undefined}
        onPointerCancel={onRangeStart ? clearPress : undefined}
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
  };

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-stretch gap-1.5 w-full">
        {/* Keldi / Kelmadi - ikkita bir xil o'lchamli tugma */}
        {BUTTON_STATUSES.map((s) => (
          <span key={s} className="flex flex-1">
            {renderStatusButton(s)}
          </span>
        ))}

        {/* Sababli / Ozod - dropdown ichida */}
        <SelectRoot
          value={dropdownValue}
          onValueChange={pickStatus}
          disabled={disabled}
        >
          <SelectTrigger
            className={cn(
              "h-auto w-[150px] shrink-0 py-2 text-xs font-medium transition-colors",
              dropdownValue
                ? cn(TRIGGER_STATUS_CLASS[dropdownValue], "font-semibold")
                : "border-gray-200 bg-white text-muted-foreground hover:bg-gray-50",
            )}
          >
            {dropdownValue ? (
              <span className="flex items-center gap-2">
                <StatusDot status={dropdownValue} />
                {STATUS_LABEL[dropdownValue]}
              </span>
            ) : (
              <span>Sababli / Ozod</span>
            )}
          </SelectTrigger>
          <SelectContent>
            {DROPDOWN_STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                <span className="flex items-center gap-2">
                  <StatusDot status={s} />
                  {STATUS_LABEL[s]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </SelectRoot>
      </div>

      {showReason && (
        <input
          type="text"
          value={reason}
          disabled={disabled}
          maxLength={300}
          onChange={(e) => onChange({ ...value, reason: e.target.value })}
          placeholder="Sabab izohi (ixtiyoriy)"
          className="w-full rounded-md border border-amber-200 bg-amber-50/50 px-2.5 py-1.5 text-xs text-amber-900 placeholder:text-amber-500/70 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:opacity-50"
        />
      )}
    </div>
  );
};

export default AttendanceMarker;
