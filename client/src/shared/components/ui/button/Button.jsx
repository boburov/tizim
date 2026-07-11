// Components
import { Button as ButtonComponent } from "@/shared/components/shadcn/button";

const Button = ({ children, ...props }) => {
  return <ButtonComponent {...props}>{children}</ButtonComponent>;
};

export default Button;
