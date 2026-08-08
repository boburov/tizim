import useObjectState from "@/shared/hooks/useObjectState";
import useModal from "@/shared/hooks/useModal";
import useUserUpdateMutation from "../hooks/useUserUpdateMutation";
import { usePayrollImpactQuery } from "@/owner/features/staffPayroll";
import { MODAL } from "@/shared/constants/modals";

import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import Button from "@/shared/components/ui/button/Button";

import { ROLES } from "@/shared/constants/roles";
import { toDateInput } from "@/shared/utils/formatDate";
import { NO_AUTOFILL, NO_AUTOFILL_FORM } from "@/shared/constants/form";

const GENDER_OPTIONS = [
  { value: "male", label: "Erkak" },
  { value: "female", label: "Ayol" },
];

const buildInitial = (user) => ({
  firstName: user?.firstName || "",
  lastName: user?.lastName || "",
  phone: user?.phone || "",
  birthDate: toDateInput(user?.birthDate),
  gender: user?.gender || "",

  // student
  enrolledAt: toDateInput(user?.enrolledAt),
  completedAt: toDateInput(user?.completedAt),

  // teacher
  hiredAt: toDateInput(user?.hiredAt),
});

// `user` ModalWrapper data orqali keladi
const UserEditModal = ({ user, close, isLoading, setIsLoading }) => {
  const obj = useObjectState(buildInitial(user));
  const isStudent = user?.role === ROLES.STUDENT;
  const isTeacher = user?.role === ROLES.TEACHER;

  const { openModal } = useModal();

  // ISHGA OLINGAN SANA o'zgarganda maosh tarixi bor-yo'qligini oldindan
  // bilamiz. So'rov hech narsani o'zgartirmaydi - faqat sanaydi.
  const hiredAtChanged = isTeacher && obj.hiredAt !== toDateInput(user?.hiredAt);
  const { data: impact } = usePayrollImpactQuery(isTeacher ? user?._id : null);

  const { mutate } = useUserUpdateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
      // HR ma'lumoti SAQLANDI. Endi - va faqat endi - egasidan moliyaviy
      // qismi haqida so'raymiz. Maosh tarixi bu paytda hali TEGILMAGAN.
      if (hiredAtChanged && impact?.hasHistory) {
        openModal(MODAL.EMPLOYMENT_DATE_CHANGE, { impact });
      }
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    // O'qituvchi uchun ishga olingan sana majburiy - bo'sh bo'lsa yubormaymiz.
    if (isTeacher && !obj.hiredAt) return;

    const body = {
      firstName: obj.firstName.trim(),
      lastName: obj.lastName.trim(),
      phone: obj.phone || undefined,
    };
    if (!isStudent) body.birthDate = obj.birthDate || null;

    if (isStudent) {
      // Jins faqat o'quvchida bo'ladi (o'qituvchida so'ralmaydi).
      body.gender = obj.gender || null;
      body.enrolledAt = obj.enrolledAt || null;
      body.completedAt = obj.completedAt || null;
    }
    if (isTeacher) {
      body.hiredAt = obj.hiredAt;
    }

    setIsLoading(true);
    mutate({ id: user._id, body });
  };

  const today = toDateInput(new Date());

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 max-h-[70vh] overflow-y-auto pr-1"
      {...NO_AUTOFILL_FORM}
    >
      <div className="grid grid-cols-2 gap-3">
        <InputField
          name="firstName"
          label="Ism"
          value={obj.firstName}
          onChange={(e) => obj.setField("firstName", e.target.value)}
          required
          disabled={isLoading}
          {...NO_AUTOFILL}
        />
        <InputField
          name="lastName"
          label="Familiya"
          value={obj.lastName}
          onChange={(e) => obj.setField("lastName", e.target.value)}
          required
          disabled={isLoading}
          {...NO_AUTOFILL}
        />
      </div>

      <InputField
        type="tel"
        name="phone"
        label="Telefon (ixtiyoriy)"
        value={obj.phone}
        onChange={(e) => obj.setField("phone", e.target.value)}
        disabled={isLoading}
        {...NO_AUTOFILL}
      />

      {isStudent ? (
        <SelectField
          label="Jinsi"
          value={obj.gender}
          onChange={(v) => obj.setField("gender", v)}
          options={GENDER_OPTIONS}
          placeholder="Tanlang"
          disabled={isLoading}
        />
      ) : (
        <InputField
          type="date"
          name="birthDate"
          label="Tug'ilgan sana"
          value={obj.birthDate}
          max={today}
          onChange={(e) => obj.setField("birthDate", e.target.value)}
          disabled={isLoading}
        />
      )}

      {isStudent && (
        <div className="grid grid-cols-2 gap-3">
          <InputField
            type="date"
            name="enrolledAt"
            label="Ro'yxatga olingan sana"
            value={obj.enrolledAt}
            max={today}
            onChange={(e) => obj.setField("enrolledAt", e.target.value)}
            disabled={isLoading}
          />
          <InputField
            type="date"
            name="completedAt"
            label="Yakunlash sanasi"
            value={obj.completedAt}
            min={obj.enrolledAt || undefined}
            max={today}
            onChange={(e) => obj.setField("completedAt", e.target.value)}
            disabled={isLoading}
          />
        </div>
      )}

      {isTeacher && (
        <div>
          <InputField
            type="date"
            name="hiredAt"
            label="Ishga olingan sana"
            value={obj.hiredAt}
            max={today}
            onChange={(e) => obj.setField("hiredAt", e.target.value)}
            required
            disabled={isLoading}
          />
          {/* HR va MOLIYA ajratilgan - foydalanuvchi buni sanani
              o'zgartirishdan OLDIN bilishi kerak, keyin emas. */}
          {hiredAtChanged && impact?.hasHistory && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">
              Bu xodimda {impact.monthCount} oylik maosh tarixi bor. Sanani
              o'zgartirish faqat HR ma'lumotini yangilaydi - maosh
              o'z-o'zidan qayta hisoblanmaydi.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-2 sticky bottom-0 bg-card">
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
          {isLoading ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>
    </form>
  );
};

export default UserEditModal;
