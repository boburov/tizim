// React
import { useRef } from "react";

// Utils
import { cn } from "@/shared/utils/cn";

// Components
import Button from "../button/Button";
import {
  Dialog,
  DialogTitle,
  DialogHeader,
  DialogContent,
  DialogDescription,
} from "@/shared/components/shadcn/dialog";

// "Rostdan ham?" oynasi. Ikki qarama-qarshi talabni bir vaqtda bajaradi:
//
// 1) TASODIFAN yaratib yubormaslik. Formada Enter ham "Yuborish" degani -
//    operator hali maydonlarni to'ldirayotganda ham. Oradagi bitta savol
//    shu xatoni bazaga yozilishidan OLDIN ushlab qoladi.
//
// 2) TEZLIKNI olib qo'ymaslik. Oyna ochilishi bilan tasdiqlash tugmasi
//    FOKUSDA turadi, demak Enter > Enter ketma-ketligi ishlayveradi va
//    klaviaturada ishlaydigan operator sichqonchaga qo'l uzatmaydi.
//
// QuickCreateModal singari LOKAL boshqariladi (redux registriga tegmaydi):
// bu oyna boshqa modal ichidan ochiladi, global kalit esa bir sahifadagi
// barcha nusxalarni birdan ochib yuborardi.
const ConfirmDialog = ({
  open = false,
  onOpenChange,
  onConfirm,
  title = "Tasdiqlaysizmi?",
  description = "",
  confirmLabel = "Ha",
  cancelLabel = "Yo'q",
  confirmVariant = "default",
  isLoading = false,
  className = "",
  children,
}) => {
  const confirmRef = useRef(null);

  // Radix o'zicha BIRINCHI tabbable elementni fokuslaydi - bu esa "Yo'q"
  // tugmasi bo'lib qolardi va Enter bekor qilishga aylanardi.
  const handleOpenAutoFocus = (e) => {
    e.preventDefault();
    confirmRef.current?.focus();
  };

  // Enterni BOSIB TURISH bilan tasdiqlanmasin. Formadagi Enter shu oynani
  // ochadi; barmoq ko'tarilmasa klaviatura takrori endigina fokus olgan
  // "Ha" ni bosib yuborardi - ya'ni himoya ishlamay qolardi. Faqat YANGI
  // bosish hisobga olinadi.
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && e.repeat) e.preventDefault();
  };

  const handleConfirm = () => {
    if (isLoading) return;
    onConfirm?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onKeyDown={handleKeyDown}
        onOpenAutoFocus={handleOpenAutoFocus}
        className={cn("w-[calc(100%-1.5rem)] max-w-sm gap-3", className)}
      >
        {/* Header */}
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {/* Body (ixtiyoriy: tasdiqdan oldin ko'rsatiladigan xulosa) */}
        {children}

        {/* Footer */}
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            disabled={isLoading}
            onClick={() => onOpenChange?.(false)}
            className="flex-1"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            ref={confirmRef}
            variant={confirmVariant}
            disabled={isLoading}
            onClick={handleConfirm}
            className="flex-1"
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmDialog;
