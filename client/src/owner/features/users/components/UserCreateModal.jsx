import useObjectState from "@/shared/hooks/useObjectState";
import useActiveBranch from "@/shared/hooks/useActiveBranch";
import useUserCreateMutation from "../hooks/useUserCreateMutation";
import useAvailabilityQuery from "../hooks/useAvailabilityQuery";

import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import CreatableSelectField from "@/shared/components/ui/select/CreatableSelectField";
import Button from "@/shared/components/ui/button/Button";
import BranchCreateModal from "@/owner/features/branches/components/modals/BranchCreateModal";
import CompensationFields from "@/owner/features/teacherSalary/components/CompensationFields";

import {
  BASE_TYPES,
  VARIABLE_TYPES,
  hasAnyPart,
  toCompensationPayload,
  describeCompensation,
} from "@/owner/features/teacherSalary/utils/compensation";

import { todayInput } from "@/shared/utils/formatDate";
import { ROLES, ROLE_LABELS } from "@/shared/constants/roles";
import { PERMISSIONS } from "@/shared/constants/permissions";

const ROLE_OPTIONS = [
  { value: ROLES.STUDENT, label: ROLE_LABELS.student },
  { value: ROLES.TEACHER, label: ROLE_LABELS.teacher },
];

const GENDER_OPTIONS = [
  { value: "male", label: "Erkak" },
  { value: "female", label: "Ayol" },
];

const initialState = (defaultRole) => ({
  // ── qadam boshqaruvi ──
  // 1 = shaxsiy ma'lumot, 2 = maosh (faqat o'qituvchi uchun).
  step: 1,

  firstName: "",
  lastName: "",
  username: "",
  phone: "",
  password: "",
  role: defaultRole || ROLES.STUDENT,
  homeBranchId: "",

  gender: "",

  // student — ro'yxatga olingan sana majburiy, default bugun.
  enrolledAt: todayInput(),

  // teacher
  birthDate: "",
  hiredAt: "",

  // ── 2-qadam: maosh stavkasi ──
  baseType: BASE_TYPES.FIXED_MONTHLY,
  baseAmount: "",
  variableType: VARIABLE_TYPES.NONE,
  variableRate: "",
  percentBase: "billed",
  effectiveFrom: "",
  note: "",
});

