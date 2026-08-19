import { cn } from "@/shared/utils/cn";

/**
 * ISH MAKONI SAHIFASINING QOBIG'I.
 *
 * Bitta sarlavha shakli — to'rt makonda ham. Talab 25 "vizual
 * minimalizm" ni so'raydi: bir xil narsa har sahifada boshqacha
 * ko'rinsa, foydalanuvchi har safar qaytadan o'rganadi.
 *
 * `subtitle` — ATAYLAB majburiy emas, lekin tavsiya etiladi: u
 * sahifa NIMA UCHUN kerakligini bir jumlada aytadi va yangi
 * foydalanuvchi uchun eng arzon o'quv materiali.
 */
export const PageHeader = ({ title, subtitle, actions, className }) => (
  <header className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
    <div className="min-w-0">
      <h1 className="truncate text-2xl font-semibold text-foreground">{title}</h1>
      {subtitle && (
        <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

const WorkspacePage = ({ title, subtitle, actions, children, className }) => (
  <div className={cn("space-y-5", className)}>
    <PageHeader title={title} subtitle={subtitle} actions={actions} />
    {children}
  </div>
);

export default WorkspacePage;
