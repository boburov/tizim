// React
import { useMemo } from "react";

// Components
import SelectField from "@/shared/components/ui/select/SelectField";

// Hooks
import useUsersListQuery from "@/owner/features/users/hooks/useUsersListQuery";

// Constants
import { ROLES } from "@/shared/constants/roles";

// O'qituvchi tanlash - searchable SelectField (qidiruvli). value/onChange/disabled
// interfeysi o'zgarmadi.
const TeacherSinglePicker = ({ value = "", onChange, disabled = false }) => {
  const { data } = useUsersListQuery({ role: ROLES.TEACHER, limit: 200 });

  const options = useMemo(
    () =>
      (data?.data || []).map((t) => ({
        value: t._id,
        label: `${t.firstName} ${t.lastName || ""}`.trim(),
      })),
    [data],
  );

  return (
    <SelectField
      searchable
      required
      label="O'qituvchi"
      placeholder="O'qituvchi tanlang..."
      value={value}
      onChange={(v) => onChange(v)}
      options={options}
      disabled={disabled}
    />
  );
};

export default TeacherSinglePicker;
