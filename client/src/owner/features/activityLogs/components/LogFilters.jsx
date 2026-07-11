import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";

const METHOD_OPTIONS = [
  { value: "", label: "Barcha metodlar" },
  { value: "POST", label: "POST" },
  { value: "PATCH", label: "PATCH" },
  { value: "PUT", label: "PUT" },
  { value: "DELETE", label: "DELETE" },
];

const RESOURCE_OPTIONS = [
  { value: "", label: "Barcha resurslar" },
  { value: "user", label: "Foydalanuvchi" },
  { value: "group", label: "Guruh" },
  { value: "feedback", label: "Fikr-mulohaza" },
  { value: "holiday", label: "Bayram" },
  { value: "notification", label: "Bildirishnoma" },
  { value: "attendance", label: "Davomat" },
];

const LogFilters = ({ filters, onChange }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
    <SelectField
      label="Metod"
      value={filters.method}
      onChange={(v) => onChange("method", v)}
      options={METHOD_OPTIONS}
    />
    <SelectField
      label="Resurs"
      value={filters.resourceType}
      onChange={(v) => onChange("resourceType", v)}
      options={RESOURCE_OPTIONS}
    />
    <InputField
      type="date"
      name="fromDate"
      label="Kimdan"
      value={filters.fromDate}
      onChange={(e) => onChange("fromDate", e.target.value)}
    />
    <InputField
      type="date"
      name="toDate"
      label="Kimgacha"
      value={filters.toDate}
      onChange={(e) => onChange("toDate", e.target.value)}
    />
  </div>
);

export default LogFilters;
