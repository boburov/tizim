import { useState } from "react";
import { useParams } from "react-router-dom";
import InputField from "@/shared/components/ui/input/InputField";
import BackLink from "@/shared/components/ui/link/BackLink";
import { SessionTabs } from "@/shared/components/attendance";
import { GradeGrid } from "@/owner/features/grades";
import useGradesForGroupDateQuery from "@/owner/features/grades/hooks/useGradesForGroupDateQuery";
import useGradeBulkRecordMutation from "@/owner/features/grades/hooks/useGradeBulkRecordMutation";
import { todayInput } from "@/shared/utils/formatDate";

const TeacherGradesMarkPage = () => {
  const { groupId } = useParams();
  const [date, setDate] = useState(todayInput());
  const [slot, setSlot] = useState(null);

  const { data, isLoading } = useGradesForGroupDateQuery(groupId, date, slot);
  const { mutate, isPending } = useGradeBulkRecordMutation();

  const effectiveSlot = slot ?? data?.slot ?? "";

  const handleSubmit = (items) => {
    if (!groupId || !date || items.length === 0) return;
    mutate({ groupId, date, items, slot: effectiveSlot });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <BackLink to="/teacher/grades" className="shrink-0" />
          <h1 className="text-2xl font-semibold truncate">
            {data?.group?.name || "Baholash"}
          </h1>
        </div>
        <InputField
          type="date"
          name="date"
          label="Sana"
          value={date}
          max={todayInput()}
          onChange={(e) => {
            setDate(e.target.value);
            setSlot(null);
          }}
          className="!gap-1"
        />
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>
      ) : (
        <>
          <SessionTabs
            sessions={data?.sessions}
            activeSlot={effectiveSlot}
            onSelect={setSlot}
          />
          <GradeGrid data={data} onSubmit={handleSubmit} isSubmitting={isPending} />
        </>
      )}
    </div>
  );
};

export default TeacherGradesMarkPage;
