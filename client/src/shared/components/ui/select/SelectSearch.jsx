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
import { Check, ChevronDown } from "lucide-react";

const SelectSearch = ({
  value,
  onChange,
  options = [],
  isLoading = false,
  triggerClassName = "",
  searchPlaceholder = "Qidirish...",
  emptyText = "Hech narsa topilmadi",
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
          className="justify-between font-normal px-3 hover:bg-white"
        >
          <span
            className={cn(
              "line-clamp-1",
              selectedOption?.label ? "text-black" : "text-gray-500",
            )}
          >
            {selectedOption?.label || props.placeholder}
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
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SelectSearch;
