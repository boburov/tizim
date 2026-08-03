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

// Qidiriladigan KO'P TANLOVLI select. value - tanlangan qiymatlar massivi,
// onChange - yangi massiv. Tanlanganda popover ochiq qoladi (ketma-ket tanlash).
const MultiSelectSearch = ({
  value = [],
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
  const selected = Array.isArray(value) ? value : [];
  const selectedCount = selected.length;

  const toggle = (optValue) => {
    const exists = selected.includes(optValue);
    const next = exists
      ? selected.filter((v) => v !== optValue)
      : [...selected, optValue];
    onChange?.(next);
  };

  const triggerLabel =
    selectedCount === 0
      ? props.placeholder
      : selectedCount === 1
        ? options.find((o) => o.value === selected[0])?.label ||
          `1 ta tanlandi`
        : `${selectedCount} ta tanlandi`;

  return (
    <Popover
      open={open}
      className={cn(props.className)}
      onOpenChange={setOpen}
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
              selectedCount ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {triggerLabel}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const checked = selected.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggle(option.value)}
                    className="flex items-center justify-between gap-1.5"
                  >
                    <span className="line-clamp-1">{option.label}</span>
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        checked
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {checked && <Check className="size-3" />}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>

          {/* "Yangi qo'shish" - CommandList'dan TASHQARIDA (cmdk filtri uni
              qidiruv paytida yashirib qo'ymasligi uchun). Ko'p tanlovli
              selectda popover ochiq qoladi, lekin bu yerda yopamiz: modal
              ochilgani uchun ortidagi ro'yxat baribir ko'rinmaydi. */}
          {onAddNew && (
            <div className="border-t p-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onAddNew();
                }}
                className="flex w-full items-center gap-1.5 rounded-sm px-2 py-2 text-sm font-medium text-primary transition-colors hover:bg-muted"
              >
                <Plus className="size-4" />
                {addNewLabel}
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default MultiSelectSearch;
