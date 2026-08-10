/**
 * Bot holatlarining nomi va rangi.
 *
 * Tenant holatlaridan alohida (`tenantStatus.js`): to'plam boshqacha —
 * botda DRAFT/SUSPENDED yo'q, o'rniga STOPPED bor.
 */
export const BOT_STATUS_LABEL = {
  DRAFT: 'Yangi',
  PROVISIONING: 'Deploy qilinmoqda',
  ACTIVE: 'Ishlayapti',
  FAILED: 'Xato',
  STOPPED: "To'xtatilgan",
  DEPROVISIONING: "O'chirilmoqda",
  DELETED: "O'chirilgan",
};

export const BOT_STATUS_STYLE = {
  DRAFT: 'bg-muted text-muted-foreground',
  PROVISIONING:
    'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  ACTIVE:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  FAILED: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  STOPPED:
    'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  DEPROVISIONING:
    'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  DELETED: 'bg-muted text-muted-foreground',
};

/** Amal bajarilyapti — bu paytda tugmalar bloklanadi va so'rov tez-tez yangilanadi. */
export const BOT_BUSY_STATUSES = new Set(['PROVISIONING', 'DEPROVISIONING']);

export const RUNTIME_LABEL = { NODEJS: 'Node.js', PHP: 'PHP' };

export const MODE_LABEL = { POLLING: 'polling', WEBHOOK: 'webhook' };
