import useObjectState from "@/shared/hooks/useObjectState";
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import BranchFormFields from "../BranchFormFields";
import { useBranchCreateMutation } from "../../hooks/useBranchMutations";
import { useRolesQuery } from "@/owner/features/roles";
import { ROLES } from "@/shared/constants/roles";
import { phoneOrNull } from "@/shared/utils/formatPhone";

/**
 * FILIAL yaratish. Majburiy maydon FAQAT bittta - filial nomi.
 *
 * Direktor IXTIYORIY: uni shu yerda birga yaratish qulay, lekin majburiy
 * qilinsa halqa hosil bo'lardi - har bir yangi filialda darhol 1 ta
 * foydalanuvchi paydo bo'lardi va server foydalanuvchisi bor filialni
 * o'chirishga yo'l qo'ymasdi. Direktorni keyin "Xodim qo'shish" orqali
 * biriktirish mumkin.
 *
 * Direktor blokini QISMAN to'ldirib bo'lmaydi: yo hammasi (ism, familiya,
 * login, parol), yo hech biri.
 */
// `onCreated` - selectdan "Yangi qo'shish" orqali ochilganda beriladi:
// yaratilgan filial darhol tanlanishi uchun (CreatableSelectField).
const BranchCreateModal = ({ close, isLoading, setIsLoading, onCreated }) => {
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
    onSuccess: (data) => {
      setIsLoading(false);
      onCreated?.(data);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const usernameShort =
    obj.dirUsername.trim().length > 0 && obj.dirUsername.trim().length < 3;

  // Direktor bloki umuman tegilmaganmi?
  const dirUntouched =
    !obj.dirFirstName.trim() &&
    !obj.dirLastName.trim() &&
    !obj.dirUsername.trim() &&
    !obj.dirPassword;

  const dirComplete =
    obj.dirFirstName.trim() &&
    obj.dirLastName.trim() &&
    obj.dirUsername.trim().length >= 3 &&
    obj.dirPassword.length >= 6;

  // Nom yetarli. Direktor bloki esa yo bo'sh, yo to'liq bo'lishi kerak -
  // yarim to'ldirilgani jimgina tashlab yuborilsa foydalanuvchi "direktor
  // ham yaratildi" deb o'ylab qolardi.
  const isValid = Boolean(obj.name.trim()) && (dirUntouched || dirComplete);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) return;
    setIsLoading(true);
    mutate({
      name: obj.name.trim(),
      address: obj.address.trim() || null,
      // Telefon IXTIYORIY: chala terilgan maska qoldig'i ("+998 (90") null
      // sifatida ketadi, "telefon noto'g'ri" deb rad etilmaydi.
      phone: phoneOrNull(obj.phone),
      // Bloki bo'sh bo'lsa director UMUMAN yuborilmaydi - bo'sh obyekt
      // serverda validatsiyadan o'tmasdi.
      ...(dirUntouched
        ? {}
        : {
            director: {
              firstName: obj.dirFirstName.trim(),
              lastName: obj.dirLastName.trim(),
              username: obj.dirUsername.trim().toLowerCase(),
              password: obj.dirPassword,
              phone: phoneOrNull(obj.dirPhone) || undefined,
              role: obj.dirRole || "director",
            },
          }),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <BranchFormFields obj={obj} disabled={isLoading} twoCols />

      <div className="pt-3 border-t space-y-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Filial direktori</p>
          <p className="text-xs opacity-60">
            Ixtiyoriy — keyinroq ham qo&apos;shish mumkin. Boshlasangiz, ism,
            familiya, login va parolni to&apos;ldirish kerak.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <InputField
            name="dirFirstName"
            label="Ism"
            value={obj.dirFirstName}
            onChange={(e) => obj.setField("dirFirstName", e.target.value)}
            disabled={isLoading}
          />
          <InputField
            name="dirLastName"
            label="Familiya"
            value={obj.dirLastName}
            onChange={(e) => obj.setField("dirLastName", e.target.value)}
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
            disabled={isLoading}
          />
          <InputField
            type="password"
            name="dirPassword"
            label="Parol"
            value={obj.dirPassword}
            onChange={(e) => obj.setField("dirPassword", e.target.value)}
            description="Kamida 6 ta belgi"
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
