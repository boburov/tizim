import { useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet, X } from "lucide-react";

// Utils
import { cn } from "@/shared/utils/cn";

const ACCEPT = ".xlsx,.csv";
const MAX_MB = 10;

const isAllowed = (file) => /\.(xlsx|csv)$/i.test(file?.name || "");

const prettySize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * Fayl tanlash: sudrab tashlash (drag & drop) yoki bosib tanlash.
 *
 * Tekshiruv shu yerda ham bor (kengaytma + hajm), lekin bu FAQAT qulaylik
 * uchun - haqiqiy to'siq serverda (uploadSheet middleware). Client
 * tekshiruvi foydalanuvchiga tez javob beradi, xavfsizlik vazifasini
 * bajarmaydi.
 */
const ImportDropzone = ({ file, onSelect, disabled = false }) => {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const accept = (picked) => {
    setError("");
    if (!picked) return;
    if (!isAllowed(picked)) {
      setError("Faqat .xlsx yoki .csv fayl yuklash mumkin");
      return;
    }
    if (picked.size > MAX_MB * 1024 * 1024) {
      setError(`Fayl juda katta (${MAX_MB} MB dan oshmasin)`);
      return;
    }
    onSelect(picked);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    accept(e.dataTransfer.files?.[0]);
  };

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
        <FileSpreadsheet className="size-8 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">{prettySize(file.size)}</p>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Faylni olib tashlash"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border bg-muted/30",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <UploadCloud className="size-9 text-muted-foreground" />
        <p className="text-sm font-medium">
          Faylni shu yerga tashlang yoki <span className="text-primary">tanlang</span>
        </p>
        <p className="text-xs text-muted-foreground">
          .xlsx yoki .csv &middot; {MAX_MB} MB gacha
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            accept(e.target.files?.[0]);
            // Bir xil faylni ketma-ket tanlash ham onChange bersin.
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
};

export default ImportDropzone;
