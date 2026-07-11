import useObjectState from "@/shared/hooks/useObjectState";
import Button from "@/shared/components/ui/button/Button";
import LeadFormFields from "./LeadFormFields";
import { useLeadUpdateMutation } from "../hooks/useLeadMutations";

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

const LeadEditModal = ({ lead, close, isLoading, setIsLoading }) => {
  const obj = useObjectState({
    firstName: lead?.firstName || "",
    lastName: lead?.lastName || "",
    age: lead?.age ?? "",
    phone: lead?.phone || "",
    parentPhone: lead?.parentPhone || "",
    sourceId: lead?.source?._id || "",
    directionId: lead?.direction?._id || "",
    status: lead?.status || "new",
    trialDate: toDateInput(lead?.trialDate),
    rejectionReasonId: lead?.rejectionReason?._id || "",
    notes: lead?.notes || "",
  });

  const { mutate } = useLeadUpdateMutation({
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
      id: lead._id,
      body: {
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
      },
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
          {isLoading ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>
    </form>
  );
};

export default LeadEditModal;
