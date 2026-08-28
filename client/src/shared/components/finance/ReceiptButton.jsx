import { useState } from "react";
import { Printer, Loader2 } from "lucide-react";

import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { useEntryDetailByKey } from "@/owner/features/financeAnalytics/hooks/useFinanceAnalytics";
import { cn } from "@/shared/utils/cn";
import TransactionReceipt from "./TransactionReceipt";

/**
 * ══════════════════════════════════════════════════════════════════════
 * CHEK TUGMASI — pul harakat qilgan HAR QANDAY joyga qo'yiladigan bo'lak
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── MUAMMO ──
 * `TransactionReceipt` tayyor jurnal yozuvini talab qiladi
 * (`GET /finance-analytics/entries/:id`). Lekin to'lov qabul qilingan
 * joyda o'sha yozuvning ID si YO'Q: u `postCore()` ichida tug'iladi va
 * mijozga qaytarilmaydi. Shu sabab chek faqat moliya ro'yxatidan
 * ochilardi — ya'ni kassir to'lovni olib, chekni BOSHQA sahifadan
 * qidirishi kerak edi.
 *
 * ── YECHIM ──
 * Kalit mijoz tomonda TUZILADI: `payment:<paymentTransactionId>`.
 * Manba hujjat ID si esa har doim qo'lda bor. Shu tufayli chek
 * tugmasini qo'shish = bitta qator.
 *
 * ── FAQAT BOSILGANDA SO'RALADI ──
 * `enabled` faqat oyna ochilganda yonadi. Aks holda 30 qatorli
 * to'lovlar tarixi 30 ta so'rov yuborardi.
 *
 * ── RUXSATSIZ UMUMAN CHIZILMAYDI ──
 * Endpoint `finance.read` talab qiladi. Tugma ko'rinib turib 403
 * berish — foydalanuvchini aldash; shuning uchun `null` qaytariladi.
 *
 * ── YOZUV YO'Q BO'LSA ──
 * Filialsiz hujjat jurnalga umuman tushmaydi (`postCore` uni
 * "branchsiz" deb o'tkazib yuboradi), ya'ni 404 KUTILGAN holat.
 * Bunda tugma o'chirilgan holatga o'tadi — chunki "chek yo'q" degani
 * xato emas, hujjat holati.
 */
const ReceiptButton = ({
  postingKey,
  label = "Chek",
  iconOnly = false,
  className,
}) => {
  const { has } = usePermissions();
  const [open, setOpen] = useState(false);

  // ⚠ Hook shartsiz chaqiriladi (React qoidasi); so'rovni `postingKey`
  // va `open` cheklaydi, erta `return` emas.
  const { data, isFetching, isError } = useEntryDetailByKey(
    open && postingKey ? postingKey : null,
  );

  if (!postingKey || !has(PERMISSIONS.FINANCE_READ)) return null;

  const missing = isError;
  const Icon = isFetching ? Loader2 : Printer;

  return (
    <>
      <button
        type="button"
        disabled={missing}
        onClick={() => setOpen(true)}
        aria-label={missing ? "Chek mavjud emas" : label}
        title={missing ? "Bu hujjat uchun jurnal yozuvi yo'q" : label}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-md text-xs font-medium",
          "text-muted-foreground hover:text-foreground",
          "disabled:pointer-events-none disabled:opacity-40",
          iconOnly ? "size-8 justify-center" : "h-8 px-2",
          className,
        )}
      >
        <Icon className={cn("size-4", isFetching && "animate-spin")} />
        {!iconOnly && <span>{label}</span>}
      </button>

      {/* Yozuv kelmaguncha oyna chizilmaydi: `TransactionReceipt`
          `entry` bo'lmasa `null` qaytaradi, ya'ni bo'sh chek
          KO'RSATILMAYDI. */}
      <TransactionReceipt
        entry={data}
        open={open && Boolean(data)}
        onOpenChange={setOpen}
      />
    </>
  );
};

export default ReceiptButton;
