// Icons
import { Plus, Trash2 } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import TimeInput from "@/shared/components/ui/input/TimeInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/shadcn/select";

// Utils
import { DAY_OPTIONS, DAY_LABELS_FULL_UZ } from "@/shared/utils/formatSchedule";
import { cn } from "@/shared/utils/cn";

const ALL_DAYS = DAY_OPTIONS.map((d) => d.value);
// Bir kunda bir nechta dars (sessiya) bo'lishi mumkin - jami qatorlar uchun yumshoq chegara
const MAX_ROWS = 21;

const findFirstFreeDay = (usedDays) =>
  ALL_DAYS.find((d) => !usedDays.includes(d)) || "mon";

const emptyRow = (usedDays = []) => ({
  day: findFirstFreeDay(usedDays),
  startTime: "14:00",
  endTime: "15:30",
});

const GRID_COLS =
  "grid-cols-[minmax(100px,1.2fr)_minmax(110px,1fr)_minmax(110px,1fr)_36px]";

const ScheduleRow = ({ row, idx, duplicate, disabled, onUpdate, onRemove }) => {
  return (
    <div>
      <div
        className={cn(
          "grid gap-2 items-center px-2 py-1.5",
          GRID_COLS,
          duplicate && "bg-red-50",
        )}
      >
        <Select
          value={row.day}
          onValueChange={(v) => onUpdate("day", v)}
          disabled={disabled}
        >
          <SelectTrigger
            className={cn("h-9 text-sm", duplicate && "border-red-400")}
          >
            <SelectValue placeholder="Kun" />
          </SelectTrigger>
          <SelectContent>
            {DAY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <TimeInput
          value={row.startTime}
          onChange={(v) => onUpdate("startTime", v)}
          disabled={disabled}
        />
        <TimeInput
          value={row.endTime}
          onChange={(v) => onUpdate("endTime", v)}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={onRemove}
          aria-label="Qatorni o'chirish"
          className="size-9 text-red-500 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {duplicate && (
        <p className="px-2 pb-1.5 text-[11px] text-red-600">
          {DAY_LABELS_FULL_UZ[row.day]} {row.startTime} allaqachon bor (bir xil
          vaqt takrorlanmasin)
        </p>
      )}
    </div>
  );
};

const GroupScheduleField = ({ value = [], onChange, disabled = false }) => {
  const update = (idx, key, val) => {
    const next = value.map((item, i) =>
      i === idx ? { ...item, [key]: val } : item,
    );
    onChange(next);
  };

  const addRow = () => {
    if (value.length >= MAX_ROWS) return;
    const used = value.map((v) => v.day);
    onChange([...value, emptyRow(used)]);
  };
  const removeRow = (idx) => onChange(value.filter((_, i) => i !== idx));

  // Dublikat = bir xil kun VA bir xil boshlanish vaqti (kun takrori ruxsat etiladi)
  const keyCount = value.reduce((acc, r) => {
    const k = `${r.day}-${r.startTime}`;
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const isDup = (idx) => {
    const r = value[idx];
    return r ? keyCount[`${r.day}-${r.startTime}`] > 1 : false;
  };
  const canAddMore = value.length < MAX_ROWS;

  return (
    <div className="space-y-2">
      {/* Header - teachers panel bilan bir xil balandlikda */}
      <div className="flex items-center justify-between h-6">
        <span className="text-sm font-medium">Dars jadvali</span>
        <span className="text-xs text-muted-foreground">
          {value.length > 0 ? `${value.length} ta kun` : ""}
        </span>
      </div>

      <div className="border rounded-md overflow-hidden bg-white">
        {value.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            Hech qanday dars kuni qo'shilmagan
          </div>
        ) : (
          <>
            {/* Sub-header */}
            <div
              className={cn(
                "grid gap-2 px-2 py-1.5 bg-gray-50 border-b text-[11px] uppercase tracking-wide text-muted-foreground font-medium",
                GRID_COLS,
              )}
            >
              <span>Kun</span>
              <span>Boshlanish</span>
              <span>Tugash</span>
              <span />
            </div>

            <div className="divide-y">
              {value.map((row, idx) => (
                <ScheduleRow
                  key={idx}
                  row={row}
                  idx={idx}
                  duplicate={isDup(idx)}
                  disabled={disabled}
                  onUpdate={(key, val) => update(idx, key, val)}
                  onRemove={() => removeRow(idx)}
                />
              ))}
            </div>
          </>
        )}

        {/* Footer: + Qator qo'shish (jadval ichida) */}
        <button
          type="button"
          onClick={addRow}
          disabled={disabled || !canAddMore}
          title={!canAddMore ? "Maksimal qatorlar soni" : undefined}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-gray-50 border-t disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="size-4" />
          Qator qo'shish
        </button>
      </div>
    </div>
  );
};

export default GroupScheduleField;
