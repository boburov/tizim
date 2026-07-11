// Components
import SelectField from "./SelectField";

// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API
import { usersAPI } from "@/owner/features/users/api/users.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

const defaultFormatUserFunc = (user) => ({
  value: user._id,
  label: `${user.firstName} ${user.lastName || ""} (${user.role})`,
});

const SelectAllUsers = ({
  label = "Foydalanuvchi",
  formatUsers = defaultFormatUserFunc,
  role,
  ...props
}) => {
  const params = role ? { role, limit: 200 } : { limit: 200 };
  const { data } = useQuery({
    queryKey: qk.users.list(params),
    queryFn: () => usersAPI.list(params).then((res) => res.data.data),
  });
  const users = data || [];

  return (
    <SelectField
      required
      searchable
      label={label}
      options={users.map(formatUsers)}
      emptyText="Foydalanuvchi topilmadi"
      placeholder="Foydalanuvchini tanlang"
      {...props}
    />
  );
};

export default SelectAllUsers;
