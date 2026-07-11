// Components
import {
  FieldLabel,
  FieldContent,
  Field as FieldComponent,
} from "@/shared/components/shadcn/field";

const Field = ({ className = "", label = "", ...props }) => {
  return (
    <FieldComponent className={className} {...props}>
      {label && (
        <FieldLabel htmlFor={props.htmlFor || props.id}>{label}</FieldLabel>
      )}
      <FieldContent>{props.children}</FieldContent>
    </FieldComponent>
  );
};

export { FieldLabel, FieldContent };

export default Field;
