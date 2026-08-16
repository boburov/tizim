import InputField from "@/shared/components/ui/input/InputField";

// twoCols - keng modallar uchun (2 ustunli grid), aks holda bitta ustun
//
// ⚠ `maxLength` HAR MAYDONDA ANIQ KO'RSATILADI. `Input` standart holatda
// har qanday matn maydonini 20 belgida KESADI (DEFAULT_MAX_LENGTH), server
// esa nomga 120, manzilga 300 belgi beradi. Ko'rsatilmagan paytda
// "Chilonzor filiali (2-bino)" kabi nom jimgina qirqilib, tahrirlash
// oynasi saqlaganda MAVJUD nomni ham kaltalashtirib yuborardi - hech
// qanday xato xabari bo'lmasdan. Placeholder'ning o'zi ("Masalan:
// Chilonzor filiali", 26 belgi) kiritib bo'lmaydigan uzunlikda edi.
const BranchFormFields = ({
  obj,
  disabled = false,
  showThreshold = false,
  twoCols = false,
}) => (
  <div className={twoCols ? "grid gap-3 sm:grid-cols-2" : "space-y-3"}>
    <InputField
      name="name"
      label="Filial nomi"
      placeholder="Masalan: Chilonzor filiali"
      maxLength={120}
      value={obj.name}
      onChange={(e) => obj.setField("name", e.target.value)}
      required
      disabled={disabled}
    />
    {/* type="tel" -> InputTel (react-imask, "+{998} (00) 000-00-00") */}
    <InputField
      type="tel"
      name="phone"
      label="Telefon"
      value={obj.phone}
      onChange={(e) => obj.setField("phone", e.target.value)}
      disabled={disabled}
    />
    <InputField
      name="address"
      label="Manzil"
      placeholder="Toshkent, Chilonzor 5-kvartal"
      maxLength={300}
      value={obj.address}
      onChange={(e) => obj.setField("address", e.target.value)}
      className={twoCols ? "sm:col-span-2" : ""}
      disabled={disabled}
    />

    {showThreshold && (
      <div className={twoCols ? "sm:col-span-2" : ""}>
        <InputField
          name="expenseApprovalThreshold"
          label="Chiqim limiti (bitta to'lov uchun)"
          type="number"
          placeholder="Masalan: 10000000"
          value={obj.expenseApprovalThreshold}
          onChange={(e) => obj.setField("expenseApprovalThreshold", e.target.value)}
          disabled={disabled}
        />
        <p className="text-xs opacity-60 mt-1">
          Shu summadan katta to'lov tasdiqlashni kutadi
        </p>
      </div>
    )}
  </div>
);

export default BranchFormFields;