// `onCreated` - selectdan "Yangi qo'shish" orqali ochilganda beriladi:
// yaratilgan o'quvchi/o'qituvchi darhol tanlanishi uchun.
const UserCreateModal = ({
  defaultRole,
  close,
  isLoading,
  setIsLoading,
  onCreated,
}) => {
  const obj = useObjectState(initialState(defaultRole));
  const isStudent = obj.role === ROLES.STUDENT;
  const isTeacher = obj.role === ROLES.TEACHER;
  const onSalaryStep = obj.step === 2;

  // FILIAL. Odatda server aktiv filialdan (x-branch-id) oladi. Lekin
  // "Barcha filiallar" rejimida aktiv filial YO'Q va server 400 qaytaradi
  // ("Filial tanlanmagan") - o'shanda qaysi filialga yozishni SO'RAYMIZ.
  const { branches, isAllBranches, multiBranch } = useActiveBranch();
  const needsBranch = multiBranch && isAllBranches;
  const branchOptions = branches.map((b) => ({
    value: String(b._id),
    label: b.name,
  }));

  const { mutate } = useUserCreateMutation({
    onSuccess: (data) => {
      setIsLoading(false);
      onCreated?.(data);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  // Username kamida 3 ta belgi bo'lishi kerak (server bilan bir xil qoida).
  const usernameShort =
    obj.username.trim().length > 0 && obj.username.trim().length < 3;

  // TELEFON/LOGIN BANDLIGI - yozayotgan paytda tekshiriladi.
  //
  // Ilgari bu faqat SO'NGGI qadamda, server 409 qaytarganda bilinardi:
  // o'qituvchida bu ikkinchi qadam (maosh) ham to'ldirilgandan keyin
  // degani edi va odam hammasini boshidan kiritishga majbur bo'lardi.
  const { phoneTaken, usernameTaken, isChecking, isStale } =
    useAvailabilityQuery({ phone: obj.phone, username: obj.username });

  // Tekshiruv HALI TUGAMAGAN bo'lsa "band" deb ko'rsatmaymiz, lekin
  // keyingi qadamga ham o'tkazmaymiz - aks holda javob kelguncha bosib
  // ulgurgan odam eski muammoga qaytardi.
  const checkPending = isChecking || isStale;

  // 1-qadam to'liqmi (maosh maydonlari bu yerda TEKSHIRILMAYDI - ular
  // ixtiyoriy va 2-qadamda "keyinroq" bilan butunlay o'tkazib yuborilishi
  // mumkin).
  const isStepOneValid = () =>
    obj.firstName.trim() &&
    obj.lastName.trim() &&
    obj.username.trim().length >= 3 &&
    obj.password &&
    obj.role &&
    (obj.role !== ROLES.TEACHER || obj.hiredAt) &&
    (obj.role !== ROLES.STUDENT || obj.enrolledAt) &&
    (!needsBranch || obj.homeBranchId) &&
    !phoneTaken &&
    !usernameTaken;

  // Kiritilgan maosh stavkasi yaroqlimi. Bo'sh bo'lishi ham MUMKIN
  // ("keyinroq belgilayman"), lekin yarim to'ldirilgan bo'lmasligi kerak.
  const salaryTouched =
    (obj.baseType === BASE_TYPES.FIXED_MONTHLY && obj.baseAmount !== "") ||
    (obj.variableType !== VARIABLE_TYPES.NONE && obj.variableRate !== "");
  const salaryValid = hasAnyPart(obj);
  const percentTooBig =
    obj.variableType === VARIABLE_TYPES.PERCENT && Number(obj.variableRate) > 100;

  // Foydalanuvchi hujjatini yig'adi. `withSalary=false` bo'lsa maosh
  // qo'shilmaydi - "keyinroq belgilayman" yo'li.
  const buildBody = (withSalary) => {
    const body = {
      firstName: obj.firstName.trim(),
      lastName: obj.lastName.trim(),
      username: obj.username.trim(),
      password: obj.password,
      role: obj.role,
    };
    if (needsBranch && obj.homeBranchId) body.homeBranchId = obj.homeBranchId;
    if (obj.phone.trim()) body.phone = obj.phone.trim();
    if (obj.gender) body.gender = obj.gender;

    if (isStudent) {
      body.enrolledAt = obj.enrolledAt;
    } else {
      if (obj.birthDate) body.birthDate = obj.birthDate;
      if (obj.hiredAt) body.hiredAt = obj.hiredAt;
      if (withSalary && salaryValid) {
        body.compensation = toCompensationPayload({
          ...obj,
          // Sana ko'rsatilmasa stavka ISHGA OLINGAN kundan boshlanadi -
          // aks holda oradagi kunlar stavkasiz qolib, maosh 0 chiqardi.
          effectiveFrom: obj.effectiveFrom || obj.hiredAt,
        });
      }
    }
    return body;
  };

  const submit = (withSalary) => {
    setIsLoading(true);
    mutate(buildBody(withSalary));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // ── 1-qadam ──
    if (!onSalaryStep) {
      if (!isStepOneValid()) return;
      // Javob kelmagan bo'lsa kutamiz: band raqam bilan 2-qadamga o'tib,
      // u yerda 409 olish - aynan tuzatilayotgan muammoning o'zi.
      if (checkPending) return;
      if (obj.role !== ROLES.STUDENT && obj.role !== ROLES.TEACHER) return;

      // O'quvchida maosh qadami YO'Q - darhol yaratiladi.
      if (!isTeacher) return submit(false);

      // O'qituvchi: maosh qadamiga o'tamiz.
      return obj.setFields({
        step: 2,
        // Amal qilish sanasi default - ishga olingan kun.
        effectiveFrom: obj.effectiveFrom || obj.hiredAt,
      });
    }

    // ── 2-qadam ──
    if (!salaryValid || percentTooBig) return;
    submit(true);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Qadam indikatori - faqat o'qituvchida (o'quvchida bitta qadam). */}
      {isTeacher && (
        <div className="flex items-center gap-2 text-xs">
          <span
            className={
              onSalaryStep
                ? "text-muted-foreground"
                : "font-medium text-foreground"
            }
          >
            1. Ma'lumotlar
          </span>
          <span className="h-px flex-1 bg-border" />
          <span
            className={
              onSalaryStep
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            }
          >
            2. Maosh
          </span>
        </div>
      )}

      {!onSalaryStep ? (
        <>
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
              name="username"
              label="Login (username)"
              placeholder="Kamida 3 ta belgi"
              value={obj.username}
              onChange={(e) => obj.setField("username", e.target.value)}
              error={usernameShort || usernameTaken}
              required
              disabled={isLoading}
            />
            {usernameTaken && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-300">
                Bu login allaqachon band — boshqasini tanlang
              </p>
            )}
          </div>
          <div>
            <InputField
              type="tel"
              name="phone"
              label="Telefon (ixtiyoriy)"
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

          {needsBranch && (
            <CreatableSelectField
              label="Filial"
              placeholder="Filialni tanlang"
              value={obj.homeBranchId}
              onChange={(v) =>
                obj.setField("homeBranchId", v?.target?.value ?? v)
              }
              options={branchOptions}
              required
              error={!obj.homeBranchId}
              disabled={isLoading}
              createLabel="Yangi filial"
              createTitle="Yangi filial"
              createClassName="max-w-lg"
              createPermission={PERMISSIONS.BRANCHES_CREATE}
              create={<BranchCreateModal />}
              onCreated={(b) => obj.setField("homeBranchId", String(b._id))}
            />
          )}

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
                required
                error={isStudent && !obj.enrolledAt}
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
            <Button
              type="submit"
              disabled={isLoading || !isStepOneValid() || checkPending}
              className="flex-1"
            >
              {checkPending
                ? "Tekshirilmoqda..."
                : isTeacher
                  ? "Keyingisi"
                  : isLoading
                    ? "Yaratilmoqda..."
                    : "Yaratish"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            <b>
              {obj.firstName} {obj.lastName}
            </b>{" "}
            uchun maosh. Keyinroq ham belgilash mumkin, lekin stavkasiz
            o'qituvchining maoshi <b>0</b> bo'lib hisoblanadi.
          </p>

          <CompensationFields form={obj} disabled={isLoading} />

          {salaryValid && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Natija: </span>
              <b>{describeCompensation(obj)}</b>
            </div>
          )}

          {salaryTouched && !salaryValid && (
            <p className="text-xs text-red-600 dark:text-red-300">
              Stavka summasi kiritilmagan. To'ldiring yoki "Keyinroq
              belgilayman" ni tanlang.
            </p>
          )}

          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => obj.setField("step", 1)}
              disabled={isLoading}
              className="sm:flex-1"
            >
              Orqaga
            </Button>
            {/* MAOSHSIZ YARATISH: forma to'liq bo'lmasa ham o'qituvchi
                yaratiladi. Bu ATAYLAB alohida tugma - "Yaratish" ni bosib
                jimgina maoshsiz qolib ketish eng yomon holat bo'lardi. */}
            <Button
              type="button"
              variant="ghost"
              onClick={() => submit(false)}
              disabled={isLoading}
              className="sm:flex-1"
            >
              Keyinroq belgilayman
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !salaryValid || percentTooBig}
              className="sm:flex-1"
            >
              {isLoading ? "Yaratilmoqda..." : "Yaratish"}
            </Button>
          </div>
        </>
      )}
    </form>
  );
};

export default UserCreateModal;
