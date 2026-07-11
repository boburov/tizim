import { Cake, Gift, ChevronRight } from "lucide-react";
import Card from "@/shared/components/ui/card/Card";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import useTeacherBirthdaysQuery from "../hooks/useTeacherBirthdaysQuery";

const UZ_MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];

// birthDate'dan faqat kun-oy: "21-may" (yilni ko'rsatmaymiz).
const dayMonth = (dateLike) => {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getUTCDate()}-${UZ_MONTHS[d.getUTCMonth()]}`;
};

const daysLabel = (d) => {
  if (d === 0) return "Bugun";
  if (d === 1) return "Ertaga";
  return `${d} kundan keyin`;
};

const TeacherBirthdaysCard = () => {
  const { openModal } = useModal();
  const { data, isLoading } = useTeacherBirthdaysQuery();
  const items = data || [];

  return (
    <Card
      title="O'qituvchilar tug'ilgan kunlari"
      icon={<Cake className="size-5 text-primary" />}
    >
      <p className="mt-1 text-xs text-muted-foreground">
        Eng yaqin tug'ilgan kundan boshlab. O'qituvchini tanlab tabriklang.
      </p>

      <div className="mt-3">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-lg bg-muted/60"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            compact
            icon={Cake}
            title="Tug'ilgan sana kiritilgan o'qituvchi yo'q"
            description="O'qituvchi profilida tug'ilgan sanani belgilang."
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border">
            {items.map((t) => (
              <li key={t._id}>
                <button
                  type="button"
                  onClick={() =>
                    openModal(MODAL.TEACHER_BIRTHDAY_CONGRATULATE, {
                      teacher: t,
                    })
                  }
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-muted/40"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Gift className="size-4.5" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {t.firstName} {t.lastName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {dayMonth(t.birthDate)}
                      {t.turningAge ? ` · ${t.turningAge} yosh to'ladi` : ""}
                    </span>
                  </span>

                  <StatusBadge tone={t.isToday ? "success" : "neutral"}>
                    {daysLabel(t.daysUntil)}
                  </StatusBadge>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
};

export default TeacherBirthdaysCard;
