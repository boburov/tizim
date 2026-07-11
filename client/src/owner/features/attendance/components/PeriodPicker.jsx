import SelectField from "@/shared/components/ui/select/SelectField";
import SelectYear from "@/shared/components/ui/select/SelectYear";

const MONTHS = [
  { value: "1", label: "Yanvar" },
  { value: "2", label: "Fevral" },
  { value: "3", label: "Mart" },
  { value: "4", label: "Aprel" },
  { value: "5", label: "May" },
  { value: "6", label: "Iyun" },
  { value: "7", label: "Iyul" },
  { value: "8", label: "Avgust" },
  { value: "9", label: "Sentabr" },
  { value: "10", label: "Oktabr" },
  { value: "11", label: "Noyabr" },
  { value: "12", label: "Dekabr" },
];

const PeriodPicker = ({ year, month, onChange }) => (
  <div className="flex items-end gap-2">
    <SelectField
      label="Oy"
      value={String(month)}
      onChange={(v) => onChange({ year: Number(year), month: Number(v) })}
      options={MONTHS}
      className="!gap-1"
    />
    <SelectYear
      value={year}
      onChange={(v) => onChange({ year: v, month: Number(month) })}
      className="!gap-1 w-28"
    />
  </div>
);

export default PeriodPicker;
