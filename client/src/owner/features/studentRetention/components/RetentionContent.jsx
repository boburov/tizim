import { useMemo } from "react";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import RetentionStatCards from "./RetentionStatCards";
import DurationBeforeLeavingChart from "./DurationBeforeLeavingChart";
import ChurnReasonsTable from "./ChurnReasonsTable";
import TeacherChurnTable from "./TeacherChurnTable";
import useRetentionQuery from "../hooks/useRetentionQuery";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";

// Davr preseti - leftAt diapazonini hisoblaydi (mashina sanasi YYYY-MM-DD).
const toISO = (d) => d.toISOString().slice(0, 10);
const rangeFor = (preset) => {
  if (preset === "all") return {};
  const now = new Date();
  const months = preset === "3m" ? 3 : 12;
  const from = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return { fromDate: toISO(from), toDate: toISO(now) };
};

// preset - route element orqali ("all" | "12m" | "3m").
const RetentionContent = ({ preset }) => {
  const params = useMemo(() => rangeFor(preset), [preset]);
  const { data, isLoading, isError, refetch } = useRetentionQuery(params);
  const { openModal } = useModal();

  if (isError) return <ErrorState onRetry={refetch} />;
  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>;
  }

  return (
    <div className="space-y-5 pt-3">
      <RetentionStatCards
        data={data}
        onShowChurned={() => openModal(MODAL.CHURNED_STUDENTS, { params })}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DurationBeforeLeavingChart buckets={data?.durationBuckets || []} />
        <ChurnReasonsTable reasons={data?.reasons || []} />
      </div>

      <TeacherChurnTable teachers={data?.teachers || []} />
    </div>
  );
};

export default RetentionContent;
