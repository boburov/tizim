import { useState } from "react";
import ChannelSelector from "@/owner/features/notifications/components/ChannelSelector";
import Button from "@/shared/components/ui/button/Button";
import { useCongratulateTeacherMutation } from "../hooks/useHolidayMutations";

// O'qituvchini tug'ilgan kuni bilan tabriklash modali.
// 2 ta kanal: Telegram (tg orqali) va Platforma (inapp) - biri yoki ikkalasi.
// `teacher` ModalWrapper data orqali keladi.
const TeacherCongratulateModal = ({
  teacher,
  close,
  isLoading,
  setIsLoading,
}) => {
  const [channels, setChannels] = useState(["telegram", "inapp"]);
  const [message, setMessage] = useState("");

  const { mutate } = useCongratulateTeacherMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const name = `${teacher?.firstName || ""} ${teacher?.lastName || ""}`.trim();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!channels.length || !teacher?._id) return;
    setIsLoading(true);
    mutate({
      id: teacher._id,
      body: { channels, message: message.trim() || undefined },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{name}</span> ga tug'ilgan
        kun tabrigini yuboring.
      </p>

      <div>
        <label className="text-sm font-medium">Yuborish kanali</label>
        <div className="mt-2">
          <ChannelSelector
            value={channels}
            onChange={setChannels}
            disabled={isLoading}
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">
          Tabrik matni (ixtiyoriy)
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={2000}
          disabled={isLoading}
          placeholder="Bo'sh qoldirilsa standart tabrik matni yuboriladi."
          className="mt-2 w-full rounded-lg border border-border p-3 text-sm outline-none focus:border-primary disabled:opacity-50"
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
          disabled={isLoading || !channels.length}
          className="flex-1"
        >
          {isLoading ? "Yuborilmoqda..." : "Tabriklash"}
        </Button>
      </div>
    </form>
  );
};

export default TeacherCongratulateModal;
