// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import InputMoney from "@/shared/components/ui/input/InputMoney";
import SelectField from "@/shared/components/ui/select/SelectField";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import {
  useSetCompensationMutation,
  usePayrollStartMutation,
} from "../../hooks/useStaffPayroll";

// Utils
import { toDateInput } from "@/shared/utils/formatDate";

const SALARY_TYPE_OPTIONS = [
  { value: "fixed", label: "Qat'iy oylik (KPI yo'q)" },
  { value: "fixed_plus_kpi", label: "Oylik + KPI" },
  { value: "kpi_only", label: "Faqat KPI (oyliksiz)" },
];

/**
 * MAOSH SHARTNOMASI.
 *
 * Yangi shartnoma eskisini YOPADI va tarix saqlanadi: martdagi oshirish
 * yanvar maoshini qayta yozmaydi. Shuning uchun "amal qilish sanasi"
 * majburiy va o'tmishdagi oylar tegilmaydi.
 */
const CompensationModal = ({ employee, active, close, isLoading, setIsLoading }) => {
  const obj = useObjectState({
    salaryType: active?.salaryType || "fixed",
    baseAmount: active?.baseAmount ? String(active.baseAmount) : "",
    effectiveFrom: toDateInput(new Date()),
    note: "",
    // MIGRATSIYA: oldingi maoshlar boshqa tizimda to'langanmi.
    alreadyPaidBefore: Boolean(employee?.payrollStartFrom),
  });

  const { mutate: setPayrollStart } = usePayrollStartMutation();
  const activationWas = Boolean(employee?.payrollStartFrom);

  const { mutate } = useSetCompensationMutation({
    onSuccess: () => {
      // MOLIYAVIY CHEGARA shartnoma bilan BIRGA qo'yiladi: aks holda
      // shartnoma ochilishi bilanoq oylik job o'tgan oylarni yaratib
      // yuborishi mumkin edi.
      //
      // Faqat ATAYLAB o'zgartirilganda yuboriladi: tarix mavjud bo'lsa
      // server tasdiq va sabab talab qiladi, va har saqlashda uni
      // qayta-qayta so'rash noto'g'ri bo'lardi.
      if (obj.alreadyPaidBefore !== activationWas) {
        setPayrollStart({
          employeeId: employee?._id,
          payrollStartFrom: obj.alreadyPaidBefore ? obj.effectiveFrom : null,
          confirm: true,
          reason: obj.alreadyPaidBefore
            ? "Oldingi maoshlar boshqa tizimda to'langan (migratsiya)"
            : "Maosh hisobi chegarasi olib tashlandi",
        });
      }
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const isKpiOnly = obj.salaryType === "kpi_only";
  const valid = isKpiOnly || Number(obj.baseAmount) >= 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!valid) return;
    setIsLoading(true);
    mutate({
      employee: employee?._id,
      salaryType: obj.salaryType,
      baseAmount: isKpiOnly ? 0 : Number(obj.baseAmount || 0),
      effectiveFrom: obj.effectiveFrom,
      note: obj.note || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {employee?.firstName} {employee?.lastName}
        </span>{" "}
        uchun maosh shartnomasi. Amaldagisi yopiladi, tarix saqlanadi.
      </p>

      <SelectField
        name="salaryType"
        label="Maosh turi"
        options={SALARY_TYPE_OPTIONS}
        value={obj.salaryType}
        onChange={(v) => obj.setField("salaryType", v?.target?.value ?? v)}
        disabled={isLoading}
      />

      {!isKpiOnly && (
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="baseAmount">
            Oylik summa
          </label>
          <InputMoney
            id="baseAmount"
            name="baseAmount"
            value={obj.baseAmount}
            onChange={(e) => obj.setField("baseAmount", e.target.value)}
            placeholder="0"
            disabled={isLoading}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Ishga kirgan yoki bo'shagan oyda kunlar bo'yicha bo'lib hisoblanadi.
          </p>
        </div>
      )}

      <InputField
        type="date"
        name="effectiveFrom"
        label="Amal qilish sanasi"
        value={obj.effectiveFrom}
        onChange={(e) => obj.setField("effectiveFrom", e.target.value)}
        required
        disabled={isLoading}
      />

      <InputField
        name="note"
        label="Izoh (ixtiyoriy)"
        value={obj.note}
        onChange={(e) => obj.setField("note", e.target.value)}
        disabled={isLoading}
      />

      {/* MIGRATSIYA SAVOLI. Markazlar boshqa CRM'dan ko'chib keladi va
          o'tgan oylarning maoshi allaqachon to'langan bo'ladi - tizim
          ularni qaytadan yaratmasligi kerak. */}
      <label className="flex items-start gap-2.5 rounded-md border bg-muted/50 p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={obj.alreadyPaidBefore}
          onChange={(e) => obj.setField("alreadyPaidBefore", e.target.checked)}
          disabled={isLoading}
        />
        <span>
          <span className="font-medium">
            Oldingi maoshlar boshqa tizimda to'langan
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Belgilansa, tizim yuqoridagi sanadan OLDINGI oylar uchun maosh
            umuman yaratmaydi - tarix faqat HR ma'lumoti sifatida qoladi.
          </span>
        </span>
      </label>

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
        <Button type="submit" disabled={isLoading || !valid} className="flex-1">
          {isLoading ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>
    </form>
  );
};

export default CompensationModal;
