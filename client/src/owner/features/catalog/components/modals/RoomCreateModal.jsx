// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import useActiveBranch from "@/shared/hooks/useActiveBranch";

// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";

// Hooks (feature)
import { useRoomCreateMutation } from "../../hooks/useCatalogQueries";

/**
 * XONA yaratish - tezkor forma.
 *
 * Majburiy maydon FAQAT bitta: nom. Sig'im va maydon ixtiyoriy, chunki
 * ular ko'pincha keyin, xona jihozlangach aniqlanadi - ularni majburiy
 * qilish "hozir kiritolmayman" degan foydalanuvchini butun amaldan
 * qaytarardi.
 *
 * ═══════════════════════════════════════════════════════════════════
 * FILIAL TANLASH FAQAT "BARCHA FILIALLAR" REJIMIDA CHIQADI.
 *
 * Server `resolveBranchForWrite` orqali yozishni DOIM aniq filialga
 * bog'laydi va "barcha filiallar" rejimida 400 qaytaradi - qaysi
 * filialga xona qo'shilishini taxmin qilib bo'lmaydi (rooms.service.js).
 * Shuning uchun bu rejimda tanlagich ko'rsatiladi; aks holda filial
 * kontekstdan olinadi va maydon umuman ko'rinmaydi (bitta filialli
 * markazda u faqat shovqin).
 * ═══════════════════════════════════════════════════════════════════
 */
const RoomCreateModal = ({ close, isLoading, setIsLoading, onCreated, branchId: fixedBranchId }) => {
  const { branches, isAllBranches, hasMultipleBranches } = useActiveBranch();

  const obj = useObjectState({
    name: "",
    capacity: "",
    areaM2: "",
    branchId: "",
  });

  const { mutate } = useRoomCreateMutation({
    onSuccess: (data) => {
      setIsLoading(false);
      onCreated?.(data);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  // FILIAL KARTASIDAN CHAQIRILGANDA (`branchId` prop) tanlagich
  // UMUMAN chiqmaydi: foydalanuvchi allaqachon A filialining ichida
  // turibdi va unga "qaysi filial?" deb savol berish — kontekstni
  // yo'qotgandek ko'rinadi. Yomoni, u yerda BOSHQA filialni tanlash
  // mumkin bo'lardi va xona noto'g'ri joyda paydo bo'lardi.
  const pinned = Boolean(fixedBranchId);

  // Tanlagich faqat shu shartda kerak: ko'p filial bor VA hozir aniq
  // filial tanlanmagan VA kontekstdan filial berilmagan.
  const needsBranch = !pinned && hasMultipleBranches && isAllBranches;

  const branchOptions = branches.map((b) => ({
    value: b._id || b.id,
    label: b.name,
  }));

  const isValid = Boolean(obj.name.trim()) && (!needsBranch || obj.branchId);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) return;
    setIsLoading(true);
    mutate({
      name: obj.name.trim(),
      // Bo'sh maydon `null` bo'lib ketadi, `0` EMAS: "sig'imi 0 ta xona"
      // bilan "sig'imi kiritilmagan xona" boshqa-boshqa gap.
      capacity: obj.capacity === "" ? null : Number(obj.capacity),
      areaM2: obj.areaM2 === "" ? null : Number(obj.areaM2),
      // Kontekstdan kelgan filial USTUN turadi. Berilmasa — tanlangani,
      // u ham bo'lmasa server aktiv filialdan oladi
      // (`resolveBranchForWrite`).
      ...(pinned ? { branchId: fixedBranchId } : needsBranch ? { branchId: obj.branchId } : {}),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <InputField
        autoFocus
        name="name"
        label="Xona nomi"
        placeholder="masalan: 201-xona"
        // Server 80 gacha qabul qiladi (`rooms/validators/create.validator.js`).
        // Ko'rsatilmasa `Input` 20 belgida jimgina kesardi.
        maxLength={80}
        value={obj.name}
        onChange={(e) => obj.setField("name", e.target.value)}
        disabled={isLoading}
      />

      {needsBranch && (
        <SelectField
          name="branchId"
          label="Filial"
          options={branchOptions}
          value={obj.branchId}
          onChange={(v) => obj.setField("branchId", v?.target?.value ?? v)}
          disabled={isLoading}
          description="Xona qaysi filialga tegishli"
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <InputField
          type="number"
          min="0"
          name="capacity"
          label="Sig'imi"
          placeholder="Ixtiyoriy"
          value={obj.capacity}
          onChange={(e) => obj.setField("capacity", e.target.value)}
          disabled={isLoading}
          description="Necha kishi sig'adi"
        />
        <InputField
          type="number"
          min="0"
          step="0.1"
          name="areaM2"
          label="Maydoni"
          placeholder="Ixtiyoriy"
          value={obj.areaM2}
          onChange={(e) => obj.setField("areaM2", e.target.value)}
          disabled={isLoading}
          description="kv.m"
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
        <Button type="submit" disabled={isLoading || !isValid} className="flex-1">
          {isLoading ? "Saqlanmoqda..." : "Qo'shish"}
        </Button>
      </div>
    </form>
  );
};

export default RoomCreateModal;
