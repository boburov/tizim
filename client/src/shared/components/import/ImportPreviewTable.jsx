import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Clock } from "lucide-react";

// Components
import InputField from "@/shared/components/ui/input/InputField";

// Utils
import { cn } from "@/shared/utils/cn";

const STATUS_META = {
  ok: { label: "Tayyor", cls: "text-emerald-600 dark:text-emerald-400", Icon: CheckCircle2 },
  imported: { label: "Kiritildi", cls: "text-emerald-600 dark:text-emerald-400", Icon: CheckCircle2 },
  error: { label: "Xato", cls: "text-destructive", Icon: AlertCircle },
  failed: { label: "Yozilmadi", cls: "text-destructive", Icon: AlertCircle },
  duplicate: { label: "Takror", cls: "text-amber-600 dark:text-amber-400", Icon: Copy },
  pending: { label: "Tasdiq kutmoqda", cls: "text-sky-600 dark:text-sky-400", Icon: Clock },
};

const cellText = (v) => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") return "";
  return String(v);
};

const isBadStatus = (s) => s === "error" || s === "failed" || s === "duplicate";

/**
 * Ko'rib chiqish jadvali: qator raqami, holat, xatolar va asl qiymatlar.
 *
 * Xatoli qatorlar ajratib ko'rsatiladi va xato bo'lgan ustun katagi
 * belgilanadi - foydalanuvchi Excel'da qaysi katakni tuzatishni
 * qidirib o'tirmasin.
 */
const ImportPreviewTable = ({ rows = [], columns = [] }) => {
  const [search, setSearch] = useState("");
  const [onlyErrors, setOnlyErrors] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyErrors && !isBadStatus(r.status)) return false;
      if (!term) return true;
      // Qator raqami bo'yicha ham qidirilsin ("12" -> 12-qator).
      if (String(r.rowNumber).includes(term)) return true;
      const haystack = [
        ...Object.values(r.raw || {}).map(cellText),
        ...(r.errors || []).map((e) => e.message),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [rows, search, onlyErrors]);

  // Xato bo'lgan maydon nomlari - katakni belgilash uchun.
  const errorFieldsOf = (row) =>
    new Set((row.errors || []).map((e) => e.field).filter(Boolean));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <InputField
          name="importSearch"
          type="search"
          placeholder="Qator, ism yoki xato bo'yicha qidirish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyErrors}
            onChange={(e) => setOnlyErrors(e.target.checked)}
          />
          Faqat muammoli qatorlar
        </label>
      </div>

      <div className="max-h-[45vh] overflow-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Qator
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Holat
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                >
                  {c.header}
                </th>
              ))}
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Izoh / xato
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const meta = STATUS_META[row.status] || STATUS_META.ok;
              const badFields = errorFieldsOf(row);
              const bad = isBadStatus(row.status);
              return (
                <tr
                  key={row.rowNumber}
                  className={cn(
                    "border-t",
                    bad && "bg-destructive/5",
                    row.status === "pending" && "bg-sky-500/5",
                  )}
                >
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {row.rowNumber}
                  </td>
                  <td className={cn("whitespace-nowrap px-3 py-2", meta.cls)}>
                    <span className="flex items-center gap-1.5">
                      <meta.Icon className="size-3.5 shrink-0" />
                      <span className="text-xs font-medium">{meta.label}</span>
                    </span>
                  </td>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "max-w-[220px] truncate px-3 py-2",
                        badFields.has(c.header) &&
                          "bg-destructive/15 font-medium text-destructive",
                      )}
                      title={cellText(row.raw?.[c.key])}
                    >
                      {cellText(row.raw?.[c.key])}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-xs">
                    {row.errors?.length ? (
                      <ul className="space-y-0.5 text-destructive">
                        {row.errors.map((e, i) => (
                          <li key={i}>
                            {e.field ? <strong>{e.field}: </strong> : null}
                            {e.message}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted-foreground">{row.message || "-"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 3}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  Mos qator topilmadi
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} / {rows.length} qator ko'rsatilmoqda
      </p>
    </div>
  );
};

export default ImportPreviewTable;
