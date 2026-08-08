import useObjectState from "@/shared/hooks/useObjectState";
import Button from "@/shared/components/ui/button/Button";
import { extractApiErrorMessage } from "@/shared/utils/apiError";
import LeadFormFields from "./LeadFormFields";
import { useLeadUpdateMutation } from "../hooks/useLeadMutations";
import { validateLead, hasErrors } from "../utils/leadValidation";
import { NO_AUTOFILL_FORM } from "@/shared/constants/form";

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

const LeadEditModal = ({ lead, close, isLoading, setIsLoading }) => {
  const obj = useObjectState({
    firstName: lead?.firstName || "",
    lastName: lead?.lastName || "",
    age: lead?.age ?? "",
    phone: lead?.phone || "",
    parentPhone: lead?.parentPhone || "",
    sourceId: lead?.source?._id || "",
    directionId: lead?.direction?._id || "",
    status: lead?.status || "new",
    trialDate: toDateInput(lead?.trialDate),
    rejectionReasonId: lead?.rejectionReason?._id || "",
    rejectionNote: lead?.rejectionNote || "",
    // Populate qilingan obyekt ham, xom ObjectId ham kelishi mumkin.
    assignedTo: lead?.assignedTo?._id || lead?.assignedTo || "",
    notes: lead?.notes || "",
  });

  // Forma holati ma'lumotdan alohida: xatolarni faqat "Saqlash" bosilgandan
  // KEYIN ko'rsatamiz, server xatosi esa oynada turadi (toast o'chib ketadi).
  const ui = useObjectState({ showErrors: false, errorMsg: "" });

  const { mutate } = useLeadUpdateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: (err) => {
      setIsLoading(false);
      ui.setField("errorMsg", extractApiErrorMessage(err));
    },
  });

  const errors = ui.showErrors ? validateLead(obj) : {};

  const handleSubmit = (e) => {
    e.preventDefault();
    ui.setFields({ showErrors: true, errorMsg: "" });
    if (hasErrors(validateLead(obj))) return;
    setIsLoading(true);
    mutate({
      id: lead._id,
      body: {
        firstName: obj.firstName.trim(),
        lastName: obj.lastName.trim(),
        age: obj.age ? Number(obj.age) : null,
        phone: obj.phone,
        parentPhone: obj.parentPhone || null,
        sourceId: obj.sourceId || null,
        directionId: obj.directionId || null,
        status: obj.status,
        trialDate: obj.trialDate || null,
        rejectionReasonId:
          obj.status === "rejected" ? obj.rejectionReasonId || null : null,
        rejectionNote:
          obj.status === "rejected" ? (obj.rejectionNote || "").trim() : "",
        assignedTo: obj.assignedTo || null,
        notes: obj.notes || "",
      },
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-3"
      {...NO_AUTOFILL_FORM}
    >
      <LeadFormFields obj={obj} disabled={isLoading} errors={errors} />

      {ui.errorMsg && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
          {ui.errorMsg}
        </p>
      )}

      {ui.showErrors && hasErrors(errors) && !ui.errorMsg && (
        <p className="text-xs text-red-600 dark:text-red-300">
          Majburiy maydonlarni to&apos;ldiring.
        </p>
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
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>
    </form>
  );
};

export default LeadEditModal;
