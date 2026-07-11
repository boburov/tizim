import { Link } from "react-router-dom";
import Card from "@/shared/components/ui/card/Card";

const TopAbsentList = ({ items = [] }) => (
  <Card>
    <h3 className="font-semibold mb-3">Eng ko'p kelmaganlar</h3>
    {items.length === 0 ? (
      <p className="text-sm text-muted-foreground">Ma'lumot yo'q</p>
    ) : (
      <ol className="space-y-0.5">
        {items.map((s, i) => (
          <li
            key={s.student._id}
            className="flex items-center justify-between gap-3 text-sm rounded-md px-1.5 py-1 -mx-1.5 hover:bg-muted/50 transition-colors"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-muted-foreground tabular-nums w-5 text-right">
                {i + 1}.
              </span>
              <Link
                to={`/owner/users/${s.student._id}`}
                className="font-medium hover:underline truncate"
              >
                {s.student.firstName} {s.student.lastName}
              </Link>
            </span>
            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-700">
              {s.absent} ta
            </span>
          </li>
        ))}
      </ol>
    )}
  </Card>
);

export default TopAbsentList;
