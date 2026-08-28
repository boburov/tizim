import { useRef, useState } from "react";
import { AlertTriangle, FileUp, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/shared/components/shadcn/sheet";
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import useActiveBranch from "@/shared/hooks/useActiveBranch";
import useObjectState from "@/shared/hooks/useObjectState";
import { formatMoney } from "@/shared/utils/formatMoney";
import { METHOD_OPTIONS, today } from "@/owner/features/financeAnalytics/components/actions/opsFormUtils";

import {
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useExpenseCategoriesQuery,
  useUploadReceiptMutation,
} from "../hooks/useExpenses";

/**
 * ══════════════════════════════════════════════════════════════════════
 * CHIQIM YOZISH VA TAHRIRLASH — BIR EKRAN
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA PANEL, ALOHIDA SAHIFA EMAS ──
 * Chiqim kunda o'nlab marta yoziladi va deyarli har doim BOSHQA ish
 * ustida turib: kassir qoldiqqa qarab turib "bugungi kanselyariya"ni
 * kiritadi. Sahifaga o'tish kontekstni yo'qotadi va qaytishni talab
 * qiladi. Panel esa ekranni tark etmaydi.
 *
 * ── NEGA YARATISH VA TAHRIRLASH BITTA KOMPONENT ──
 * Maydonlar to'plami AYNAN bir xil va tekshiruvlar ham (summa musbat,
 * kategoriya majburiy, «Barcha filiallar» rejimida filial shart).
 * Ikki nusxa bo'lsa ular MUQARRAR ajralib ketardi: yaratishga
 * qo'shilgan yangi maydon tahrirlashda tushib qolardi va foydalanuvchi
 * uni faqat qayta yozish orqali to'ldira olardi.
 *
 * ── FILIAL MAYDONI SHARTLI ──
 * U faqat filial ROSTDAN HAM bir nechta bo'lganda ko'rinadi. Bitta
 * filialli markazda server filialni o'zi qo'yadi
 * (`resolveBranchForWrite`), tanlagich esa bitta variantli bo'sh
 * savol bo'lardi.
 *
 * «Barcha filiallar» rejimida server yozishni ATAYLAB rad etadi —
 * "pul qaysi kassadan chiqdi?" degan savol javobsiz qolmasligi kerak.
 * Shuning uchun bu rejimda maydon MAJBURIY bo'ladi va tugma to'g'ri
 * filial tanlangunicha o'chirilgan turadi (foydalanuvchi butun formani
 * to'ldirib, faqat oxirida 400 olmasin).
 *
 * ── MARKAZ UMUMIY CHIQIMI (`branchId: null`) ENDI TAKLIF QILINADI ──
 * Ilgari bu variant ro'yxatdan ATAYLAB olib tashlangandi: tasdiq
 * navbati (`Approval.branchId`) NOT NULL bo'lgani uchun umumiy chiqim
 * har doim 500 bilan tugardi. Server tuzatildi — so'rov endi ASOSIY
 * filialga yoziladi, chiqimning o'zi esa filialsiz qoladi. Ijara va
 * brend reklamasi kabi markaz xarajatlari uchun yagona to'g'ri variant
 * shu: ularni bitta filialga yozib qo'yish o'sha filial foydasini
 * yolg'on pasaytirardi.
 */

/** «Markaz umumiy» — bo'sh satrdan FARQ QILADIGAN aniq belgi. */
const ORG_WIDE = "__org__";

const ExpenseFormSheet = ({ open, onOpenChange, expense = null }) => {
  const isEdit = Boolean(expense);
  const { branches, isAllBranches, hasMultipleBranches } = useActiveBranch();
  const categories = useExpenseCategoriesQuery({ enabled: open });
  const fileRef = useRef(null);

  // ── BOSHLANG'ICH QIYMATLAR PROP'DAN, EFFEKT BILAN EMAS ──
  //
  // Ilgari bu yerda `useEffect` turib, panel ochilganda formani
  // hujjatdan to'ldirardi. Uch muammosi bor edi: birinchi kadr BO'SH
  // forma bilan chizilardi (keyin sakrab to'lardi), effekt ichidagi
  // `setState` kaskadli render tug'dirardi (eslint ham shuni
  // to'sadi), va "tahrirlanmagan maydonni tozalash" mantig'i qo'lda
  // yozilishi kerak edi.
  //
  // Buning o'rniga chaqiruvchi komponentga `key` qo'yiladi
  // (`ExpensesPage`): hujjat almashganda komponent QAYTA YARATILADI
  // va holat tabiiy ravishda yangi hujjatdan boshlanadi. Bu React'ning
  // "identity o'zgarsa — holat ham o'zgarsin" qoidasi.
  const form = useObjectState({
    amount: expense ? String(expense.amount ?? "") : "",
    category: expense
      ? String(expense.categoryId || expense.category?._id || expense.category?.id || "")
      : "",
    method: expense?.method || "cash",
    spentAt: String(expense?.spentAt || "").slice(0, 10) || today(),
    title: expense?.title || "",
    description: expense?.description || "",
    vendor: expense?.vendor || "",
    // UCH HOLAT: `null` — markaz umumiy chiqimi, bo'sh satr — "joriy
    // filial", ID — aniq filial. Ular BOSHQA-BOSHQA narsa, shuning
    // uchun umumiy chiqim aniq belgi bilan ajratiladi.
    branchId: expense ? (expense.branchId ? String(expense.branchId) : ORG_WIDE) : "",
    receiptId: expense?.receiptId ? String(expense.receiptId) : "",
    receiptName: expense?.receipt?.originalName || "",
  });
  const [error, setError] = useState(null);

  const afterWrite = () => {
    onOpenChange(false);
    form.resetState();
    setError(null);
  };

  const createMutation = useCreateExpenseMutation({
    onSuccess: ({ pendingApproval, data }) => {
      afterWrite();
      if (pendingApproval) {
        // 202 — HUJJAT YOZILMADI. Buni "qo'shildi" deb ko'rsatish
        // foydalanuvchini chalg'itardi: u qoldiqqa qarab, o'zgarmaganini
        // ko'rib, qayta kiritishga urinardi.
        toast.warning("Tasdiqqa yuborildi", {
          description:
            "Summa filial limitidan oshdi — chiqim owner tasdiqlagandan keyin yoziladi.",
        });
        return;
      }
      toast.success("Chiqim yozildi", {
        // Server qaytargan hujjat summasi — forma qiymati EMAS.
        // Ikkalasi bir xil bo'lishi kerak, lekin ekranda TASDIQLANGAN
        // raqam turishi shart.
        description: data?.amount
          ? `${formatMoney(data.amount)} · kassa qoldig'i va pul oqimi yangilandi`
          : "Kassa qoldig'i va pul oqimi yangilandi",
      });
    },
    onError: (err) =>
      setError(err?.response?.data?.message || "Chiqimni yozib bo'lmadi"),
  });

  const updateMutation = useUpdateExpenseMutation({
    onSuccess: (data) => {
      afterWrite();
      toast.success("Chiqim yangilandi", {
        description: data?.amount
          ? `${formatMoney(data.amount)} · jurnal qayta yozildi`
          : "Jurnal qayta yozildi",
      });
    },
    onError: (err) =>
      setError(err?.response?.data?.message || "Chiqimni saqlab bo'lmadi"),
  });

  const uploadMutation = useUploadReceiptMutation({
    onSuccess: (data) => {
      form.setFields({
        receiptId: String(data?.id || ""),
        receiptName: data?.originalName || "",
      });
    },
  });

  const mutation = isEdit ? updateMutation : createMutation;

  // Yozilishi mumkin bo'lgan filiallar. «Barcha filiallar» rejimida
  // tanlov MAJBURIY (yuqoridagi izohga qarang).
  const needsBranch = hasMultipleBranches && isAllBranches && !isEdit;

  // TASDIQDAN o'tgan chiqimning summasi QULFLANADI — server ham aynan
  // shuni rad etadi (400). Maydonni ochiq qoldirish foydalanuvchini
  // butun formani to'ldirib, oxirida xato olishga majburlardi.
  const amountLocked = isEdit && Boolean(expense?.expenseApprovalId);

  const amount = Number(form.amount);
  const invalid =
    !form.category ||
    !form.title.trim() ||
    !Number.isFinite(amount) ||
    amount < 1 ||
    (needsBranch && !form.branchId) ||
    uploadMutation.isPending;

  const submit = () => {
    setError(null);
    const body = {
      category: form.category,
      method: form.method,
      spentAt: form.spentAt,
      title: form.title.trim(),
      description: form.description.trim(),
      vendor: form.vendor.trim(),
      // `null` chekni UZADI, `undefined` esa tegmaydi — server ikkala
      // holatni ham shunday o'qiydi.
      receipt: form.receiptId || null,
      ...(amountLocked ? {} : { amount }),
    };

    // FILIAL UCH HOLAT, IKKITA EMAS:
    //   ORG_WIDE  → `null`      "markaz umumiy"
    //   ID        → o'sha ID    aniq filial
    //   bo'sh     → yuborilmaydi "joriy filial" (server hal qiladi)
    if (form.branchId === ORG_WIDE) body.branchId = null;
    else if (form.branchId) body.branchId = form.branchId;

    if (isEdit) mutation.mutate({ id: expense.id || expense._id, ...body });
    else mutation.mutate(body);
  };

  const pickReceipt = (e) => {
    const file = e.target.files?.[0];
    // Bir xil faylni qayta tanlash ham hodisa tug'dirsin.
    e.target.value = "";
    if (file) uploadMutation.mutate(file);
  };

  const categoryOptions = (categories.data || []).map((c) => ({
    value: c._id || c.id,
    label: c.name,
  }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Chiqimni tahrirlash" : "Yangi chiqim"}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-4 px-4 py-2">
          <InputField
            label="Summa"
            type="money"
            required
            autoFocus
            disabled={amountLocked}
            value={form.amount}
            onChange={(e) => form.setField("amount", e.target.value)}
            placeholder="0"
          />
          {amountLocked && (
            <p className="-mt-2 text-xs text-muted-foreground">
              Tasdiqdan o'tgan chiqim summasini o'zgartirib bo'lmaydi. Bekor
              qilib qaytadan kiriting.
            </p>
          )}

          <SelectField
            label="Kategoriya"
            required
            searchable
            value={form.category}
            onChange={(v) => form.setField("category", v)}
            options={categoryOptions}
            placeholder={categories.isLoading ? "Yuklanmoqda..." : "Tanlang"}
          />

          <SelectField
            label="Hisob"
            value={form.method}
            onChange={(v) => form.setField("method", v)}
            options={METHOD_OPTIONS}
          />

          <InputField
            label="Sana"
            type="date"
            value={form.spentAt}
            onChange={(e) => form.setField("spentAt", e.target.value)}
          />

          <InputField
            label="Tavsif"
            required
            maxLength={200}
            value={form.title}
            onChange={(e) => form.setField("title", e.target.value)}
            placeholder="Masalan: kanselyariya"
          />

          <InputField
            label="Izoh"
            maxLength={1000}
            value={form.description}
            onChange={(e) => form.setField("description", e.target.value)}
            placeholder="Ixtiyoriy"
          />

          <InputField
            label="Yetkazib beruvchi"
            maxLength={200}
            value={form.vendor}
            onChange={(e) => form.setField("vendor", e.target.value)}
            placeholder="Ixtiyoriy"
          />

          {hasMultipleBranches && (
            <SelectField
              label="Filial"
              required={needsBranch}
              value={form.branchId}
              onChange={(v) => form.setField("branchId", v)}
              options={[
                ...(needsBranch ? [] : [{ value: "", label: "Joriy filial" }]),
                ...branches.map((b) => ({ value: b._id || b.id, label: b.name })),
                { value: ORG_WIDE, label: "Markaz umumiy (filialsiz)" },
              ]}
              placeholder="Filialni tanlang"
            />
          )}

          {form.branchId === ORG_WIDE && (
            <p className="rounded-lg border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
              Markaz umumiy chiqimi hech qaysi filial kassasidan chiqmaydi va
              tasdiqdan o'tadi. Ijara, brend reklamasi kabi xarajatlar uchun.
            </p>
          )}

          {/* ── CHEK ──
              Fayl chiqim SAQLANISHIDAN OLDIN yuklanadi va faqat ID si
              tanaga qo'shiladi: chiqim tasdiqqa tushsa hujjat hali
              yo'q, ya'ni faylni unga bog'lab bo'lmasdi. */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Chek</p>
            {form.receiptId ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {form.receiptName || "Biriktirilgan fayl"}
                </span>
                <button
                  type="button"
                  onClick={() => form.setFields({ receiptId: "", receiptName: "" })}
                  className="text-muted-foreground transition hover:text-destructive"
                  aria-label="Chekni olib tashlash"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => fileRef.current?.click()}
                disabled={uploadMutation.isPending}
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <FileUp className="mr-1.5 size-4" />
                )}
                Chek biriktirish
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
              onChange={pickReceipt}
            />
          </div>

          {needsBranch && !form.branchId && (
            <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-2.5 text-xs">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span className="text-foreground">
                «Barcha filiallar» rejimi tanlangan. Chiqim aniq filial
                kassasidan chiqadi — filialni tanlang.
              </span>
            </p>
          )}
        </div>

        {error && (
          <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <footer className="sticky bottom-0 flex gap-2 border-t border-border bg-card p-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Bekor qilish
          </Button>
          <Button className="flex-1" onClick={submit} disabled={invalid || mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Saqlash
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
};

export default ExpenseFormSheet;
