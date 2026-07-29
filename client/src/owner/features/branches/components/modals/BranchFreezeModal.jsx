// Components
import Button from "@/shared/components/ui/button/Button";

// Hooks
import { useBranchUpdateMutation } from "../../hooks/useBranchMutations";

/**
 * FILIALNI MUZLATISH / QAYTA FAOLLASHTIRISH.
 *
 * O'chirishdan farqi: ma'lumot joyida qoladi, filial shunchaki ishlamay
 * turadi - xodimlari kira olmaydi va u ro'yxatlarda faol sifatida
 * ko'rinmaydi. Istalgan payt qaytarish mumkin.
 *
 * Asosiy filialni muzlatib bo'lmaydi (serverda ham tekshiruv bor):
 * migratsiyada barcha eski ma'lumot shunga biriktirilgan.
 */
const BranchFreezeModal = ({ branch = {}, close, isLoading, setIsLoading }) => {
  const isActive = branch.isActive !== false;

  const { mutate } = useBranchUpdateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-medium">{branch.name}</span> filialini{" "}
        {isActive ? "muzlatmoqchimisiz" : "qayta faollashtirmoqchimisiz"}?
      </p>

      <p className="text-xs opacity-70">
        {isActive
          ? "Ma'lumot o'chmaydi - filial vaqtincha ishlamay turadi va faol ro'yxatlarda ko'rinmaydi. Istalgan payt qaytarish mumkin."
          : "Filial yana faol bo'ladi: xodimlari kira oladi va u ro'yxatlarda ko'rinadi."}
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
          variant={isActive ? "destructive" : "default"}
          disabled={isLoading}
          onClick={() => {
            setIsLoading(true);
            mutate({ id: branch._id, body: { isActive: !isActive } });
          }}
          className="flex-1"
        >
          {isLoading
            ? "Saqlanmoqda..."
            : isActive
              ? "Muzlatish"
              : "Faollashtirish"}
        </Button>
      </div>
    </div>
  );
};

export default BranchFreezeModal;
