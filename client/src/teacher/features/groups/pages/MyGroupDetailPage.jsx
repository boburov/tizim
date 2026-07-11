// Router
import { useParams, useNavigate } from "react-router-dom";

// Icons
import { ArrowLeft, Send } from "lucide-react";

// Components
import Card from "@/shared/components/ui/card/Card";
import Badge from "@/shared/components/ui/badge/Badge";

// Hooks
import useGoBack from "@/shared/hooks/useGoBack";
import useGroupQuery from "../hooks/useGroupQuery";

// Components
import ScheduleCards from "@/shared/components/schedule/ScheduleCards";

// Utils
import { formatPhone } from "@/shared/utils/formatPhone";

const MyGroupDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack("/teacher/groups");
  const { data: group, isLoading, isError } = useGroupQuery(id);

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>;
  }

  if (isError || !group) {
    return (
      <div className="p-8 text-center">
        <button
          type="button"
          onClick={goBack}
          className="text-blue-600 hover:underline cursor-pointer"
        >
          Guruhlar ro'yxatiga qaytish
        </button>
      </div>
    );
  }

  const students = group.students || [];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border bg-white hover:bg-gray-50 cursor-pointer"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="min-w-0 break-words text-xl font-semibold sm:text-2xl">
            {group.name}
          </h1>
          <Badge variant="secondary" className="shrink-0">
            {students.length} o'quvchi
          </Badge>
        </div>
      </div>

      <Card className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Dars jadvali
          </p>
          <ScheduleCards schedule={group.schedule} />
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-1">O'quvchilar</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Davomat va darsdan ozod qilish uchun o'quvchini tanlang
        </p>
        {students.length === 0 ? (
          <p className="text-muted-foreground text-sm">O'quvchilar yo'q</p>
        ) : (
          <StudentsList
            students={students}
            onSelect={(s) =>
              navigate(`/teacher/groups/${id}/students/${s._id}`)
            }
          />
        )}
      </Card>
    </div>
  );
};

// O'quvchining Telegram holatini ko'rsatadigan kichik komponent
const TelegramStatus = ({ telegram }) => {
  if (!telegram) {
    return <span className="text-muted-foreground">Bog'lanmagan</span>;
  }
  if (telegram.username) {
    return (
      <a
        href={`https://t.me/${telegram.username}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex min-w-0 items-center gap-1 font-medium text-sky-600 hover:text-sky-700 hover:underline"
      >
        <Send className="size-3.5 shrink-0" />
        <span className="truncate">@{telegram.username}</span>
      </a>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 font-medium text-emerald-600"
      title={`Telegram ID: ${telegram.telegramId}`}
    >
      <Send className="size-3.5 shrink-0" />
      Bog'langan
    </span>
  );
};

// Mobil - card ro'yxati, sm+ - jadval (gorizontal scroll bilan).
// Qatorni bosish o'quvchi detali sahifasiga olib boradi (davomat + ozod davrlari).
const StudentsList = ({ students, onSelect }) => (
  <>
    {/* Mobil ko'rinish: stacked cards */}
    <ul className="space-y-2.5 sm:hidden">
      {students.map((s, i) => (
        <li
          key={s._id}
          onClick={() => onSelect?.(s)}
          className="cursor-pointer rounded-xl border border-border/60 p-3 transition-colors hover:bg-gray-50"
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-xs text-muted-foreground">{i + 1}.</span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="break-words font-medium">
                {s.firstName} {s.lastName}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatPhone(s.phone) || "Telefon yo'q"}
              </p>
              <div className="text-sm">
                <TelegramStatus telegram={s.telegram} />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>

    {/* Desktop/planshet ko'rinish: jadval */}
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="text-left">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Ism familiya</th>
            <th className="px-3 py-2 font-medium">Telefon</th>
            <th className="px-3 py-2 font-medium">Telegram</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s, i) => (
            <tr
              key={s._id}
              onClick={() => onSelect?.(s)}
              className="cursor-pointer border-t transition-colors hover:bg-gray-50"
            >
              <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
              <td className="px-3 py-2 font-medium">
                {s.firstName} {s.lastName}
              </td>
              <td className="px-3 py-2">{formatPhone(s.phone) || "-"}</td>
              <td className="px-3 py-2">
                <TelegramStatus telegram={s.telegram} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

export default MyGroupDetailPage;
