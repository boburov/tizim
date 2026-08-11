import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Users,
} from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import ImportDropzone from "./ImportDropzone";
import ImportEditableGrid from "./ImportEditableGrid";

// Hooks
import {
  useImportersQuery,
  useImportTemplateMutation,
  useImportDraftMutation,
  useImportValidateRowsMutation,
  useImportCreateMutation,
  useImportJobQuery,
} from "@/shared/hooks/useImport";

// Utils
import { cn } from "@/shared/utils/cn";

const STEP = { UPLOAD: "upload", GRID: "grid", RUNNING: "running", DONE: "done" };

const money = (n) => new Intl.NumberFormat("uz-UZ").format(Math.round(Number(n) || 0));

const StatCard = ({ label, value, tone = "muted", hint }) => {
  const tones = {
    muted: "bg-muted text-foreground",
    good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    bad: "bg-destructive/10 text-destructive",
    warn: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  };
  return (
    <div className={cn("rounded-lg px-3 py-2", tones[tone])}>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs opacity-80">{label}</p>
      {hint && <p className="text-[11px] opacity-70">{hint}</p>}
    </div>
  );
};

const ProgressBar = ({ value }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
    <div
      className="h-full rounded-full bg-primary transition-[width] duration-300"
      style={{ width: `${Math.min(100, value)}%` }}
    />
  </div>
);

/**
 * ODAM IMPORTI - JADVAL USTASI (o'quvchi / o'qituvchi / xodim).
 *
 * Eski ImportModal'dan farqi: bu yerda foydalanuvchi ma'lumotni
 * TAHRIRLAY OLADI. Fayl bir marta yuboriladi, server uni qoralamaga
 * aylantiradi (login/parol/sana avtomatik to'ldiriladi), keyin butun
 * ish tahrirlangan QATORLAR bilan davom etadi.
 *
 * MUHIM: server tahrirlangan qatorlarni yozishdan OLDIN to'liq qayta
 * tekshiradi. Bu yerdagi tekshiruv faqat qulaylik uchun - unga
 * xavfsizlik jihatidan tayanilmaydi.
 */
