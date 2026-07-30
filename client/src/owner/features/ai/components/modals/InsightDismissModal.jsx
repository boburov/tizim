import { useState } from "react";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { useDismissInsightMutation } from "../../hooks/useInsightMutations";

// Insight'ni rad etish - sabab MAJBURIY.
//
// Nega majburiy: "bu noto'g'ri" degan signal modelni kalibrlash uchun
// mavjud eng qimmatli ma'lumot. Sababsiz rad etish nima uchun noto'g'ri
// ekanini yashiradi va vaznlarni tuzatishning imkonini bermaydi.
// Server ham buni talab qiladi - UI faqat shu qoidani aks ettiradi.
const InsightDismissModal = () => {
  const { data, closeModal } = useModal(MODAL.AI_INSIGHT_DISMISS);
  const [reason, setReason] = useState("");

  const { mutate, isPending } = useDismissInsightMutation({
    onSuccess: () => {
      setReason("");
      closeModal(MODAL.AI_INSIGHT_DISMISS);
    },
  });

  const submit = (e) => {
    e.preventDefault();
    if (reason.trim().length < 3) return;
    mutate({ id: data?._id, reason: reason.trim() });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{data?.subjectLabel}</span> bo'yicha
        bu baho nega noto'g'ri? Izohingiz kelgusi hisob-kitoblarni aniqroq qiladi.
      </p>

      <textarea
        autoFocus
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Masalan: o'quvchi kasal edi, ota-onasi ogohlantirgan"
        className="w-full resize-none rounded-md border border-border bg-background p-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
      />

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => closeModal(MODAL.AI_INSIGHT_DISMISS)}
          className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Bekor qilish
        </button>
        <button
          type="submit"
          disabled={isPending || reason.trim().length < 3}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Saqlanmoqda…" : "Rad etish"}
        </button>
      </div>
    </form>
  );
};

export default InsightDismissModal;
