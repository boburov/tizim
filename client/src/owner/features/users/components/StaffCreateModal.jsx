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
import OpeningBalanceField from "@/owner/features/ledger/components/OpeningBalanceField";

// Constants
import { ROLES } from "@/shared/constants/roles";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { suggestUsername, suggestPassword } from "../utils/credentials";
import { NO_AUTOFILL, NO_AUTOFILL_FORM } from "@/shared/constants/form";
import {
  parseOpeningAmount,
  isOpeningAmountValid,
} from "@/owner/features/ledger/utils/ledger";

const initialState = (homeBranchId) => ({
  firstName: "",
  lastName: "",
  phone: "",
  // Login va parol AVTOMATIK — ism yozilishi bilan
  // (`UserCreateModal` bilan bir xil qoida, bitta yordamchidan).
  username: "",
  password: "",
  manualCreds: false,
  // Kamdan-kam kerak — yig'ilgan holatda ochiladi.
  showOpening: false,
  role: "",
  homeBranchId: homeBranchId || "",

  // Boshlang'ich qoldiq - ishga olishdan OLDINGI hisob-kitob.
  // Manfiy = xodim qarzdor, musbat = markaz qarzdor, 0 = qoldiq yo'q.
  openingBalance: "",
  openingNote: "",
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

  /** Ism yozilganda login+parol o'zi to'ldiriladi (qo'lda rejimda tegilmaydi). */
  const setName = (field, value) => {
    const next = { ...obj.state, [field]: value };
    const patch = { [field]: value };
    if (!obj.manualCreds) {
      patch.username = suggestUsername(next.firstName, next.lastName);
      if (!obj.password) patch.password = suggestPassword();
    }
    obj.setFields(patch);
  };

  const usernameShort =
    obj.username.trim().length > 0 && obj.username.trim().length < 3;

  // Login bandligi - saqlashdan OLDIN, maydonning o'zida. Telefon
  // tekshirilmaydi: takrorlanish ruxsat etilgan (server ham bloklamaydi).
  const { usernameTaken, isChecking, isStale } = useAvailabilityQuery({
    username: obj.username,
  });
  const checkPending = isChecking || isStale;

  const isValid =
    obj.firstName.trim() &&
    obj.lastName.trim() &&
    obj.username.trim().length >= 3 &&
    obj.password.length >= 6 &&
    obj.role &&
    obj.homeBranchId &&
    // Nol/bo'sh - YAROQLI holat ("qoldiq yo'q").
    isOpeningAmountValid(obj.openingBalance) &&
    !usernameTaken;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid || checkPending) return;
    setIsLoading(true);

    const body = {
      firstName: obj.firstName.trim(),
      lastName: obj.lastName.trim(),
      username: obj.username.trim().toLowerCase(),
      password: obj.password,
      phone: obj.phone || undefined,
      role: obj.role,
      homeBranchId: obj.homeBranchId,
    };

    // Nol bo'lsa maydon UMUMAN yuborilmaydi: server "qoldiq yo'q"
    // holatini yozuvning YO'QLIGI bilan ifodalaydi.
    const opening = parseOpeningAmount(obj.openingBalance);
    if (opening) {
      body.openingBalance = opening;
      if (obj.openingNote.trim()) body.openingBalanceNote = obj.openingNote.trim();
    }

    mutate(body);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" {...NO_AUTOFILL_FORM}>
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
        label="Telefon"
        value={obj.phone}
        onChange={(e) => obj.setField("phone", e.target.value)}
        disabled={isLoading}
        {...NO_AUTOFILL}
      />

      {/* KIRISH MA'LUMOTLARI — AVTOMATIK.
          Xodim qo'shayotgan odam login o'ylab topishi shart emas:
          u ismdan yasaladi, parol esa og'zaki aytish uchun qulay
          alifbodan (chalkashadigan l/I/0/O belgilarisiz).
          Batafsil: `users/utils/credentials.js`. */}
      <div className="pt-2 border-t">
        <p className="text-sm font-medium mb-2">Kirish ma'lumotlari</p>
        {!obj.manualCreds ? (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <div className="min-w-0">
              <p className="font-mono text-sm text-foreground">
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
                  Avtomatik yasaldi. Shu ma'lumotni xodimga bering.
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
        ) : (
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
                {...NO_AUTOFILL}
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
              {...NO_AUTOFILL}
              // Yangi xodimning paroli - operatorning saqlangan paroli
              // bu yerga tiqilib qolmasligi kerak.
              autoComplete="new-password"
            />
          </div>
        )}
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

      {/* BOSHLANG'ICH QOLDIQ — YIG'ILGAN.
          Tizimga o'tish paytidagi eski qarz uchun; yangi xodim
          qo'shishda deyarli har doim bo'sh qoladi. Ochiq turganda
          formaning uchdan birini egallab, har safar "buni
          to'ldirishim kerakmi?" degan savol tug'dirardi. */}
      <div className="pt-2 border-t">
        {obj.showOpening ? (
          <OpeningBalanceField
            form={obj}
            disabled={isLoading}
            personLabel="xodim"
          />
        ) : (
          <button
            type="button"
            onClick={() => obj.setField("showOpening", true)}
            disabled={isLoading}
            className="text-xs text-muted-foreground underline-offset-2 transition hover:text-foreground hover:underline"
          >
            + Boshlang'ich qoldiq (eski qarz yoki oldindan to'lov)
          </button>
        )}
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
