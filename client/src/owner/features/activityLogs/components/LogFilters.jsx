import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";

// Texnik "metod" o'rniga - ma'noga ega amal turlari
const ACTION_OPTIONS = [
  { value: "", label: "Barcha amallar" },
  { value: "CREATE", label: "Yaratildi" },
  { value: "UPDATE", label: "Tahrirlandi" },
  { value: "DELETE", label: "O'chirildi" },
  { value: "LOGIN", label: "Tizimga kirish" },
];

const RESOURCE_OPTIONS = [
  { value: "", label: "Barcha modullar" },
  { value: "user", label: "Foydalanuvchilar" },
  { value: "group", label: "Guruhlar" },
  { value: "attendance", label: "Davomat" },
  { value: "feedback", label: "Fikr-mulohaza" },
  { value: "notification", label: "Bildirishnomalar" },
  { value: "holiday", label: "Bayramlar" },
];

const LogFilters = ({ filters, onChange }) => (
  <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <SelectField
      label="Amal turi"
      value={filters.action}
      onChange={(v) => onChange("action", v)}
      options={ACTION_OPTIONS}
    />
    <SelectField
      label="Modul"
      value={filters.resourceType}
      onChange={(v) => onChange("resourceType", v)}
      options={RESOURCE_OPTIONS}
    />
    <InputField
      type="date"
      name="fromDate"
      label="Boshlanish sanasi"
      value={filters.fromDate}
      onChange={(e) => onChange("fromDate", e.target.value)}
    />
    <InputField
      type="date"
      name="toDate"
      label="Tugash sanasi"
      value={filters.toDate}
      onChange={(e) => onChange("toDate", e.target.value)}
    />
  </div>
);

export default LogFilters;
