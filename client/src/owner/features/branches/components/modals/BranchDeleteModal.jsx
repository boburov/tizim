import Button from "@/shared/components/ui/button/Button";
import { useBranchRemoveMutation } from "../../hooks/useBranchMutations";

const BranchDeleteModal = ({ close, isLoading, setIsLoading, data }) => {
  const branch = data?.branch || {};

  const { mutate } = useBranchRemoveMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-medium">{branch.name}</span> filialini o'chirmoqchimisiz?
      </p>
      <p className="text-xs opacity-70">
        Filialda guruh yoki xodim bo'lsa o'chirilmaydi - avval ularni boshqa
        filialga ko'chiring.
      </p>
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
          variant="destructive"
          disabled={isLoading}
          onClick={() => {
            setIsLoading(true);
            mutate(branch._id);
          }}
          className="flex-1"
        >
          {isLoading ? "O'chirilmoqda..." : "O'chirish"}
        </Button>
      </div>
    </div>
  );
};

export default BranchDeleteModal;
