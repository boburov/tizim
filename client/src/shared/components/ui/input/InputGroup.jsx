// Utils
import { cn } from "@/shared/utils/cn";

const InputGroup = ({ children, className = "", as = "div", ...props }) => {
  const Component = as;
  return (
    <Component className={cn("grid grid-cols-1 gap-5", className)} {...props}>
      {children}
    </Component>
  );
};

export default InputGroup;
