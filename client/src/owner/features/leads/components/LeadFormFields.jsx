import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import CreatableSelectField from "@/shared/components/ui/select/CreatableSelectField";
import { LEAD_STATUS_OPTIONS } from "@/shared/constants/leadStatus";
import { PERMISSIONS } from "@/shared/constants/permissions";
import useLeadOptionsQuery from "../hooks/useLeadOptionsQuery";
import LeadOptionCreateModal from "./LeadOptionCreateModal";

// Server bilan bir xil bo'lishi SHART (leads.validators.js: MIN_NOTE).
const MIN_CLOSING_NOTE = 10;

const withEmpty = (data, placeholder = "-") => [
  { value: "", label: placeholder },
  ...(data?.data || []).map((o) => ({ value: o._id, label: o.name })),
];

// Ikki raqam bir xilligini tekshirish uchun: formatlash belgilarini
// (probel, qavs, chiziqcha, +) tashlab faqat raqamlarni solishtiramiz.
// "+998 90 123 45 67" va "998901234567" - bir xil raqam.
const digitsOnly = (v) => String(v || "").replace(/\D/g, "");

const LeadFormFields = ({ obj, disabled = false }) => {
  // Ikkala maydon ham to'ldirilgan VA bir xil bo'lsa - xato.
  // Server ham shuni rad etadi, lekin foydalanuvchi buni YOZAYOTGANDA
  // ko'rishi kerak, saqlash tugmasini bosgandan keyin emas.
  const bothPhonesSame =
    digitsOnly(obj.phone).length > 0 &&
    digitsOnly(obj.phone) === digitsOnly(obj.parentPhone);

  const sourceQ = useLeadOptionsQuery({ kind: "source" });
  const directionQ = useLeadOptionsQuery({ kind: "direction" });
  const rejectionQ = useLeadOptionsQuery({ kind: "rejection" });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <InputField
          name="firstName"
          label="Ism"
          value={obj.firstName}
          onChange={(e) => obj.setField("firstName", e.target.value)}
          required
          disabled={disabled}
        />
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
        <InputField
          type="tel"
          name="phone"
          label="Telefon"
          value={obj.phone}
          onChange={(e) => obj.setField("phone", e.target.value)}
          required
          disabled={disabled}
        />
        <InputField
          type="tel"
          name="parentPhone"
          label="Qo'shimcha telefon"
          description="O'zining yoki ota-onasining (ixtiyoriy)"
          value={obj.parentPhone}
          error={bothPhonesSame}
          onChange={(e) => obj.setField("parentPhone", e.target.value)}
          disabled={disabled}
        />
      </div>

      {bothPhonesSame && (
        <p className="-mt-1 text-xs text-red-600 dark:text-red-300">
          Ikkala raqam bir xil. Qo&apos;shimcha raqam BOSHQA odamniki
          bo&apos;lishi kerak — aks holda undan foyda yo&apos;q.
        </p>
      )}

      <InputField
        type="number"
        name="age"
        label="Yoshi"
        min="1"
        max="120"
        value={obj.age}
        onChange={(e) => obj.setField("age", e.target.value)}
        disabled={disabled}
      />

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
            error={!obj.rejectionReasonId}
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
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Narxi qimmat dedi, 400 mingga rozi edi"
              value={obj.rejectionNote || ""}
              onChange={(e) => obj.setField("rejectionNote", e.target.value)}
              disabled={disabled}
            />
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
