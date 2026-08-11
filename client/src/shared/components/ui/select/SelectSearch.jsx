// React
import { useState } from "react";

// Utils
import { cn } from "@/shared/utils/cn";

// Components
import Button from "../button/Button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/shadcn/popover";
import {
  Command,
  CommandItem,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandInput,
} from "@/shared/components/shadcn/command";

// Icons
import { Check, ChevronDown, Plus } from "lucide-react";

const SelectSearch = ({
  value,
  onChange,
  options = [],
  isLoading = false,
  triggerClassName = "",
  searchPlaceholder = "Qidirish...",
  emptyText = "Hech narsa topilmadi",
  onAddNew,
  addNewLabel = "Yangi",
  ...props
}) => {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((o) => o.value === value);

  const handleOpenChange = (isOpen) => {
    setOpen(isOpen);
  };

  const handleChange = (option) => {
    setOpen(false);
    onChange?.(option.value === value ? "" : option.value);
  };

  const handleAddNew = () => {
    setOpen(false);
    onAddNew?.();
  };

  return (
    <Popover
      open={open}
      className={cn(props.className)}
      onOpenChange={handleOpenChange}
    >
      <PopoverTrigger asChild className={triggerClassName}>
        <Button
          type="button"
          variant="outline"
          disabled={props.disabled || isLoading}
          className="justify-between font-normal px-3 hover:bg-card"
        >
          <span
            className={cn(
              "line-clamp-1",
              selectedOption?.label ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {selectedOption?.label || props.placeholder}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      {/* Kenglik triggerga TENGLASHTIRILADI, lekin `min-w` bilan pol
          qo'yiladi. Sababi: bu select endi jadval katagida ham ishlaydi,
          u yerda trigger 130px atrofida bo'ladi va ro'yxat shunga
          qisqarib, "Yangi guruh" kabi matn ikki qatorga sinib ketardi.
          Keng formalarda hech narsa o'zgarmaydi - u yerda trigger
          allaqachon shu poldan keng. */}
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-60 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => handleChange(option)}
                  className="flex items-center justify-between gap-1.5"
                >
                  {option.label}
                  <Check
                    className={cn(
                      "size-4 text-primary shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>

          {/* "Yangi qo'shish" - CommandList'dan TASHQARIDA. Ichida bo'lsa
              cmdk uni ham qidiruv bo'yicha filtrlab, aynan kerak bo'lgan
              paytda (hech narsa topilmaganda) yashirib qo'yardi. */}
          {onAddNew && (
            <div className="border-t p-1">
              <button
                type="button"
                onClick={handleAddNew}
                className="flex w-full items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-2 text-sm font-medium text-primary transition-colors hover:bg-muted"
              >
                <Plus className="size-4 shrink-0" />
                {addNewLabel}
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SelectSearch;
