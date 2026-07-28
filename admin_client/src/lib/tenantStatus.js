// Tenant statuslari — barcha sahifalar shu yerdan oladi (bitta manba).
export const STATUS_STYLE = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PROVISIONING: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  SUSPENDED: 'bg-slate-200 text-slate-500',
  DEPROVISIONING: 'bg-orange-100 text-orange-700',
  DELETED: 'bg-slate-100 text-slate-400 line-through',
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
  if (percent === null || percent === undefined) return 'bg-slate-300';
  if (percent >= 100) return 'bg-red-500';
  if (percent >= 80) return 'bg-amber-500';
  return 'bg-emerald-500';
};
