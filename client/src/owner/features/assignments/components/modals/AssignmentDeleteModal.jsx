// React
import { useEffect } from "react";

// Icons
import { AlertTriangle } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";

// Hooks
import { useDeleteAssignmentMutation } from "../../hooks/useAssignmentMutations";

/**
 * Vazifani o'chirish tasdig'i.
 *
 * Fayl diskdan HAM o'chadi - bu matnda ochiq aytiladi, chunki aynan shu
 * amal kvotani bo'shatadi va uni qaytarib bo'lmaydi.
 */
const AssignmentDeleteModal = ({ id, setIsLoading, close, onDeleted }) => {
  const { mutate: remove, isPending } = useDeleteAssignmentMutation({
    onSuccess: () => {
      close?.();
      onDeleted?.();
    },
  });

  useEffect(() => {
    setIsLoading?.(isPending);
  }, [isPending, setIsLoading]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2.5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          Vazifa arxivlanadi va biriktirilgan fayl diskdan butunlay
          o'chiriladi. Fayl egallagan joy bo'shaydi. Bu amalni qaytarib
          bo'lmaydi.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => close?.()}
        >
          Bekor qilish
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={isPending || !id}
          onClick={() => remove(id)}
        >
          {isPending ? "O'chirilmoqda..." : "O'chirish"}
        </Button>
      </div>
    </div>
  );
};

export default AssignmentDeleteModal;
