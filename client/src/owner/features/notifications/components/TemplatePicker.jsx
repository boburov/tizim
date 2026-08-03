import CreatableSelectField from "@/shared/components/ui/select/CreatableSelectField";
import { PERMISSIONS } from "@/shared/constants/permissions";
import useNotificationTemplatesQuery from "@/owner/features/notificationTemplates/hooks/useNotificationTemplatesQuery";
import TemplateCreateModal from "@/owner/features/notificationTemplates/components/TemplateCreateModal";

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
    <CreatableSelectField
      searchable
      label="Shablon (ixtiyoriy)"
      placeholder="Tayyor matn tanlang"
      value={value || ""}
      onChange={handleChange}
      options={options}
      isLoading={isLoading}
      disabled={disabled}
      createLabel="Yangi shablon"
      createTitle="Yangi shablon"
      createPermission={PERMISSIONS.NOTIFICATION_TEMPLATES_MANAGE}
      create={<TemplateCreateModal />}
      // Yangi shablon so'rov ro'yxatiga hali tushmagan, shuning uchun
      // `handleChange` ichidagi `templates.find` uni topa olmasdi va xabar
      // matni bo'sh qolardi - yaratilgan obyektni to'g'ridan-to'g'ri uzatamiz.
      onCreated={(tpl) => onChange?.(tpl._id, tpl)}
    />
  );
};

export default TemplatePicker;
