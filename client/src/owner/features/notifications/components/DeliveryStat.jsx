import { Users, Send, Eye } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/shared/components/shadcn/tooltip";
import { cn } from "@/shared/utils/cn";

/**
 * DeliveryStat - qabul / bot / o'qilgan raqamlarini bitta ixcham guruhga
 * birlashtiradi. Sarlavhasiz: kichik ikonka + raqam, tooltip izohlaydi.
 * Kontekstsiz 3 ta ustun o'rniga skanlash oson bitta blok.
 */
const Metric = ({ icon: Icon, value, label, tone }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="inline-flex items-center gap-1 tabular-nums">
        <Icon className={cn("size-3.5", tone)} />
        <span className="text-sm font-medium">{value ?? 0}</span>
      </span>
    </TooltipTrigger>
    <TooltipContent>
      {label}: {value ?? 0}
    </TooltipContent>
  </Tooltip>
);

const DeliveryStat = ({
  recipients = 0,
  bot = 0,
  read = 0,
  className = "",
}) => (
  <TooltipProvider delayDuration={150}>
    <div
      className={cn(
        "inline-flex items-center gap-3.5 text-muted-foreground",
        className,
      )}
    >
      <Metric
        icon={Users}
        value={recipients}
        label="Qabul qiluvchilar"
        tone="text-muted-foreground"
      />
      <span className="text-border">·</span>
      <Metric
        icon={Send}
        value={bot}
        label="Bot orqali yetkazildi"
        tone="text-sky-600"
      />
      <span className="text-border">·</span>
      <Metric
        icon={Eye}
        value={read}
        label="O'qilgan"
        tone="text-emerald-600"
      />
    </div>
  </TooltipProvider>
);

export default DeliveryStat;
