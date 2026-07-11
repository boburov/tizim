import useObjectState from "@/shared/hooks/useObjectState";
import Button from "@/shared/components/ui/button/Button";
import LeadFormFields from "./LeadFormFields";
import { useLeadCreateMutation } from "../hooks/useLeadMutations";

const initial = {
  firstName: "",
  lastName: "",
  age: "",
  phone: "",
  parentPhone: "",
  sourceId: "",
  directionId: "",
  status: "new",
  trialDate: "",
  rejectionReasonId: "",
  notes: "",
};

const LeadCreateModal = ({ close, isLoading, setIsLoading }) => {
  const obj = useObjectState(initial);

  const { mutate } = useLeadCreateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!obj.firstName.trim() || !obj.phone) return;
    setIsLoading(true);
    mutate({
      firstName: obj.firstName.trim(),
      lastName: obj.lastName.trim(),
      age: obj.age ? Number(obj.age) : null,
      phone: obj.phone,
      parentPhone: obj.parentPhone || null,
      sourceId: obj.sourceId || null,
      directionId: obj.directionId || null,
      status: obj.status,
      trialDate: obj.trialDate || null,
      rejectionReasonId:
        obj.status === "rejected" ? obj.rejectionReasonId || null : null,
      notes: obj.notes || "",
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <LeadFormFields obj={obj} disabled={isLoading} />
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
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? "Yaratilmoqda..." : "Yaratish"}
        </Button>
      </div>
    </form>
  );
};

export default LeadCreateModal;
