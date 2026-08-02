import { useMemo, useState } from "react";
import {
  Download,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  FileDown,
  ArrowLeft,
} from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import ImportDropzone from "./ImportDropzone";
import ImportPreviewTable from "./ImportPreviewTable";

// Hooks
import {
  useImportersQuery,
  useImportTemplateMutation,
  useImportPreviewMutation,
  useImportCommitMutation,
  useImportErrorReportMutation,
} from "@/shared/hooks/useImport";

// Utils
import { cn } from "@/shared/utils/cn";

const STEP = { UPLOAD: "upload", PREVIEW: "preview", DONE: "done" };

const StatCard = ({ label, value, tone = "muted" }) => {
  const tones = {
    muted: "bg-muted text-foreground",
    good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    bad: "bg-destructive/10 text-destructive",
    warn: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  };
  return (
    <div className={cn("rounded-lg px-3 py-2", tones[tone])}>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs opacity-80">{label}</p>
    </div>
  );
};

const ProgressBar = ({ value }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
    <div
      className="h-full rounded-full bg-primary transition-[width] duration-200"
      style={{ width: `${value}%` }}
    />
  </div>
);

/**
 * Excel import ustasi (wizard): fayl tanlash -> ko'rib chiqish -> natija.
 *
 * MUHIM: "ko'rib chiqish" va "tasdiqlash" bir XIL faylni serverga ikki
 * marta yuboradi. Server tasdiq bosqichida faylni QAYTA tekshiradi -
 * client yuborgan qatorlarga ishonilmaydi. Shuning uchun bu yerda
 * tekshirilgan qatorlar saqlanmaydi, faqat FAYL saqlanadi.
 *
 * Props (ModalWrapper `data` orqali):
 *   importerKey - "student-payments" | "teacher-salary-payments"
 *   close       - ModalWrapper beradi
 */
