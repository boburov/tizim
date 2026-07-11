import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import { LEAD_STATUS_OPTIONS } from "@/shared/constants/leadStatus";
import useLeadOptionsQuery from "../hooks/useLeadOptionsQuery";

const withEmpty = (data, placeholder = "-") => [
  { value: "", label: placeholder },
  ...(data?.data || []).map((o) => ({ value: o._id, label: o.name })),
];

const LeadFormFields = ({ obj, disabled = false }) => {
  const sourceQ = useLeadOptionsQuery({ kind: "source" });
  const directionQ = useLeadOptionsQuery({ kind: "direction" });
  const rejectionQ = useLeadOptionsQuery({ kind: "rejection" });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <InputField
          name="firstName"
          label="Ism"
          value={obj.firstName}
          onChange={(e) => obj.setField("firstName", e.target.value)}
          required
          disabled={disabled}
        />
        <InputField
          name="lastName"
          label="Familiya"
          value={obj.lastName}
          onChange={(e) => obj.setField("lastName", e.target.value)}
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InputField
          type="tel"
          name="phone"
          label="Telefon"
          value={obj.phone}
          onChange={(e) => obj.setField("phone", e.target.value)}
          required
          disabled={disabled}
        />
        <InputField
          type="number"
          name="age"
          label="Yoshi"
          min="1"
          max="120"
          value={obj.age}
          onChange={(e) => obj.setField("age", e.target.value)}
          disabled={disabled}
        />
      </div>

      <InputField
        type="tel"
        name="parentPhone"
        label="Ota-ona telefoni"
        value={obj.parentPhone}
        onChange={(e) => obj.setField("parentPhone", e.target.value)}
        disabled={disabled}
      />

      <div className="grid grid-cols-2 gap-3">
        <SelectField
          searchable
          label="Manba"
          value={obj.sourceId}
          onChange={(v) => obj.setField("sourceId", v)}
          options={withEmpty(sourceQ.data)}
          disabled={disabled}
        />
        <SelectField
          searchable
          label="Yo'nalish"
          value={obj.directionId}
          onChange={(v) => obj.setField("directionId", v)}
          options={withEmpty(directionQ.data)}
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Status"
          value={obj.status}
          onChange={(v) => obj.setField("status", v)}
          options={LEAD_STATUS_OPTIONS}
          disabled={disabled}
        />
        <InputField
          type="date"
          name="trialDate"
          label="Sinov darsi sanasi"
          value={obj.trialDate}
          onChange={(e) => obj.setField("trialDate", e.target.value)}
          disabled={disabled}
        />
      </div>

      {obj.status === "rejected" && (
        <SelectField
          searchable
          label="Rad etish sababi"
          value={obj.rejectionReasonId}
          onChange={(v) => obj.setField("rejectionReasonId", v)}
          options={withEmpty(rejectionQ.data)}
          disabled={disabled}
        />
      )}

      <div>
        <label className="text-sm font-medium block mb-1">Izoh</label>
        <textarea
          rows={3}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Qo'shimcha izoh..."
          value={obj.notes}
          onChange={(e) => obj.setField("notes", e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
};

export default LeadFormFields;
