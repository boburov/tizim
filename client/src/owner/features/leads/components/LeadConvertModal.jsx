import useObjectState from "@/shared/hooks/useObjectState";
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import { useLeadConvertMutation } from "../hooks/useLeadMutations";

const GENDER_OPTIONS = [
  { value: "male", label: "Erkak" },
  { value: "female", label: "Ayol" },
];

const LeadConvertModal = ({ lead, close, isLoading, setIsLoading }) => {
  const obj = useObjectState({
    firstName: lead?.firstName || "",
    lastName: lead?.lastName || "",
    username: "",
    phone: lead?.phone || "",
    password: "",
    gender: "",
    enrolledAt: "",
  });

  const { mutate } = useLeadConvertMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const isValid = () =>
    obj.firstName.trim() &&
    obj.lastName.trim() &&
    obj.username.trim() &&
    obj.phone &&
    obj.password;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid()) return;
    setIsLoading(true);
    const body = {
      firstName: obj.firstName.trim(),
      lastName: obj.lastName.trim(),
      username: obj.username.trim(),
      phone: obj.phone,
      password: obj.password,
    };
    if (obj.gender) body.gender = obj.gender;
    if (obj.enrolledAt) body.enrolledAt = obj.enrolledAt;
    mutate({ id: lead._id, body });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Lid faol o'quvchiga aylantiriladi va status "Guruhga qo'shildi" bo'ladi.
      </p>
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
      <InputField
        name="username"
        label="Login (username)"
        value={obj.username}
        onChange={(e) => obj.setField("username", e.target.value)}
        required
        disabled={isLoading}
      />
      <InputField
        type="tel"
        name="phone"
        label="Telefon"
        value={obj.phone}
        onChange={(e) => obj.setField("phone", e.target.value)}
        required
        disabled={isLoading}
      />
      <InputField
        type="password"
        name="password"
        label="Parol"
        value={obj.password}
        onChange={(e) => obj.setField("password", e.target.value)}
        required
        disabled={isLoading}
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Jinsi"
          value={obj.gender}
          onChange={(v) => obj.setField("gender", v)}
          options={GENDER_OPTIONS}
          placeholder="Tanlang"
          disabled={isLoading}
        />
        <InputField
          type="date"
          name="enrolledAt"
          label="Ro'yxatga olingan sana"
          value={obj.enrolledAt}
          onChange={(e) => obj.setField("enrolledAt", e.target.value)}
          disabled={isLoading}
        />
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
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? "Aylantirilmoqda..." : "O'quvchiga aylantirish"}
        </Button>
      </div>
    </form>
  );
};

export default LeadConvertModal;
