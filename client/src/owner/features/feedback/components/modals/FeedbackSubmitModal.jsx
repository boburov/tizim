import useObjectState from "@/shared/hooks/useObjectState";
import Button from "@/shared/components/ui/button/Button";
import Switch from "@/shared/components/ui/switch/Switch";
import FeedbackTypePicker from "../FeedbackTypePicker";
import GroupPicker from "@/owner/features/attendance/components/GroupPicker";
import { useSubmitFeedbackMutation } from "../../hooks/useFeedbackMutations";

const FeedbackSubmitModal = ({
  close,
  isLoading,
  setIsLoading,
  showGroupPicker = true,
}) => {
  const obj = useObjectState({
    type: "",
    group: "",
    message: "",
    isAnonymous: false,
  });

  const { mutate } = useSubmitFeedbackMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!obj.type || obj.message.trim().length < 5) return;
    setIsLoading(true);
    mutate({
      type: obj.type,
      group: obj.group || undefined,
      message: obj.message.trim(),
      isAnonymous: !!obj.isAnonymous,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <FeedbackTypePicker
        value={obj.type}
        onChange={(v) => obj.setField("type", v)}
        required
        disabled={isLoading}
      />
      {showGroupPicker && (
        <GroupPicker
          value={obj.group}
          onChange={(v) => obj.setField("group", v)}
          disabled={isLoading}
          label="Guruh (ixtiyoriy)"
        />
      )}
      <div>
        <label className="text-sm font-medium block mb-1">
          Sizning fikringiz
        </label>
        <textarea
          rows={5}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Kamida 5 belgi..."
          value={obj.message}
          onChange={(e) => obj.setField("message", e.target.value)}
          required
          minLength={5}
          maxLength={2000}
          disabled={isLoading}
        />
      </div>
      <div className="flex items-center justify-between gap-3 border rounded-md px-3 py-2">
        <div>
          <p className="text-sm font-medium">Anonim yuborish</p>
          <p className="text-xs text-muted-foreground">
            Yoqilsa ismingiz ko'rinmaydi va javob ham yuborilmaydi
          </p>
        </div>
        <Switch
          checked={!!obj.isAnonymous}
          onChange={(v) => obj.setField("isAnonymous", v)}
          disabled={isLoading}
        />
      </div>
      <div className="flex gap-2 pt-1">
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
          type="submit"
          disabled={isLoading || !obj.type || obj.message.trim().length < 5}
          className="flex-1"
        >
          {isLoading ? "Yuborilmoqda..." : "Yuborish"}
        </Button>
      </div>
    </form>
  );
};

export default FeedbackSubmitModal;
