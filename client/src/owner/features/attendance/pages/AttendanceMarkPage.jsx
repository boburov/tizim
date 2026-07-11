import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import InputField from "@/shared/components/ui/input/InputField";
import Card from "@/shared/components/ui/card/Card";
import { AttendanceGrid, SessionTabs } from "@/shared/components/attendance";
import GroupPicker from "../components/GroupPicker";
import TeacherPresenceCard from "../components/TeacherPresenceCard";
import useAttendanceForGroupDateQuery from "../hooks/useAttendanceForGroupDateQuery";
import useBulkRecordMutation from "../hooks/useBulkRecordMutation";
import { todayInput } from "@/shared/utils/formatDate";

const AttendanceMarkPage = () => {
  // Guruh sahifasidan "Davomat belgilash" bilan kelinsa - ?groupId=... oldindan tanlanadi
  const [searchParams] = useSearchParams();
  const [groupId, setGroupId] = useState(searchParams.get("groupId") || "");
  const [date, setDate] = useState(todayInput());
  // null → server birinchi sessiyani tanlaydi; tanlangach aniq slot
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
      <h1 className="text-2xl font-semibold">Davomat belgilash</h1>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex-1 min-w-0">
          <GroupPicker value={groupId} onChange={setGroupId} autoSelectFirst />
        </div>

        <InputField
          type="date"
          name="date"
          label="Sana"
          value={date}
          max={todayInput()}
          onChange={(e) => {
            setDate(e.target.value);
            setSlot(null); // yangi kun → sessiya qayta tanlanadi
          }}
          className="w-full sm:w-56"
        />
      </Card>

      {!groupId ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          Boshlash uchun guruh tanlang
        </div>
      ) : isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>
      ) : (
        <>
          <TeacherPresenceCard groupId={groupId} date={date} />
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

export default AttendanceMarkPage;
