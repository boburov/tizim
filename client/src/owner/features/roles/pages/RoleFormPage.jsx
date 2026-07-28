// React
import { useEffect } from "react";

// Router
import { useNavigate, useParams } from "react-router-dom";

// Icons
import { Snowflake, Trash2, Save } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import BackLink from "@/shared/components/ui/link/BackLink";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import AccessSections from "../components/AccessSections";
import RolePresetPicker from "../components/RolePresetPicker";
import RoleFreezeModal from "../components/modals/RoleFreezeModal";
import RoleDeleteModal from "../components/modals/RoleDeleteModal";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import useModal from "@/shared/hooks/useModal";
import { useRolesQuery, useRolesMatrixQuery } from "../hooks/useRolesQuery";
import {
  useRoleCreateMutation,
  useRoleUpdateMutation,
} from "../hooks/useRoleMutations";

// Utils
import { isSameSelection } from "../utils/access.utils";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { ROLE_TYPES, ROLE_TYPE_LABELS } from "@/shared/constants/roles";

const ROLE_TYPE_OPTIONS = Object.values(ROLE_TYPES).map((value) => ({
  value,
  label: ROLE_TYPE_LABELS[value],
}));

// Yangi rol "Ega" tipida yaratilmaydi - bu to'liq kirish demak.
const CREATE_TYPE_OPTIONS = ROLE_TYPE_OPTIONS.filter(
  (o) => o.value !== ROLE_TYPES.OWNER,
);

const ROLES_PATH = "/owner/roles";

