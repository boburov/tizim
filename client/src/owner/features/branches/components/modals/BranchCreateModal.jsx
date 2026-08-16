// React
import { useState } from "react";

// Icons
import { ChevronDown } from "lucide-react";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";

// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";

// Feature
import { useBranchCreateMutation } from "../../hooks/useBranchMutations";
import { useRolesQuery } from "@/owner/features/roles";

// Constants / utils
import { ROLES } from "@/shared/constants/roles";
import { cn } from "@/shared/utils/cn";
import { phoneOrNull } from "@/shared/utils/formatPhone";

/**
 * FILIAL YARATISH - UCH MAYDON.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA SODDALASHTIRILDI
 *
 * Ilgari formada 9 ta maydon bor edi (filial nomi, manzil, telefon,
 * direktor ismi, familiyasi, telefoni, roli, logini, paroli) va ularning
 * SAKKIZTASI ixtiyoriy edi. Natijada eng oddiy amal - "yangi filial
 * ochib, direktorga kirish berish" - to'ldirilmagan maydonlar orasida
 * yo'qolib ketardi.
 *
 * Endi ekranda faqat AMALNI TUGATADIGAN uchta maydon turadi:
 *
 *     Filial nomi   →  markazda qanday ataladi
 *     Login         →  direktor tizimga qanday kiradi
 *     Parol         →  ...va nima bilan kiradi
 *
 * Qolgani "Qo'shimcha" ostida yig'ilgan - o'chirilmagan, chunki manzil
 * va telefon hujjatlarda kerak bo'ladi, rol esa filialni direktordan
 * boshqa lavozimga (masalan menejerga) berish imkonini beradi.
 *
 * DIREKTOR ISMI SO'RALMAYDI: server bo'sh ismni ko'rinadigan o'rinbosar
 * bilan to'ldiradi ("Direktor <filial nomi>"), ya'ni xodimlar ro'yxatida
 * u darhol ko'zga tashlanadi va tahrirlanadi. Ismni majburiy qilish
 * butun amalni "pasportda qanday yozilgan edi?" degan savolga
 * bog'lab qo'yardi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * DIREKTOR BLOKI IXTIYORIY BO'LIB QOLADI: login ham, parol ham bo'sh
 * bo'lsa faqat filial ochiladi. Bu ataylab - server foydalanuvchisi bor
 * filialni o'chirishga yo'l qo'ymaydi, ya'ni majburiy direktor "endi bu
 * filialni hech qachon o'chirib bo'lmaydi" degani bo'lardi.
 */
// `onCreated` - selectdan "Yangi qo'shish" orqali ochilganda beriladi:
// yaratilgan filial darhol tanlanishi uchun (CreatableSelectField).
const BranchCreateModal = ({ close, isLoading, setIsLoading, onCreated }) => {
  const [showMore, setShowMore] = useState(false);

  const obj = useObjectState({
    name: "",
    username: "",
    password: "",
    // Qo'shimcha
    address: "",
    phone: "",
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

  const username = obj.username.trim();
  const usernameShort = username.length > 0 && username.length < 3;
  const passwordShort = obj.password.length > 0 && obj.password.length < 6;

  // Hisob bloki umuman tegilmaganmi?
  const accountUntouched = !username && !obj.password;
  const accountComplete = username.length >= 3 && obj.password.length >= 6;

  // Nom yetarli. Hisob esa yo bo'sh, yo to'liq: yarim to'ldirilgani
  // jimgina tashlab yuborilsa foydalanuvchi "kirish ham berildi" deb
  // o'ylab qolardi.
  const isValid =
    Boolean(obj.name.trim()) && (accountUntouched || accountComplete);

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
      ...(accountUntouched
        ? {}
        : {
            director: {
              username: username.toLowerCase(),
              password: obj.password,
              role: obj.dirRole || "director",
            },
          }),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* `maxLength` ANIQ KO'RSATILGAN - `Input` standart holatda barcha
          matn maydonini 20 belgida KESADI (DEFAULT_MAX_LENGTH). Server
          esa 120 gacha qabul qiladi (`createSchema`). Ko'rsatilmasa
          "Yunusobod 2-filial (yangi bino)" kabi nom jimgina qirqilib,
          bazaga chala yozilardi - foydalanuvchiga hech qanday xabar
          bermasdan. */}
      <InputField
        autoFocus
        required
        name="name"
        label="Filial nomi"
        placeholder="masalan: Chilonzor"
        maxLength={120}
        value={obj.name}
        onChange={(e) => obj.setField("name", e.target.value)}
        disabled={isLoading}
      />

      <div className="space-y-3 rounded-md border p-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Direktor kirishi</p>
          <p className="text-xs text-muted-foreground">
            Ixtiyoriy — keyinroq &laquo;Xodim qo&apos;shish&raquo; orqali ham
            berish mumkin.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <InputField
            name="username"
            label="Login"
            placeholder="masalan: chilonzor"
            autoComplete="off"
            maxLength={40}
            value={obj.username}
            onChange={(e) => obj.setField("username", e.target.value)}
            error={usernameShort}
            description={usernameShort ? "Kamida 3 ta belgi" : ""}
            disabled={isLoading}
          />
          <InputField
            type="password"
            name="password"
            label="Parol"
            autoComplete="new-password"
            maxLength={100}
            value={obj.password}
            onChange={(e) => obj.setField("password", e.target.value)}
            error={passwordShort}
            description="Kamida 6 ta belgi"
            disabled={isLoading}
          />
        </div>
      </div>

      {/* QO'SHIMCHA - yig'ilgan holda. Maydonlar DOM'da faqat ochilganda
          paydo bo'ladi: yashirin, lekin tab bilan yetib boriladigan
          maydon ekran o'quvchi uchun "yo'qdek" ko'rinib, aslida
          fokus oladi. */}
      <div>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown
            className={cn("size-4 transition-transform", showMore && "rotate-180")}
          />
          Qo&apos;shimcha
        </button>

        {showMore && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <InputField
              name="address"
              label="Manzil"
              maxLength={300}
              value={obj.address}
              onChange={(e) => obj.setField("address", e.target.value)}
              disabled={isLoading}
            />
            <InputField
              type="tel"
              name="phone"
              label="Filial telefoni"
              value={obj.phone}
              onChange={(e) => obj.setField("phone", e.target.value)}
              disabled={isLoading}
            />
            {roleOptions.length > 0 && (
              <SelectField
                name="dirRole"
                label="Rahbar roli"
                options={roleOptions}
                value={obj.dirRole}
                onChange={(v) => obj.setField("dirRole", v?.target?.value ?? v)}
                disabled={isLoading}
                description="Login berilganda qo'llanadi"
              />
            )}
          </div>
        )}
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
