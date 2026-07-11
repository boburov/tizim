import { useRef, useState } from "react";
import { STATUS_LABEL } from "@/shared/constants/attendance";
import { cn } from "@/shared/utils/cn";

// "Hammaga" shortcut: knobni surib/bosib tanlangan status BARCHA o'quvchiga qo'llanadi
const STATUSES = ["present", "absent", "excused", "exempt"];
const KNOB_CLASS = {
  present: "bg-green-500",
  absent: "bg-red-500",
  excused: "bg-amber-500",
  exempt: "bg-gray-500",
};

const BulkStatusSlider = ({ onPick, disabled = false }) => {
  const [index, setIndex] = useState(0);
  const trackRef = useRef(null);
  const dragging = useRef(false);

  const apply = (i) => {
    const clamped = Math.max(0, Math.min(STATUSES.length - 1, i));
    setIndex(clamped);
    onPick(STATUSES[clamped]);
  };

  const indexFromX = (clientX) => {
    const el = trackRef.current;
    if (!el) return index;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.round(ratio * (STATUSES.length - 1));
  };

  const onPointerDown = (e) => {
    if (disabled) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    apply(indexFromX(e.clientX));
  };
  const onPointerMove = (e) => {
    if (!dragging.current || disabled) return;
    const i = indexFromX(e.clientX);
    if (i !== index) apply(i);
  };
  const stopDrag = (e) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      ref={trackRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      className={cn(
        "relative flex w-full max-w-md touch-none select-none rounded-full border border-gray-200 bg-gray-100 p-1",
        disabled ? "pointer-events-none opacity-50" : "cursor-pointer",
      )}
    >
      {/* Surilib turuvchi rangli knob */}
      <div
        className={cn(
          "pointer-events-none absolute bottom-1 top-1 rounded-full shadow transition-transform duration-200 ease-out",
          KNOB_CLASS[STATUSES[index]],
        )}
        style={{
          left: "0.25rem",
          width: `calc((100% - 0.5rem) / ${STATUSES.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {STATUSES.map((s, i) => (
        <button
          key={s}
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => apply(i)}
          className={cn(
            "relative z-10 flex-1 rounded-full px-2 py-2 text-xs font-medium transition-colors",
            i === index ? "text-white" : "text-muted-foreground",
          )}
        >
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
};

export default BulkStatusSlider;
