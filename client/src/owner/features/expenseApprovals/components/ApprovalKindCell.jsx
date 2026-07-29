// Constants
import { KIND_LABELS, KIND_META } from "../constants";

/**
 * Jadvalning BOY BIRINCHI USTUNI - rangli tur ikonkasi + nomi + pastida
 * subyekt/kontekst. Ikkinchi qator bo'lmasa ustun bo'sh ko'rinmasligi
 * uchun `contextName` zaxira sifatida ishlatiladi.
 */
const ApprovalKindCell = ({ approval }) => {
  const meta = KIND_META[approval.kind];
  const Icon = meta?.icon;
  const subtitle = approval.subjectName || approval.contextName;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${
          meta?.cls || "bg-zinc-100 text-zinc-500"
        }`}
      >
        {Icon ? <Icon size={17} strokeWidth={2} /> : null}
      </span>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {KIND_LABELS[approval.kind] || approval.kind}
        </p>
        {subtitle && (
          <p className="truncate text-xs text-zinc-500">
            {subtitle}
            {approval.subjectName && approval.contextName
              ? ` · ${approval.contextName}`
              : ""}
          </p>
        )}
      </div>
    </div>
  );
};

export default ApprovalKindCell;
