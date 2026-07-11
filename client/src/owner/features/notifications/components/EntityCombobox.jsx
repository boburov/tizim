import { useState } from "react";
import { Check, ChevronsUpDown, X, Loader2, Search } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/shared/components/shadcn/popover";
import {
  Command,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/shared/components/shadcn/command";

/**
 * EntityCombobox - qidiruvli (single/multi) tanlash.
 *
 * Server tomonda qidirish uchun `search`/`onSearchChange` controlled beriladi
 * (cmdk ichki filtri o'chiriladi: shouldFilter=false).
 *
 * Props:
 *   options:   [{ id, label, sublabel? }]
 *   value:     string[] (tanlangan id'lar)
 *   onChange:  (string[]) => void
 *   multiple:  bool (default true)
 *   search, onSearchChange: controlled qidiruv
 *   isLoading, placeholder, searchPlaceholder, emptyText, disabled
 *   selectedLabels: { [id]: label } - chip matni uchun (options'da bo'lmasa)
 */
const EntityCombobox = ({
  options = [],
  value = [],
  onChange,
  multiple = true,
  search = "",
  onSearchChange,
  isLoading = false,
  placeholder = "Tanlang",
  searchPlaceholder = "Qidirish...",
  emptyText = "Topilmadi",
  disabled = false,
  selectedLabels = {},
}) => {
  const [open, setOpen] = useState(false);

  const labelOf = (id) =>
    selectedLabels[id] ||
    options.find((o) => o.id === id)?.label ||
    "-";

  const toggle = (id) => {
    if (multiple) {
      const set = new Set(value);
      set.has(id) ? set.delete(id) : set.add(id);
      onChange([...set]);
    } else {
      onChange(value.includes(id) ? [] : [id]);
      setOpen(false);
    }
  };

  const remove = (id) => onChange(value.filter((v) => v !== id));

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            type="button"
            className={cn(
              "flex h-10 w-full items-center justify-between gap-2 rounded-[2px] border border-input bg-white px-3 text-sm outline-2 outline-primary disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <span className="truncate text-muted-foreground">
              {value.length
                ? `${value.length} ta tanlandi`
                : placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            {/* Controlled qidiruv input (cmdk CommandInput o'rniga - server filter) */}
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 shrink-0 opacity-50" />
              <input
                autoFocus
                value={search}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {isLoading && (
                <Loader2 className="size-4 animate-spin opacity-50" />
              )}
            </div>
            <CommandList>
              {!isLoading && options.length === 0 && (
                <CommandEmpty>{emptyText}</CommandEmpty>
              )}
              <CommandGroup>
                {options.map((opt) => {
                  const checked = value.includes(opt.id);
                  return (
                    <CommandItem
                      key={opt.id}
                      value={opt.id}
                      onSelect={() => toggle(opt.id)}
                      className="cursor-pointer"
                    >
                      <Check
                        className={cn(
                          "mr-2 size-4 shrink-0",
                          checked ? "opacity-100 text-primary" : "opacity-0",
                        )}
                      />
                      <span className="flex flex-col">
                        <span className="truncate">{opt.label}</span>
                        {opt.sublabel && (
                          <span className="text-xs text-muted-foreground">
                            {opt.sublabel}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Tanlangan chiplar - bittalab o'chiriladi */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-md border bg-muted/60 py-1 pl-2 pr-1 text-xs"
            >
              <span className="max-w-[180px] truncate">{labelOf(id)}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(id)}
                  className="rounded-sm p-0.5 hover:bg-muted"
                  aria-label="O'chirish"
                >
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default EntityCombobox;
