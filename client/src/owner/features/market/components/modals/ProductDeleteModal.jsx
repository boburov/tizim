// Components
import Button from "@/shared/components/ui/button/Button";

// Mutations
import { useProductRemoveMutation } from "../../hooks/useMarketMutations";

/**
 * MAHSULOTNI O'CHIRISH.
 *
 * ⚠ MATNDA "butunlay o'chiriladi" DEYILMAYDI — chunki bu ROST EMAS.
 * Server soft-delete qiladi: buyurtmalar mahsulotga bog'langan va
 * ular o'quvchining tanga sarflaganini isbotlaydi. Matn amalda nima
 * bo'lishini aytadi: ro'yxatdan yo'qoladi, tarix qoladi.
 */
const ProductDeleteModal = ({ close, isLoading, setIsLoading, product }) => {
  const { mutate } = useProductRemoveMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleDelete = () => {
    if (!product?._id) return;
    setIsLoading(true);
    mutate(product._id);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <b className="text-foreground">{product?.name}</b> marketdan olib
        tashlanadi va o'quvchilarga ko'rinmay qoladi. Allaqachon qilingan
        buyurtmalar va ularning tarixi saqlanib qoladi.
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
          onClick={handleDelete}
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading ? "O'chirilmoqda..." : "O'chirish"}
        </Button>
      </div>
    </div>
  );
};

export default ProductDeleteModal;
