// Utils
import { cn } from "@/shared/utils/cn";

// Icons
import { Plus } from "lucide-react";

// Components
import {
  SelectItem,
  SelectValue,
  SelectContent,
  SelectTrigger,
  SelectSeparator,
  Select as SelectWrapper,
} from "@/shared/components/shadcn/select";

const EMPTY_SENTINEL = "__empty__";
// "Yangi qo'shish" qatori ODDIY variant qilib beriladi, tugma qilib emas.
// Radix Select o'z viewport'i ichidagi bosishni item tanlash deb o'qiydi -
// oddiy <button> sichqonchada ishlamay qolishi mumkin. Sentinel variant esa
// Radix'ning o'z mexanizmidan o'tadi: klaviatura ham, sichqoncha ham ishlaydi
// va ro'yxat o'zi yopiladi. `handleChange` uni ushlab qoladi, ya'ni bu qiymat
// hech qachon `onChange` ga chiqmaydi.
const ADD_NEW_SENTINEL = "__add_new__";

const Select = ({
  value,
  onChange,
  onOpenChange,
  options = [],
  isLoading = false,
  triggerClassName = "",
  onAddNew,
  addNewLabel = "Yangi",
  ...props
}) => {
  const handleChange = (next) => {
    if (next === ADD_NEW_SENTINEL) {
      onAddNew?.();
      return;
    }
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
          "h-10 bg-card text-base outline-2 outline-primary md:text-sm",
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

        {/* Yangi qo'shish - ro'yxatning eng oxirida, ajratuvchi chiziq bilan */}
        {onAddNew && !isLoading && (
          <>
            {options.length > 0 && <SelectSeparator />}
            <SelectItem
              value={ADD_NEW_SENTINEL}
              className="text-primary font-medium"
            >
              <span className="flex items-center gap-1.5">
                <Plus className="size-4" />
                {addNewLabel}
              </span>
            </SelectItem>
          </>
        )}
      </SelectContent>
    </SelectWrapper>
  );
};

export default Select;
