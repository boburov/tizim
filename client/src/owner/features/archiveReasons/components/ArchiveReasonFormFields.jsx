import InputField from "@/shared/components/ui/input/InputField";

const ArchiveReasonFormFields = ({ obj, disabled = false }) => (
  <InputField
    name="title"
    label="Sabab sarlavhasi"
    placeholder="Masalan: Boshqa markazga o'tdi"
    value={obj.title}
    onChange={(e) => obj.setField("title", e.target.value)}
    required
    disabled={disabled}
  />
);

export default ArchiveReasonFormFields;
