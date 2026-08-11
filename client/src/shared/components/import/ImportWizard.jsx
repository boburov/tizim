import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  useImportOptionsQuery,
  useImportTemplateMutation,
  useImportDraftMutation,
  useImportValidateRowsMutation,
  useImportCreateMutation,
  useImportJobQuery,
} from "@/shared/hooks/useImport";

// Utils
import { cn } from "@/shared/utils/cn";
import { qk } from "@/shared/lib/query/keys";

const STEP = { UPLOAD: "upload", GRID: "grid", RUNNING: "running", DONE: "done" };

const money = (n) => new Intl.NumberFormat("uz-UZ").format(Math.round(Number(n) || 0));

/**
 * Server javobini AVVALGI qatorlar bilan birlashtiradi.
 *
 * NEGA: bitta katak tahrirlansa ham server BARCHA qatorlarni qayta
 * tekshirib qaytaradi (fayl ichidagi login to'qnashuvini topish uchun
 * unga to'liq ro'yxat kerak). Javobni to'g'ridan-to'g'ri holatga yozsak,
 * 300 ta qatorning 300 tasi ham yangi obyekt bo'lib, qator memo'si
 * ishlamay qolardi va butun ro'yxat qayta chizilardi.
 *
 * Bu yerda mazmuni o'zgarmagan qator ESKI havolasini saqlaydi - demak
 * faqat haqiqatan o'zgargan qator qayta chiziladi. Solishtirish O(n)
 * qator bo'yicha, lekin bitta qatorni qayta chizishdan ancha arzon.
 */
const mergeRows = (prev, next) => {
  if (!prev.length) return next;
  const byNumber = new Map(prev.map((r) => [r.rowNumber, r]));
  return next.map((r) => {
    const old = byNumber.get(r.rowNumber);
    return old && JSON.stringify(old) === JSON.stringify(r) ? old : r;
  });
};

// Ixcham ko'rsatkich: qiymat qalin, izoh yonida kichik. Karta emas -
// beshta karta jadvalga qoladigan balandlikni yeb qo'yardi.
const Chip = ({ value, label, tone = "muted" }) => {
  const tones = {
    muted: "bg-card text-foreground",
    good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    bad: "bg-destructive/10 text-destructive",
    warn: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 rounded-lg px-2.5 py-1 text-sm",
        tones[tone],
      )}
    >
      <strong className="font-semibold tabular-nums">{value}</strong>
      <span className="text-xs opacity-70">{label}</span>
    </span>
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
 *
 * ─── NEGA OYNA EMAS, SAHIFA ───
 * Bu usta modal ichida yashardi va o'sha yerda 200 qatorli jadvalga
 * ekranning yarmi ham tegmasdi: modal balandligi cheklangan, atrofi
 * qorong'i, yon tomonda esa bekor turgan joy. Import - bir zumlik
 * tasdiq emas, o'nlab qatorni ko'zdan kechirib, guruh biriktirib,
 * xatolarni tuzatadigan ISH. Shuning uchun u endi to'liq sahifa.
 *
 * `close` - ish tugagach qayerga qaytish (sahifada "ortga", oynada
 * "yopish"). Komponent buni bilmaydi - chaqiruvchi hal qiladi.
 */
