// Components
import {
  TooltipContent,
  TooltipTrigger,
  Tooltip as TooltipComponent,
} from "../../shadcn/tooltip";

const Tooltip = ({ children, content }) => {
  return (
    <TooltipComponent>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </TooltipComponent>
  );
};

export default Tooltip;
