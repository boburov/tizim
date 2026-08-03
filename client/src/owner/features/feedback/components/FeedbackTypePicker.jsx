import CreatableSelectField from "@/shared/components/ui/select/CreatableSelectField";
import { PERMISSIONS } from "@/shared/constants/permissions";
import useFeedbackTypesQuery from "../hooks/useFeedbackTypesQuery";
import FeedbackTypeCreateModal from "./modals/FeedbackTypeCreateModal";

// `creatable` default'i `!includeAll`: `includeAll` FILTR rejimining belgisi
// ("Barchasi" varianti bor), filtrda esa yangi tur yaratish ma'nosiz - odam
// ro'yxatni suzayapti, ma'lumot kiritmayapti.
const FeedbackTypePicker = ({
  value,
  onChange,
  disabled = false,
  label = "Tur",
  required = false,
  includeAll = false,
  creatable = !includeAll,
}) => {
  const { data, isLoading } = useFeedbackTypesQuery({ limit: 200 });
  const types = data?.data || [];
  const options = [
    ...(includeAll ? [{ value: "", label: "Barchasi" }] : []),
    ...types.map((t) => ({ value: t._id, label: t.name })),
  ];

  return (
    <CreatableSelectField
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
      createLabel="Yangi tur"
      createTitle="Yangi feedback turi"
      createPermission={PERMISSIONS.FEEDBACK_TYPES_MANAGE}
      create={creatable ? <FeedbackTypeCreateModal /> : null}
      onCreated={(t) => onChange?.(t._id)}
    />
  );
};

export default FeedbackTypePicker;
