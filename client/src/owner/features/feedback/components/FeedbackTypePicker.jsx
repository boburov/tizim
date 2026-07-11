import SelectField from "@/shared/components/ui/select/SelectField";
import useFeedbackTypesQuery from "../hooks/useFeedbackTypesQuery";

const FeedbackTypePicker = ({
  value,
  onChange,
  disabled = false,
  label = "Tur",
  required = false,
  includeAll = false,
}) => {
  const { data, isLoading } = useFeedbackTypesQuery({ limit: 200 });
  const types = data?.data || [];
  const options = [
    ...(includeAll ? [{ value: "", label: "Barchasi" }] : []),
    ...types.map((t) => ({ value: t._id, label: t.name })),
  ];

  return (
    <SelectField
      searchable
      label={label}
      placeholder="Turini tanlang"
      emptyText="Turlar topilmadi"
      value={value || ""}
      onChange={onChange}
      options={options}
      isLoading={isLoading}
      disabled={disabled}
      required={required}
    />
  );
};

export default FeedbackTypePicker;
