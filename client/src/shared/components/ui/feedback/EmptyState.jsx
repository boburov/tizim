import { Inbox } from "lucide-react";
import { cn } from "@/shared/utils/cn";

/**
 * EmptyState - ma'lumot yo'qligida ko'rsatiladigan umumiy block.
 * icon, sarlavha, tavsif va ixtiyoriy amal (action) qabul qiladi.
 */
const EmptyState = ({
  icon: Icon = Inbox,
  title = "Ma'lumot topilmadi",
  description = "",
  action = null,
  compact = false,
  className = "",
}) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center rounded-lg border border-dashed bg-white text-center",
      compact ? "gap-1.5 p-6" : "gap-2 p-10",
      className,
    )}
  >
    <div className="flex size-11 items-center justify-center rounded-full bg-muted">
      <Icon className="size-5 text-muted-foreground" strokeWidth={1.75} />
    </div>
    <p className="text-sm font-medium text-foreground">{title}</p>
    {description && (
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
    )}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

export default EmptyState;
