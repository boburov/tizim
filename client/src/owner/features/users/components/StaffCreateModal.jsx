// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import { useEffect } from "react";
import useAuth from "@/shared/hooks/useAuth";
import { useStaffCreateMutation } from "../hooks/useStaffMutations";
import useAvailabilityQuery from "../hooks/useAvailabilityQuery";
import { useRolesQuery } from "@/owner/features/roles";
import { useBranchesQuery } from "@/owner/features/branches";

// Components
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import CreatableSelectField from "@/shared/components/ui/select/CreatableSelectField";
import Button from "@/shared/components/ui/button/Button";
import BranchCreateModal from "@/owner/features/branches/components/modals/BranchCreateModal";

// Constants
import { ROLES } from "@/shared/constants/roles";
import { PERMISSIONS } from "@/shared/constants/permissions";

const initialState = (homeBranchId) => ({
  firstName: "",
  lastName: "",
  phone: "",
  username: "",
  password: "",
  role: "",
  homeBranchId: homeBranchId || "",
});

/**
 * XODIM (direktor/administrator) qo'shish.
 *
 * O'quvchi/o'qituvchi qo'shishdan FARQLI:
 *  - rol DINAMIK (owner yaratgan custom rollar ham tanlanadi)
 *  - filial biriktiruvi majburiy
 *  - hiredAt/enrolledAt kabi rolga xos maydonlar YO'Q
 */
const StaffCreateModal = ({ close, isLoading, setIsLoading }) => {
  const { homeBranchId, multiBranch } = useAuth();
  const obj = useObjectState(initialState(homeBranchId));

  const { data: roles = [] } = useRolesQuery();
  const { data: branchesData } = useBranchesQuery();
  const branches = branchesData?.data || [];

  // YAKKA MARKAZ: filial tanlagich ko'rsatilmaydi, lekin server homeBranchId
  // ni MAJBURIY talab qiladi ("Filial tanlanishi shart"). Yagona filialni
  // o'zimiz qo'yamiz - egada homeBranchId bo'lmasligi mumkin.
  //
  // Bog'liqliklar ATAYLAB primitiv: `branches` har renderda yangi massiv
  // bo'lgani uchun effekt cheksiz qayta ishga tushardi.
  const onlyBranchId = branches[0]?._id;
  const { homeBranchId: pickedBranchId, setField } = obj;

  useEffect(() => {
    if (multiBranch || pickedBranchId || !onlyBranchId) return;
    setField("homeBranchId", String(onlyBranchId));
  }, [multiBranch, pickedBranchId, onlyBranchId, setField]);

  const { mutate } = useStaffCreateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  // Tanlanadigan rollar: o'quvchi/o'qituvchi/ega bu yerda kerak emas -
  // ular alohida oqim orqali yaratiladi. Muzlatilgan rol ham berilmaydi:
  // biriktirilgan odam darhol tizimga kira olmay qolardi.
  const roleOptions = roles
    .filter(
      (r) =>
        ![ROLES.OWNER, ROLES.STUDENT, ROLES.TEACHER].includes(r.value) &&
        !r.isFrozen,
    )
    .map((r) => ({ value: r.value, label: r.label || r.value }));

  const branchOptions = branches.map((b) => ({
    value: String(b._id),
    label: b.name,
  }));

  const usernameShort =
    obj.username.trim().length > 0 && obj.username.trim().length < 3;

  // Telefon/login bandligi - saqlashdan OLDIN, maydonning o'zida.
  const { phoneTaken, usernameTaken, isChecking, isStale } =
    useAvailabilityQuery({ phone: obj.phone, username: obj.username });
  const checkPending = isChecking || isStale;

  const isValid =
    obj.firstName.trim() &&
    obj.lastName.trim() &&
    obj.username.trim().length >= 3 &&
    obj.password.length >= 6 &&
    obj.role &&
    obj.homeBranchId &&
    !phoneTaken &&
    !usernameTaken;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid || checkPending) return;
    setIsLoading(true);
    mutate({
      firstName: obj.firstName.trim(),
      lastName: obj.lastName.trim(),
      username: obj.username.trim().toLowerCase(),
      password: obj.password,
      phone: obj.phone || undefined,
      role: obj.role,
      homeBranchId: obj.homeBranchId,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <InputField
          name="firstName"
          label="Ism"
          value={obj.firstName}
          onChange={(e) => obj.setField("firstName", e.target.value)}
          required
          disabled={isLoading}
        />
        <InputField
          name="lastName"
          label="Familiya"
          value={obj.lastName}
          onChange={(e) => obj.setField("lastName", e.target.value)}
          required
          disabled={isLoading}
        />
      </div>

      <div>
        <InputField
          type="tel"
          name="phone"
          label="Telefon"
          value={obj.phone}
          onChange={(e) => obj.setField("phone", e.target.value)}
          error={phoneTaken}
          disabled={isLoading}
        />
        {phoneTaken && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-300">
            Bu telefon raqam allaqachon ro&apos;yxatdan o&apos;tgan
          </p>
        )}
      </div>

      <div className="pt-2 border-t">
        <p className="text-sm font-medium mb-2">Kirish ma'lumotlari</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <InputField
              name="username"
              label="Login"
              placeholder="masalan: aziz_dir"
              value={obj.username}
              onChange={(e) => obj.setField("username", e.target.value)}
              error={usernameShort || usernameTaken}
              description={usernameShort ? "Kamida 3 ta belgi" : ""}
              required
              disabled={isLoading}
            />
            {usernameTaken && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-300">
                Bu login allaqachon band
              </p>
            )}
          </div>
          <InputField
            type="password"
            name="password"
            label="Parol"
            value={obj.password}
            onChange={(e) => obj.setField("password", e.target.value)}
            description="Kamida 6 ta belgi"
            required
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="pt-2 border-t">
        <p className="text-sm font-medium mb-2">Filial va ruxsatlar</p>
        <div className="grid grid-cols-2 gap-3">
          {multiBranch && (
            <CreatableSelectField
              name="homeBranchId"
              label="Filial"
              placeholder="Filialni tanlang"
              options={branchOptions}
              value={obj.homeBranchId}
              onChange={(v) =>
                obj.setField("homeBranchId", v?.target?.value ?? v)
              }
              required
              disabled={isLoading}
              createLabel="Yangi filial"
              createTitle="Yangi filial"
              createClassName="max-w-lg"
              createPermission={PERMISSIONS.BRANCHES_CREATE}
              create={<BranchCreateModal />}
              onCreated={(b) => obj.setField("homeBranchId", String(b._id))}
            />
          )}
          <SelectField
            name="role"
            label="Rol"
            placeholder="Rolni tanlang"
            options={roleOptions}
            value={obj.role}
            onChange={(v) => obj.setField("role", v?.target?.value ?? v)}
            required
            disabled={isLoading}
          />
        </div>
        <p className="text-xs opacity-60 mt-1">
          Rol ruxsatlarini "Rollar va ruxsatlar" bo'limida sozlaysiz
        </p>
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
          disabled={isLoading || !isValid || checkPending}
          className="flex-1"
        >
          {checkPending
            ? "Tekshirilmoqda..."
            : isLoading
              ? "Qo'shilmoqda..."
              : "Qo'shish"}
        </Button>
      </div>
    </form>
  );
};

export default StaffCreateModal;
