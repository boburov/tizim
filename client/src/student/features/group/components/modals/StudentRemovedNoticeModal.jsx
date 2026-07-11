import Button from "@/shared/components/ui/button/Button";
import useRemovalNoticeSeenMutation from "../../hooks/useRemovalNoticeSeenMutation";

// O'quvchi guruhdan chiqarilganda login qilganda ko'rsatiladigan modal.
// ModalWrapper `...data`ni spread qiladi - groupName, reasonTitle shu yerda keladi.
const StudentRemovedNoticeModal = ({
  groupName,
  reasonTitle = "",
  close,
  isLoading,
  setIsLoading,
}) => {
  const { mutate } = useRemovalNoticeSeenMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => {
      // Xato bo'lsa ham modalni yopamiz - o'quvchi ilashib qolmasin.
      setIsLoading(false);
      close?.();
    },
  });

  const handleConfirm = () => {
    setIsLoading(true);
    mutate();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed">
        Siz{" "}
        <span className="font-semibold">{groupName || "guruh"}</span>{" "}
        guruhidan chiqarildingiz.
        {reasonTitle ? (
          <>
            {" "}
            Sabab: <span className="font-medium">{reasonTitle}</span>.
          </>
        ) : null}
      </p>
      <p className="text-sm text-muted-foreground">
        Savollaringiz bo'lsa, administrator bilan bog'laning.
      </p>

      <Button
        type="button"
        onClick={handleConfirm}
        disabled={isLoading}
        className="w-full"
      >
        {isLoading ? "..." : "Tushunarli"}
      </Button>
    </div>
  );
};

export default StudentRemovedNoticeModal;