// Rol yaratish/tahrirlash - alohida sahifa.
// Ilgari bu tor modal ichida edi: ruxsatlar jadvali sig'masdi, gorizontal
// scroll'da sarlavhalar yo'qolib, qaysi katak nimani bildirishi ko'rinmasdi.
const RoleFormPage = ({ mode = "edit" }) => {
  const { value } = useParams();
  const navigate = useNavigate();
  const { openModal } = useModal();

  const isCreate = mode === "create";

  const { data: roles = [], isLoading, isError, refetch } = useRolesQuery();
  const { data: matrix, isLoading: isMatrixLoading } = useRolesMatrixQuery();

  const role = isCreate ? null : roles.find((r) => r.value === value) || null;

  const form = useObjectState({
    label: "",
    description: "",
    roleType: ROLE_TYPES.STAFF,
    selected: new Set(),
    // Saqlanmagan o'zgarishni aniqlash uchun boshlang'ich holat.
    initial: new Set(),
    error: "",
  });
  const {
    label,
    description,
    roleType,
    selected,
    initial,
    error,
    setField,
    setFields,
  } = form;

  // Rol yuklangach formani to'ldiramiz.
  useEffect(() => {
    if (isCreate || !role) return;
    const ids = new Set(role.permissionIds || []);
    setFields({
      label: role.label || "",
      description: role.description || "",
      roleType: role.roleType || ROLE_TYPES.STAFF,
      selected: ids,
      initial: new Set(ids),
      error: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role?.value, role?.updatedAt, isCreate]);

  const { mutate: createRole, isPending: isCreating } = useRoleCreateMutation({
    onSuccess: (data) => navigate(`${ROLES_PATH}/${data.value}`, { replace: true }),
  });
  const { mutate: updateRole, isPending: isUpdating } = useRoleUpdateMutation({
    onSuccess: (data) => setField("initial", new Set(data.permissionIds || [])),
  });

  const isSaving = isCreating || isUpdating;
  const isSystem = Boolean(role?.isSystem);
  const isDirty =
    isCreate ||
    !isSameSelection(selected, initial) ||
    label !== (role?.label || "") ||
    description !== (role?.description || "") ||
    roleType !== (role?.roleType || ROLE_TYPES.STAFF);

  if (isError) return <ErrorState onRetry={refetch} />;

  // Tahrirlash rejimida rol topilmasa (o'chirilgan yoki noto'g'ri URL).
  if (!isCreate && !isLoading && !role) {
    return (
      <div className="space-y-4">
        <BackLink to={ROLES_PATH} label="Rollar" />
        <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
          Bunday rol topilmadi
        </div>
      </div>
    );
  }

  const handleSave = () => {
    const trimmed = label.trim();
    if (trimmed.length < 2) {
      setField("error", "Rol nomi kamida 2 ta belgidan iborat bo'lsin");
      return;
    }
    setField("error", "");

    const body = { description, permissionIds: [...selected] };
    // Tizim rolida nom/tip o'zgarmaydi - serverga ham yubormaymiz.
    if (!isSystem) {
      body.label = trimmed;
      body.roleType = roleType;
    }

    if (isCreate) createRole({ ...body, label: trimmed, roleType });
    else updateRole({ value: role.value, body });
  };

  const isBusy = isLoading || isMatrixLoading;

  return (
    <div className="space-y-5 pb-24">
      {/* Sarlavha */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <BackLink to={ROLES_PATH} />
          <div>
            <h1 className="text-2xl font-semibold">
              {isCreate ? "Yangi rol" : role?.label}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Rol tizimning qaysi qismlariga kira olishini belgilang
            </p>
          </div>
        </div>

        {!isCreate && !isSystem && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => openModal(MODAL.ROLE_FREEZE, { role })}
            >
              <Snowflake className="mr-1.5 size-4" />
              {role?.isFrozen ? "Muzdan chiqarish" : "Muzlatish"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-red-600 hover:text-red-700"
              onClick={() => openModal(MODAL.ROLE_DELETE, { role })}
            >
              <Trash2 className="mr-1.5 size-4" />
              O'chirish
            </Button>
          </div>
        )}
      </header>

      {/* Muzlatilgan rol ogohlantirishi */}
      {role?.isFrozen && (
        <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm dark:border-sky-900 dark:bg-sky-950/40">
          <Snowflake className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <div>
            <p className="font-medium text-sky-900 dark:text-sky-200">
              Bu rol muzlatilgan
            </p>
            <p className="mt-0.5 text-sky-800/80 dark:text-sky-300/80">
              Rol egalari tizimga kira olmaydi
              {role.frozenReason ? `. Sabab: ${role.frozenReason}` : ""}
            </p>
          </div>
        </div>
      )}

      {isBusy ? (
        <div className="flex h-64 items-center justify-center rounded-xl border text-sm text-muted-foreground">
          Yuklanmoqda...
        </div>
      ) : (
        <div className="space-y-5">
          {/* Rol ma'lumotlari - bitta ixcham qatorda.
              Ilgari yon panelda edi, lekin u ekranning uchdan birini egallab
              turardi va ruxsatlar jadvaliga joy qolmasdi. */}
          <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3">
            <InputField
              name="label"
              label="Rol nomi"
              required={isCreate}
              value={label}
              error={Boolean(error)}
              disabled={isSystem}
              placeholder="Masalan: Buxgalter"
              onChange={(e) => setField("label", e.target.value)}
              description={
                error || (isSystem ? "Tizim rolining nomi o'zgarmaydi" : "")
              }
            />
            <SelectField
              name="roleType"
              label="Rol tipi"
              value={roleType}
              disabled={isSystem}
              options={isCreate ? CREATE_TYPE_OPTIONS : ROLE_TYPE_OPTIONS}
              onChange={(v) => setField("roleType", v)}
              description="Ma'lumot ko'lami shu tipga qarab aniqlanadi"
            />
            <InputField
              name="description"
              label="Izoh"
              value={description}
              placeholder="Bu rol nima uchun kerakligi"
              onChange={(e) => setField("description", e.target.value)}
            />
          </div>

          {isCreate && (
            <RolePresetPicker
              modules={matrix?.modules}
              onApply={(next) => setField("selected", next)}
            />
          )}

          <AccessSections
            matrix={matrix}
            selected={selected}
            onChange={(next) => setField("selected", next)}
          />
        </div>
      )}

      {/* Pastda qotib turadigan saqlash paneli */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="text-xs text-muted-foreground">
            {isDirty ? "Saqlanmagan o'zgarishlar bor" : "Barcha o'zgarishlar saqlangan"}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => navigate(ROLES_PATH)}
            >
              Bekor qilish
            </Button>
            <Button
              type="button"
              disabled={isSaving || isBusy || (!isCreate && !isDirty)}
              onClick={handleSave}
            >
              <Save className="mr-1.5 size-4" />
              {isSaving
                ? "Saqlanmoqda..."
                : isCreate
                  ? "Rol yaratish"
                  : "Saqlash"}
            </Button>
          </div>
        </div>
      </div>

      <ModalWrapper name={MODAL.ROLE_FREEZE} title="Rolni muzlatish">
        <RoleFreezeModal />
      </ModalWrapper>

      <ModalWrapper name={MODAL.ROLE_DELETE} title="Rolni o'chirish">
        <RoleDeleteModal onDeleted={() => navigate(ROLES_PATH)} />
      </ModalWrapper>
    </div>
  );
};

export default RoleFormPage;
