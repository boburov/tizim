import useObjectState from "@/shared/hooks/useObjectState";
import Button from "@/shared/components/ui/button/Button";
import CreatableSelectField from "@/shared/components/ui/select/CreatableSelectField";
import LeadOptionCreateModal from "./LeadOptionCreateModal";
import { useLeadUpdateMutation } from "../hooks/useLeadMutations";
import useLeadOptionsQuery from "../hooks/useLeadOptionsQuery";
import { PERMISSIONS } from "@/shared/constants/permissions";

// LIDNI YOPISH - maxsus modal.
//
// NEGA TO'LIQ TAHRIRLASH FORMASI EMAS (avval shunday edi):
// xodim faqat "rad etildi" deb belgilamoqchi, lekin oldida ism, telefon,
// yosh, manba, yo'nalish, sinov sanasi... 10 ta maydon turardi. Natijada
// eng muhim maydon (sabab) shu shovqinda ko'zdan qochardi va ko'pincha
// bo'sh qolardi.
//
// Bu modalda FAQAT IKKI SAVOL bor - ikkalasi ham majburiy.

// Izoh minimal uzunligi - SERVER bilan bir xil bo'lishi shart
// (leads.validators.js: MIN_NOTE). Farq qilsa foydalanuvchi formani
// to'ldiradi-yu, server 400 qaytarardi.
const MIN_NOTE = 10;

// Xodimga NIMA yozishni ko'rsatadigan namunalar. Bo'sh "Izoh" maydoni
// oldida odam "yaxshi", "yo'q" deb yozadi - bu tahlil uchun yaroqsiz.
const HINTS = [
  "Narxi qimmat dedi, 400 mingga rozi edi",
  "Uydan uzoq ekan, transport qiyin",
  "Kechqurun vaqti yo'q, faqat ertalab bo'lardi",
  "Boshqa markazga yozilib bo'libdi",
];

const LeadCloseModal = ({ lead, close, isLoading, setIsLoading }) => {
  const obj = useObjectState({
    rejectionReasonId: lead?.rejectionReason?._id || "",
    rejectionNote: lead?.rejectionNote || "",
  });

  // Hook javob konvertini (`{success, data}`) qaytaradi - ro'yxat `.data`
  // ichida. Bo'sh variant ATAYLAB qo'shilmaydi: sabab majburiy, "-" varianti
  // esa uni ixtiyoriy qilib ko'rsatardi.
  const rejectionQ = useLeadOptionsQuery({ kind: "rejection" });
  const options = (rejectionQ.data?.data || []).map((o) => ({
    value: o._id,
    label: o.name,
  }));

  const { mutate } = useLeadUpdateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const note = obj.rejectionNote.trim();
  const noteTooShort = note.length > 0 && note.length < MIN_NOTE;
  const isValid = obj.rejectionReasonId && note.length >= MIN_NOTE;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) return;
    setIsLoading(true);
    mutate({
      id: lead._id,
      body: {
        status: "rejected",
        rejectionReasonId: obj.rejectionReasonId,
        rejectionNote: note,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <b>
          {lead?.firstName} {lead?.lastName}
        </b>{" "}
        lidi yopiladi. Sabab yozilmasa, keyin &quot;nega mijozlar
        kelmayapti?&quot; savoliga javob topib bo&apos;lmaydi.
      </p>

      <CreatableSelectField
        searchable
        label="Rad etish sababi"
        placeholder="Sababni tanlang"
        value={obj.rejectionReasonId}
        onChange={(v) => obj.setField("rejectionReasonId", v)}
        options={options}
        required
        error={!obj.rejectionReasonId}
        disabled={isLoading}
        createLabel="Yangi sabab"
        createTitle="Yangi rad etish sababi"
        createPermission={PERMISSIONS.LEADS_MANAGE}
        create={<LeadOptionCreateModal kind="rejection" />}
        onCreated={(o) => obj.setField("rejectionReasonId", o._id)}
      />

      <div>
        <label
          htmlFor="rejectionNote"
          className="mb-1 block text-sm font-medium"
        >
          Mijoz nima dedi?
          <span className="text-primary">*</span>
        </label>
        <textarea
          id="rejectionNote"
          rows={3}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder={HINTS[0]}
          value={obj.rejectionNote}
          onChange={(e) => obj.setField("rejectionNote", e.target.value)}
          disabled={isLoading}
        />

        <div className="mt-1 flex items-start justify-between gap-2">
          <p
            className={
              noteTooShort
                ? "text-xs text-red-600 dark:text-red-300"
                : "text-xs text-muted-foreground"
            }
          >
            {noteTooShort
              ? `Yana ${MIN_NOTE - note.length} ta belgi kerak — bitta mazmunli jumla yozing.`
              : "Mijozning o'z so'zlari eng qimmatli — qanday aytgan bo'lsa shunday yozing."}
          </p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {note.length}/1000
          </span>
        </div>

        {/* Namunalar bosiladi: bo'sh maydon oldida odam nima yozishni
            bilmaydi va "yo'q" deb qutuladi. Namuna bosilsa u matnni
            o'zgartirib yozadi - bu bo'sh maydondan ancha yaxshi. */}
        {note.length === 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {HINTS.map((h) => (
              <button
                key={h}
                type="button"
                disabled={isLoading}
                onClick={() => obj.setField("rejectionNote", h)}
                className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {h}
              </button>
            ))}
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
        <Button
          type="submit"
          disabled={isLoading || !isValid}
          className="flex-1"
        >
          {isLoading ? "Yopilmoqda..." : "Lidni yopish"}
        </Button>
      </div>
    </form>
  );
};

export default LeadCloseModal;
