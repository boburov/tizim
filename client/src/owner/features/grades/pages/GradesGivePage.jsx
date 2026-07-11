import { useState } from "react";
import { useSearchParams } from "react-router-dom";

// Icons
import { ClipboardList } from "lucide-react";

// Components
import Card from "@/shared/components/ui/card/Card";
import InputField from "@/shared/components/ui/input/InputField";
import { Skeleton } from "@/shared/components/shadcn/skeleton";
import { SessionTabs } from "@/shared/components/attendance";
import { GroupPicker } from "@/owner/features/attendance";
import GradeGrid from "../components/GradeGrid";

// Hooks
import useGradesForGroupDateQuery from "../hooks/useGradesForGroupDateQuery";
import useGradeBulkRecordMutation from "../hooks/useGradeBulkRecordMutation";

// Utils
import { todayInput } from "@/shared/utils/formatDate";

const GradesGivePage = () => {
  const [searchParams] = useSearchParams();
  const [groupId, setGroupId] = useState(searchParams.get("groupId") || "");
  const [date, setDate] = useState(todayInput());
  const [slot, setSlot] = useState(null); // null → server birinchi sessiyani tanlaydi

  const { data, isLoading } = useGradesForGroupDateQuery(groupId, date, slot);
  const { mutate, isPending } = useGradeBulkRecordMutation();

  const effectiveSlot = slot ?? data?.slot ?? "";

  const handleSubmit = (items) => {
    if (!groupId || !date || items.length === 0) return;
    mutate({ groupId, date, items, slot: effectiveSlot });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Baholash</h1>

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
            setSlot(null);
          }}
          className="w-full sm:w-56"
        />
      </Card>

      {!groupId ? (
        <div className="rounded-lg border border-dashed bg-white p-10 text-center">
          <ClipboardList className="mx-auto size-8 text-gray-300" />
          <p className="mt-2 text-sm text-muted-foreground">
            Boshlash uchun guruh tanlang
          </p>
        </div>
      ) : isLoading ? (
        <GradeGridSkeleton />
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

const GradeGridSkeleton = () => (
  <div className="space-y-3">
    <Skeleton className="h-12 w-full rounded-md" />
    <div className="space-y-2 rounded-md border bg-white p-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-1">
          <div className="flex items-center gap-3">
            <Skeleton className="size-6 rounded" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-10 w-52 rounded-md" />
        </div>
      ))}
    </div>
  </div>
);

export default GradesGivePage;
