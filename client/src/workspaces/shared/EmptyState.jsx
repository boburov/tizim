import { cn } from "@/shared/utils/cn";

/**
 * BO'SH HOLAT — O'RGATADI, "ma'lumot yo'q" DEMAYDI (talab 23).
 *
 * ── NEGA MUHIM ──
 * Yangi markaz birinchi kuni HAMMA ekranni bo'sh ko'radi. "Ma'lumot
 * yo'q" degan yozuv unga tizim BUZUQ ekanini aytadi. To'g'ri yozuv
 * esa keyingi qadamni aytadi va shu bilan o'quv qo'llanmasi vazifasini
 * bajaradi.
 *
 * Shuning uchun `action` — tavsiya emas, deyarli MAJBURIY: bo'shlikni
 * to'ldirish yo'li ko'rsatilmasa, holat baribir boshi berk ko'cha.
 */
const EmptyState = ({ icon: Icon, title, hint, action, className }) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center",
      className,
    )}
  >
    {Icon && (
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" strokeWidth={1.5} />
      </span>
    )}
    <p className="text-sm font-medium text-foreground">{title}</p>
    {hint && <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

export default EmptyState;
