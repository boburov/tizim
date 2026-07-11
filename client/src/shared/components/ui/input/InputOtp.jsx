// Components
import {
  InputOTPSlot,
  InputOTPGroup,
  InputOTP as InputOTPComponent,
} from "../../shadcn/input-otp";

// Utils
import { cn } from "@/shared/utils/cn";

// Digigits RegExp
import { REGEXP_ONLY_DIGITS } from "input-otp";

const InputOtp = ({ className = "", maxLength = 5, ...props }) => {
  return (
    <InputOTPComponent
      maxLength={maxLength}
      className={cn(className)}
      pattern={REGEXP_ONLY_DIGITS}
      {...props}
    >
      <InputOTPGroup>
        {Array.from({ length: maxLength }).map((_, i) => (
          <InputOTPSlot key={i} index={i} />
        ))}
      </InputOTPGroup>
    </InputOTPComponent>
  );
};

export default InputOtp;
