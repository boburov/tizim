// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import InputMoney from "@/shared/components/ui/input/InputMoney";
import SelectField from "@/shared/components/ui/select/SelectField";
import MultiSelectSearch from "@/shared/components/ui/select/MultiSelectSearch";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import { useRolesQuery } from "@/owner/features/roles";
import { useKpiRuleMutation, useKpiTriggersQuery } from "../../hooks/useStaffPayroll";

// Constants
import { ROLE_TYPES } from "@/shared/constants/roles";
import { LEAD_STATUS_OPTIONS } from "@/shared/constants/leadStatus";

const REWARD_TYPE_OPTIONS = [
  { value: "fixed", label: "Qat'iy summa (har hodisa uchun)" },
  { value: "per_unit", label: "Birlik uchun (masalan har kun)" },
  { value: "percent", label: "Foiz (hodisa summasidan)" },
];

// Trigger tushunadigan shartlar. Kalitlar serverdagi `conditionKeys`
// bilan bir xil - noma'lum kalit jimgina e'tiborsiz qoladi.
const CONDITION_FIELDS = {
  minDays: { label: "Necha kun qatnasin", type: "number", hint: "Masalan: 30" },
  minAttendanceRate: {
    label: "Minimal davomat (%)",
    type: "number",
    hint: "Masalan: 80. Belgilanmagan davomat 0% deb hisoblanmaydi.",
  },
  minAmount: { label: "Minimal summa (so'm)", type: "number", hint: "" },
  // lead_created uchun - firibga qarshi ikki darvoza. Ikkalasi ham SHART
  // (kod emas): "lid kiritildi" mukofoti forma to'ldirgani uchun to'lanadi
  // va yozish tekin, shuning uchun ular bo'sh qoldirilmasligi kerak.
  minStatus: {
    label: "Lid kamida shu bosqichga yetsin",
    type: "select",
    options: LEAD_STATUS_OPTIONS,
    hint: "Bo'sh = kiritilgani yetarli. Tavsiya: \"Ma'lumot berildi\" - \"Yangi\" da qolgan lid hech kim ko'tarmagan raqam.",
  },
  dedupeDays: {
    label: "Takroriy raqam oralig'i (kun)",
    type: "number",
    hint: "Bitta telefon shu oraliqda faqat BIR marta to'lanadi. Bo'sh = 90 kun, 0 = tekshiruv o'chirilgan.",
  },
};

/**
 * KPI QOIDASI formasi.
 *
 * Qoida - KONFIGURATSIYA: yangi mukofot turi qo'shish uchun kod
 * o'zgartirilmaydi. Trigger ro'yxati serverdan keladi, shartlar esa
 * tanlangan triggerga qarab ko'rinadi.
 */
