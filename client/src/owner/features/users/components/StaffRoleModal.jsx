// Icons
import { AlertTriangle } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import SelectField from "@/shared/components/ui/select/SelectField";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import { useRolesQuery, useSetUserRoleMutation } from "@/owner/features/roles";

// Constants
import { ROLE_TYPES } from "@/shared/constants/roles";

/**
 * XODIM ROLINI ALMASHTIRISH.
 *
 * Ro'yxatdan tanlanadigan rollar SERVER qoidalariga moslab filtrlangan,
 * shunda foydalanuvchi 400/403 ni tanlagandan keyin emas, umuman ko'rmaydi:
 *   • muzlatilgan rol   - assertRoleAssignable 400 qaytaradi;
 *   • "Ega" tipidagi rol - assertCanGrantRole 403 qaytaradi (va uni UI
 *     orqali berish mahsulot jihatidan ham to'g'ri emas);
 *   • o'quvchi tipidagi rol - xodimni o'quvchiga aylantirish emas.
 *
 * Ogohlantirish MAJBURIY: server rol o'zgargach xodimning BARCHA tirik
 * sessiyalarini bekor qiladi - u hamma qurilmadan chiqib ketadi.
 */
const StaffRoleModal = ({ user, close, isLoading, setIsLoading }) => {
  const obj = useObjectState({ role: user?.role || "" });
  const { data: roles = [] } = useRolesQuery();

  const roleOptions = roles
    .filter(
      (r) =>
        r.roleType !== ROLE_TYPES.STUDENT &&
        r.roleType !== ROLE_TYPES.OWNER &&
        !r.isFrozen,
    )
    .map((r) => ({ value: r.value, label: r.label || r.value }));

  const { mutate } = useSetUserRoleMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const changed = obj.role && obj.role !== user?.role;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!changed) return;
    setIsLoading(true);
    mutate({ userId: user._id, role: obj.role });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm">
        <span className="font-semibold">
          {user?.firstName} {user?.lastName}
        </span>{" "}
        uchun yangi rol tanlang. Hozirgi rol:{" "}
        <span className="font-medium">{user?.roleLabel || user?.role}</span>
      </p>

      <SelectField
        name="role"
        label="Rol"
        placeholder="Rolni tanlang"
        options={roleOptions}
        value={obj.role}
        onChange={(v) => obj.setField("role", v?.target?.value ?? v)}
        disabled={isLoading}
      />

      <div className="flex gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          Rol o'zgartirilgach xodim barcha qurilmalarda tizimdan chiqariladi va
          qaytadan kirishi kerak.
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => close?.()}
          disabled={isLoading}
          className="flex-1"
        >
          Bekor qilish
        </Button>
        <Button
          type="submit"
          disabled={isLoading || !changed}
          className="flex-1"
        >
          {isLoading ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>
    </form>
  );
};

export default StaffRoleModal;
