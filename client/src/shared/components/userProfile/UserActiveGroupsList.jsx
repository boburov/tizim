import { Link } from "react-router-dom";
import { CalendarDays, Users, Plus } from "lucide-react";
import Card from "@/shared/components/ui/card/Card";
import Button from "@/shared/components/ui/button/Button";
import { formatDateUz } from "@/shared/utils/formatDate";
import GroupScheduleLines from "./GroupScheduleLines";

// Guruhga qo'shish onAddToGroup berilganda ko'rsatiladi (owner). Ko'chirish/chiqarish
// va o'qish davrlari guruh detail sahifasi orqali boshqariladi.
const UserActiveGroupsList = ({
  activeGroups = [],
  ownerLinks = false,
  onAddToGroup,
}) => {
  return (
    <Card>
      <div className="mb-4 space-y-3">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <Users className="size-4 shrink-0 text-muted-foreground" />
          <span>Hozirgi guruhlar</span>
          {activeGroups.length > 0 && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {activeGroups.length} ta
            </span>
          )}
        </h3>
        {onAddToGroup && activeGroups.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddToGroup}
            className="w-full"
          >
            <Plus className="size-4" />
            Guruhga qo'shish
          </Button>
        )}
      </div>

      {activeGroups.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Hech qaysi guruhga biriktirilmagan
          </p>
          {onAddToGroup && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddToGroup}
              className="w-full"
            >
              <Plus className="size-4" />
              Guruhga qo'shish
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {activeGroups.map((m) => {
            const g = m.group;
            return (
              <div
                key={m.membershipId || g._id}
                className="rounded-md border p-3.5 transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center justify-between gap-3">
                  {ownerLinks ? (
                    <Link
                      to={`/owner/groups/${g._id}`}
                      className="truncate font-semibold text-foreground transition-colors hover:text-primary"
                    >
                      {g.name}
                    </Link>
                  ) : (
                    <p className="truncate font-semibold text-foreground">
                      {g.name}
                    </p>
                  )}
                </div>

                <div className="mt-2.5">
                  <GroupScheduleLines schedule={g.schedule} />
                </div>

                <div className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" />
                  Qo'shilgan: {formatDateUz(m.joinedAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default UserActiveGroupsList;
