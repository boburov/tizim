// Components
import Card from "@/shared/components/ui/card/Card";

// Hooks
import useMyGroupQuery from "../hooks/useMyGroupQuery";

// Utils
import { formatSchedule } from "@/shared/utils/formatSchedule";
import { formatDateUz } from "@/shared/utils/formatDate";

const fmtDate = (iso) => (iso ? formatDateUz(iso) : "-");

const MyGroupPage = () => {
  const { data, isLoading } = useMyGroupQuery();

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>;
  }

  if (!data || !data.group) {
    return (
      <div className="border rounded-lg p-12 text-center bg-white">
        <p className="text-muted-foreground">
          Hozircha hech qaysi guruhga biriktirilmagansiz. Administrator bilan bog'laning.
        </p>
      </div>
    );
  }

  const { group, joinedAt } = data;
  const teachers = (group.teachers || [])
    .map((t) => `${t.firstName} ${t.lastName || ""}`.trim())
    .join(", ");

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-semibold">Mening guruhim</h1>

      <Card className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Guruh nomi</p>
          <p className="text-lg font-semibold">{group.name}</p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Dars jadvali</p>
          <p className="font-medium">{formatSchedule(group.schedule)}</p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">O'qituvchilar</p>
          <p className="font-medium">{teachers || "-"}</p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Qo'shilgan sana</p>
          <p className="font-medium">{fmtDate(joinedAt)}</p>
        </div>
      </Card>
    </div>
  );
};

export default MyGroupPage;
