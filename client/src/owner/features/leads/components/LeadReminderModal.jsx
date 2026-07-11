import useObjectState from "@/shared/hooks/useObjectState";
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import { useLeadReminderMutation } from "../hooks/useLeadMutations";

// ISO -> "YYYY-MM-DDTHH:mm" (datetime-local uchun, mahalliy vaqt)
const toLocalInput = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

const LeadReminderModal = ({ lead, close, isLoading, setIsLoading }) => {
  const obj = useObjectState({
    followUpAt: toLocalInput(lead?.followUpAt),
    followUpNote: lead?.followUpNote || "",
  });

  const { mutate } = useLeadReminderMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const save = (clear = false) => {
    setIsLoading(true);
    mutate({
      id: lead._id,
      body: clear
        ? { followUpAt: null, followUpNote: "" }
        : {
            followUpAt: obj.followUpAt
              ? new Date(obj.followUpAt).toISOString()
              : null,
            followUpNote: obj.followUpNote || "",
          },
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!obj.followUpAt) return;
    save(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Belgilangan vaqtda admin panelda avtomatik tizim bildirishnomasi chiqadi.
      </p>

      <InputField
        type="datetime-local"
        name="followUpAt"
        label="Qayta bog'lanish sanasi va vaqti"
        value={obj.followUpAt}
        onChange={(e) => obj.setField("followUpAt", e.target.value)}
        required
        disabled={isLoading}
      />

      <div>
        <label className="text-sm font-medium block mb-1">Izoh (ixtiyoriy)</label>
        <textarea
          rows={3}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Masalan: narx haqida gaplashish kerak"
          value={obj.followUpNote}
          onChange={(e) => obj.setField("followUpNote", e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className="flex gap-2 pt-1">
        {lead?.followUpAt && (
          <Button
            type="button"
            variant="outline"
            onClick={() => save(true)}
            disabled={isLoading}
            className="text-red-600"
          >
            O'chirish
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => close?.()}
          disabled={isLoading}
          className="flex-1"
        >
          Bekor qilish
        </Button>
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>
    </form>
  );
};

export default LeadReminderModal;
