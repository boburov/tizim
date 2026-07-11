// Components
import Input from "./Input";

// React
import { useRef, useState } from "react";

// Utils
import { cn } from "@/shared/utils/cn";

// Icons
import { Search, X } from "lucide-react";

const InputSearch = ({
  value,
  onChange,
  className = "",
  name = "search",
  placeholder = "Qidirish...",
  disabled = false,
  ...props
}) => {
  const isControlled = value !== undefined;
  const [innerValue, setInnerValue] = useState("");
  const currentValue = isControlled ? value : innerValue;
  const containerRef = useRef(null);

  const handleChange = (e) => {
    if (!isControlled) setInnerValue(e.target.value);
    onChange?.(e);
  };

  const handleClearValue = () => {
    if (!isControlled) setInnerValue("");
    onChange?.({ target: { name, value: "" } });
    containerRef.current?.querySelector("input")?.focus();
  };

  return (
    <div ref={containerRef} className={cn("flex items-center relative")}>
      <Search size={20} className="absolute left-3 text-gray-500" />

      <Input
        name={name}
        value={currentValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className={cn("px-10", className)}
        {...props}
        type="search"
      />

      {currentValue && !disabled && (
        <button
          type="button"
          title="Tozalash"
          aria-label="Tozalash"
          onClick={handleClearValue}
          className="flex items-center justify-center absolute inset-y-1 right-1 size-8 rounded-sm text-gray-500 hover:bg-gray-100 transition-colors outline-primary"
        >
          <X size={20} />
        </button>
      )}
    </div>
  );
};

export default InputSearch;
