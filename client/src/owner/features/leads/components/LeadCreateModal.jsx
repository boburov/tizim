import useObjectState from "@/shared/hooks/useObjectState";
import useActiveBranch from "@/shared/hooks/useActiveBranch";
import Button from "@/shared/components/ui/button/Button";
import SelectField from "@/shared/components/ui/select/SelectField";
import LeadFormFields from "./LeadFormFields";
import { useLeadCreateMutation } from "../hooks/useLeadMutations";

const initial = {
  branchId: "",
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

  // FILIAL. Odatda server aktiv filialdan (x-branch-id) oladi. Lekin
  // "Barcha filiallar" rejimida aktiv filial YO'Q - lid qaysi filialga
  // kelganini SO'RAYMIZ (foydalanuvchi qo'shishdagi bilan bir xil qoida).
  const { branches, isAllBranches, multiBranch } = useActiveBranch();
  const needsBranch = multiBranch && isAllBranches;
  const branchOptions = branches.map((b) => ({
    value: String(b._id),
    label: b.name,
  }));

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
    if (needsBranch && !obj.branchId) return;
    setIsLoading(true);
    mutate({
      ...(needsBranch && obj.branchId ? { branchId: obj.branchId } : {}),
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
      {needsBranch && (
        <SelectField
          label="Filial"
          placeholder="Filialni tanlang"
          value={obj.branchId}
          onChange={(v) => obj.setField("branchId", v?.target?.value ?? v)}
          options={branchOptions}
          required
          error={!obj.branchId}
          disabled={isLoading}
        />
      )}

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
        <Button
          type="submit"
          disabled={isLoading || (needsBranch && !obj.branchId)}
          className="flex-1"
        >
          {isLoading ? "Yaratilmoqda..." : "Yaratish"}
        </Button>
      </div>
    </form>
  );
};

export default LeadCreateModal;
