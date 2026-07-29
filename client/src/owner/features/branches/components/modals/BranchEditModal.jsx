import useObjectState from "@/shared/hooks/useObjectState";
import Button from "@/shared/components/ui/button/Button";
import BranchFormFields from "../BranchFormFields";
import { useBranchUpdateMutation } from "../../hooks/useBranchMutations";

const BranchEditModal = ({ close, isLoading, setIsLoading, data }) => {
  const branch = data?.branch || {};
  const obj = useObjectState({
    name: branch.name || "",
    address: branch.address || "",
    phone: branch.phone || "",
    expenseApprovalThreshold: branch.expenseApprovalThreshold ?? "",
  });

  const { mutate } = useBranchUpdateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!obj.name.trim()) return;
    setIsLoading(true);
    mutate({
      id: branch._id,
      body: {
        name: obj.name.trim(),
        address: obj.address.trim() || null,
        phone: obj.phone.trim() || null,
        // Bo'sh => null (limit yo'q)
        expenseApprovalThreshold:
          String(obj.expenseApprovalThreshold).trim() === ""
            ? null
            : Number(obj.expenseApprovalThreshold),
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <BranchFormFields obj={obj} disabled={isLoading} showThreshold />
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

export default BranchEditModal;
