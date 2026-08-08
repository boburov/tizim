import { useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, TriangleAlert, Search } from "lucide-react";

// Components
import InputField from "@/shared/components/ui/input/InputField";

// Utils
import { cn } from "@/shared/utils/cn";

const STATUS_META = {
  ok: { label: "Tayyor", cls: "text-emerald-600 dark:text-emerald-400", Icon: CheckCircle2 },
  imported: { label: "Yaratildi", cls: "text-emerald-600 dark:text-emerald-400", Icon: CheckCircle2 },
  error: { label: "Xato", cls: "text-destructive", Icon: AlertCircle },
  failed: { label: "Yozilmadi", cls: "text-destructive", Icon: AlertCircle },
  duplicate: { label: "Takror", cls: "text-amber-600 dark:text-amber-400", Icon: Copy },
};

const money = (n) =>
  new Intl.NumberFormat("uz-UZ").format(Math.round(Number(n) || 0));

const cellText = (v) => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") return "";
  return String(v);
};

const isBad = (s) => s === "error" || s === "failed" || s === "duplicate";

/**
 * HISOBLANGAN USTUN - "Yakuniy balans".
 *
 * Bu ustun butun jadvalning MA'NOSI: foydalanuvchi "Yaratish"ni
 * bosishdan oldin har bir o'quvchida NIMA bo'lishini ko'radi.
 * A'zolik sanasi bir oy orqaga surilsa - bu raqam darhol o'zgaradi.
 * Shu ustunsiz `+`/`-` ishorasidagi xatoni faqat yaratgandan KEYIN
 * topish mumkin bo'lardi, u paytda esa tuzatib bo'lmaydi.
 */
