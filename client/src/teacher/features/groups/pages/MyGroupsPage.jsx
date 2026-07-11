// Router
import { Link } from "react-router-dom";

// Components
import Card from "@/shared/components/ui/card/Card";
import Badge from "@/shared/components/ui/badge/Badge";

// Hooks
import useMyGroupsQuery from "../hooks/useMyGroupsQuery";

// Components
import ScheduleCards from "@/shared/components/schedule/ScheduleCards";


const MyGroupsPage = () => {
  const { data, isLoading } = useMyGroupsQuery();
  const groups = data || [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Mening guruhlarim</h1>

      {isLoading && (
        <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>
      )}

      {!isLoading && groups.length === 0 && (
        <div className="border rounded-lg p-12 text-center bg-white">
          <p className="text-muted-foreground">Sizga biriktirilgan guruhlar yo'q</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map((g) => (
          <Link
            key={g._id}
            to={`/teacher/groups/${g._id}`}
            className="block transition hover:shadow-md"
          >
            <Card className="h-full flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 break-words text-base font-semibold">
                  {g.name}
                </h3>
                <Badge variant="secondary" className="shrink-0">
                  {g.studentsCount || 0} o'quvchi
                </Badge>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <ScheduleCards schedule={g.schedule} />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default MyGroupsPage;
