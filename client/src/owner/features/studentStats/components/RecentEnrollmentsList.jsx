import { Link } from "react-router-dom";
import Card from "@/shared/components/ui/card/Card";
import { formatDateUz } from "@/shared/utils/formatDate";
import { formatEnrolledDuration } from "@/shared/utils/enrollmentDuration";

// So'nggi ro'yxatga olingan o'quvchilar - har birida o'tgan vaqt ko'rinadi.
const RecentEnrollmentsList = ({ items = [] }) => (
  <Card title="So'nggi qo'shilgan o'quvchilar">
    {items.length === 0 ? (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Ma'lumot yo'q
      </p>
    ) : (
      <ul className="mt-3 divide-y divide-border/60">
        {items.map((s) => {
          const initial = (s.firstName?.[0] || "?").toUpperCase();
          return (
            <li key={s._id}>
              <Link
                to={`/owner/users/${s._id}`}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-muted/50"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold uppercase text-primary">
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground/90">
                    {s.firstName} {s.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateUz(s.enrolledAt)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {formatEnrolledDuration(s.enrolledAt)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    )}
  </Card>
);

export default RecentEnrollmentsList;
