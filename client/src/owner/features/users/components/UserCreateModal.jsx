import useObjectState from "@/shared/hooks/useObjectState";
import useUserCreateMutation from "../hooks/useUserCreateMutation";

import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import Button from "@/shared/components/ui/button/Button";

import { todayInput } from "@/shared/utils/formatDate";
import { ROLES, ROLE_LABELS } from "@/shared/constants/roles";

const ROLE_OPTIONS = [
  { value: ROLES.STUDENT, label: ROLE_LABELS.student },
  { value: ROLES.TEACHER, label: ROLE_LABELS.teacher },
];

const GENDER_OPTIONS = [
  { value: "male", label: "Erkak" },
  { value: "female", label: "Ayol" },
];

const initialState = (defaultRole) => ({
  firstName: "",
  lastName: "",
  username: "",
  phone: "",
  password: "",
  role: defaultRole || ROLES.STUDENT,

  gender: "",

  // student
  enrolledAt: "",

  // teacher
  birthDate: "",
  hiredAt: "",
});

const UserCreateModal = ({ defaultRole, close, isLoading, setIsLoading }) => {
  const obj = useObjectState(initialState(defaultRole));
  const isStudent = obj.role === ROLES.STUDENT;

  const { mutate } = useUserCreateMutation({
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
    obj.password &&
    obj.role &&
    // O'qituvchi uchun ishga olingan sana majburiy.
    (obj.role !== ROLES.TEACHER || obj.hiredAt);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid()) return;
    // Rol majburiy: bo'sh yoki noto'g'ri qiymat bilan yuborilmasin
    if (obj.role !== ROLES.STUDENT && obj.role !== ROLES.TEACHER) return;

    const body = {
      firstName: obj.firstName.trim(),
      lastName: obj.lastName.trim(),
      username: obj.username.trim(),
      password: obj.password,
      role: obj.role,
    };
    // Telefon ixtiyoriy: faqat kiritilgan bo'lsa yuboriladi.
    if (obj.phone.trim()) body.phone = obj.phone.trim();
    if (obj.gender) body.gender = obj.gender;

    if (isStudent) {
      // Bo'sh qoldirilsa backend bugungi sanani belgilaydi.
      if (obj.enrolledAt) body.enrolledAt = obj.enrolledAt;
    } else {
      if (obj.birthDate) body.birthDate = obj.birthDate;
      if (obj.hiredAt) body.hiredAt = obj.hiredAt;
    }

    setIsLoading(true);
    mutate(body);
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
        label="Telefon (ixtiyoriy)"
        value={obj.phone}
        onChange={(e) => obj.setField("phone", e.target.value)}
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
      <SelectField
        label="Rol"
        value={obj.role}
        onChange={(v) => obj.setField("role", v)}
        options={ROLE_OPTIONS}
        required
        disabled={isLoading}
      />

      {isStudent ? (
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
            max={todayInput()}
            onChange={(e) => obj.setField("enrolledAt", e.target.value)}
            disabled={isLoading}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <InputField
            type="date"
            name="birthDate"
            label="Tug'ilgan sana"
            value={obj.birthDate}
            onChange={(e) => obj.setField("birthDate", e.target.value)}
            disabled={isLoading}
          />
          <InputField
            type="date"
            name="hiredAt"
            label="Ishga olingan sana"
            value={obj.hiredAt}
            max={todayInput()}
            onChange={(e) => obj.setField("hiredAt", e.target.value)}
            required
            disabled={isLoading}
          />
        </div>
      )}

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
          {isLoading ? "Yaratilmoqda..." : "Yaratish"}
        </Button>
      </div>
    </form>
  );
};

export default UserCreateModal;
