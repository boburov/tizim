// Components
import Input from "./Input";
import InputPwd from "./InputPwd";
import InputOtp from "./InputOtp";
import InputTel from "./InputTel";
import InputMoney from "./InputMoney";
import InputSearch from "./InputSearch";
import {
  Field,
  FieldLabel,
  FieldDescription,
} from "@/shared/components/shadcn/field";
import { cn } from "@/shared/utils/cn";

const InputComponent = ({ ...props }) => {
  if (props.type === "password") return <InputPwd {...props} />;
  if (props.type === "otp") return <InputOtp {...props} />;
  if (props.type === "tel") return <InputTel {...props} />;
  if (props.type === "money") return <InputMoney {...props} />;
  if (props.type === "search") return <InputSearch {...props} />;
  return <Input {...props} />;
};

const InputField = ({
  id = "",
  name = "",
  label = "",
  className = "",
  description = "",
  inputClassName = "",
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
      <InputComponent
        name={name}
        id={id || name}
        className={cn(inputClassName, error && "border-red-500 outline-red-500")}
        {...props}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
};

export default InputField;
