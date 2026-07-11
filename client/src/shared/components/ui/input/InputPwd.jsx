// Components
import Input from "./Input";

// React
import { useState } from "react";

// Utils
import { cn } from "@/shared/utils/cn";

// Icons
import { Eye, EyeOff } from "lucide-react";

const InputPwd = ({
  name = "password",
  placeholder = "Kamida 6ta belgi",
  disabled = false,
  ...props
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const toggleVisibility = () => setIsVisible(!isVisible);

  return (
    <div className={cn("flex items-center relative")}>
      <Input
        name={name}
        className="pr-10"
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="current-password"
        {...props}
        type={isVisible ? "text" : "password"}
      />

      <button
        type="button"
        disabled={disabled}
        onClick={toggleVisibility}
        title={isVisible ? "Parolni yashirish" : "Parolni ko'rsatish"}
        aria-label={isVisible ? "Parolni yashirish" : "Parolni ko'rsatish"}
        className="flex items-center justify-center absolute inset-y-1 right-1 size-8 rounded-sm text-gray-500 transition-colors disabled:opacity-50 outline-primary"
      >
        {isVisible ? (
          <EyeOff size={20} strokeWidth={1.5} />
        ) : (
          <Eye size={20} strokeWidth={1.5} />
        )}
      </button>
    </div>
  );
};

export default InputPwd;
