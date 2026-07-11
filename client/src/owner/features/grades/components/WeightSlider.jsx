// Utils
import { cn } from "@/shared/utils/cn";

// Icons
import { Check, AlertTriangle } from "lucide-react";

// Reyting vazn balansi: Baho vazni / Davomat vazni.
// - Bittasini surganda ikkinchisi avto-moslashib 100% saqlaydi (autoBalance).
// - Slider + raqamli input birga.
// - Ostida ikki rangli proportion bar (baho qismi / davomat qismi).
// - Real-time yig'indi badge: yashil=100%, qizil=noto'g'ri.
//
// Props:
//  grade, attendance - 0..100 sonlar
//  onChange(grade, attendance) - har o'zgarishda chaqiriladi
//  disabled
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

const WeightSlider = ({ grade, attendance, onChange, disabled = false }) => {
  const g = clamp(Number(grade) || 0);
  const a = clamp(Number(attendance) || 0);
  const total = g + a;
  const isBalanced = total === 100;

  // Bittasini o'zgartirganda ikkinchisini 100% ga moslaymiz.
  const setGrade = (next) => {
    const ng = clamp(next);
    onChange(ng, 100 - ng);
  };
  const setAttendance = (next) => {
    const na = clamp(next);
    onChange(100 - na, na);
  };

  return (
    <div className="space-y-5">
      {/* Yig'indi badge */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Yig'indi</span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            isBalanced
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700",
          )}
        >
          {isBalanced ? (
            <Check className="size-3.5" />
          ) : (
            <AlertTriangle className="size-3.5" />
          )}
          {total}%
        </span>
      </div>

      {/* Ikki rangli proportion bar */}
      <div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full bg-primary transition-all duration-200"
            style={{ width: `${g}%` }}
          />
          <div
            className="h-full bg-amber-400 transition-all duration-200"
            style={{ width: `${a}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-gray-600">
            <span className="size-2.5 rounded-full bg-primary" />
            Baho {g}%
          </span>
          <span className="flex items-center gap-1.5 text-gray-600">
            Davomat {a}%
            <span className="size-2.5 rounded-full bg-amber-400" />
          </span>
        </div>
      </div>

      {/* Baho vazni */}
      <WeightRow
        label="Baho vazni"
        accent="primary"
        value={g}
        onChange={setGrade}
        disabled={disabled}
      />

      {/* Davomat vazni */}
      <WeightRow
        label="Davomat vazni"
        accent="amber"
        value={a}
        onChange={setAttendance}
        disabled={disabled}
      />
    </div>
  );
};

// Bitta vazn qatori: label + slider + raqamli input.
const WeightRow = ({ label, accent, value, onChange, disabled }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <span
            className={cn(
              "size-2.5 rounded-full",
              accent === "primary" ? "bg-primary" : "bg-amber-400",
            )}
          />
          {label}
        </label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            className={cn(
              "h-8 w-16 rounded-md border border-gray-200 px-2 text-right text-sm tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          />
          <span className="text-sm text-gray-400">%</span>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          "h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60",
          // WebKit thumb
          "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:transition",
          // Firefox thumb
          "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow",
          accent === "primary"
            ? "[&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:bg-primary"
            : "[&::-webkit-slider-thumb]:bg-amber-400 [&::-moz-range-thumb]:bg-amber-400",
        )}
      />
    </div>
  );
};

export default WeightSlider;
