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
import OpeningBalanceField from "@/owner/features/ledger/components/OpeningBalanceField";
import {
  parseOpeningAmount,
  isOpeningAmountValid,
} from "@/owner/features/ledger/utils/ledger";

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
import { NO_AUTOFILL, NO_AUTOFILL_FORM } from "@/shared/constants/form";
import { suggestUsername, suggestPassword } from "../utils/credentials";


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
  // Login va parol AVTOMATIK to'ldiriladi (ism yozilishi bilan).
  // `manualCreds` yoqilganda foydalanuvchi ularni o'zi boshqaradi va
  // avtomatik to'ldirish TO'XTAYDI — aks holda u yozgan qiymat
  // ustidan yozib yuborilardi.
  username: "",
  phone: "",
  password: "",
  manualCreds: false,
  role: defaultRole || ROLES.STUDENT,
  homeBranchId: "",

  gender: "",

  // student — ro'yxatga olingan sana majburiy, default bugun.
  enrolledAt: todayInput(),

  // teacher
  birthDate: "",
  hiredAt: "",

  // ── boshlang'ich qoldiq (ikkala rol uchun ham) ──
  // Ishorali summa: manfiy = odam qarzdor, musbat = markaz qarzdor,
  // 0/bo'sh = qoldiq yo'q.
  // Yig'ilgan holatda ochiladi — kamdan-kam kerak bo'ladigan maydon
  // kundalik yo'lni sekinlashtirmasin.
  showOpening: false,
  openingBalance: "",
  openingNote: "",

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

  // FILIAL OLDINDAN TANLANADI, agar bitta bo'lsa.
  //
  // Ilgari maydon BO'SH ochilardi va darhol QIZIL xato ko'rsatardi —
  // foydalanuvchi hali hech narsa qilmasdan turib. Bu "forma buzuq"
  // degan taassurot berardi. Endi bitta filial bo'lsa u o'zi
  // tanlanadi; ko'p bo'lsa tanlash SO'RALADI, lekin xato faqat
  // foydalanuvchi tanlashni O'TKAZIB YUBORGANDA ko'rinadi.
  const soleBranchId = branches.length === 1 ? String(branches[0]._id) : "";
  const branchOptions = branches.map((b) => ({
    value: String(b._id),
    label: b.name,
  }));

  /**
   * ISM YOZILGANDA LOGIN VA PAROL O'ZI TO'LDIRILADI.
   *
   * `manualCreds` yoqilgan bo'lsa TEGILMAYDI — foydalanuvchi ularni
   * o'zi boshqarayotgan bo'ladi va uning yozganini bosib ketish eng
   * jahlni chiqaradigan xatti-harakat bo'lardi.
   *
   * Parol BIR MARTA yasaladi va keyin o'zgarmaydi: har harf yozilganda
   * yangilanib tursa, administrator uni yozib olishga ulgurmasdi.
   */
  const setName = (field, value) => {
    const next = { ...obj.state, [field]: value };
    const patch = { [field]: value };
    if (!obj.manualCreds) {
      patch.username = suggestUsername(next.firstName, next.lastName);
      if (!obj.password) patch.password = suggestPassword();
    }
    obj.setFields(patch);
  };

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

  // LOGIN BANDLIGI - yozayotgan paytda tekshiriladi.
  //
  // Ilgari bu faqat SO'NGGI qadamda, server 409 qaytarganda bilinardi:
  // o'qituvchida bu ikkinchi qadam (maosh) ham to'ldirilgandan keyin
  // degani edi va odam hammasini boshidan kiritishga majbur bo'lardi.
  //
  // TELEFON tekshirilmaydi - bir raqamdan bir nechta odam foydalanishi
  // mumkin (ona ikki farzandini yozdiradi), server ham bloklamaydi.
  const { usernameTaken, isChecking, isStale } = useAvailabilityQuery({
    username: obj.username,
  });

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
    (!needsBranch || obj.homeBranchId || soleBranchId) &&
    // Nol/bo'sh - YAROQLI holat ("qoldiq yo'q"). Faqat chegaradan
    // oshgan summa yaratishni bloklaydi.
    isOpeningAmountValid(obj.openingBalance) &&
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
    const branchId = obj.homeBranchId || soleBranchId;
    if (needsBranch && branchId) body.homeBranchId = branchId;
    if (obj.phone.trim()) body.phone = obj.phone.trim();
    if (obj.gender) body.gender = obj.gender;

    // BOSHLANG'ICH QOLDIQ. Nol bo'lsa maydon UMUMAN yuborilmaydi -
    // server "qoldiq yo'q" holatini yozuvning YO'QLIGI bilan ifodalaydi
    // (nol summali yozuv rad etiladi).
    const opening = parseOpeningAmount(obj.openingBalance);
    if (opening) {
      body.openingBalance = opening;
      if (obj.openingNote.trim()) body.openingBalanceNote = obj.openingNote.trim();
    }

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
    <form onSubmit={handleSubmit} className="space-y-3" {...NO_AUTOFILL_FORM}>
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
              onChange={(e) => setName("firstName", e.target.value)}
              required
              disabled={isLoading}
              {...NO_AUTOFILL}
            />
            <InputField
              name="lastName"
              label="Familiya"
              value={obj.lastName}
              onChange={(e) => setName("lastName", e.target.value)}
              required
              disabled={isLoading}
              {...NO_AUTOFILL}
            />
          </div>
          {/* TELEFON TAKRORLANISHI MUMKIN: bir oila bitta raqamdan
              foydalanadi. "Band" tekshiruvi ataylab yo'q. */}
          <InputField
            type="tel"
            name="phone"
            label="Telefon (ixtiyoriy)"
            value={obj.phone}
            onChange={(e) => obj.setField("phone", e.target.value)}
            disabled={isLoading}
            {...NO_AUTOFILL}
          />

          {/* ══════════════════════════════════════════════════════════
              KIRISH MA'LUMOTLARI — AVTOMATIK, LEKIN KO'RINADIGAN
              ══════════════════════════════════════════════════════════

              Login va parol ism yozilishi bilan o'zi to'ldiriladi
              (`setName`). Ular YASHIRILMAYDI — administrator ularni
              o'quvchiga aytishi kerak, ya'ni ko'rib turishi shart.
              Lekin ular endi TO'LDIRILADIGAN maydon emas, KO'RSATILGAN
              natija.

              O'zgartirish kerak bo'lsa — bitta tugma. Ya'ni imkoniyat
              yo'qolmadi, faqat u endi majburiy yo'l emas. */}
          {!obj.manualCreds ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Kirish ma'lumotlari</p>
                  <p className="mt-1 font-mono text-sm text-foreground">
                    {obj.username || "—"}
                    <span className="mx-2 text-muted-foreground">·</span>
                    {obj.password || "—"}
                  </p>
                  {usernameTaken ? (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-300">
                      Bu login band — o'zgartiring
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Avtomatik yasaldi. Shu ma'lumotni odamga bering.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => obj.setField("password", suggestPassword())}
                    disabled={isLoading}
                    className="rounded-md border border-border px-2 py-1 text-xs text-foreground transition hover:bg-accent"
                  >
                    Boshqa parol
                  </button>
                  <button
                    type="button"
                    onClick={() => obj.setField("manualCreds", true)}
                    disabled={isLoading}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:text-foreground"
                  >
                    O'zim kiritaman
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
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
                  {...NO_AUTOFILL}
                />
                {usernameTaken && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-300">
                    Bu login allaqachon band — boshqasini tanlang
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
                {...NO_AUTOFILL}
                // Bu YANGI odamning paroli - brauzer bu yerga OPERATORNING
                // saqlangan parolini tiqib qo'ymasligi kerak. "new-password"
                // aynan shu holat uchun va "off" dan ko'ra ishonchli.
                autoComplete="new-password"
              />
            </>
          )}

          {/* ROL — FAQAT TANLANMAGAN BO'LSA SO'RALADI.
              Menyudan "O'quvchi" tanlab kelgan odamdan rolni QAYTA
              so'rash — u allaqachon javob bergan savolni takrorlash. */}
          {!defaultRole && (
            <SelectField
              label="Rol"
              value={obj.role}
              onChange={(v) => obj.setField("role", v)}
              options={ROLE_OPTIONS}
              required
              disabled={isLoading}
            />
          )}

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

          {/* ══════════════════════════════════════════════════════════
              BOSHLANG'ICH QOLDIQ — YIG'ILGAN HOLATDA
              ══════════════════════════════════════════════════════════

              Bu maydon TIZIMGA O'TISH paytidagi holat uchun: eski
              daftardan ko'chirilayotgan qarz yoki oldindan to'lov.
              Yangi o'quvchi qo'shishda u deyarli HAR DOIM bo'sh
              qoladi.

              Ochiq turganda u formaning yarmini egallardi va uch
              qatorlik izoh bilan birga "bu nima, to'ldirishim
              kerakmi?" degan savol tug'dirardi — har safar, har
              o'quvchida.

              Yig'ilgan holatda u YO'QOLMAYDI: kerak bo'lganda bitta
              bosishda ochiladi. Ya'ni kamdan-kam holat kundalik
              yo'lni sekinlashtirmaydi. */}
          {obj.showOpening ? (
            <OpeningBalanceField
              form={obj}
              disabled={isLoading}
              personLabel={isStudent ? "o'quvchi" : "o'qituvchi"}
            />
          ) : (
            <button
              type="button"
              onClick={() => obj.setField("showOpening", true)}
              disabled={isLoading}
              className="self-start text-xs text-muted-foreground underline-offset-2 transition hover:text-foreground hover:underline"
            >
              + Boshlang'ich qoldiq (eski qarz yoki oldindan to'lov)
            </button>
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
            uchun maosh. Stavkasiz maosh <b>0</b> hisoblanadi.
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
              Stavka summasi kiritilmagan.
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
