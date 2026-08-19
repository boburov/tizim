import { useMemo, useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";

import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/shared/components/shadcn/sheet";
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";
import { MONTH_OPTIONS } from "@/shared/constants/calendar";
import { useCreateBudget, useUpdateBudget } from "../hooks/useBudgetOps";

/**
 * BYUDJET MUHARRIRI.
 *
 * ── UCH DARAJA, VA ULAR QO'SHILMAYDI ──
 *   Jami       — butun davr uchun bitta shift
 *   Kategoriya — aniq kategoriya (Ijara, Marketing...)
 *   Tur        — kategoriya turi (payroll/operating/tax/capital)
 *
 * Ular BIR-BIRINI QAMRAMAYDI: "jami 50 mln, shundan marketing 5 mln"
 * — ikkalasi ham to'g'ri. Shuning uchun panel pastida ko'rsatiladigan
 * yig'indi FAQAT kategoriya qatorlari bo'yicha — jami qatorini unga
 * qo'shish bir xil pulni ikki marta sanardi.
 *
 * ── BYUDJET PUL EMAS ──
 * Bu forma hech qanday jurnal yozuvi yaratmaydi. Sarlavhada shu
 * ochiq aytiladi, chunki "50 mln byudjet kiritdim" degan odam uni
 * kassa bilan chalkashtirishi mumkin.
 */
const SCOPE_OPTIONS = [
  { value: "category", label: "Kategoriya" },
  { value: "kind", label: "Kategoriya turi" },
  { value: "total", label: "Jami (umumiy shift)" },
];

const KIND_OPTIONS = [
  { value: "payroll", label: "Maosh" },
  { value: "operating", label: "Operatsion" },
  { value: "tax", label: "Soliq" },
  { value: "capital", label: "Kapital" },
];

const emptyLine = () => ({
  key: Math.random().toString(36).slice(2),
  scope: "category", categoryId: "", categoryKind: "", amount: "", note: "",
});

const BudgetEditorSheet = ({ open, onOpenChange, budget, filters, categories = [] }) => {
  const isEdit = Boolean(budget?.id);
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const pending = create.isPending || update.isPending;

  const [form, setForm] = useState({ name: "", year: "", month: "", lines: [] });
  const [error, setError] = useState(null);
  // Oldingi `open` HOLATDA saqlanadi: React render paytida ref
  // o'qishni ham, effekt ichida setState ni ham tavsiya qilmaydi.
  // Bu "props o'zgarganda holatni moslash" naqshi — hujjatlarda
  // ochiq qo'llab-quvvatlangan va qo'shimcha render sikli bermaydi.
  const [wasOpen, setWasOpen] = useState(open);

  // Panel ochilganda mavjud byudjetdan yoki joriy filtrdan to'ldiriladi.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setError(null);
      if (isEdit) {
        setForm({
          name: budget.name || "",
          year: String(budget.year),
          month: String(budget.month || ""),
          lines: (budget.lines || []).map((l) => ({
            key: l.id,
            scope: l.scope,
            categoryId: l.categoryId || "",
            categoryKind: l.categoryKind || "",
            amount: String(l.amount ?? ""),
            note: l.note || "",
          })),
        });
      } else {
        const y = filters?.year || String(new Date().getFullYear());
        const m = filters?.month || String(new Date().getMonth() + 1);
        setForm({
          name: `${MONTH_OPTIONS.find((o) => String(o.value) === String(m))?.label || ""} ${y}`.trim(),
          year: String(y), month: String(m), lines: [emptyLine()],
        });
      }
    }
  }

  const setLine = (key, patch) =>
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    }));

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.categoryId || c.id, label: c.name })).filter((o) => o.value),
    [categories],
  );

  // ── VALIDATSIYA ──
  // Server ham tekshiradi (yagona haqiqiy to'siq); bu yerdagisi
  // foydalanuvchini bekorga so'rov yuborishdan saqlaydi.
  const lineError = (l) => {
    if (l.amount === "" || l.amount === null) return "Summa kiritilishi shart";
    const n = Number(l.amount);
    if (!Number.isFinite(n) || n < 0) return "Summa manfiy bo'lmasligi kerak";
    if (!Number.isInteger(n)) return "Butun so'mda kiriting";
    if (l.scope === "category" && !l.categoryId) return "Kategoriya tanlang";
    if (l.scope === "kind" && !l.categoryKind) return "Turni tanlang";
    return null;
  };
  const errors = form.lines.map(lineError);
  const dupTotal = form.lines.filter((l) => l.scope === "total").length > 1;
  const dupCategory = (() => {
    const seen = new Set();
    for (const l of form.lines) {
      if (l.scope !== "category" || !l.categoryId) continue;
      if (seen.has(l.categoryId)) return true;
      seen.add(l.categoryId);
    }
    return false;
  })();
  const invalid =
    !form.year || !form.month || errors.some(Boolean) || dupTotal || dupCategory || !form.lines.length;

  // ── QORALAMA YIG'INDISI (foydalanuvchi KIRITAYOTGAN qiymatlar) ──
  //
  // Bu SERVER O'LCHOVI EMAS: u foydalanuvchining o'z formasida
  // terayotgan raqamlarini qo'shib ko'rsatadi ("shu paytgacha
  // 45 mln kiritdingiz"). Shuning uchun `|| 0` bu yerda TO'G'RI —
  // to'ldirilmagan maydon haqiqatan nol, "o'lchanmagan" emas.
  //
  // `total` va `kind` qatorlari ATAYLAB qo'shilmaydi: ular boshqa
  // daraja va ularni qo'shish bir xil pulni ikki marta sanardi.
  const draftCategorySum = form.lines
    .filter((l) => l.scope === "category")
    .reduce((s, l) => s + (Number(l.amount) || 0), 0); // draft-input

  const submit = () => {
    setError(null);
    const payload = {
      name: form.name,
      lines: form.lines.map((l) => ({
        scope: l.scope,
        categoryId: l.scope === "category" ? l.categoryId : undefined,
        categoryKind: l.scope === "kind" ? l.categoryKind : undefined,
        amount: Number(l.amount),
        note: l.note || undefined,
      })),
    };
    const onDone = { onSuccess: () => onOpenChange(false), onError: (e) => setError(e?.response?.data?.message || "Saqlab bo'lmadi") };
    if (isEdit) update.mutate({ id: budget.id, ...payload }, onDone);
    else create.mutate({ ...payload, periodType: "month", year: Number(form.year), month: Number(form.month), status: "active" }, onDone);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Byudjetni tahrirlash" : "Yangi byudjet"}</SheetTitle>
          <SheetDescription>
            Byudjet — REJA. U kassaga ham, jurnalga ham yozilmaydi.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 px-4 py-2">
          <InputField label="Nomi" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />

          {!isEdit && (
            <div className="grid grid-cols-2 gap-2">
              <SelectField
                label="Oy" value={form.month}
                onChange={(v) => setForm((f) => ({ ...f, month: v }))}
                options={MONTH_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
              />
              <InputField label="Yil" value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} />
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Qatorlar</h3>
              <Button variant="outline" size="sm"
                onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))}>
                <Plus className="mr-1 size-3.5" /> Qator
              </Button>
            </div>

            <div className="space-y-2">
              {form.lines.map((l, i) => (
                <div key={l.key} className="rounded-xl border border-border p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <SelectField label="Daraja" value={l.scope}
                      onChange={(v) => setLine(l.key, { scope: v, categoryId: "", categoryKind: "" })}
                      options={SCOPE_OPTIONS} />
                    {l.scope === "category" && (
                      <SelectField label="Kategoriya" value={l.categoryId}
                        onChange={(v) => setLine(l.key, { categoryId: v })}
                        options={categoryOptions} searchable />
                    )}
                    {l.scope === "kind" && (
                      <SelectField label="Turi" value={l.categoryKind}
                        onChange={(v) => setLine(l.key, { categoryKind: v })}
                        options={KIND_OPTIONS} />
                    )}
                  </div>

                  <div className="mt-2 flex items-end gap-2">
                    <div className="flex-1">
                      <InputField label="Summa" type="money" value={l.amount}
                        onChange={(e) => setLine(l.key, { amount: e.target.value })} placeholder="0" />
                    </div>
                    <Button variant="ghost" size="sm"
                      onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((x) => x.key !== l.key) }))}
                      title="Qatorni o'chirish">
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </div>

                  {errors[i] && <p className="mt-1 text-xs text-destructive">{errors[i]}</p>}
                </div>
              ))}
            </div>

            {dupTotal && <p className="mt-2 text-xs text-destructive">&ldquo;Jami&rdquo; qatori faqat bitta bo'lishi mumkin</p>}
            {dupCategory && <p className="mt-2 text-xs text-destructive">Bir kategoriya ikki marta kiritilgan</p>}

            {draftCategorySum > 0 && (
              <p className="mt-3 rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
                Kategoriya qatorlari yig'indisi:{" "}
                <b className="text-foreground">{formatMoney(draftCategorySum)}</b>
                <br />
                &ldquo;Jami&rdquo; va &ldquo;Tur&rdquo; qatorlari bunga qo'shilmaydi — ular boshqa daraja.
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="mx-4 mb-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        <footer className="sticky bottom-0 flex gap-2 border-t border-border bg-card p-4">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={pending}>
            Bekor qilish
          </Button>
          <Button className="flex-1" onClick={submit} disabled={invalid || pending}>
            {pending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Saqlash
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
};

export default BudgetEditorSheet;
