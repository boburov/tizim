// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import useUsersListQuery from "@/owner/features/users/hooks/useUsersListQuery";
import { useLeadReminderBulkMutation } from "../hooks/useLeadMutations";

// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";

// Utils
import { formatPhone } from "@/shared/utils/formatPhone";

// "YYYY-MM-DDTHH:mm" (datetime-local, mahalliy vaqt)
const toLocalInput = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Default - ERTAGA 10:00. Amalda eslatma deyarli har doim "ertaga qayta
// qo'ng'iroq" degani bo'ladi, shuning uchun forma shu holatda ochiladi va
// xodim odatda faqat "Saqlash" ni bosadi.
const tomorrowAt10 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toLocalInput(d);
};

const LeadBulkReminderModal = ({
  leads = [],
  close,
  isLoading,
  setIsLoading,
  onDone,
}) => {
  const obj = useObjectState({
    followUpAt: tomorrowAt10(),
    followUpNote: "",
    // "" - mas'ulga TEGMAYMIZ (har lid o'zinikini saqlaydi).
    assignedTo: "",
    showError: false,
  });

  const staffQ = useUsersListQuery({ staff: 1, limit: 200 });
  const staffOptions = [
    { value: "", label: "O'zgartirilmasin" },
    { value: "none", label: "Mas'ulni olib tashlash" },
    ...(staffQ.data?.data || []).map((u) => ({
      value: u._id,
      label: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.username,
    })),
  ];

  const { mutate } = useLeadReminderBulkMutation({
    onSuccess: () => {
      setIsLoading(false);
      onDone?.();
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const submit = (clear) => {
    setIsLoading(true);
    mutate({
      ids: leads.map((l) => String(l._id)),
      followUpAt: clear ? null : new Date(obj.followUpAt).toISOString(),
      followUpNote: clear ? "" : obj.followUpNote || "",
      // "" bo'lsa maydonni UMUMAN yubormaymiz - server `undefined` ni
      // "tegmaslik" deb tushunadi. "none" esa aniq "bo'shatish" buyrug'i.
      ...(obj.assignedTo
        ? { assignedTo: obj.assignedTo === "none" ? null : obj.assignedTo }
        : {}),
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!obj.followUpAt) {
      obj.setField("showError", true);
      return;
    }
    submit(false);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <b>{leads.length} ta lid</b> uchun bitta eslatma o&apos;rnatiladi. Vaqti
        kelganda mas&apos;ul xodimga platformada va Telegram bog&apos;langan
        bo&apos;lsa botda xabar boradi.
      </p>

      {/* Kimga tegishli ekani ko'rinib tursin: 200 tagacha lid tanlansa
          ham operator nimani o'zgartirayotganini bilishi kerak. */}
      <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded-md border bg-muted/40 p-2 text-xs">
        {leads.map((l) => (
          <li key={l._id} className="flex justify-between gap-2">
            <span className="font-medium">
              {l.firstName} {l.lastName}
            </span>
            <span className="text-muted-foreground">{formatPhone(l.phone)}</span>
          </li>
        ))}
      </ul>

      <div>
        <InputField
          type="datetime-local"
          name="followUpAt"
          label="Qayta bog'lanish sanasi va vaqti"
          value={obj.followUpAt}
          onChange={(e) =>
            obj.setFields({ followUpAt: e.target.value, showError: false })
          }
          required
          error={obj.showError && !obj.followUpAt}
          disabled={isLoading}
        />
        {obj.showError && !obj.followUpAt && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-300">
            Sana va vaqtni tanlang
          </p>
        )}
      </div>

      <SelectField
        searchable
        label="Mas'ul xodim"
        description="Tanlansa - barcha belgilangan lidlarning mas'uli almashadi"
        value={obj.assignedTo}
        onChange={(v) => obj.setField("assignedTo", v)}
        options={staffOptions}
        isLoading={staffQ.isLoading}
        searchPlaceholder="Xodim qidirish..."
        emptyText="Xodim topilmadi"
        disabled={isLoading}
      />

      <div>
        <label htmlFor="bulkNote" className="mb-1 block text-sm font-medium">
          Izoh (ixtiyoriy)
        </label>
        <textarea
          id="bulkNote"
          rows={2}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Masalan: narx haqida gaplashish kerak"
          value={obj.followUpNote}
          onChange={(e) => obj.setField("followUpNote", e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {/* Ommaviy O'CHIRISH ham kerak: noto'g'ri vaqtga qo'yilgan 20 ta
            eslatmani bittalab olib tashlash - o'sha xatoning ikkinchi qismi. */}
        <Button
          type="button"
          variant="outline"
          onClick={() => submit(true)}
          disabled={isLoading}
          className="text-red-600 dark:text-red-300"
        >
          Eslatmani o&apos;chirish
        </Button>
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

export default LeadBulkReminderModal;
