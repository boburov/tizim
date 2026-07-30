// Router
import { Link } from "react-router-dom";

// Icons
import { ArrowUpRight } from "lucide-react";

const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

// Reference: "Team Collaboration" - bu yerda eng band o'qituvchilar (o'quvchilar soni bo'yicha).
const TopTeachersList = ({ items = [] }) => (
  <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-5">
    <div className="flex items-center justify-between">
      <h2 className="font-semibold text-foreground">Faol o'qituvchilar</h2>
      <Link
        to="/owner/teachers"
        className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
      >
        Barchasi <ArrowUpRight className="size-3" />
      </Link>
    </div>

    {items.length === 0 ? (
      <p className="mt-6 text-sm text-muted-foreground">Ma'lumot yo'q</p>
    ) : (
      <ul className="mt-4 space-y-3">
        {items.map((t) => (
          <li key={t.id} className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {initials(t.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{t.name}</p>
              <p className="text-xs text-muted-foreground">{t.groupsCount} ta guruh</p>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">
              {t.studentsCount} o'quvchi
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export default TopTeachersList;
