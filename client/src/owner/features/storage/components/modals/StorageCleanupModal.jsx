// React
import { useEffect } from "react";

// Icons
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";

// Hooks
import { formatBytes } from "@/shared/hooks/useStorageUsage";
import {
  useCleanupMutation,
  useCleanupPreviewMutation,
} from "../../hooks/useStorageAdmin";

/**
 * TOZALASHNI TASDIQLASH.
 *
 * Oyna ochilgan zahoti "nima o'chadi" so'raladi va aniq raqam
 * ko'rsatiladi. Raqamsiz tasdiqlash shunchaki bir qo'shimcha bosish
 * bo'lardi - admin nima yo'qotayotganini bilmasdi.
 *
 * `all` rejimi (to'liq tozalash) alohida qizil ogohlantirish oladi:
 * u vazifalardagi BARCHA biriktirmalarni o'chiradi va qaytarib
 * bo'lmaydi.
 */
const StorageCleanupModal = ({ all = false, olderThanDays, setIsLoading, close }) => {
  const days = Number(olderThanDays);
  // Nishon aniq bo'lmasa (muddat ham, `all` ham yo'q) - so'rov yubormaymiz.
  // Server bunday tanani 400 bilan rad etadi, foydalanuvchi esa o'zi
  // qilmagan amal uchun xato ko'radi.
  const hasTarget = all || Number.isFinite(days);
  const payload = all ? { all: true } : { olderThanDays: days };

  const {
    mutate: preview,
    data: stats,
    isPending: counting,
  } = useCleanupPreviewMutation();

  const { mutate: run, isPending } = useCleanupMutation({
    onSuccess: () => close?.(),
  });

  // Oyna ochilganda darhol hisoblaymiz.
  useEffect(() => {
    if (!hasTarget) return;
    preview(payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, olderThanDays]);

  useEffect(() => {
    setIsLoading?.(isPending);
  }, [isPending, setIsLoading]);

  const nothingToDo = stats && stats.files === 0;

  return (
    <div className="space-y-4">
      <div
        className={
          all
            ? "flex gap-2.5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
            : "flex gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
        }
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          {all ? (
            <>
              Markazdagi <b>BARCHA</b> biriktirilgan fayllar diskdan butunlay
              o'chiriladi. Vazifalarning matni qoladi, lekin fayllarni qaytarib
              bo'lmaydi.
            </>
          ) : (
            <>
              <b>{olderThanDays}</b> kundan eski fayllar diskdan butunlay
              o'chiriladi. Vazifalarning matni qoladi, fayllarni qaytarib
              bo'lmaydi.
            </>
          )}
        </p>
      </div>

      {/* Aniq raqam - tasdiqlashni ma'noli qiladigan yagona narsa */}
      <div className="rounded-md border bg-muted/50 p-3 text-sm">
        {counting || !stats ? (
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Hisoblanmoqda...
          </span>
        ) : nothingToDo ? (
          <span className="text-muted-foreground">
            Bu shart bo'yicha o'chiriladigan fayl topilmadi.
          </span>
        ) : (
          <span>
            <b>{stats.files}</b> ta fayl o'chiriladi -{" "}
            <b>{formatBytes(stats.bytes)}</b> joy bo'shaydi.
          </span>
        )}
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
          disabled={isPending || counting || nothingToDo || !hasTarget}
          onClick={() => run(payload)}
        >
          <Trash2 className="size-4" />
          {isPending ? "Tozalanmoqda..." : "Tozalash"}
        </Button>
      </div>
    </div>
  );
};

export default StorageCleanupModal;
