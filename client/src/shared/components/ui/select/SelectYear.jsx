import SelectField from "./SelectField";

const buildYearOptions = (from, to) => {
  const arr = [];
  for (let y = to; y >= from; y -= 1) {
    arr.push({ value: String(y), label: String(y) });
  }
  return arr;
};

const SelectYear = ({
  value,
  onChange,
  from = 2020,
  to = new Date().getFullYear(),
  label = "Yil",
  placeholder = "Yilni tanlang",
  ...props
}) => {
  const options = buildYearOptions(from, to);
  return (
    <SelectField
      label={label}
      placeholder={placeholder}
      value={value === undefined || value === null ? "" : String(value)}
      onChange={(v) => onChange?.(v === "" ? "" : Number(v))}
      options={options}
      {...props}
    />
  );
};

export default SelectYear;
