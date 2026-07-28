import InputField from "@/shared/components/ui/input/InputField";

const BranchFormFields = ({ obj, disabled = false, showThreshold = false }) => (
  <div className="space-y-3">
    <InputField
      name="name"
      label="Filial nomi"
      placeholder="Masalan: Chilonzor filiali"
      value={obj.name}
      onChange={(e) => obj.setField("name", e.target.value)}
      required
      disabled={disabled}
    />
    <InputField
      name="code"
      label="Qisqa kod (ixtiyoriy)"
      placeholder="Masalan: CHL"
      value={obj.code}
      onChange={(e) => obj.setField("code", e.target.value)}
      disabled={disabled}
    />
    <InputField
      name="address"
      label="Manzil (ixtiyoriy)"
      placeholder="Toshkent, Chilonzor 5-kvartal"
      value={obj.address}
      onChange={(e) => obj.setField("address", e.target.value)}
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

    {showThreshold && (
      <div>
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
          Shu summadan katta to'lov sizning tasdig'ingizni kutadi. Bo'sh
          qoldirilsa - limit yo'q.
        </p>
      </div>
    )}
  </div>
);

export default BranchFormFields;
