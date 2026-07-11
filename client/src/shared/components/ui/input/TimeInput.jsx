import * as React from "react";

// Utils
import { cn } from "@/shared/utils/cn.js";

/**
 * TimeInput - 24 soatlik vaqt uchun oddiy native input ("HH:mm").
 *
 * Native `<input type="time">` ishlatiladi: uning QIYMATI doim 24 soatlik "HH:mm"
 * formatida bo'ladi (jadval solishtiruvi/validatsiya aynan shu formatga tayanadi).
 * Soat/daqiqa segmentlari va strelkalar bilan qiymat oson kiritiladi - eski maskali
 * matn inputidagi tahrirlash muammolari (masalan "830" -> "23:00") yo'q.
 *
 * Eslatma: ko'rinish (24h yoki AM/PM) brauzer/OS tiliga bog'liq - qiymat esa
 * har doim 24 soatlik. 24 soatlik muhitda AM/PM ko'rsatilmaydi.
 *
 * @param {string}   value     "HH:mm" ko'rinishidagi qiymat
 * @param {Function} onChange  (next: "HH:mm") => void  (tozalasa "" qaytadi)
 * @param {boolean}  disabled
 */
const inputClasses =
  "h-9 w-full rounded-md border border-input bg-white px-2 text-center text-sm tabular-nums outline-2 outline-primary outline-offset-0 focus:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-calendar-picker-indicator]:cursor-pointer";

const TimeInput = React.forwardRef(function TimeInput(
  { value, onChange, disabled = false, className },
  ref,
) {
  return (
    <input
      ref={ref}
      type="time"
      step={60}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Vaqt"
      className={cn(inputClasses, className)}
    />
  );
});

export default TimeInput;
