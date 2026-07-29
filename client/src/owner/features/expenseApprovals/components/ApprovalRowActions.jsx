// Icons
import { MoreVertical, Check, X, RotateCw, Eye, Ban } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/shared/components/shadcn/dropdown-menu";

// Hooks
import useApprovalPermissions from "../hooks/useApprovalPermissions";

/**
 * Qator amallari (⋮).
 *
 * Huquq mantig'i bu yerda TAKRORLANMAYDI - `useApprovalPermissions`
 * yagona manba. Qaror qabul qilib bo'lmasa sababi menyuda ko'rinadi,
 * ya'ni foydalanuvchi "nega tugma yo'q" deb qolmaydi.
 */
const ApprovalRowActions = ({
  approval,
  onDetail,
  onApprove,
  onReject,
  onCancel,
  onRetry,
  disabled = false,
}) => {
  const { resolve } = useApprovalPermissions();
  const { canDecide, canCancel, canRetry, reason } = resolve(approval);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Amallar"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical size={16} strokeWidth={1.5} />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="min-w-[13rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem onSelect={() => onDetail?.(approval)}>
          <Eye className="size-4" />
          Batafsil
        </DropdownMenuItem>

        {(canDecide || canCancel || canRetry) && <DropdownMenuSeparator />}

        {canDecide && (
          <>
            <DropdownMenuItem
              disabled={disabled}
              onSelect={() => onApprove?.(approval)}
            >
              <Check className="size-4 text-emerald-600" />
              Tasdiqlash
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={disabled}
              className="text-red-600 focus:text-red-700"
              onSelect={() => onReject?.(approval)}
            >
              <X className="size-4" />
              Rad etish
            </DropdownMenuItem>
          </>
        )}

        {canCancel && (
          <DropdownMenuItem
            disabled={disabled}
            onSelect={() => onCancel?.(approval)}
          >
            <Ban className="size-4" />
            So'rovni bekor qilish
          </DropdownMenuItem>
        )}

        {canRetry && (
          <DropdownMenuItem
            disabled={disabled}
            onSelect={() => onRetry?.(approval)}
          >
            <RotateCw className="size-4" />
            Qayta urinish
          </DropdownMenuItem>
        )}

        {reason && (
          <p className="px-2 py-1.5 text-xs text-amber-600">{reason}</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ApprovalRowActions;
