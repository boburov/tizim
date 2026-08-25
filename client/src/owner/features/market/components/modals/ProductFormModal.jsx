// React
import { useEffect } from "react";

// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import Switch from "@/shared/components/ui/switch/Switch";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import usePermissions from "@/shared/hooks/usePermissions";
import useCoinConfig from "@/shared/hooks/useCoinConfig";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";

// Mutations
import {
  useProductCreateMutation,
  useProductUpdateMutation,
} from "../../hooks/useMarketMutations";

const EMPTY = {
  name: "",
  description: "",
  imageUrl: "",
  price: 10,
  unlimited: true,
  stock: 1,
  deliveryInfo: "",
  deliveryDays: 0,
  isActive: true,
  centerWide: false,
};

/**
 * MAHSULOT FORMASI — yaratish VA tahrirlash (bitta modal).
 *
 * ── `unlimited` KALIT NEGA ALOHIDA ──
 * Serverda zaxira `null` (cheksiz) yoki son. HTML raqam maydoni
 * `null` ni ifodalay olmaydi: bo'sh qiymat `""` bo'ladi va u
 * `Number("")` → `0` ga aylanardi, ya'ni "cheksiz" JIMGINA
 * "tugagan" ga aylanib qolardi. Kalit bu ikki holatni ochiq
 * ajratadi.
 *
 * ── YETKAZISH SHARTI MAJBURIY EMAS, LEKIN MUHIM ──
 * `deliveryInfo` o'quvchiga yuboriladigan xabarga TUSHADI ("qanday
 * olaman"). Bo'sh qoldirilsa xabar yarim bo'ladi — shuning uchun
 * maydon tavsifida buni ochiq aytamiz.
 */
const ProductFormModal = ({ close, isLoading, setIsLoading, product }) => {
  const isEdit = Boolean(product?._id);
  const { has } = usePermissions();
  const { coinLabel } = useCoinConfig();
  // Markaz umumiy mahsuloti — server ham AYNI ruxsatni talab qiladi
  // (`market.service.ts` → `isOrgLevel`). Ikki tomon bir xil kalitga
  // tayanadi, aks holda tugma ko'rinib, so'rov 403 bilan qaytardi.
  const canCenterWide = has(PERMISSIONS.BRANCHES_VIEW_ALL);

  const { state, setField, setFields } = useObjectState(EMPTY);

  useEffect(() => {
    if (!product) {
      setFields(EMPTY);
      return;
    }
    setFields({
      name: product.name || "",
      description: product.description || "",
      imageUrl: product.imageUrl || "",
      price: product.price ?? 10,
      unlimited: product.stock === null || product.stock === undefined,
      stock: product.stock ?? 1,
      deliveryInfo: product.deliveryInfo || "",
      deliveryDays: product.deliveryDays ?? 0,
      isActive: product.isActive ?? true,
      centerWide: !product.branchId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?._id]);

  const done = () => {
    setIsLoading(false);
    close?.();
  };
  const fail = () => setIsLoading(false);

  const { mutate: create } = useProductCreateMutation({ onSuccess: done, onError: fail });
  const { mutate: update } = useProductUpdateMutation({ onSuccess: done, onError: fail });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!state.name.trim()) return;

    const body = {
      name: state.name.trim(),
      description: state.description.trim(),
      imageUrl: state.imageUrl.trim(),
      price: Number(state.price) || 0,
      stock: state.unlimited ? null : Number(state.stock) || 0,
      deliveryInfo: state.deliveryInfo.trim(),
      deliveryDays: Number(state.deliveryDays) || 0,
      isActive: state.isActive,
    };

    setIsLoading(true);
    if (isEdit) {
      // ⚠ `branchId` TAHRIRLASHDA YUBORILMAYDI. Mahsulotning filialini
      // keyin ko'chirish uning buyurtmalari bilan ko'lam bo'yicha
      // mos kelmay qolishiga olib kelardi (buyurtmada xaridorning
      // filiali muzlatilgan).
      update({ id: product._id, body });
    } else {
      create({ ...body, ...(canCenterWide && state.centerWide ? { branchId: null } : {}) });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <InputField
        name="name"
        label="Nomi"
        placeholder="Masalan: Sovg'a daftar"
        maxLength={120}
        value={state.name}
        onChange={(e) => setField("name", e.target.value)}
        required
        autoFocus
        disabled={isLoading}
      />

      <InputField
        name="description"
        label="Tavsif"
        placeholder="Qisqacha izoh"
        maxLength={300}
        value={state.description}
        onChange={(e) => setField("description", e.target.value)}
        disabled={isLoading}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          type="number"
          name="price"
          label={`Narxi (${coinLabel})`}
          min={0}
          value={state.price}
          onChange={(e) => setField("price", e.target.value)}
          required
          disabled={isLoading}
        />
        <InputField
          type="number"
          name="deliveryDays"
          label="Necha kunda yetadi"
          description="0 = darhol beriladi"
          min={0}
          max={365}
          value={state.deliveryDays}
          onChange={(e) => setField("deliveryDays", e.target.value)}
          disabled={isLoading}
        />
      </div>

      <InputField
        name="deliveryInfo"
        label="Qanday olinadi"
        description="O'quvchiga yuboriladigan xabarga aynan shu matn tushadi"
        placeholder="Masalan: Qabulxonadan pasport bilan olib ketiladi"
        maxLength={200}
        value={state.deliveryInfo}
        onChange={(e) => setField("deliveryInfo", e.target.value)}
        disabled={isLoading}
      />

      <InputField
        name="imageUrl"
        label="Rasm havolasi"
        placeholder="https://..."
        maxLength={500}
        value={state.imageUrl}
        onChange={(e) => setField("imageUrl", e.target.value)}
        disabled={isLoading}
      />

      <div className="space-y-3 rounded-md border border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Cheksiz zaxira</p>
            <p className="text-xs text-muted-foreground">
              Sertifikat, raqamli sovg'a — soni cheklanmagan
            </p>
          </div>
          <Switch
            checked={state.unlimited}
            onChange={(v) => setField("unlimited", v)}
            disabled={isLoading}
            aria-label="Cheksiz zaxira"
          />
        </div>

        {!state.unlimited && (
          <InputField
            type="number"
            name="stock"
            label="Nechta bor"
            min={0}
            value={state.stock}
            onChange={(e) => setField("stock", e.target.value)}
            disabled={isLoading}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Marketda ko'rinsin</p>
          <p className="text-xs text-muted-foreground">
            O'chirilsa o'quvchilar ro'yxatida chiqmaydi
          </p>
        </div>
        <Switch
          checked={state.isActive}
          onChange={(v) => setField("isActive", v)}
          disabled={isLoading}
          aria-label="Faol"
        />
      </div>

      {!isEdit && canCenterWide && (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Butun markaz uchun</p>
            <p className="text-xs text-muted-foreground">
              O'chirilsa faqat joriy filial o'quvchilariga ko'rinadi
            </p>
          </div>
          <Switch
            checked={state.centerWide}
            onChange={(v) => setField("centerWide", v)}
            disabled={isLoading}
            aria-label="Butun markaz uchun"
          />
        </div>
      )}

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
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? "Saqlanmoqda..." : isEdit ? "Saqlash" : "Qo'shish"}
        </Button>
      </div>
    </form>
  );
};

export default ProductFormModal;
