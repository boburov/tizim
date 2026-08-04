// React
import { useMemo } from "react";

// Icons
import { RefreshCw, Copy } from "lucide-react";

// Sonner
import { toast } from "sonner";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import useGroupsListQuery from "@/owner/features/groups/hooks/useGroupsListQuery";
import { useLeadConvertMutation } from "../hooks/useLeadMutations";

// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import CreatableSelectField from "@/shared/components/ui/select/CreatableSelectField";
import GroupCreateModal from "@/owner/features/groups/components/modals/GroupCreateModal";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";

// Utils
import { generateCredentials, generatePassword, generateUsername } from "@/shared/utils/credentials";

const GENDER_OPTIONS = [
  { value: "male", label: "Erkak" },
  { value: "female", label: "Ayol" },
];

const LeadConvertModal = ({ lead, close, isLoading, setIsLoading }) => {
  // Login/parol DARHOL tayyor bo'ladi. Ilgari operator ularni o'zi o'ylab
  // topardi - qabul qilishdagi eng sekin qadam shu edi.
  //
  // useMemo SHART: `useObjectState` argumenti har renderda hisoblanadi, ya'ni
  // memosiz har harf yozilganda yangi parol yasalib, foydalanuvchi ko'chirib
  // olgan parol jimgina eskirardi (qiymatning o'zi almashmasa ham, `resetState`
  // boshqa parolga qaytarardi).
  const initialCreds = useMemo(
    () => generateCredentials(lead?.firstName, lead?.lastName),
    [lead?.firstName, lead?.lastName],
  );
  const obj = useObjectState({
    firstName: lead?.firstName || "",
    lastName: lead?.lastName || "",
    phone: lead?.phone || "",
    gender: "",
    enrolledAt: "",
    groupId: "",
    ...initialCreds,
  });

  // Guruh tanlash: arxivlanmagan guruhlar. Ro'yxatda kerakli guruh bo'lmasa
  // shu yerdan "+ Yangi guruh" bilan ochiladi (yangi sotuvlar oqimi uchun).
  const { data: groupsData, isLoading: loadingGroups } = useGroupsListQuery({
    limit: 200,
  });
  const groupOptions = useMemo(
    () => [
      { value: "", label: "Guruhsiz" },
      ...(groupsData?.data || []).map((g) => ({ value: g._id, label: g.name })),
    ],
    [groupsData],
  );

  const { mutate } = useLeadConvertMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const copy = async (value, label) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} nusxa olindi`);
    } catch {
      toast.error("Nusxa olishda xatolik");
    }
  };

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
    // Guruh tanlansa - o'quvchi shu qadamning O'ZIDA guruhga qabul qilinadi.
    if (obj.groupId) body.groupId = obj.groupId;
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

      <div className="flex items-end gap-2">
        <InputField
          name="username"
          label="Login (username)"
          className="flex-1"
          // Input'ning standart limiti 20 - server esa 40 belgigacha ruxsat
          // beradi. Uzun familiyali generatsiya qilingan login kesilib qolmasin.
          maxLength={40}
          value={obj.username}
          onChange={(e) => obj.setField("username", e.target.value)}
          required
          disabled={isLoading}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Loginni qayta generatsiya qilish"
          aria-label="Loginni qayta generatsiya qilish"
          disabled={isLoading}
          onClick={() =>
            obj.setField(
              "username",
              generateUsername(obj.firstName, obj.lastName, [obj.username]),
            )
          }
        >
          <RefreshCw className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Loginni nusxalash"
          aria-label="Loginni nusxalash"
          onClick={() => copy(obj.username, "Login")}
        >
          <Copy className="size-4" />
        </Button>
      </div>

      <InputField
        type="tel"
        name="phone"
        label="Telefon"
        value={obj.phone}
        onChange={(e) => obj.setField("phone", e.target.value)}
        required
        disabled={isLoading}
      />

      <div className="flex items-end gap-2">
        <InputField
          type="password"
          name="password"
          label="Parol"
          className="flex-1"
          value={obj.password}
          onChange={(e) => obj.setField("password", e.target.value)}
          required
          disabled={isLoading}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Parolni qayta generatsiya qilish"
          aria-label="Parolni qayta generatsiya qilish"
          disabled={isLoading}
          onClick={() => obj.setField("password", generatePassword())}
        >
          <RefreshCw className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Parolni nusxalash"
          aria-label="Parolni nusxalash"
          onClick={() => copy(obj.password, "Parol")}
        >
          <Copy className="size-4" />
        </Button>
      </div>

      <CreatableSelectField
        searchable
        label="Guruh"
        description="Tanlansa o'quvchi shu yerning o'zida guruhga qabul qilinadi."
        value={obj.groupId}
        onChange={(v) => obj.setField("groupId", v)}
        options={groupOptions}
        isLoading={loadingGroups}
        placeholder="Guruhni tanlang"
        searchPlaceholder="Guruh qidirish..."
        emptyText="Guruh topilmadi"
        disabled={isLoading}
        createLabel="Yangi guruh"
        createTitle="Yangi guruh"
        createPermission={PERMISSIONS.GROUPS_CREATE}
        createClassName="max-w-2xl"
        create={<GroupCreateModal />}
        onCreated={(g) => obj.setField("groupId", g._id)}
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
