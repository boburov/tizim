// Tenant statuslari — barcha sahifalar shu yerdan oladi (bitta manba).
export const STATUS_STYLE = {
  DRAFT: 'bg-muted text-muted-foreground',
  PROVISIONING: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  ACTIVE: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  FAILED: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300',
  SUSPENDED: 'bg-accent text-muted-foreground',
  DEPROVISIONING: 'bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300',
  DELETED: 'bg-muted text-muted-foreground line-through',
};

export const STATUS_LABEL = {
  DRAFT: 'Qoralama',
  PROVISIONING: 'Yaratilmoqda…',
  ACTIVE: 'Faol',
  FAILED: 'Xato',
  SUSPENDED: "To'xtatilgan",
  DEPROVISIONING: "O'chirilmoqda…",
  DELETED: "O'chirilgan",
};

/** Jarayon ketayotgan statuslar — UI ularni avtomatik yangilab turadi. */
export const BUSY_STATUSES = ['PROVISIONING', 'DEPROVISIONING'];

export const formatLimit = (v) => (v === -1 ? 'cheksiz' : v);

/** Limit foiziga qarab rang. */
export const usageColor = (percent) => {
  if (percent === null || percent === undefined) return 'bg-muted-foreground/30';
  if (percent >= 100) return 'bg-red-500';
  if (percent >= 80) return 'bg-amber-500';
  return 'bg-emerald-500';
};
