// Components
import Button from "@/shared/components/ui/button/Button";
import SelectField from "@/shared/components/ui/select/SelectField";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import { useRoleRemoveMutation } from "../../hooks/useRoleMutations";
import { useRolesQuery } from "../../hooks/useRolesQuery";

// Rolni o'chirish. Rolda foydalanuvchi bo'lsa - avval ularni boshqa rolga
// ko'chirish SHART (aks holda rolsiz foydalanuvchi qolib ketardi).
const RoleDeleteModal = ({ role, close, isLoading, setIsLoading, onDeleted }) => {
  const { data: roles = [] } = useRolesQuery();

  const form = useObjectState({ migrateTo: "", error: "" });
  const { migrateTo, error, setField } = form;

  const hasUsers = (role?.userCount || 0) > 0;

  // O'zidan boshqa, muzlatilmagan rollar.
  const options = roles
    .filter((r) => r.value !== role?.value && !r.isFrozen)
    .map((r) => ({ value: r.value, label: r.label }));

  const { mutate } = useRoleRemoveMutation({
    onSuccess: () => {
      setIsLoading(false);
      onDeleted?.();
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = () => {
    if (hasUsers && !migrateTo) {
      setField("error", "Foydalanuvchilarni ko'chirish uchun rol tanlang");
      return;
    }
    setField("error", "");
    setIsLoading(true);
    mutate({ value: role.value, migrateTo: hasUsers ? migrateTo : undefined });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-semibold">{role?.label}</span> roli butunlay
        o'chiriladi.
      </p>

      {hasUsers && (
        <div className="space-y-3">
          <p className="rounded-lg bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-300 dark:bg-amber-950/40 dark:text-amber-200">
            Bu rolda {role.userCount} ta foydalanuvchi bor. Ularni qaysi rolga
            o'tkazamiz?
          </p>
          <SelectField
            name="migrateTo"
            label="Yangi rol"
            required
            value={migrateTo}
            options={options}
            error={Boolean(error)}
            description={error || ""}
            onChange={(v) => setField("migrateTo", v)}
          />
        </div>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={isLoading}
          onClick={() => close?.()}
        >
          Bekor qilish
        </Button>
        <Button
          type="button"
          variant="danger"
          className="flex-1"
          disabled={isLoading}
          onClick={handleSubmit}
        >
          {isLoading ? "O'chirilmoqda..." : "O'chirish"}
        </Button>
      </div>
    </div>
  );
};

export default RoleDeleteModal;
