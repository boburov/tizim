// Components
import {
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
  Tooltip as TooltipComponent,
} from "../../shadcn/tooltip";

// Radix Tooltip Provider'siz ishlamaydi (hech qanday xato bermay, shunchaki
// ochilmaydi). Ilova darajasida Provider yo'q, shuning uchun har bir
// tooltip o'zinikini olib yuradi - ichma-ich joylashsa ham xavfsiz.
const Tooltip = ({ children, content, delayDuration = 200 }) => {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <TooltipComponent>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>{content}</TooltipContent>
      </TooltipComponent>
    </TooltipProvider>
  );
};

export default Tooltip;