const ImportWizard = ({ importerKey, close, creatable = null }) => {
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

  // Tanlov ustunlari uchun variantlar (guruh, filial, rol).
  //
  // `optionsReady` MUHIM: "hali kelmadi" bilan "keldi, lekin bo'sh" ni
  // ajratadi. Ikkalasini bir xil ko'rsak, markazda hali guruh
  // yaratilmagan holatda katak jimgina matn maydoniga aylanardi -
  // foydalanuvchi guruh nomini qo'lda yozib, "guruh topilmadi" xatosini
  // olardi va nega select yo'qligini tushunmasdi.
  const { data: options, isSuccess: optionsReady } =
    useImportOptionsQuery(importerKey);

  // Jadvaldan yangi guruh/rol yaratilganda variantlar ro'yxati eskiradi.
  // Jadval yaratilgan qiymatni o'zi vaqtincha ko'rsatib turadi, bu esa
  // ro'yxatni haqiqiy manbadan yangilaydi.
  const queryClient = useQueryClient();
  const refreshOptions = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.imports.options(importerKey) });
  }, [queryClient, importerKey]);

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
      const merged = mergeRows(rowsRef.current, data.rows || []);
      rowsRef.current = merged;
      setRows(merged);
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

  // KESHNI TOZALASH - import yozib bo'lgach.
  //
  // NEGA KENG: bitta import odam yaratadi, guruhga a'zo qiladi, o'tgan
  // oylar uchun to'lov qatorlarini quradi, depozit va qarzdorlikni
  // o'zgartiradi. Ya'ni ro'yxat, moliya, guruh va statistika - hammasi
  // eskiradi. Ularni bittalab sanab chiqish "qaysidir birini unutish"
  // demak: import kamdan-kam bajariladi, shuning uchun hammasini
  // bekor qilish arzonroq va ishonchliroq.
  //
  // Effekt SONGA bog'lanadi, `result` obyektiga emas: navbat yo'lida
  // `result` har render'da qayta hisoblanadi va obyektga bog'lansa
  // effekt bekorga qayta ishga tushardi. Ref esa ketma-ket ikkinchi
  // marta chaqirilishdan saqlaydi; `reset()` uni qaytaradi.
  const invalidatedRef = useRef(false);
  const importedCount = result?.summary?.imported || 0;
  useEffect(() => {
    if (!importedCount || invalidatedRef.current) return;
    invalidatedRef.current = true;
    queryClient.invalidateQueries();
  }, [importedCount, queryClient]);

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

  // OMMAVIY BELGILASH: tanlangan qatorlarga bitta qiymat (masalan guruh).
  //
  // Bitta-bitta `handleEdit` chaqirilmaydi: har chaqiruv `rowsRef` ustiga
  // yozib, o'z taymerini qo'yardi va 50 ta qator uchun 50 ta tekshiruv
  // so'rovi ketardi. Bu yerda o'zgarish BIR marta qo'llanadi va BITTA
  // tekshiruv yuboriladi.
  const handleBulkEdit = useCallback(
    (rowNumbers, key, value) => {
      const target = new Set(rowNumbers);
      const next = rowsRef.current.map((r) =>
        target.has(r.rowNumber) ? { ...r, raw: { ...r.raw, [key]: value } } : r,
      );
      rowsRef.current = next;
      setRows(next);

      clearTimeout(validateTimer.current);
      validateMut.mutate({
        importerKey,
        rows: next.map((r) => ({ rowNumber: r.rowNumber, raw: r.raw })),
      });
    },
    [importerKey, validateMut],
  );

  useEffect(() => () => clearTimeout(validateTimer.current), []);

  const reset = () => {
    setFile(null);
    invalidatedRef.current = false;
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
  //
  // MANBA IKKITA, va ikkalasi ham kerak:
  //   result.rows - YOZISH natijasi (kim haqiqatan yaratildi);
  //   rows        - client nusxasi (parol shu yerda - server jarayon
  //                 holatida uni qaytarmaydi).
  // Faqat `rows` ga qarab bo'lmaydi: navbat (Redis) yo'lida undagi
  // status yozishdan OLDINGI "ok" bo'lib qoladi, ya'ni yozishda
  // yiqilgan qator ham ro'yxatga tushardi va resepshin mavjud bo'lmagan
  // akkaunt uchun login/parol tarqatardi.
  const downloadCredentials = () => {
    const outcome = new Map(
      (result?.rows || []).map((r) => [r.rowNumber, r.status]),
    );
    const done = rows.filter((r) => {
      const status = outcome.get(r.rowNumber) ?? r.status;
      return status === "imported";
    });
    if (!done.length) return;

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
      <div className="min-w-0 max-w-2xl space-y-4">
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
      <div className="flex min-w-0 flex-col gap-3">
        {/* Ilgari bu yerda 5 ta katta karta va uch qatorli ogohlantirish
            bor edi - ular jadvalga qoladigan balandlikni yeb qo'yardi.
            Endi bitta ixcham qator: son + qoldiq yig'indisi. Avans va
            qarz ATAYLAB alohida - qo'shib yuborilsa bir-birini yeb,
            nazorat ma'nosini yo'qotardi. */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2.5">
          <Chip value={s.total || 0} label="qator" />
          <Chip value={ready} label="tayyor" tone={ready ? "good" : "muted"} />
          {(s.error || 0) > 0 && <Chip value={s.error} label="xato" tone="bad" />}
          {credit > 0 && (
            <Chip value={`+${money(credit)}`} label="avans" tone="info" />
          )}
          {debt > 0 && <Chip value={`−${money(debt)}`} label="qarz" tone="warn" />}
          <span
            className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground"
            title="Boshlang'ich qoldiq bir marta yoziladi va keyin o'zgartirib bo'lmaydi. Summalarni o'z hisobingiz bilan solishtiring."
          >
            <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
            <span className="hidden sm:inline">Qoldiq bir marta yoziladi</span>
          </span>
        </div>

        <ImportEditableGrid
          rows={rows}
          columns={importer.columns}
          options={options}
          optionsReady={optionsReady}
          creatable={creatable}
          onOptionCreated={refreshOptions}
          onEdit={handleEdit}
          onBulkEdit={handleBulkEdit}
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
      <div className="mx-auto min-w-0 max-w-xl space-y-4 py-6">
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
    <div className="min-w-0 space-y-4">
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

      <div className="flex flex-wrap justify-center gap-2 rounded-xl border bg-muted/40 px-3 py-2.5">
        <Chip value={s.total || 0} label="jami qator" />
        <Chip value={s.imported || 0} label="yaratildi" tone="good" />
        <Chip
          value={s.failed || 0}
          label="yozilmadi"
          tone={s.failed ? "bad" : "muted"}
        />
        <Chip
          value={s.duplicate || 0}
          label="takror"
          tone={s.duplicate ? "warn" : "muted"}
        />
      </div>

      {failedRows.length > 0 && (
        <>
          <p className="text-sm font-medium">O'tmagan qatorlar</p>
          <ImportEditableGrid
            rows={failedRows}
            columns={importer.columns}
            options={options}
            optionsReady={optionsReady}
            disabled
          />
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

export default ImportWizard;