const KpiRuleModal = ({ rule, close, isLoading, setIsLoading }) => {
  const { data: triggers = [] } = useKpiTriggersQuery();
  const { data: roles = [] } = useRolesQuery();

  const obj = useObjectState({
    name: rule?.name || "",
    description: rule?.description || "",
    trigger: rule?.trigger || "",
    rewardType: rule?.rewardType || "fixed",
    rewardValue: rule?.rewardValue != null ? String(rule.rewardValue) : "",
    applicableRoles: rule?.applicableRoles || [],
    monthlyCap: rule?.monthlyCap ? String(rule.monthlyCap) : "",
    conditions: rule?.conditions || {},
    enabled: rule?.enabled !== false,
  });

  const { mutate } = useKpiRuleMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const selectedTrigger = triggers.find((t) => t.key === obj.trigger);
  const conditionKeys = selectedTrigger?.conditionKeys || [];

  // Bo'sh qiymat SHARTNI O'CHIRADI - `undefined` yozilsa server uni umuman
  // ko'rmaydi va trigger o'z standartini qo'llaydi. `""` yoki `null`
  // yuborilsa shart "berilgan, lekin bo'sh" bo'lib qolardi.
  const setCondition = (key, value) => {
    const next = { ...obj.conditions };
    if (value === undefined || value === "") delete next[key];
    else next[key] = value;
    obj.setField("conditions", next);
  };

  const roleOptions = roles
    .filter((r) => r.roleType !== ROLE_TYPES.STUDENT)
    .map((r) => ({ value: r.value, label: r.label || r.value }));

  const valid = obj.name.trim() && obj.trigger && Number(obj.rewardValue) > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!valid) return;
    setIsLoading(true);
    mutate({
      id: rule?._id,
      body: {
        name: obj.name.trim(),
        description: obj.description || undefined,
        trigger: obj.trigger,
        rewardType: obj.rewardType,
        rewardValue: Number(obj.rewardValue),
        applicableRoles: obj.applicableRoles,
        monthlyCap: Number(obj.monthlyCap || 0),
        conditions: obj.conditions,
        enabled: obj.enabled,
      },
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-h-[70vh] space-y-3 overflow-y-auto pr-1"
    >
      <InputField
        name="name"
        label="Qoida nomi"
        value={obj.name}
        onChange={(e) => obj.setField("name", e.target.value)}
        placeholder="Masalan: Resepshin konversiyasi"
        required
        disabled={isLoading}
      />

      <SelectField
        name="trigger"
        label="Trigger (nima o'lchanadi)"
        placeholder="Tanlang"
        options={triggers.map((t) => ({ value: t.key, label: t.label }))}
        value={obj.trigger}
        onChange={(v) => obj.setFields({ trigger: v?.target?.value ?? v, conditions: {} })}
        disabled={isLoading}
      />

      {/* Shartlar - tanlangan triggerga qarab */}
      {conditionKeys
        .filter((k) => CONDITION_FIELDS[k])
        .map((k) => {
          const field = CONDITION_FIELDS[k];
          return (
            <div key={k}>
              {field.type === "select" ? (
                <SelectField
                  name={k}
                  label={field.label}
                  placeholder="Bo'sh qoldirish mumkin"
                  options={field.options}
                  value={obj.conditions[k] ?? ""}
                  onChange={(v) =>
                    setCondition(k, v?.target?.value ?? v ?? undefined)
                  }
                  disabled={isLoading}
                />
              ) : (
                <InputField
                  type="number"
                  name={k}
                  label={field.label}
                  value={obj.conditions[k] ?? ""}
                  onChange={(e) =>
                    setCondition(
                      k,
                      e.target.value === "" ? undefined : Number(e.target.value),
                    )
                  }
                  disabled={isLoading}
                />
              )}
              {field.hint ? (
                <p className="mt-1 text-xs text-muted-foreground">{field.hint}</p>
              ) : null}
            </div>
          );
        })}

      <SelectField
        name="rewardType"
        label="Mukofot turi"
        options={REWARD_TYPE_OPTIONS}
        value={obj.rewardType}
        onChange={(v) => obj.setField("rewardType", v?.target?.value ?? v)}
        disabled={isLoading}
      />

      <div>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="rewardValue">
          {obj.rewardType === "percent" ? "Foiz (%)" : "Mukofot summasi"}
        </label>
        {obj.rewardType === "percent" ? (
          <InputField
            type="number"
            name="rewardValue"
            value={obj.rewardValue}
            onChange={(e) => obj.setField("rewardValue", e.target.value)}
            disabled={isLoading}
          />
        ) : (
          <InputMoney
            id="rewardValue"
            name="rewardValue"
            value={obj.rewardValue}
            onChange={(e) => obj.setField("rewardValue", e.target.value)}
            disabled={isLoading}
          />
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium">Qaysi rollarga</label>
        <MultiSelectSearch
          placeholder="Bo'sh qoldirilsa - hamma xodimga"
          options={roleOptions}
          value={obj.applicableRoles}
          onChange={(v) => obj.setField("applicableRoles", v)}
          disabled={isLoading}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="monthlyCap">
          Oylik shift (ixtiyoriy)
        </label>
        <InputMoney
          id="monthlyCap"
          name="monthlyCap"
          value={obj.monthlyCap}
          onChange={(e) => obj.setField("monthlyCap", e.target.value)}
          placeholder="0 = cheksiz"
          disabled={isLoading}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Noto'g'ri sozlangan qoida byudjetni yeb qo'ymasligi uchun.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={obj.enabled}
          onChange={(e) => obj.setField("enabled", e.target.checked)}
          disabled={isLoading}
        />
        Qoida yoqilgan
      </label>

      <div className="sticky bottom-0 flex gap-2 bg-card pt-2">
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

export default KpiRuleModal;
