import { Link } from "react-router-dom";
import { Users, ChevronRight } from "lucide-react";
import Card from "@/shared/components/ui/card/Card";
import { cn } from "@/shared/utils/cn";
import GroupScheduleLines from "./GroupScheduleLines";

const UserTaughtGroupsList = ({ groups = [], ownerLinks = false }) => {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <Users className="size-4 text-muted-foreground" />
          Biriktirilgan guruhlar
        </h3>
        {groups.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {groups.length} ta
          </span>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Biriktirilgan guruhlar yo'q
        </p>
      ) : (
        <div className="space-y-2.5">
          {groups.map((g) => {
            // ownerLinks bo'lsa - butun karta guruh detaliga o'tadi
            const body = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-semibold text-foreground">
                      {g.name}
                    </span>
                    {ownerLinks && (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    )}
                  </span>
                  <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {g.studentsCount || 0} o'quvchi
                  </span>
                </div>

                <div className="mt-2.5">
                  <GroupScheduleLines schedule={g.schedule} />
                </div>
              </>
            );

            const cardClass =
              "block rounded-md border p-3.5 transition-colors";

            return ownerLinks ? (
              <Link
                key={g._id}
                to={`/owner/groups/${g._id}`}
                className={cn(
                  cardClass,
                  "group hover:border-primary/40 hover:bg-muted/40",
                )}
              >
                {body}
              </Link>
            ) : (
              <div key={g._id} className={cn(cardClass, "hover:bg-muted/30")}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default UserTaughtGroupsList;
