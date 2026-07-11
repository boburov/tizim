import { AlertCircle, RefreshCw } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import { cn } from "@/shared/utils/cn";

// Query xatosi yuz berganda ko'rsatiladigan umumiy block
const ErrorState = ({
  title = "Ma'lumotni yuklab bo'lmadi",
  message = "Tarmoq xatosi yoki server bilan bog'liq muammo. Iltimos, qaytadan urinib ko'ring.",
  onRetry,
  compact = false,
  className = "",
}) => (
  <div
    className={cn(
      "border rounded-md bg-white",
      compact ? "p-4" : "p-8",
      "flex flex-col items-center justify-center text-center gap-2",
      className,
    )}
    role="alert"
  >
    <AlertCircle
      className={cn(compact ? "size-6" : "size-10", "text-red-500")}
      strokeWidth={1.5}
    />
    <p className="font-medium text-sm">{title}</p>
    {message && <p className="text-xs text-muted-foreground max-w-md">{message}</p>}
    {onRetry && (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="mt-2"
      >
        <RefreshCw className="size-4" />
        Qaytadan urinish
      </Button>
    )}
  </div>
);

export default ErrorState;
