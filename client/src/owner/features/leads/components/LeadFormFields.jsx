import { cn } from "@/shared/utils/cn";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import CreatableSelectField from "@/shared/components/ui/select/CreatableSelectField";
import { LEAD_STATUS_OPTIONS } from "@/shared/constants/leadStatus";
import { PERMISSIONS } from "@/shared/constants/permissions";
import useUsersListQuery from "@/owner/features/users/hooks/useUsersListQuery";
import useLeadOptionsQuery from "../hooks/useLeadOptionsQuery";
import LeadOptionCreateModal from "./LeadOptionCreateModal";
import {
  digitsOnly,
  MIN_CLOSING_NOTE,
} from "../utils/leadValidation";

const withEmpty = (data, placeholder = "-") => [
  { value: "", label: placeholder },
  ...(data?.data || []).map((o) => ({ value: o._id, label: o.name })),
];

// Maydon ostidagi qizil izoh. Xato matni bo'lmasa - hech narsa chiqmaydi.
const FieldError = ({ children }) =>
  children ? (
    <p className="mt-1 text-xs text-red-600 dark:text-red-300">{children}</p>
  ) : null;

// `errors` - { maydon: "xato matni" }. Faqat forma YUBORILGANDAN keyin
// to'ldiriladi: hali yozayotgan odamga qizil bo'yash bosim beradi.
const LeadFormFields = ({ obj, disabled = false, errors = {} }) => {
  // Ikkala maydon ham to'ldirilgan VA bir xil bo'lsa - xato.
  // Server ham shuni rad etadi, lekin foydalanuvchi buni YOZAYOTGANDA
  // ko'rishi kerak, saqlash tugmasini bosgandan keyin emas.
  const bothPhonesSame =
    digitsOnly(obj.phone).length > 0 &&
    digitsOnly(obj.phone) === digitsOnly(obj.parentPhone);

  const sourceQ = useLeadOptionsQuery({ kind: "source" });
  const directionQ = useLeadOptionsQuery({ kind: "direction" });
  const rejectionQ = useLeadOptionsQuery({ kind: "rejection" });

  // MAS'UL uchun ro'yxat: o'quvchidan boshqa hamma (ega, o'qituvchi, custom
  // rollar). `staff: 1` - server bayrog'i, ertaga yaratilgan rol ham
  // avtomatik shu ro'yxatga tushadi.
  const staffQ = useUsersListQuery({ staff: 1, limit: 200 });
  const staffOptions = [
    { value: "", label: "Mas'ul yo'q" },
    ...(staffQ.data?.data || []).map((u) => ({
      value: u._id,
      label: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.username,
    })),
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <InputField
            name="firstName"
            label="Ism"
            value={obj.firstName}
            onChange={(e) => obj.setField("firstName", e.target.value)}
            required
            error={!!errors.firstName}
            disabled={disabled}
          />
          <FieldError>{errors.firstName}</FieldError>
        </div>
        <InputField
          name="lastName"
          label="Familiya"
          value={obj.lastName}
          onChange={(e) => obj.setField("lastName", e.target.value)}
          disabled={disabled}
        />
      </div>

      {/* IKKI TELEFON YONMA-YON.
          Ilgari ikkinchisi pastda, alohida qatorda turardi va xodim uni
          ko'pincha to'ldirmasdi. Lid bilan bog'lanib bo'lmasligi esa
          sotuvni to'g'ridan-to'g'ri yo'qotadi - ikkinchi raqam aynan shu
          xavfni kamaytiradi, shuning uchun u birinchisining YONIDA. */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <InputField
            type="tel"
            name="phone"
            label="Telefon"
            value={obj.phone}
            onChange={(e) => obj.setField("phone", e.target.value)}
            required
            error={!!errors.phone}
            disabled={disabled}
          />
          <FieldError>{errors.phone}</FieldError>
        </div>
        <InputField
          type="tel"
          name="parentPhone"
          label="Qo'shimcha telefon"
          description="O'zining yoki ota-onasining (ixtiyoriy)"
          value={obj.parentPhone}
          error={bothPhonesSame || !!errors.parentPhone}
          onChange={(e) => obj.setField("parentPhone", e.target.value)}
          disabled={disabled}
        />
      </div>

      {bothPhonesSame ? (
        <p className="-mt-1 text-xs text-red-600 dark:text-red-300">
          Ikkala raqam bir xil. Qo&apos;shimcha raqam BOSHQA odamniki
          bo&apos;lishi kerak — aks holda undan foyda yo&apos;q.
        </p>
      ) : (
        <FieldError>{errors.parentPhone}</FieldError>
      )}

      <div>
        <InputField
          type="number"
          name="age"
          label="Yoshi"
          min="1"
          max="120"
          value={obj.age}
          onChange={(e) => obj.setField("age", e.target.value)}
          error={!!errors.age}
          disabled={disabled}
        />
        <FieldError>{errors.age}</FieldError>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CreatableSelectField
          searchable
          label="Manba"
          value={obj.sourceId}
          onChange={(v) => obj.setField("sourceId", v)}
          options={withEmpty(sourceQ.data)}
          disabled={disabled}
          createLabel="Yangi manba"
          createTitle="Yangi manba"
          createPermission={PERMISSIONS.LEADS_MANAGE}
          create={<LeadOptionCreateModal kind="source" />}
          onCreated={(o) => obj.setField("sourceId", o._id)}
        />
        <CreatableSelectField
          searchable
          label="Yo'nalish"
          value={obj.directionId}
          onChange={(v) => obj.setField("directionId", v)}
          options={withEmpty(directionQ.data)}
          disabled={disabled}
          createLabel="Yangi yo'nalish"
          createTitle="Yangi yo'nalish"
          createPermission={PERMISSIONS.LEADS_MANAGE}
          create={<LeadOptionCreateModal kind="direction" />}
          onCreated={(o) => obj.setField("directionId", o._id)}
        />
      </div>

      {/* MAS'UL. Eslatma aynan shu odamga boradi (platformada ham,
          Telegramda ham) - shuning uchun u eslatma maydonlariga eng yaqin
          joyda turadi. Bo'sh qoldirilsa eslatma egalarga tushadi. */}
      <SelectField
        searchable
        label="Mas'ul xodim"
        description="Qayta bog'lanish eslatmasi shu odamga yuboriladi"
        value={obj.assignedTo || ""}
        onChange={(v) => obj.setField("assignedTo", v)}
        options={staffOptions}
        isLoading={staffQ.isLoading}
        placeholder="Mas'ul yo'q"
        searchPlaceholder="Xodim qidirish..."
        emptyText="Xodim topilmadi"
        disabled={disabled}
      />

      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Status"
          value={obj.status}
          onChange={(v) => obj.setField("status", v)}
          options={LEAD_STATUS_OPTIONS}
          disabled={disabled}
        />
        <InputField
          type="date"
          name="trialDate"
          label="Sinov darsi sanasi"
          value={obj.trialDate}
          onChange={(e) => obj.setField("trialDate", e.target.value)}
          disabled={disabled}
        />
      </div>

      {obj.status === "rejected" && (
        <>
          <CreatableSelectField
            searchable
            label="Rad etish sababi"
            value={obj.rejectionReasonId}
            onChange={(v) => obj.setField("rejectionReasonId", v)}
            options={withEmpty(rejectionQ.data)}
            required
            error={!obj.rejectionReasonId || !!errors.rejectionReasonId}
            disabled={disabled}
            createLabel="Yangi sabab"
            createTitle="Yangi rad etish sababi"
            createPermission={PERMISSIONS.LEADS_MANAGE}
            create={<LeadOptionCreateModal kind="rejection" />}
            onCreated={(o) => obj.setField("rejectionReasonId", o._id)}
          />

          {/* YOPISH IZOHI shu yerda ham majburiy: statusni tahrirlash
              modalidan ham "rad etilgan" ga o'zgartirish mumkin va server
              ikkala yo'lda ham bir xil talab qo'yadi. Bu maydon bo'lmasa
              foydalanuvchi saqlash tugmasini bosib 400 xato olardi va
              sababini tushunmasdi. */}
          <div>
            <label
              htmlFor="rejectionNote"
              className="mb-1 block text-sm font-medium"
            >
              Mijoz nima dedi?<span className="text-primary">*</span>
            </label>
            <textarea
              id="rejectionNote"
              rows={2}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary",
                errors.rejectionNote && "border-red-500",
              )}
              placeholder="Narxi qimmat dedi, 400 mingga rozi edi"
              value={obj.rejectionNote || ""}
              onChange={(e) => obj.setField("rejectionNote", e.target.value)}
              disabled={disabled}
            />
            <FieldError>{errors.rejectionNote}</FieldError>
            <p className="mt-1 text-xs text-muted-foreground">
              Kamida {MIN_CLOSING_NOTE} ta belgi. Bu matn &quot;nega mijozlar
              kelmayapti?&quot; tahlilining yagona manbai.
            </p>
          </div>
        </>
      )}

      <div>
        <label className="text-sm font-medium block mb-1">Izoh</label>
        <textarea
          rows={3}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Qo'shimcha izoh..."
          value={obj.notes}
          onChange={(e) => obj.setField("notes", e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
};

export default LeadFormFields;
