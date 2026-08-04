// React
import { useEffect } from "react";

// Icons
import { AlertTriangle } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";

// Hooks
import { formatBytes } from "@/shared/hooks/useStorageUsage";
import { useRemoveStoredFileMutation } from "../../hooks/useStorageAdmin";

/** Bitta faylni o'chirish tasdig'i. */
const StoredFileDeleteModal = ({ file, setIsLoading, close }) => {
  const { mutate: remove, isPending } = useRemoveStoredFileMutation({
    onSuccess: () => close?.(),
  });

  useEffect(() => {
    setIsLoading?.(isPending);
  }, [isPending, setIsLoading]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2.5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="truncate font-medium">{file?.originalName}</p>
          <p className="mt-0.5">
            {formatBytes(file?.size)} bo'shaydi. Fayl diskdan butunlay
            o'chiriladi
            {file?.assignment ? " va vazifadan olib tashlanadi" : ""}. Qaytarib
            bo'lmaydi.
          </p>
        </div>
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
          disabled={isPending || !file?._id}
          onClick={() => remove(file._id)}
        >
          {isPending ? "O'chirilmoqda..." : "O'chirish"}
        </Button>
      </div>
    </div>
  );
};

export default StoredFileDeleteModal;
