import useObjectState from "@/shared/hooks/useObjectState";

import Button from "@/shared/components/ui/button/Button";
import CompensationFields from "../CompensationFields";

import {
  useSetCompensationMutation,
  useAmendCompensationMutation,
} from "../../hooks/useCompensationMutations";
import {
  BASE_TYPES,
  VARIABLE_TYPES,
  hasAnyPart,
  toCompensationPayload,
  describeCompensation,
} from "../../utils/compensation";
import { todayInput, toDateInput } from "@/shared/utils/formatDate";

/**
 * MAOSH STAVKASINI BELGILASH / O'ZGARTIRISH.
 *
 * IKKI XIL AMAL, ATAYLAB AJRATILGAN:
 *   • "Yangi stavka" (set)   - eskisini yopib yangisini ochadi. Maosh TARIXI
 *     saqlanadi: martdagi oshirish yanvar maoshini o'zgartirmaydi.
 *   • "Tuzatish" (amend)     - amaldagi stavkani JOYIDA tuzatadi. Faqat XATO
 *     KIRITISH uchun ("nolni ko'p yozib yubordim").
 *
 * Foydalanuvchi bu farqni tushunishi kerak, shuning uchun u tugma matnida
 * va tushuntirish qatorida ochiq yozilgan - aks holda har oshirish tarixni
 * o'chirib yuborardi.
 */
const CompensationSetModal = ({
  teacherId,
  active,
  hiredAt,
  mode = "set",
  close,
  isLoading,
  setIsLoading,
}) => {
  const isAmend = mode === "amend" && active?._id;

  const form = useObjectState({
    baseType: active?.baseType || BASE_TYPES.FIXED_MONTHLY,
    baseAmount: active?.baseAmount ? String(active.baseAmount) : "",
    variableType: active?.variableType || VARIABLE_TYPES.NONE,
    variableRate: active?.variableRate ? String(active.variableRate) : "",
    percentBase: active?.percentBase || "billed",
    // Yangi stavka: default BUGUN (kelajakdan boshlash ham mumkin).
    // Tuzatish: mavjud sana o'zgarmaydi.
    effectiveFrom: isAmend
      ? toDateInput(active?.effectiveFrom)
      : todayInput(),
    note: isAmend ? active?.note || "" : "",
  });

  const done = () => {
    setIsLoading(false);
    close?.();
  };
  const fail = () => setIsLoading(false);

  const setMutation = useSetCompensationMutation(teacherId, {
    onSuccess: done,
    onError: fail,
  });
  const amendMutation = useAmendCompensationMutation(teacherId, {
    onSuccess: done,
    onError: fail,
  });

  const valid = hasAnyPart(form);
  const percentTooBig =
    form.variableType === VARIABLE_TYPES.PERCENT && Number(form.variableRate) > 100;

  // Stavka ishga olingan sanadan oldin boshlana olmaydi (server ham rad etadi).
  const beforeHire =
    hiredAt && form.effectiveFrom && form.effectiveFrom < toDateInput(hiredAt);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!valid || percentTooBig || beforeHire) return;

    const body = toCompensationPayload(form);
    setIsLoading(true);

    if (isAmend) {
      amendMutation.mutate({ id: active._id, body });
    } else {
      setMutation.mutate({ ...body, teacher: teacherId });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {active && !isAmend && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Hozirgi stavka: </span>
          <b>{describeCompensation(active)}</b>
        </div>
      )}

      <CompensationFields form={form} disabled={isLoading} />

      {beforeHire && (
        <p className="text-xs text-red-600 dark:text-red-300">
          Stavka ishga olingan sanadan ({toDateInput(hiredAt)}) oldin
          boshlana olmaydi.
        </p>
      )}

      {valid && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Yangi natija: </span>
          <b>{describeCompensation(form)}</b>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {isAmend
          ? "Amaldagi stavka joyida o'zgaradi — yangi tarix yozuvi ochilmaydi."
          : "Eski stavka yopilib tarixda qoladi. To'langan oylar qayta hisoblanmaydi."}
      </p>

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
          disabled={isLoading || !valid || percentTooBig || beforeHire}
          className="flex-1"
        >
          {isLoading ? "Saqlanmoqda..." : isAmend ? "Tuzatish" : "Saqlash"}
        </Button>
      </div>
    </form>
  );
};

export default CompensationSetModal;
