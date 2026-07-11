import * as React from "react";

// Utils
import { cn } from "@/shared/utils/cn.js";

export const inputBaseClasses =
  "flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-base outline-2 outline-primary outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

// Barcha textli inputlar uchun standart belgi limiti (caller o'zi override qila oladi)
const DEFAULT_MAX_LENGTH = 20;

const Input = ({ className, type = "text", maxLength, ...props }, ref) => {
  // number/date/datetime kabi turlar uchun maxLength qo'llanmaydi
  const isTextLike =
    type === "text" || type === "email" || type === "url" || type === "textarea";
  const resolvedMaxLength = isTextLike
    ? maxLength ?? DEFAULT_MAX_LENGTH
    : maxLength;

  if (type === "textarea") {
    return (
      <textarea
        ref={ref}
        maxLength={resolvedMaxLength}
        {...props}
        className={cn(inputBaseClasses, "h-auto min-h-40 max-h-96", className)}
      />
    );
  }

  return (
    <input
      ref={ref}
      maxLength={resolvedMaxLength}
      {...props}
      type={type}
      className={cn(inputBaseClasses, className)}
    />
  );
};

Input.displayName = "Input";

export default Input;
