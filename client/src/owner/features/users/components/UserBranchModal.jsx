// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import { useUserBranchesMutation } from "../hooks/useStaffMutations";
import { useBranchesQuery } from "@/owner/features/branches";
import { useRolesQuery } from "@/owner/features/roles";

// Components
import SelectField from "@/shared/components/ui/select/SelectField";
import Button from "@/shared/components/ui/button/Button";

// Icons
import { Plus, X } from "lucide-react";

// Constants
import { ROLES } from "@/shared/constants/roles";

/**
 * Foydalanuvchining FILIAL biriktiruvini tahrirlash.
 *
 * homeBranchId      - asosiy filial (yangi hujjatlar shunga yoziladi)
 * branchAssignments - qo'shimcha filiallar, har birida O'Z roli bo'lishi
 *                     mumkin (A da direktor, B da o'qituvchi).
 */
const UserBranchModal = ({ close, isLoading, setIsLoading, data }) => {
  const user = data?.user || {};

  const obj = useObjectState({
    homeBranchId: String(user.homeBranchId?._id || user.homeBranchId || ""),
    assignments: (user.branchAssignments || []).map((a) => ({
      branchId: String(a.branchId?._id || a.branchId || ""),
      role: a.role || "",
    })),
  });

  const { data: branchesData } = useBranchesQuery();
  const { data: roles = [] } = useRolesQuery();
  const branches = branchesData?.data || [];

  const branchOptions = branches.map((b) => ({
    value: String(b._id),
    label: b.name,
  }));
  const roleOptions = [
    { value: "", label: "Asosiy rol (o'zgarishsiz)" },
    ...roles
      .filter((r) => r.value !== ROLES.OWNER && !r.isFrozen)
      .map((r) => ({ value: r.value, label: r.label || r.value })),
  ];

  const { mutate } = useUserBranchesMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const addRow = () =>
    obj.setField("assignments", [...obj.assignments, { branchId: "", role: "" }]);

  const removeRow = (i) =>
    obj.setField(
      "assignments",
      obj.assignments.filter((_, idx) => idx !== i),
    );

  const patchRow = (i, key, value) =>
    obj.setField(
      "assignments",
      obj.assignments.map((a, idx) => (idx === i ? { ...a, [key]: value } : a)),
    );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!obj.homeBranchId) return;
    setIsLoading(true);
    mutate({
      id: user._id,
      homeBranchId: obj.homeBranchId,
      // Bo'sh qatorlar yuborilmasin
      branchAssignments: obj.assignments
        .filter((a) => a.branchId)
        .map((a) => ({ branchId: a.branchId, role: a.role || null })),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <SelectField
        name="homeBranchId"
        label="Asosiy filial"
        placeholder="Filialni tanlang"
        options={branchOptions}
        value={obj.homeBranchId}
        onChange={(v) => obj.setField("homeBranchId", v?.target?.value ?? v)}
        required
        disabled={isLoading}
        description="Yangi guruh va to'lovlar shu filialga yoziladi"
      />

      <div className="space-y-2 pt-2 border-t">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Qo'shimcha filiallar</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            disabled={isLoading}
          >
            <Plus className="size-3.5" />
            Qo'shish
          </Button>
        </div>
        <p className="text-xs opacity-60">
          Xodim bir nechta filialda ishlasa. Har filialda alohida rol berish
          mumkin - masalan bir joyda direktor, boshqasida o'qituvchi.
        </p>

        {obj.assignments.length === 0 && (
          <p className="text-xs opacity-50 py-2">Qo'shimcha filial yo'q</p>
        )}

        {obj.assignments.map((a, i) => (
          <div key={i} className="flex items-end gap-2">
            <SelectField
              name={`branch-${i}`}
              label={i === 0 ? "Filial" : ""}
              placeholder="Filial"
              options={branchOptions}
              value={a.branchId}
              onChange={(v) => patchRow(i, "branchId", v?.target?.value ?? v)}
              disabled={isLoading}
              className="flex-1"
            />
            <SelectField
              name={`role-${i}`}
              label={i === 0 ? "Rol" : ""}
              placeholder="Rol"
              options={roleOptions}
              value={a.role}
              onChange={(v) => patchRow(i, "role", v?.target?.value ?? v)}
              disabled={isLoading}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => removeRow(i)}
              disabled={isLoading}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-2">
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
          disabled={isLoading || !obj.homeBranchId}
          className="flex-1"
        >
          {isLoading ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>
    </form>
  );
};

export default UserBranchModal;
