import { useState } from "react";

import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import { todayInput, toDateInput } from "@/shared/utils/formatDate";
import useGroupUpdateMutation from "../../hooks/useGroupUpdateMutation";

// Kursni yakunlash = tugash sanasini belgilash. Sana o'tgan/bugun bo'lsa guruh
// darhol arxivga o'tadi (ochiq a'zolik va o'qituvchi davri shu kunda yopiladi).
// `group` ModalWrapper data orqali keladi.
const GroupFinishModal = ({ group, close, isLoading, setIsLoading }) => {
  const [endDate, setEndDate] = useState(todayInput());
  const minDate = group?.startDate ? toDateInput(group.startDate) : undefined;

  const { mutate } = useGroupUpdateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleConfirm = () => {
    if (!endDate) return;
    setIsLoading(true);
    mutate({ id: group._id, body: { endDate } });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <p className="font-semibold">
          {(group?.name || "").trim()} kursini yakunlaysizmi?
        </p>
        <p className="mt-1">
          Yakunlangach guruh arxivga o'tadi: to'lov, davomat va o'qituvchi davri
          amallari to'xtaydi, ochiq o'quvchi a'zoliklari va o'qituvchi davri
          belgilangan sanada yopiladi. Keyinchalik tugash sanasini o'zgartirib
          qayta faollashtirish mumkin.
        </p>
      </div>

      <InputField
        type="date"
        name="endDate"
        label="Kurs tugash sanasi"
        value={endDate}
        min={minDate}
        onChange={(e) => setEndDate(e.target.value)}
        required
        disabled={isLoading}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => close?.()}
          disabled={isLoading}
          className="flex-1"
        >
          Bekor qilish
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={handleConfirm}
          disabled={isLoading || !endDate}
          className="flex-1"
        >
          {isLoading ? "Yakunlanmoqda..." : "Kursni yakunlash"}
        </Button>
      </div>
    </div>
  );
};

export default GroupFinishModal;
