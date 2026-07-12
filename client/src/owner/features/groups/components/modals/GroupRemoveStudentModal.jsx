import { useState } from "react";
import Button from "@/shared/components/ui/button/Button";
import SelectField from "@/shared/components/ui/select/SelectField";
import useGroupRemoveStudentMutation from "../../hooks/useGroupRemoveStudentMutation";
import useArchiveReasonsQuery from "@/owner/features/archiveReasons/hooks/useArchiveReasonsQuery";

const formatMoney = (n) => new Intl.NumberFormat("uz-UZ").format(Number(n) || 0);

const GroupRemoveStudentModal = ({
  groupId,
  student,
  close,
  isLoading,
  setIsLoading,
}) => {
  const [reasonId, setReasonId] = useState("");
  // Qarz aniqlanganda (OUTSTANDING_DEBT) - summa saqlanadi va write-off tasdiq
  // ko'rinishi ochiladi. null → oddiy chiqarish ko'rinishi.
  const [debtAmount, setDebtAmount] = useState(null);

  const { data } = useArchiveReasonsQuery({ limit: 200 });
  const reasonOptions = [
    { value: "", label: "Sababsiz" },
    ...(data?.data || []).map((r) => ({ value: r._id, label: r.title })),
  ];

  const { mutate } = useGroupRemoveStudentMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: (err) => {
      setIsLoading(false);
      const resp = err?.response?.data;
      if (resp?.code === "OUTSTANDING_DEBT") {
        setDebtAmount(resp?.details?.amount || 0);
      }
    },
  });

  const handleRemove = (writeOff = false) => {
    setIsLoading(true);
    mutate({
      id: groupId,
      studentId: student._id,
      reasonId: reasonId || undefined,
      writeOff,
    });
  };

  const studentName = `${student?.firstName || ""} ${student?.lastName || ""}`.trim();

  // 2-bosqich: qarz aniqlandi → yomon qarz tasdig'i
  if (debtAmount != null) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="mb-1 font-semibold">Qarz aniqlandi</p>
          <p>
            <span className="font-semibold">{studentName}</span> o'quvchisida hali{" "}
            <span className="font-semibold">{formatMoney(debtAmount)} so'm</span>{" "}
            to'lanmagan qarz bor. Agar hozir chiqarsangiz, bu qarz{" "}
            <span className="font-semibold">Undirilmagan to'lov (hisobdan chiqarilgan)</span>{" "}
            sifatida yoziladi. O'quvchi bu summani endi to'lashi shart emas va u
            ta'lim markazi uchun moliyaviy zarar sifatida hisoblanadi.
          </p>
        </div>

        <div className="flex gap-2">
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
            type="button"
            variant="danger"
            onClick={() => handleRemove(true)}
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading ? "Bajarilmoqda..." : "Chiqarish va hisobdan chiqarish"}
          </Button>
        </div>
      </div>
    );
  }

  // 1-bosqich: oddiy chiqarish
  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-semibold">{studentName}</span> guruhdan chiqariladi.
        Davomat va to'lov tarixi saqlanadi. Davom etasizmi?
      </p>

      <SelectField
        searchable
        label="Chiqish sababi"
        value={reasonId}
        onChange={setReasonId}
        options={reasonOptions}
        disabled={isLoading}
      />

      <div className="flex gap-2">
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
          type="button"
          variant="danger"
          onClick={() => handleRemove(false)}
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading ? "Chiqarilmoqda..." : "Chiqarish"}
        </Button>
      </div>
    </div>
  );
};

export default GroupRemoveStudentModal;
