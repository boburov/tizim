import { useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/shared/components/shadcn/sheet";
import Button from "@/shared/components/ui/button/Button";
import { cn } from "@/shared/utils/cn";
import useActiveBranch from "@/shared/hooks/useActiveBranch";
import { ALL_BRANCHES } from "@/shared/lib/branch/activeBranch";
import { newIdemKey } from "./opsFormUtils";

/**
 * MOLIYAVIY AMAL PANELI — barcha tez amallar uchun umumiy qobiq.
 *
 * Nima beradi:
 *   • forma OCHILGANDA idempotentlik kaliti yaratadi (qarang opsFormUtils)
 *   • qaytarilmas amallar uchun TASDIQ bosqichi
 *   • yuborish holati va xato ko'rsatish
 *
 * ── NEGA TASDIQ BOSQICHI ──
 * Qaytarim, o'tkazma va egasining puli — kassadan pul harakatlantiradi
 * va ularni "bekor qilish" tugmasi YO'Q (to'g'rilash faqat yangi
 * korreksiya yozuvi bilan). Shuning uchun oxirgi qadam summani ochiq
 * takrorlaydi: foydalanuvchi nol sonini yanglishtirmaganini ko'radi.
 */
const FinanceActionSheet = ({
  open, onOpenChange, title, description,
  children, onSubmit, submitLabel = "Saqlash",
  confirm = null, // { text } — berilsa tasdiq bosqichi qo'shiladi
  disabled = false,
  isPending = false,
  error = null,
}) => {
  const [idemKey, setIdemKey] = useState(newIdemKey);
  const [confirming, setConfirming] = useState(false);

  // ══════════════════════════════════════════════════════════════════
  // «BARCHA FILIALLAR» REJIMIDA YOZIB BO'LMAYDI
  //
  // Server buni ochiq rad etadi (`resolveBranchForWrite`): pul QAYSI
  // filial kassasidan chiqishi noaniq bo'lsa, yozuv yozib bo'lmaydi.
  // Bu TO'G'RI qoida.
  //
  // Lekin UI buni AYTMASDI: foydalanuvchi butun formani to'ldirib,
  // tasdiqlab, faqat oxirida 400 olardi. Brauzer QA aynan shuni
  // ko'rsatdi — o'tkazma yuborildi va jimgina yiqildi.
  //
  // Endi ogohlantirish BOSHIDA turadi va tugma o'chiriladi.
  // ══════════════════════════════════════════════════════════════════
  const { branchId } = useActiveBranch();
  const noBranch = !branchId || branchId === ALL_BRANCHES;
  // Oldingi `open` qiymati HOLATDA saqlanadi (ref emas): React
  // render paytida ref o'qishni ham taqiqlaydi.
  const [wasOpen, setWasOpen] = useState(open);

  // Panel har OCHILGANDA yangi kalit: ikki alohida amal bir-birini
  // to'smasligi kerak.
  //
  // ── NEGA `useEffect` EMAS ──
  // Effekt ichida `setState` kaskadli qayta render beradi va React
  // buni ochiq tavsiya qilmaydi (`react-hooks/set-state-in-effect`).
  // Bu yerda holat PROPS DAN KELIB CHIQADI ("panel ochildimi?"),
  // ya'ni React hujjatlaridagi "adjusting state when props change"
  // holati — React uni render paytida qo'llab-quvvatlaydi va
  // qo'shimcha render sikliga olib kelmaydi.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setIdemKey(newIdemKey());
      setConfirming(false);
    }
  }

  const handle = () => {
    if (confirm && !confirming) { setConfirming(true); return; }
    onSubmit(idemKey);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        <div className="flex-1 space-y-4 px-4 py-2">
          {noBranch && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span className="text-foreground">
                Hozir <b>«Barcha filiallar»</b> rejimi tanlangan. Moliyaviy amal
                aniq filialga yoziladi — yuqoridagi tanlagichdan filialni tanlang.
              </span>
            </div>
          )}
          {children}
        </div>

        {error && (
          <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {confirming && confirm && (
          <div className="mx-4 mb-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
            <p className="font-medium text-foreground">Tasdiqlaysizmi?</p>
            <p className="mt-1 text-muted-foreground">{confirm.text}</p>
            <p className="mt-1 text-muted-foreground">
              Bu amalni bekor qilib bo'lmaydi — faqat yangi korreksiya yozuvi bilan tuzatiladi.
            </p>
          </div>
        )}

        <footer className="sticky bottom-0 flex gap-2 border-t border-border bg-card p-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => (confirming ? setConfirming(false) : onOpenChange(false))}
            disabled={isPending}
          >
            {confirming ? "Orqaga" : "Bekor qilish"}
          </Button>
          <Button
            className={cn("flex-1", confirming && "bg-warning text-warning-foreground hover:bg-warning/90")}
            onClick={handle}
            disabled={disabled || isPending || noBranch}
          >
            {isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {confirming ? "Ha, tasdiqlayman" : submitLabel}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
};

export default FinanceActionSheet;
