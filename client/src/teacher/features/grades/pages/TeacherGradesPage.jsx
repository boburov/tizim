import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import Card from "@/shared/components/ui/card/Card";
import Badge from "@/shared/components/ui/badge/Badge";
import Button from "@/shared/components/ui/button/Button";
import useMyGroupsQuery from "@/teacher/features/groups/hooks/useMyGroupsQuery";
import GroupScheduleLines from "@/shared/components/userProfile/GroupScheduleLines";
import { scheduleActiveOn } from "@/shared/utils/formatSchedule";

const dayOfWeekOf = (d) => {
  const map = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[new Date(d).getUTCDay()];
};

const TeacherGradesPage = () => {
  const { data: groups = [], isLoading } = useMyGroupsQuery();
  const todayDow = dayOfWeekOf(new Date());

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Baholash</h1>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>
      ) : groups.length === 0 ? (
        <div className="border rounded-lg p-12 text-center bg-white">
          <p className="text-muted-foreground">
            Sizga biriktirilgan guruhlar yo'q
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((g) => {
            const isToday = scheduleActiveOn(g.schedule).some(
              (s) => s.day === todayDow,
            );
            return (
              <Card key={g._id} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 break-words font-semibold">{g.name}</h3>
                  {isToday && (
                    <Badge className="shrink-0 bg-blue-100 text-blue-700">
                      Bugun
                    </Badge>
                  )}
                </div>
                <GroupScheduleLines schedule={g.schedule} />
                <p className="text-sm">{g.studentsCount || 0} o'quvchi</p>

                <div className="pt-2">
                  <Link to={`/teacher/grades/${g._id}`}>
                    <Button variant="outline" className="w-full">
                      <Star className="size-4" />
                      Baho qo'yish
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TeacherGradesPage;