const ImportModal = ({ importerKey, close }) => {
  const { data: importers, isLoading, isError, refetch } = useImportersQuery();

  const [step, setStep] = useState(STEP.UPLOAD);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);

  const importer = useMemo(
    () => (importers || []).find((i) => i.key === importerKey) || null,
    [importers, importerKey],
  );

  const templateMut = useImportTemplateMutation();
  const previewMut = useImportPreviewMutation({
    onProgress: setProgress,
    onSuccess: (data) => {
      setPreview(data);
      setStep(STEP.PREVIEW);
    },
  });
  const commitMut = useImportCommitMutation({
    onProgress: setProgress,
    onSuccess: (data) => {
      setResult(data);
      setStep(STEP.DONE);
    },
  });
  const errorReportMut = useImportErrorReportMutation();

  const busy = previewMut.isPending || commitMut.isPending;

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setProgress(0);
    setStep(STEP.UPLOAD);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  if (isError) return <ErrorState onRetry={refetch} />;
  if (!importer) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Bu importni bajarish uchun ruxsatingiz yo'q.
      </p>
    );
  }

  // ── 1-BOSQICH: fayl tanlash ──
  if (step === STEP.UPLOAD) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-sm font-medium">1. Shablonni yuklab oling</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Shablonda ustun sarlavhalari, namuna qator va har bir ustun uchun
            qoidalar yozilgan yo'riqnoma bor.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            disabled={templateMut.isPending}
            onClick={() => templateMut.mutate(importer.key)}
          >
            {templateMut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Shablonni yuklab olish
          </Button>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">2. To'ldirilgan faylni yuklang</p>
          <ImportDropzone file={file} onSelect={setFile} disabled={busy} />
        </div>

        {busy && (
          <div className="space-y-1">
            <ProgressBar value={progress} />
            <p className="text-xs text-muted-foreground">
              {progress < 100 ? `Yuklanmoqda... ${progress}%` : "Tekshirilmoqda..."}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => close?.()} disabled={busy}>
            Bekor qilish
          </Button>
          <Button
            disabled={!file || busy}
            onClick={() => {
              setProgress(0);
              previewMut.mutate({ importerKey: importer.key, file });
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Tekshirish
          </Button>
        </div>
      </div>
    );
  }

  // ── 2-BOSQICH: ko'rib chiqish ──
  if (step === STEP.PREVIEW) {
    const s = preview.summary;
    const canImport = s.valid > 0;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label="Jami qator" value={s.total} />
          <StatCard label="Tayyor" value={s.valid} tone={s.valid ? "good" : "muted"} />
          <StatCard label="Xato" value={s.error} tone={s.error ? "bad" : "muted"} />
          <StatCard label="Takror" value={s.duplicate} tone={s.duplicate ? "warn" : "muted"} />
        </div>

        {preview.unknownHeaders?.length > 0 && (
          <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              Tanilmagan ustun(lar) e'tiborsiz qoldiriladi:{" "}
              <strong>{preview.unknownHeaders.join(", ")}</strong>
            </span>
          </div>
        )}

        {preview.truncated && (
          <p className="text-xs text-muted-foreground">
            Quyida faqat birinchi qatorlar ko'rsatilgan. Statistika butun faylga tegishli.
          </p>
        )}

        <ImportPreviewTable rows={preview.rows} columns={importer.columns} />

        {!canImport && (
          <p className="text-sm text-destructive">
            Import qilinadigan to'g'ri qator yo'q. Xatolarni tuzatib, faylni qayta yuklang.
          </p>
        )}

        {busy && (
          <div className="space-y-1">
            <ProgressBar value={progress} />
            <p className="text-xs text-muted-foreground">Import qilinmoqda...</p>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={reset} disabled={busy}>
            <ArrowLeft className="size-4" />
            Boshqa fayl
          </Button>
          {s.error + s.duplicate > 0 && (
            <Button
              variant="outline"
              disabled={errorReportMut.isPending}
              onClick={() =>
                errorReportMut.mutate({
                  importerKey: importer.key,
                  rows: preview.rows.filter((r) => r.errors?.length),
                })
              }
            >
              <FileDown className="size-4" />
              Xatolarni yuklab olish
            </Button>
          )}
          <Button
            disabled={!canImport || busy}
            onClick={() => {
              setProgress(0);
              commitMut.mutate({ importerKey: importer.key, file });
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {s.valid} ta qatorni import qilish
          </Button>
        </div>
      </div>
    );
  }

  // ── 3-BOSQICH: natija ──
  const s = result.summary;
  const hasFailed = result.failedRows?.length > 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <CheckCircle2 className="size-10 text-emerald-500" />
        <p className="text-lg font-semibold">Import yakunlandi</p>
        <p className="text-sm text-muted-foreground">
          {s.imported} ta yozuv kiritildi
          {s.pending > 0 && `, ${s.pending} tasi tasdiq kutmoqda`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Jami qator" value={s.total} />
        <StatCard label="Kiritildi" value={s.imported} tone="good" />
        <StatCard
          label="Yozilmadi"
          value={s.failed + s.error}
          tone={s.failed + s.error ? "bad" : "muted"}
        />
        <StatCard
          label="Tasdiq kutmoqda"
          value={s.pending}
          tone={s.pending ? "info" : "muted"}
        />
      </div>

      {hasFailed && (
        <>
          <p className="text-sm font-medium">O'tmagan qatorlar</p>
          <ImportPreviewTable rows={result.failedRows} columns={importer.columns} />
        </>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {hasFailed && (
          <Button
            variant="outline"
            disabled={errorReportMut.isPending}
            onClick={() =>
              errorReportMut.mutate({
                importerKey: importer.key,
                rows: result.failedRows,
              })
            }
          >
            <FileDown className="size-4" />
            Xatolarni Excel qilib olish
          </Button>
        )}
        <Button variant="outline" onClick={reset}>
          Yana import qilish
        </Button>
        <Button onClick={() => close?.()}>Yopish</Button>
      </div>
    </div>
  );
};

export default ImportModal;
