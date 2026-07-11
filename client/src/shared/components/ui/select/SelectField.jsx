// Components
import Select from "./Select";
import {
  Field,
  FieldLabel,
  FieldDescription,
} from "@/shared/components/shadcn/field";
import SelectSearch from "./SelectSearch";
import { cn } from "@/shared/utils/cn";

const SelectComponent = ({ ...props }) => {
  if (props.searchable) return <SelectSearch {...props} />;
  return <Select {...props} />;
};

const SelectField = ({
  id = "",
  name = "",
  label = "",
  className = "",
  description = "",
  selectClassName = "",
  error = false,
  ...props
}) => {
  return (
    <Field data-disabled={props.disabled} className={className}>
      {label && (
        <FieldLabel
          htmlFor={id || name}
          className={cn("max-w-max", error && "text-red-600")}
        >
          {label}
          {props.required && (
            <span className={error ? "text-red-600" : "text-primary"}>*</span>
          )}
        </FieldLabel>
      )}
      <SelectComponent
        name={name}
        id={id || name}
        className={cn(selectClassName, error && "border-red-500")}
        {...props}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
};

export default SelectField;
