import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import SelectYear from "@/shared/components/ui/select/SelectYear";
import Switch from "@/shared/components/ui/switch/Switch";
import {
  HOLIDAY_AUDIENCE_OPTIONS,
  MONTH_OPTIONS,
} from "@/shared/constants/notification";

const monthSelectOptions = MONTH_OPTIONS.map((o) => ({
  value: String(o.value),
  label: o.label,
}));

const HolidayFormFields = ({ obj, disabled = false }) => (
  <div className="space-y-3">
    <InputField
      name="name"
      label="Bayram nomi"
      placeholder="Masalan: Yangi yil"
      value={obj.name}
      onChange={(e) => obj.setField("name", e.target.value)}
      required
      disabled={disabled}
    />

    <div className="flex items-center justify-between gap-3 border rounded-md px-3 py-2">
      <div>
        <p className="text-sm font-medium">Yillik takrorlanadi</p>
        <p className="text-xs text-muted-foreground">
          Har yili shu sanada avto-yuboriladi
        </p>
      </div>
      <Switch
        checked={!!obj.isRecurring}
        onChange={(v) => obj.setField("isRecurring", v)}
        disabled={disabled}
      />
    </div>

    <div className="grid grid-cols-3 gap-2">
      <SelectField
        label="Oy"
        value={String(obj.month || "")}
        onChange={(v) => obj.setField("month", Number(v))}
        options={monthSelectOptions}
        disabled={disabled}
      />
      <InputField
        name="day"
        label="Kun"
        type="number"
        min="1"
        max="31"
        value={obj.day}
        onChange={(e) => obj.setField("day", e.target.value)}
        required
        disabled={disabled}
      />
      {!obj.isRecurring && (
        <SelectYear
          name="year"
          value={obj.year}
          onChange={(v) => obj.setField("year", v)}
          required
          disabled={disabled}
        />
      )}
    </div>

    <SelectField
      label="Auditoriya"
      value={obj.audience}
      onChange={(v) => obj.setField("audience", v)}
      options={HOLIDAY_AUDIENCE_OPTIONS}
      disabled={disabled}
    />

    <div>
      <label className="text-sm font-medium block mb-1">Tabrik matni</label>
      <textarea
        rows={4}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Tabrik so'zlari..."
        value={obj.message}
        onChange={(e) => obj.setField("message", e.target.value)}
        required
        disabled={disabled}
      />
    </div>
  </div>
);

export default HolidayFormFields;
