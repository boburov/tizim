import useObjectState from "@/shared/hooks/useObjectState";
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import BranchFormFields from "../BranchFormFields";
import { useBranchCreateMutation } from "../../hooks/useBranchMutations";
import { useRolesQuery } from "@/owner/features/roles";
import { ROLES } from "@/shared/constants/roles";

/**
 * FILIAL yaratish - direktori bilan BIRGA.
 *
 * Direktor MAJBURIY: direktorsiz filial "qorong'i" bo'lib qoladi - u yerda
 * guruh va to'lov paydo bo'ladi, lekin owner'dan boshqa hech kim ko'ra
 * olmaydi. Login/parol shu yerda beriladi, keyin direktor o'zi kiradi.
 */
const BranchCreateModal = ({ close, isLoading, setIsLoading }) => {
  const obj = useObjectState({
    // Filial
    name: "",
    address: "",
    phone: "",
    // Direktor
    dirFirstName: "",
    dirLastName: "",
    dirPhone: "",
    dirUsername: "",
    dirPassword: "",
    dirRole: "director",
  });

  const { data: roles = [] } = useRolesQuery();
  const roleOptions = roles
    .filter(
      (r) =>
        ![ROLES.OWNER, ROLES.STUDENT, ROLES.TEACHER].includes(r.value) &&
        !r.isFrozen,
    )
    .map((r) => ({ value: r.value, label: r.label || r.value }));

  const { mutate } = useBranchCreateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const usernameShort =
    obj.dirUsername.trim().length > 0 && obj.dirUsername.trim().length < 3;

  const isValid =
    obj.name.trim() &&
    obj.dirFirstName.trim() &&
    obj.dirLastName.trim() &&
    obj.dirUsername.trim().length >= 3 &&
    obj.dirPassword.length >= 6;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) return;
    setIsLoading(true);
    mutate({
      name: obj.name.trim(),
      address: obj.address.trim() || null,
      phone: obj.phone.trim() || null,
      director: {
        firstName: obj.dirFirstName.trim(),
        lastName: obj.dirLastName.trim(),
        username: obj.dirUsername.trim().toLowerCase(),
        password: obj.dirPassword,
        phone: obj.dirPhone || undefined,
        role: obj.dirRole || "director",
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <BranchFormFields obj={obj} disabled={isLoading} twoCols />

      <div className="pt-3 border-t space-y-3">
        <p className="text-sm font-medium">Filial direktori</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <InputField
            name="dirFirstName"
            label="Ism"
            value={obj.dirFirstName}
            onChange={(e) => obj.setField("dirFirstName", e.target.value)}
            required
            disabled={isLoading}
          />
          <InputField
            name="dirLastName"
            label="Familiya"
            value={obj.dirLastName}
            onChange={(e) => obj.setField("dirLastName", e.target.value)}
            required
            disabled={isLoading}
          />
          <InputField
            type="tel"
            name="dirPhone"
            label="Telefon"
            value={obj.dirPhone}
            onChange={(e) => obj.setField("dirPhone", e.target.value)}
            disabled={isLoading}
          />
          {roleOptions.length > 0 && (
            <SelectField
              name="dirRole"
              label="Rol"
              options={roleOptions}
              value={obj.dirRole}
              onChange={(v) => obj.setField("dirRole", v?.target?.value ?? v)}
              disabled={isLoading}
            />
          )}
          <InputField
            name="dirUsername"
            label="Login"
            placeholder="masalan: aziz_andijon"
            value={obj.dirUsername}
            onChange={(e) => obj.setField("dirUsername", e.target.value)}
            error={usernameShort}
            description={usernameShort ? "Kamida 3 ta belgi" : ""}
            required
            disabled={isLoading}
          />
          <InputField
            type="password"
            name="dirPassword"
            label="Parol"
            value={obj.dirPassword}
            onChange={(e) => obj.setField("dirPassword", e.target.value)}
            description="Kamida 6 ta belgi"
            required
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={() => close?.()}
          disabled={isLoading}
          className="flex-1"
        >
          Bekor qilish
        </Button>
        <Button type="submit" disabled={isLoading || !isValid} className="flex-1">
          {isLoading ? "Yaratilmoqda..." : "Yaratish"}
        </Button>
      </div>
    </form>
  );
};

export default BranchCreateModal;
