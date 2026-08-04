import { useMyAssignmentsUnreadCountQuery } from "../hooks/useMyAssignmentsQuery";

/**
 * O'qilmagan vazifalar nishoni (sidebar).
 *
 * Vazifa IKKI kanal orqali keladi: bot va platforma. Botni bloklagan
 * o'quvchi uchun platforma YAGONA kanal, shuning uchun menyuda raqam
 * turishi kerak - aks holda u vazifa borligini umuman bilmasdi.
 *
 * Nol bo'lganda hech narsa chizilmaydi: bo'sh nishon menyuda doimiy
 * shovqin bo'lardi.
 */
const StudentAssignmentsBadge = () => {
  const { data: count = 0 } = useMyAssignmentsUnreadCountQuery();
  if (!count) return null;

  return (
    <span className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
};

export default StudentAssignmentsBadge;
