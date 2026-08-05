import useObjectState from "@/shared/hooks/useObjectState";
import useActiveBranch from "@/shared/hooks/useActiveBranch";
import Button from "@/shared/components/ui/button/Button";
import SelectField from "@/shared/components/ui/select/SelectField";
import ConfirmDialog from "@/shared/components/ui/modal/ConfirmDialog";
import { extractApiErrorMessage } from "@/shared/utils/apiError";
import LeadFormFields from "./LeadFormFields";
import { useLeadCreateMutation } from "../hooks/useLeadMutations";
import { validateLead, hasErrors } from "../utils/leadValidation";

const initial = {
  branchId: "",
  firstName: "",
  lastName: "",
  age: "",
  phone: "",
  parentPhone: "",
  sourceId: "",
  directionId: "",
  status: "new",
  trialDate: "",
  rejectionReasonId: "",
  rejectionNote: "",
  assignedTo: "",
  notes: "",
};

const LeadCreateModal = ({ close, isLoading, setIsLoading }) => {
  const obj = useObjectState(initial);

  // Forma HOLATI (ma'lumotdan alohida):
  //   showErrors - "Yaratish" bosilganmi. Odam hali yozayotganda maydonlarni
  //                qizil bo'yash bosim beradi, shuning uchun faqat urinishdan
  //                KEYIN ko'rsatamiz.
  //   confirmOpen - tasdiq oynasi.
  //   errorMsg   - serverdan qaytgan xato. Toast o'chib ketadi, bu esa
  //                oynada turadi va operator nima bo'lganini o'qib oladi.
  const ui = useObjectState({
    showErrors: false,
    confirmOpen: false,
    errorMsg: "",
  });

  // FILIAL. Odatda server aktiv filialdan (x-branch-id) oladi. Lekin
  // "Barcha filiallar" rejimida aktiv filial YO'Q - lid qaysi filialga
  // kelganini SO'RAYMIZ (foydalanuvchi qo'shishdagi bilan bir xil qoida).
  const { branches, isAllBranches, multiBranch } = useActiveBranch();
  const needsBranch = multiBranch && isAllBranches;
  const branchOptions = branches.map((b) => ({
    value: String(b._id),
    label: b.name,
  }));

  const { mutate } = useLeadCreateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: (err) => {
      setIsLoading(false);
      ui.setField("errorMsg", extractApiErrorMessage(err));
    },
  });

  const validate = () => {
    const found = validateLead(obj);
    if (needsBranch && !obj.branchId) found.branchId = "Filialni tanlang";
    return found;
  };

  const errors = ui.showErrors ? validate() : {};

  // Bu yerga FAQAT lid formasining o'zidan kelinadi. Ichki oynalardagi
  // ("+ Yangi manba") Enter QuickCreateModal ichida to'xtatiladi - aks holda
  // React portal hodisasi ota formani yuborib, lid so'ralmasdan yaratilardi.
  const handleSubmit = (e) => {
    e.preventDefault();
    ui.setFields({ showErrors: true, errorMsg: "" });
    if (hasErrors(validate())) return;
    ui.setField("confirmOpen", true);
  };

  const handleConfirm = () => {
    ui.setFields({ confirmOpen: false, errorMsg: "" });
    setIsLoading(true);
    mutate({
      ...(needsBranch && obj.branchId ? { branchId: obj.branchId } : {}),
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
      // Yopish izohi ILGARI YUBORILMAS EDI: forma uni so'rardi-yu, so'rov
      // tanasiga qo'shmasdi, natijada "rad etilgan" lid har safar server
      // validatsiyasida yiqilardi.
      rejectionNote:
        obj.status === "rejected" ? (obj.rejectionNote || "").trim() : "",
      assignedTo: obj.assignedTo || null,
      notes: obj.notes || "",
    });
  };

  const fullName = `${obj.firstName} ${obj.lastName}`.trim();

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        {needsBranch && (
          <div>
            <SelectField
              label="Filial"
              placeholder="Filialni tanlang"
              value={obj.branchId}
              onChange={(v) => obj.setField("branchId", v?.target?.value ?? v)}
              options={branchOptions}
              required
              error={!obj.branchId}
              disabled={isLoading}
            />
            {errors.branchId && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-300">
                {errors.branchId}
              </p>
            )}
          </div>
        )}

        <LeadFormFields obj={obj} disabled={isLoading} errors={errors} />

        {/* Server xatosi - toastdan tashqari SHU YERDA ham. Toast bir necha
            soniyada yo'qoladi, forma esa ochiq qoladi va operator nega
            saqlanmaganini bilmay qolardi. */}
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
          {/* Tugma ATAYLAB o'chirilmaydi: to'ldirilmagan maydonda bosilsa
              nima yetishmayotgani QIZIL bo'lib ko'rsatiladi. O'chirilgan
              tugma esa sababni aytmasdan jim turadi. */}
          <Button type="submit" disabled={isLoading} className="flex-1">
            {isLoading ? "Yaratilmoqda..." : "Yaratish"}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={ui.confirmOpen}
        onOpenChange={(v) => ui.setField("confirmOpen", v)}
        onConfirm={handleConfirm}
        title="Lid yaratilsinmi?"
        description={[fullName, obj.phone].filter(Boolean).join(" • ")}
        confirmLabel="Ha, yaratish"
        cancelLabel="Yo'q"
        isLoading={isLoading}
      />
    </>
  );
};

export default LeadCreateModal;
