import { useMemo, useState } from "react";
import { Download, ListChecks, Loader2 } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";

// Hooks
import { useExportDatasetsQuery, useExportMutation } from "@/shared/hooks/useExport";

/**
 * Excel eksport modali - ustunlarni tanlash oynasi.
 *
 * Ustunlar SERVERDAN (`/exports/datasets`) keladi. Bu ataylab: ro'yxat
 * client'da takrorlansa, serverga ustun qo'shilganda bu yerda unutilib
 * ketardi. Qo'shimcha foyda - ruxsati yetmagan ustun (masalan telefon)
 * javobga umuman tushmaydi, ya'ni bu yerda alohida tekshiruv shart emas.
 *
 * Props (ModalWrapper `data` orqali uzatadi):
 *   datasetKey - qaysi hisobot ("student-payments", "teachers")
 *   filters    - sahifadagi joriy filtrlar (ekranda ko'ringan narsa yuklansin)
 *   close      - ModalWrapper beradi
 */
const ExportModal = ({ datasetKey, filters = {}, close }) => {
  const { data, isLoading, isError, refetch } = useExportDatasetsQuery();

  const dataset = useMemo(
    () => (data || []).find((d) => d.key === datasetKey) || null,
    [data, datasetKey],
  );

  const defaultKeys = useMemo(
    () => (dataset?.columns || []).filter((c) => c.default).map((c) => c.key),
    [dataset],
  );

  // null = foydalanuvchi hali tanlovga tegmagan -> standart ustunlar.
  //
  // NEGA useEffect EMAS: ustunlar so'rov tugagach keladi, ya'ni birinchi
  // renderda dataset hali null. Effekt ichida setState qilish ortiqcha
  // qayta render beradi (va lint qoidasi buni bloklaydi). Render paytida
  // hisoblash bir xil natijani effektsiz beradi.
  const [picked, setPicked] = useState(null);
  const selected = picked ?? defaultKeys;

  const mutation = useExportMutation({ onSuccess: () => close?.() });

  const toggle = (key) =>
    setPicked(
      selected.includes(key)
        ? selected.filter((k) => k !== key)
        : [...selected, key],
    );

  const allKeys = dataset?.columns.map((c) => c.key) || [];
  const allSelected = allKeys.length > 0 && selected.length === allKeys.length;

  const toggleAll = () => setPicked(allSelected ? [] : allKeys);

  const handleDownload = () => {
    // Ustunlarni REYESTR tartibida yuboramiz - foydalanuvchi qaysi
    // tartibda bosganiga qarab Excel ustunlari sakrab ketmasin.
    const ordered = allKeys.filter((k) => selected.includes(k));
    mutation.mutate({ datasetKey, columns: ordered, filters });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (isError) return <ErrorState onRetry={refetch} />;

  if (!dataset) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Bu hisobotni yuklab olish uchun ruxsatingiz yo'q.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {selected.length} / {allKeys.length} ustun tanlandi
        </p>
        <Button variant="ghost" size="sm" onClick={toggleAll}>
          <ListChecks className="size-4" />
          {allSelected ? "Tozalash" : "Hammasi"}
        </Button>
      </div>

      <div className="max-h-[45vh] space-y-1 overflow-y-auto rounded-lg border bg-card p-2">
        {dataset.columns.map((col) => (
          <label
            key={col.key}
            className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
          >
            <input
              type="checkbox"
              checked={selected.includes(col.key)}
              onChange={() => toggle(col.key)}
            />
            <span className="flex-1">{col.header}</span>
          </label>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Jadvaldagi joriy filtrlar saqlanadi - ekranda ko'rinayotgan ma'lumot
        yuklab olinadi.
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => close?.()} disabled={mutation.isPending}>
          Bekor qilish
        </Button>
        <Button
          onClick={handleDownload}
          disabled={selected.length === 0 || mutation.isPending}
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Yuklab olish
        </Button>
      </div>
    </div>
  );
};

export default ExportModal;
