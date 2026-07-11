import { useEffect } from "react";
import useObjectState from "@/shared/hooks/useObjectState";
import InputField from "@/shared/components/ui/input/InputField";
import Button from "@/shared/components/ui/button/Button";
import Card from "@/shared/components/ui/card/Card";
import {
  useAttendanceSettingsQuery,
  useAttendanceSettingsUpdateMutation,
} from "../hooks/useAttendanceSettingsQuery";

const AttendanceSettingsPage = () => {
  const { data: settings, isLoading } = useAttendanceSettingsQuery();
  const { mutate, isPending } = useAttendanceSettingsUpdateMutation();

  const obj = useObjectState({
    lowAttendanceThreshold: 60,
    consecutiveAbsencesAlert: 3,
  });

  useEffect(() => {
    if (settings) {
      obj.setFields({
        lowAttendanceThreshold: settings.lowAttendanceThreshold,
        consecutiveAbsencesAlert: settings.consecutiveAbsencesAlert,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?._id]);

  const handleSubmit = (e) => {
    e.preventDefault();
    mutate({
      lowAttendanceThreshold: Number(obj.lowAttendanceThreshold),
      consecutiveAbsencesAlert: Number(obj.consecutiveAbsencesAlert),
    });
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Davomat sozlamalari</h1>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
        <Card className="space-y-3">
          <h3 className="font-semibold">Ogohlantirish chegaralari</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <InputField
              name="lowAttendanceThreshold"
              label="Past davomat chegarasi (%)"
              type="number"
              min="0"
              max="100"
              description="Bu foizdan past bo'lganlar dashboardda ko'rsatiladi"
              value={obj.lowAttendanceThreshold}
              onChange={(e) =>
                obj.setField("lowAttendanceThreshold", e.target.value)
              }
              disabled={isPending}
            />
            <InputField
              name="consecutiveAbsencesAlert"
              label="Ketma-ket kelmaganlik (kun)"
              type="number"
              min="1"
              description="Necha kun ketma-ket kelmasa ogohlantirish"
              value={obj.consecutiveAbsencesAlert}
              onChange={(e) =>
                obj.setField("consecutiveAbsencesAlert", e.target.value)
              }
              disabled={isPending}
            />
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saqlanmoqda..." : "Saqlash"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AttendanceSettingsPage;
