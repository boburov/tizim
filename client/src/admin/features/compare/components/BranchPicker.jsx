// Components
import SelectField from "@/shared/components/ui/select/SelectField";

/**
 * FILIAL TANLAGICH - CHECKBOX'LI KO'P TANLOV.
 *
 * `SelectField multiple` ostida `MultiSelectSearch` turadi: har qator
 * yonida katakcha, tanlangach ro'yxat YOPILMAYDI (ketma-ket bir necha
 * filial belgilash uchun). Yangi komponent YOZILMADI - u qidiruv,
 * klaviatura navigatsiyasi va mobil xatti-harakati bilan birga
 * allaqachon tekshirilgan.
 *
 * "BARCHASI" TUGMASI ALOHIDA: `MultiSelectSearch` ichida "hammasini
 * belgilash" qatori yo'q, uni ro'yxat ichiga qo'shish esa oddiy filial
 * bilan bir xil ko'rinardi va "Barchasi" nomli filial bordek tuyulardi.
 *
 * BO'SH TANLOV = HAMMASI. Bu ataylab: sahifa birinchi ochilganda
 * foydalanuvchi hech narsa tanlamagan bo'ladi va u holda BO'SH jadval
 * emas, TO'LIQ ko'rinish chiqishi kerak. Tanlov - bu FILTR, "noldan
 * yig'ish" emas.
 */
const BranchPicker = ({ branches = [], value = [], onChange }) => {
  const options = branches.map((b) => ({
    value: String(b._id || b.id),
    label: b.name,
  }));

  const allSelected = value.length === 0 || value.length === options.length;

  return (
    <div className="flex items-center gap-2">
      <SelectField
        multiple
        name="branches"
        className="min-w-[13rem]"
        options={options}
        value={value}
        onChange={(v) => onChange(Array.isArray(v) ? v : [])}
        placeholder="Barcha filiallar"
        searchPlaceholder="Filial qidirish..."
        emptyText="Filial topilmadi"
      />

      {/* Tanlovni bekor qilish - faqat filtr FAOL bo'lganda ko'rinadi.
          Doim turgan, lekin hech narsa qilmaydigan tugma foydalanuvchini
          "nimadir o'zgaradimi?" deb sinab ko'rishga majburlaydi. */}
      {!allSelected && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="shrink-0 text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          Barchasi
        </button>
      )}
    </div>
  );
};

export default BranchPicker;