const PreviewCell = ({ preview }) => {
  if (!preview) return <span className="text-muted-foreground">—</span>;

  const { months, billed, opening, finalBalance, direction, warning } = preview;

  // O'qituvchi/xodim: oylik hisob yo'q, faqat yo'nalish matni.
  if (direction !== undefined) {
    return (
      <div className="min-w-[220px] space-y-0.5 text-xs">
        {opening ? (
          <p className={cn("font-medium tabular-nums", opening > 0 ? "text-amber-600 dark:text-amber-400" : "text-sky-600 dark:text-sky-400")}>
            {opening > 0 ? "+" : "−"}
            {money(Math.abs(opening))}
          </p>
        ) : (
          <p className="text-muted-foreground">Qoldiq yo'q</p>
        )}
        {direction && <p className="text-muted-foreground">{direction}</p>}
        {warning && (
          <p className="flex items-start gap-1 text-amber-600 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 size-3 shrink-0" />
            {warning}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-[220px] space-y-0.5 text-xs tabular-nums">
      <p className="text-muted-foreground">
        {months} oy × hisob = <strong>{money(billed)}</strong>
      </p>
      {opening !== 0 && (
        <p className="text-muted-foreground">
          Boshlang'ich: {opening > 0 ? "+" : "−"}
          {money(Math.abs(opening))}
        </p>
      )}
      <p
        className={cn(
          "font-semibold",
          finalBalance < 0
            ? "text-destructive"
            : finalBalance > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground",
        )}
      >
        Yakuniy: {finalBalance > 0 ? "+" : finalBalance < 0 ? "−" : ""}
        {money(Math.abs(finalBalance))}
        {finalBalance < 0 ? " (qarz)" : finalBalance > 0 ? " (avans)" : ""}
      </p>
      {preview.note && <p className="text-amber-600 dark:text-amber-400">{preview.note}</p>}
    </div>
  );
};

/**
 * TAHRIRLANADIGAN IMPORT JADVALI.
 *
 * Har katak oddiy `input` - maxsus grid kutubxonasi ATAYLAB
 * ishlatilmadi: 2000 qatorgacha bo'lgan jadval uchun u ortiqcha
 * bog'liqlik, uslub farqi va yangi xatolar manbai bo'lardi.
 *
 * O'zgarish ONBLUR da yuqoriga uzatiladi (onChange da emas): har
 * harfda butun jadval qayta render bo'lib, server tekshiruvi ham
 * chaqirilardi.
 */
const ImportEditableGrid = ({ rows = [], columns = [], onEdit, disabled = false }) => {
  const [search, setSearch] = useState("");
  const [onlyBad, setOnlyBad] = useState(false);
  // Tahrirlanayotgan katakning mahalliy qiymati - blur'gacha shu yerda
  // turadi, shunda yozayotganda kursor sakramaydi.
  const draftRef = useRef({});

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyBad && !isBad(r.status)) return false;
      if (!term) return true;
      if (String(r.rowNumber).includes(term)) return true;
      return Object.values(r.raw || {})
        .map(cellText)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [rows, search, onlyBad]);

  const errorFieldsOf = (row) =>
    new Set((row.errors || []).map((e) => e.field).filter(Boolean));

  const badCount = rows.filter((r) => isBad(r.status)).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <InputField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Qidirish (ism, login, qator raqami)"
            className="pl-8"
          />
        </div>
        {badCount > 0 && (
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={onlyBad}
              onChange={(e) => setOnlyBad(e.target.checked)}
              className="size-4 accent-destructive"
            />
            Faqat muammoli ({badCount})
          </label>
        )}
        <span className="text-xs text-muted-foreground">
          {filtered.length} / {rows.length} qator
        </span>
      </div>

      <div className="max-h-[55vh] overflow-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="w-10 border-b px-2 py-2 text-left text-xs font-medium">#</th>
              <th className="w-28 border-b px-2 py-2 text-left text-xs font-medium">
                Holat
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="border-b px-2 py-2 text-left text-xs font-medium whitespace-nowrap"
                  title={c.note}
                >
                  {c.header}
                  {c.required && <span className="text-destructive"> *</span>}
                </th>
              ))}
              <th className="border-b px-2 py-2 text-left text-xs font-medium">
                Natija (hisoblangan)
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const meta = STATUS_META[row.status] || STATUS_META.ok;
              const badFields = errorFieldsOf(row);
              // Maydonga bog'lanmagan xatolar (umumiy) - alohida qatorda.
              const generalErrors = (row.errors || []).filter((e) => !e.field);

              return (
                <tr
                  key={row.rowNumber}
                  className={cn(
                    "align-top",
                    isBad(row.status) && "bg-destructive/5",
                  )}
                >
                  <td className="border-b px-2 py-1.5 text-xs text-muted-foreground tabular-nums">
                    {row.rowNumber}
                  </td>
                  <td className="border-b px-2 py-1.5">
                    <span className={cn("flex items-center gap-1 text-xs", meta.cls)}>
                      <meta.Icon className="size-3.5 shrink-0" />
                      {meta.label}
                    </span>
                    {generalErrors.map((e, i) => (
                      <p key={i} className="mt-0.5 text-[11px] text-destructive">
                        {e.message}
                      </p>
                    ))}
                    {row.message && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {row.message}
                      </p>
                    )}
                  </td>

                  {columns.map((c) => {
                    const fieldErrors = (row.errors || []).filter(
                      (e) => e.field === c.key,
                    );
                    const key = `${row.rowNumber}:${c.key}`;
                    return (
                      <td key={c.key} className="border-b px-1 py-1">
                        <input
                          type="text"
                          disabled={disabled}
                          defaultValue={cellText(row.raw?.[c.key])}
                          // key - server qiymatni o'zgartirsa (autofill,
                          // login to'qnashuvi) input yangilansin.
                          key={`${key}:${cellText(row.raw?.[c.key])}`}
                          onBlur={(e) => {
                            const next = e.target.value;
                            if (next === cellText(row.raw?.[c.key])) return;
                            delete draftRef.current[key];
                            onEdit?.(row.rowNumber, c.key, next);
                          }}
                          onChange={(e) => {
                            draftRef.current[key] = e.target.value;
                          }}
                          className={cn(
                            "w-full min-w-[110px] rounded border bg-background px-2 py-1 text-xs outline-none",
                            "focus:ring-1 focus:ring-primary",
                            badFields.has(c.key)
                              ? "border-destructive"
                              : "border-transparent hover:border-input",
                            disabled && "opacity-60",
                          )}
                        />
                        {fieldErrors.map((e, i) => (
                          <p key={i} className="px-1 pt-0.5 text-[11px] text-destructive">
                            {e.message}
                          </p>
                        ))}
                      </td>
                    );
                  })}

                  <td className="border-b px-2 py-1.5">
                    <PreviewCell preview={row.preview} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!filtered.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Qator topilmadi
          </p>
        )}
      </div>
    </div>
  );
};

export default ImportEditableGrid;
