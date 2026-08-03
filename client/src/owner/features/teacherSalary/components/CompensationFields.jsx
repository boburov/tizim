// Components
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";

// Utils
import {
  BASE_TYPES,
  VARIABLE_TYPES,
  BASE_TYPE_OPTIONS,
  VARIABLE_TYPE_OPTIONS,
  PERCENT_BASE_OPTIONS,
  VARIABLE_UNIT,
  isPercentType,
  money,
} from "../utils/compensation";

/**
 * MAOSH STAVKASI MAYDONLARI (form emas - faqat maydonlar).
 *
 * Ikki joyda ishlatiladi va IKKALASIDA BIR XIL bo'lishi shart:
 *   1. o'qituvchi yaratish modalining 2-qadami,
 *   2. o'qituvchi profilidagi "Maoshni belgilash/o'zgartirish".
 * Nusxa ko'chirilsa vaqt o'tib ikkisi ajralib ketardi (masalan bir joyda
 * foiz chegarasi tekshirilib, ikkinchisida yo'q).
 *
 * `form` - useObjectState natijasi (setField bilan).
 */
const CompensationFields = ({ form, disabled = false, showEffectiveFrom = true }) => {
  const showBase = form.baseType === BASE_TYPES.FIXED_MONTHLY;
  const showVariable = form.variableType !== VARIABLE_TYPES.NONE;
  const percent = isPercentType(form.variableType);

  // Foiz 100 dan oshmasin - server ham shuni rad etadi, lekin foydalanuvchi
  // xatoni yuborishdan OLDIN ko'rishi kerak.
  const percentInvalid = percent && Number(form.variableRate) > 100;

  return (
    <div className="space-y-3">
      {/* ── 1) FIKSA QISM ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectField
          label="Fiksa (asosiy) qism"
          value={form.baseType}
          onChange={(v) => form.setField("baseType", v)}
          options={BASE_TYPE_OPTIONS}
          disabled={disabled}
        />
        {showBase && (
          <InputField
            name="baseAmount"
            type="money"
            label="Oylik summa (so'm)"
            placeholder="2 000 000"
            value={form.baseAmount}
            onChange={(e) => form.setField("baseAmount", e.target.value)}
            disabled={disabled}
          />
        )}
      </div>

      {showBase && (
        <p className="text-xs text-muted-foreground">
          Bu summa <b>butun markaz</b> uchun. O'qituvchi 1 ta guruhda ishlasa
          ham, 5 ta guruhda ishlasa ham {money(form.baseAmount) || 0} so'm
          bo'lib qoladi. Ishga kirgan/bo'shagan oyda kunlar bo'yicha
          taqsimlanadi.
        </p>
      )}

      {/* ── 2) O'ZGARUVCHI QISM ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectField
          label="O'zgaruvchi qism"
          value={form.variableType}
          onChange={(v) => form.setField("variableType", v)}
          options={VARIABLE_TYPE_OPTIONS}
          disabled={disabled}
        />
        {showVariable && (
          <InputField
            name="variableRate"
            type={percent ? "number" : "money"}
            label={`Stavka (${VARIABLE_UNIT[form.variableType] || ""})`}
            placeholder={percent ? "30" : "50 000"}
            value={form.variableRate}
            error={percentInvalid}
            onChange={(e) => form.setField("variableRate", e.target.value)}
            disabled={disabled}
            {...(percent ? { min: 0, max: 100 } : {})}
          />
        )}
      </div>

      {percentInvalid && (
        <p className="text-xs text-red-600 dark:text-red-300">
          Foiz 100 dan oshmasligi kerak.
        </p>
      )}

      {/* Foiz bazasi - bu MAOSH SIYOSATI, texnik detal emas. */}
      {percent && (
        <>
          <SelectField
            label="Foiz nimadan hisoblanadi"
            value={form.percentBase}
            onChange={(v) => form.setField("percentBase", v)}
            options={PERCENT_BASE_OPTIONS}
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            {form.percentBase === "collected"
              ? "O'quvchi to'lamasa o'qituvchi ham olmaydi - risk bo'linadi."
              : "O'quvchi to'lamasa ham o'qituvchi to'liq oladi - yo'qotish markazda qoladi."}
          </p>
        </>
      )}

      {showVariable && form.variableType === VARIABLE_TYPES.PER_STUDENT && (
        <p className="text-xs text-muted-foreground">
          O'quvchi guruhda o'tkazgan kunlari ulushicha sanaladi: butun oy = 1,
          yarim oy = 0.5. Oy oxirida qo'shilgan o'quvchi uchun to'liq summa
          to'lanmaydi.
        </p>
      )}

      {showVariable && form.variableType === VARIABLE_TYPES.PER_LESSON_HOUR && (
        <p className="text-xs text-muted-foreground">
          Dars soatlari guruh jadvalidan olinadi. Bayram kunlari va bekor
          qilingan darslar hisobga kirmaydi.
        </p>
      )}

      {/* ── 3) AMAL QILISH SANASI ── */}
      {showEffectiveFrom && (
        <InputField
          name="effectiveFrom"
          type="date"
          label="Qaysi sanadan amal qiladi"
          value={form.effectiveFrom}
          onChange={(e) => form.setField("effectiveFrom", e.target.value)}
          disabled={disabled}
          description="Shu sanadan keyingi oylar qayta hisoblanadi. Allaqachon to'langan oylar o'zgarmaydi."
        />
      )}

      <InputField
        name="note"
        label="Izoh (ixtiyoriy)"
        placeholder="Masalan: sinov muddati stavkasi"
        value={form.note}
        onChange={(e) => form.setField("note", e.target.value)}
        disabled={disabled}
      />
    </div>
  );
};

export default CompensationFields;
