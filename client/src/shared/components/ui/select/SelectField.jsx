// Icons
import { Plus } from "lucide-react";

// Components
import Select from "./Select";
import {
  Field,
  FieldLabel,
  FieldDescription,
} from "@/shared/components/shadcn/field";
import SelectSearch from "./SelectSearch";
import MultiSelectSearch from "./MultiSelectSearch";
import { cn } from "@/shared/utils/cn";

const SelectComponent = ({ ...props }) => {
  if (props.multiple) return <MultiSelectSearch {...props} />;
  if (props.searchable) return <SelectSearch {...props} />;
  return <Select {...props} />;
};

// `onAddNew` berilsa "yangi qo'shish" IKKI joyda chiqadi:
//
//   1) DROPDOWN ICHIDA, ro'yxatning eng oxirida (`SelectComponent` ga
//      uzatiladi) - asosiy joyi. Kerakli qiymat YO'Qligi aynan ro'yxat
//      ochilganda ma'lum bo'ladi, demak tugma o'sha yerda turishi kerak.
//   2) yorliq qatorining o'ng chetida - ro'yxatni ochmasdan ham ko'rinadi.
//
// Tugmalarning o'zi hech narsa ochmaydi: modalni CreatableSelectField
// boshqaradi.
const SelectField = ({
  id = "",
  name = "",
  label = "",
  className = "",
  description = "",
  selectClassName = "",
  error = false,
  onAddNew,
  addNewLabel = "Yangi",
  ...props
}) => {
  return (
    <Field data-disabled={props.disabled} className={className}>
      {(label || onAddNew) && (
        <div className="flex items-center justify-between gap-2">
          {label ? (
            <FieldLabel
              htmlFor={id || name}
              className={cn(
                "max-w-max",
                error && "text-red-600 dark:text-red-300",
              )}
            >
              {label}
              {props.required && (
                <span
                  className={
                    error ? "text-red-600 dark:text-red-300" : "text-primary"
                  }
                >
                  *
                </span>
              )}
            </FieldLabel>
          ) : (
            <span />
          )}

          {onAddNew && (
            <button
              type="button"
              onClick={onAddNew}
              disabled={props.disabled}
              className="inline-flex shrink-0 items-center gap-1 rounded-sm text-xs font-medium text-primary transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50"
            >
              <Plus className="size-3.5" />
              {addNewLabel}
            </button>
          )}
        </div>
      )}
      <SelectComponent
        name={name}
        id={id || name}
        className={cn(selectClassName, error && "border-red-500")}
        onAddNew={onAddNew}
        addNewLabel={addNewLabel}
        {...props}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
};

export default SelectField;
