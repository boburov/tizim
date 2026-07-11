import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import { TEMPLATE_CATEGORY_OPTIONS } from "@/shared/constants/notification";

const TemplateFormFields = ({ obj, disabled = false }) => (
  <div className="space-y-3">
    <InputField
      name="name"
      label="Shablon nomi"
      placeholder="Masalan: Bayram tabrigi"
      value={obj.name}
      onChange={(e) => obj.setField("name", e.target.value)}
      required
      disabled={disabled}
    />
    <SelectField
      label="Kategoriya"
      value={obj.category}
      onChange={(v) => obj.setField("category", v)}
      options={TEMPLATE_CATEGORY_OPTIONS}
      disabled={disabled}
    />
    <div>
      <label className="text-sm font-medium block mb-1">Matn</label>
      <textarea
        rows={5}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Xabar matni..."
        value={obj.body}
        onChange={(e) => obj.setField("body", e.target.value)}
        required
        disabled={disabled}
      />
    </div>
  </div>
);

export default TemplateFormFields;
