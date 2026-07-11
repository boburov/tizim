// Utils
import { cn } from "@/shared/utils/cn";

// Components
import {
  SelectItem,
  SelectValue,
  SelectContent,
  SelectTrigger,
  Select as SelectWrapper,
} from "@/shared/components/shadcn/select";

const EMPTY_SENTINEL = "__empty__";

const Select = ({
  value,
  onChange,
  onOpenChange,
  options = [],
  isLoading = false,
  triggerClassName = "",
  ...props
}) => {
  const handleChange = (next) => {
    onChange?.(next === EMPTY_SENTINEL ? "" : next);
  };

  const handleOpenChange = (e) => {
    onOpenChange?.(e);
  };

  const isControlled = value !== undefined;
  const valueProp = isControlled
    ? { value: value === "" || value == null ? EMPTY_SENTINEL : value }
    : {};

  return (
    <SelectWrapper
      id={props.id || props.name}
      {...valueProp}
      onValueChange={handleChange}
      name={props.name || props.id}
      onOpenChange={handleOpenChange}
      {...props}
    >
      {/* Trigger */}
      <SelectTrigger
        className={cn(
          "h-10 bg-white text-base outline-2 outline-primary md:text-sm",
          triggerClassName,
        )}
      >
        <SelectValue placeholder={props.placeholder} />
      </SelectTrigger>

      {/* Content */}
      <SelectContent>
        {/* Options */}
        {!isLoading &&
          options.map((opt) => {
            const itemValue =
              opt.value === "" || opt.value == null
                ? EMPTY_SENTINEL
                : opt.value;
            return (
              <SelectItem
                key={itemValue}
                value={itemValue}
                disabled={opt.disabled}
              >
                {opt.label}
              </SelectItem>
            );
          })}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center h-20">
            <div className="size-5 border-2 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </SelectContent>
    </SelectWrapper>
  );
};

export default Select;
