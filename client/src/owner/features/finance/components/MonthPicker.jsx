import SelectField from "@/shared/components/ui/select/SelectField";
import SelectYear from "@/shared/components/ui/select/SelectYear";
import { MONTH_OPTIONS } from "@/shared/constants/calendar";

const monthOptions = MONTH_OPTIONS.map((o) => ({
  value: String(o.value),
  label: o.label,
}));

// Oy + yil tanlash. value: { year, month }, onChange: ({ year, month })
const MonthPicker = ({ year, month, onChange }) => (
  <div className="flex items-end gap-2">
    <div className="w-32">
      <SelectField
        value={String(month)}
        onChange={(v) => onChange({ year: Number(year), month: Number(v) })}
        options={monthOptions}
        className="!gap-1"
      />
    </div>
    <div className="w-28">
      <SelectYear
        label=""
        value={year}
        onChange={(v) => onChange({ year: Number(v), month: Number(month) })}
        className="!gap-1"
      />
    </div>
  </div>
);

export default MonthPicker;
