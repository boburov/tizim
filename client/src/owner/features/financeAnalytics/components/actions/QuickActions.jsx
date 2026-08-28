import { useState } from "react";
import { Plus, ArrowLeftRight, Undo2, PiggyBank, Receipt } from "lucide-react";
import { useNavigate } from "react-router-dom";

import Button from "@/shared/components/ui/button/Button";
import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import TransferSheet from "./TransferSheet";
import OwnerCapitalSheet from "./OwnerCapitalSheet";
import RefundSheet from "./RefundSheet";
import { ExpenseFormSheet } from "@/owner/features/expenses";

/**
 * TEZ AMALLAR.
 *
 * ── RUXSAT: KO'RINISH, XAVFSIZLIK EMAS ──
 * Tugma yashirilishi faqat QULAYLIK uchun — foydalanuvchi bajara
 * olmaydigan amalni ko'rib turmasin. Haqiqiy to'siq SERVERDA
 * (`requirePermission`), va u chetlab o'tilmaydi.
 *
 * ── NEGA HAMMASI PANEL (sheet) ──
 * Chiqim yozish uchun boshqa sahifaga o'tib, keyin qaytib kelish
 * kontekstni yo'qotadi: foydalanuvchi qaysi davr va filialga qarab
 * turgani esdan chiqadi. Panel esa ekranni tark etmaydi.
 *
 * ── CHIQIM PANELDA OCHILADI, SAHIFAGA O'TMAYDI ──
 * Ilgari bu tugma `/owner/finance/expenses` ga olib borardi va u
 * yerda yana "Yangi chiqim" bosish kerak edi — ikki bosish va
 * yo'qolgan kontekst. Endi AYNAN o'sha panel (`ExpenseFormSheet`)
 * shu yerda ochiladi: nusxa yo'q, ya'ni tasdiq zanjiri, chek
 * biriktirish va filial tanlash ham o'zi bilan keladi.
 *
 * TO'LOV esa hamon sahifaga olib boradi: u o'quvchini, guruhni va
 * davrni tanlashni talab qiladi — bu ro'yxat ekranining ishi.
 */
const QuickActions = ({ className }) => {
  const { has } = usePermissions();
  const navigate = useNavigate();
  const [open, setOpen] = useState(null);

  const canExpense = has(PERMISSIONS.FINANCE_CREATE_EXPENSE);
  const canPay = has(PERMISSIONS.FINANCE_READ);
  const canRefund = has(PERMISSIONS.FINANCE_MANAGE_REFUNDS);
  const canTransfer = has(PERMISSIONS.FINANCE_MANAGE_TRANSFERS);
  const canOwner = has(PERMISSIONS.FINANCE_MANAGE_OWNER_CAPITAL);

  const actions = [
    canExpense && { key: "expense", icon: Receipt, label: "Chiqim", onClick: () => setOpen("expense") },
    canPay && { key: "payment", icon: Plus, label: "To'lov", onClick: () => navigate("/owner/finance/deposits") },
    canRefund && { key: "refund", icon: Undo2, label: "Qaytarim", onClick: () => setOpen("refund") },
    canTransfer && { key: "transfer", icon: ArrowLeftRight, label: "O'tkazma", onClick: () => setOpen("transfer") },
    canOwner && { key: "owner", icon: PiggyBank, label: "Egasining puli", onClick: () => setOpen("owner") },
  ].filter(Boolean);

  if (!actions.length) return null;

  return (
    <>
      <div className={className}>
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a.key} variant="outline" size="sm" onClick={a.onClick}>
              <a.icon className="mr-1.5 size-4" />
              {a.label}
            </Button>
          ))}
        </div>
      </div>

      <TransferSheet open={open === "transfer"} onOpenChange={(v) => setOpen(v ? "transfer" : null)} />
      <OwnerCapitalSheet open={open === "owner"} onOpenChange={(v) => setOpen(v ? "owner" : null)} />
      <RefundSheet open={open === "refund"} onOpenChange={(v) => setOpen(v ? "refund" : null)} />
      <ExpenseFormSheet open={open === "expense"} onOpenChange={(v) => setOpen(v ? "expense" : null)} />
    </>
  );
};

export default QuickActions;
