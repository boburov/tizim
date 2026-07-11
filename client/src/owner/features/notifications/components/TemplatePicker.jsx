import SelectField from "@/shared/components/ui/select/SelectField";
import useNotificationTemplatesQuery from "@/owner/features/notificationTemplates/hooks/useNotificationTemplatesQuery";

const TemplatePicker = ({ value, onChange, disabled = false }) => {
  const { data, isLoading } = useNotificationTemplatesQuery({ limit: 200 });
  const templates = data?.data || [];

  const options = [
    { value: "", label: "Shablon tanlanmagan" },
    ...templates.map((t) => ({ value: t._id, label: t.name })),
  ];

  const handleChange = (id) => {
    const tpl = templates.find((t) => t._id === id);
    onChange(id || "", tpl);
  };

  return (
    <SelectField
      searchable
      label="Shablon (ixtiyoriy)"
      placeholder="Tayyor matn tanlang"
      value={value || ""}
      onChange={handleChange}
      options={options}
      isLoading={isLoading}
      disabled={disabled}
    />
  );
};

export default TemplatePicker;
