import { cn } from "@/shared/utils/cn";

// Serverdagi AUDIT_ACTIONS bilan mos. Kalitlar - inglizcha (kod qiymati),
// ko'rsatiladigan matn - o'zbekcha.
const ACTION_LABELS = {
  CREATE: "YARATILDI",
  UPDATE: "TAHRIRLANDI",
  DELETE: "O'CHIRILDI",
  LOGIN: "KIRDI",
  LOGOUT: "CHIQDI",
  SYSTEM: "TIZIM",
};

const ACTION_CLASS = {
  CREATE: "text-emerald-700 dark:text-emerald-300",
  UPDATE: "text-blue-700 dark:text-blue-300",
  DELETE: "text-rose-700 dark:text-rose-300",
  LOGIN: "text-violet-700 dark:text-violet-300",
  LOGOUT: "text-muted-foreground",
  SYSTEM: "text-muted-foreground",
};

const ActionBadge = ({ action, failed = false }) => {
  // Muvaffaqiyatsiz so'rovda amal emas, xato ta'kidlanadi
  if (failed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tracking-wide text-rose-600 dark:text-rose-300">
        <span className="size-1.5 rounded-full bg-rose-500" />
        {ACTION_LABELS[action] || action}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "text-[13px] font-semibold tracking-wide",
        ACTION_CLASS[action] || ACTION_CLASS.SYSTEM,
      )}
    >
      {ACTION_LABELS[action] || action}
    </span>
  );
};

export default ActionBadge;
