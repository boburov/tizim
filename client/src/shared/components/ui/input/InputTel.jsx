// Utils
import { cn } from "@/shared/utils/cn";

// React mask
import { IMaskInput } from "react-imask";

// Components
import { inputBaseClasses } from "./Input";

// Adapts IMaskInput's onAccept(value) to a synthetic { target: { name, value } } event
const InputTel = ({ className = "", onChange, name, ...props }) => {
  const handleAccept = (value) => {
    if (!onChange) return;
    onChange({ target: { name, value } });
  };

  return (
    <IMaskInput
      type="tel"
      name={name}
      placeholder="+998 "
      value={props.value}
      onAccept={handleAccept}
      mask="+{998} (00) 000-00-00"
      className={cn(className, inputBaseClasses)}
      {...props}
    />
  );
};

export default InputTel;