const ImportGridModal = ({ importerKey, close }) => {
  const { data: importers, isLoading, isError, refetch } = useImportersQuery();

  const [step, setStep] = useState(STEP.UPLOAD);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [jobId, setJobId] = useState(null);
  // Sinxron yo'l natijasi (Redis yo'q, kichik fayl). Navbat yo'lida
  // natija `job` so'rovidan hisoblanadi - qarang pastdagi `result`.
  const [syncResult, setSyncResult] = useState(null);

  // Tekshiruvni kechiktirish (debounce) - har katakdan keyin darhol
  // so'rov yuborilsa server bekorga yuklanardi.
  const validateTimer = useRef(null);
  // Jadval qatorlarining oxirgi nusxasi - tahrirlashda setState
  // updater'iga kirmasdan foydalanish uchun (yon ta'sirsiz).
  const rowsRef = useRef([]);

  const importer = useMemo(
    () => (importers || []).find((i) => i.key === importerKey) || null,
    [importers, importerKey],
  );

  const templateMut = useImportTemplateMutation();

  const draftMut = useImportDraftMutation({
    onProgress: setProgress,
    onSuccess: (data) => {
      rowsRef.current = data.rows || [];
      setRows(data.rows || []);
      setSummary(data.summary);
      setStep(STEP.GRID);
    },
  });

  const validateMut = useImportValidateRowsMutation({
    onSuccess: (data) => {
      rowsRef.current = data.rows || [];
      setRows(data.rows || []);
      setSummary(data.summary);
    },
  });

  const createMut = useImportCreateMutation({
    onSuccess: (data) => {
      if (data.status === "queued") {
        setJobId(data.jobId);
        setStep(STEP.RUNNING);
      } else {
        // Sinxron yo'l (Redis yo'q, kichik fayl) - natija darhol keldi.
        setSyncResult(data);
        setStep(STEP.DONE);
      }
    },
  });

  const { data: job } = useImportJobQuery(jobId);

  // FONDAGI ISH NATIJASI HOLATGA KO'CHIRILMAYDI - hisoblab olinadi.
  //
  // useEffect + setState bilan yozilsa natija ikki joyda (job va result)
  // turardi va ular bir-biridan farq qilib qolishi mumkin edi. Bu yerda
  // yagona haqiqat manbai - so'rov javobi.
  const queuedFinished =
    job && (job.status === "completed" || job.status === "failed");

  const result = syncResult
    ? syncResult
    : queuedFinished
      ? {
          summary: {
            total: job.total,
            imported: job.imported,
            failed: job.failed,
            duplicate: job.duplicate,
          },
          rows: job.results || [],
          error: job.status === "failed" ? job.error || "Import yiqildi" : null,
        }
      : null;

  // Ko'rsatiladigan bosqich ham hisoblanadi: fondagi ish tugagan bo'lsa
  // "natija", aks holda foydalanuvchi turgan bosqich.
  const view = queuedFinished ? STEP.DONE : step;

  // Katak tahrirlanganda: mahalliy holatni yangilab, tekshiruvni
  // kechiktirib yuboramiz.
  //
  // `next` setRows'dan TASHQARIDA hisoblanadi - updater ichida yon
  // ta'sir (mutate) chaqirilsa React uni ikki marta bajarishi mumkin
  // (StrictMode) va serverga ikkita bir xil so'rov ketardi.
  const handleEdit = useCallback(
    (rowNumber, key, value) => {
      const next = rowsRef.current.map((r) =>
        r.rowNumber === rowNumber ? { ...r, raw: { ...r.raw, [key]: value } } : r,
      );
      rowsRef.current = next;
      setRows(next);

      clearTimeout(validateTimer.current);
      validateTimer.current = setTimeout(() => {
        validateMut.mutate({
          importerKey,
          rows: next.map((r) => ({ rowNumber: r.rowNumber, raw: r.raw })),
        });
      }, 600);
    },
    [importerKey, validateMut],
  );

  useEffect(() => () => clearTimeout(validateTimer.current), []);

  const reset = () => {
    setFile(null);
    rowsRef.current = [];
    setRows([]);
    setSummary(null);
    setSyncResult(null);
    setJobId(null);
    setProgress(0);
    setStep(STEP.UPLOAD);
  };

  // Login/parollarni CSV qilib saqlash. Parollar bazada ochiq saqlanadi
  // va profil sahifasidan ham olinadi, lekin 200 ta odamni bittalab
  // ochib chiqish real emas - shuning uchun bitta fayl.
  const downloadCredentials = () => {
    const done = rows.filter((r) => r.status === "imported" || r.status === "ok");
    const head = "Ism,Familiya,Login,Parol,Telefon\n";
    const body = done
      .map((r) =>
        [
          r.raw?.firstName,
          r.raw?.lastName,
          r.raw?.username,
          r.raw?.password,
          r.raw?.phone,
        ]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob(["﻿" + head + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${importerKey}-loginlar.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  // ─────────────── 1-BOSQICH: fayl ───────────────
  if (view === STEP.UPLOAD) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-sm font-medium">1. Shablonni yuklab oling</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Login va parolni bo'sh qoldiring - tizim o'zi yasaydi va keyingi
            bosqichda tahrirlashingiz mumkin.
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

        <div className="rounded-lg border border-sky-500/40 bg-sky-500/5 p-3 text-xs">
          <p className="font-medium text-sky-800 dark:text-sky-200">
            Boshlang'ich summa ishorasi
          </p>
          <p className="mt-1 text-muted-foreground">
            <strong>+300000</strong> — ortiqcha to'langan (avans).{" "}
            <strong>−300000</strong> — kam to'langan (qarz).
          </p>
          <p className="mt-0.5 text-muted-foreground">
            O'quvchida <strong>+</strong> = bizga ortiqcha bergan, avans o'tgan
            oylar qarzini avtomatik yopadi. O'qituvchi/xodimda{" "}
            <strong>+</strong> = biz unga ortiqcha berganmiz (u bizga qarz).
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">2. To'ldirilgan faylni yuklang</p>
          <ImportDropzone file={file} onSelect={setFile} disabled={draftMut.isPending} />
        </div>

        {draftMut.isPending && (
          <div className="space-y-1">
            <ProgressBar value={progress} />
            <p className="text-xs text-muted-foreground">
              {progress < 100 ? `Yuklanmoqda... ${progress}%` : "Tayyorlanmoqda..."}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => close?.()} disabled={draftMut.isPending}>
            Bekor qilish
          </Button>
          <Button
            disabled={!file || draftMut.isPending}
            onClick={() => {
              setProgress(0);
              draftMut.mutate({ importerKey: importer.key, file });
            }}
          >
            {draftMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Davom etish
          </Button>
        </div>
      </div>
    );
  }

  // ─────────────── 2-BOSQICH: tahrirlanadigan jadval ───────────────
  if (view === STEP.GRID) {
    const s = summary || {};
    const ready = s.valid || 0;

    // Boshlang'ich summalar yig'indisi - egasi o'z hisobi bilan
    // solishtirishi uchun. Ikkita raqam alohida: avans va qarz
    // birlashtirilsa ular bir-birini yeb, nazorat ma'nosini yo'qotardi.
    let credit = 0;
    let debt = 0;
    for (const r of rows) {
      const v = Number(String(r.raw?.openingBalance ?? "").replace(/[^\d-]/g, "")) || 0;
      if (v > 0) credit += v;
      else debt += Math.abs(v);
    }

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <StatCard label="Jami qator" value={s.total || 0} />
          <StatCard label="Tayyor" value={ready} tone={ready ? "good" : "muted"} />
          <StatCard label="Xato" value={s.error || 0} tone={s.error ? "bad" : "muted"} />
          <StatCard
            label="Jami avans (+)"
            value={money(credit)}
            tone={credit ? "info" : "muted"}
          />
          <StatCard
            label="Jami qarz (−)"
            value={money(debt)}
            tone={debt ? "warn" : "muted"}
          />
        </div>

        <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            Yuqoridagi ikki summani o'z hisobingiz bilan solishtiring.
            Boshlang'ich qoldiq <strong>bir marta</strong> yoziladi va keyin
            o'zgartirib bo'lmaydi.
          </span>
        </div>

        <ImportEditableGrid
          rows={rows}
          columns={importer.columns}
          onEdit={handleEdit}
          disabled={createMut.isPending}
        />

        <div className="flex flex-wrap items-center justify-end gap-2">
          {validateMut.isPending && (
            <span className="mr-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Tekshirilmoqda...
            </span>
          )}
          <Button variant="ghost" onClick={reset} disabled={createMut.isPending}>
            <ArrowLeft className="size-4" />
            Boshqa fayl
          </Button>
          <Button
            disabled={!ready || createMut.isPending || validateMut.isPending}
            onClick={() =>
              createMut.mutate({
                importerKey: importer.key,
                rows: rows.map((r) => ({ rowNumber: r.rowNumber, raw: r.raw })),
                fileName: file?.name,
              })
            }
          >
            {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            <Users className="size-4" />
            {ready} tasini yaratish
          </Button>
        </div>
      </div>
    );
  }

  // ─────────────── 3-BOSQICH: fonda bajarilmoqda ───────────────
  if (view === STEP.RUNNING) {
    const processed = job?.processed || 0;
    const total = job?.total || rows.length || 1;
    const pct = Math.round((processed / total) * 100);

    return (
      <div className="space-y-4 py-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-lg font-semibold">Yaratilmoqda...</p>
          <p className="text-sm text-muted-foreground">
            {processed} / {total} qator
          </p>
        </div>
        <ProgressBar value={pct} />
        <p className="text-center text-xs text-muted-foreground">
          Bu oyna yopilsa ham ish fonda davom etadi. Har bir o'quvchi uchun
          guruhga qo'shish va o'tgan oylar hisobi quriladi - shuning uchun
          biroz vaqt oladi.
        </p>
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => close?.()}>
            Fonda qoldirish
          </Button>
        </div>
      </div>
    );
  }

  // ─────────────── 4-BOSQICH: natija ───────────────
  const s = result?.summary || {};
  const failedRows = (result?.rows || []).filter(
    (r) => r.status === "failed" || r.status === "error",
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        {result?.error ? (
          <AlertTriangle className="size-10 text-destructive" />
        ) : (
          <CheckCircle2 className="size-10 text-emerald-500" />
        )}
        <p className="text-lg font-semibold">
          {result?.error ? "Import to'xtadi" : "Import yakunlandi"}
        </p>
        {result?.error && (
          <p className="text-sm text-destructive">{result.error}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Jami qator" value={s.total || 0} />
        <StatCard label="Yaratildi" value={s.imported || 0} tone="good" />
        <StatCard
          label="Yozilmadi"
          value={s.failed || 0}
          tone={s.failed ? "bad" : "muted"}
        />
        <StatCard
          label="Takror"
          value={s.duplicate || 0}
          tone={s.duplicate ? "warn" : "muted"}
        />
      </div>

      {failedRows.length > 0 && (
        <>
          <p className="text-sm font-medium">O'tmagan qatorlar</p>
          <ImportEditableGrid rows={failedRows} columns={importer.columns} disabled />
        </>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {(s.imported || 0) > 0 && (
          <Button variant="outline" onClick={downloadCredentials}>
            <Download className="size-4" />
            Login/parollarni yuklab olish
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

export default ImportGridModal;
