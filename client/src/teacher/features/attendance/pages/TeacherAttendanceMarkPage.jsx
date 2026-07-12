import { useState } from "react";
import { useParams } from "react-router-dom";
import InputField from "@/shared/components/ui/input/InputField";
import BackLink from "@/shared/components/ui/link/BackLink";
import { AttendanceGrid, SessionTabs } from "@/shared/components/attendance";
import useAttendanceForGroupDateQuery from "@/owner/features/attendance/hooks/useAttendanceForGroupDateQuery";
import useBulkRecordMutation from "@/owner/features/attendance/hooks/useBulkRecordMutation";
import { todayInput } from "@/shared/utils/formatDate";

const TeacherAttendanceMarkPage = () => {
  const { groupId } = useParams();
  const [date, setDate] = useState(todayInput());
  const [slot, setSlot] = useState(null);

  const { data, isLoading } = useAttendanceForGroupDateQuery(groupId, date, slot);
  const { mutate, isPending } = useBulkRecordMutation();

  const effectiveSlot = slot ?? data?.slot ?? "";

  const handleSubmit = (items) => {
    if (!groupId || !date || items.length === 0) return;
    mutate({ groupId, date, items, slot: effectiveSlot });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <BackLink to="/teacher/attendance" className="shrink-0" />
          <h1 className="text-2xl font-semibold truncate">
            {data?.group?.name || "Davomat"}
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
          <AttendanceGrid
            data={data}
            onSubmit={handleSubmit}
            isSubmitting={isPending}
          />
        </>
      )}
    </div>
  );
};

export default TeacherAttendanceMarkPage;
