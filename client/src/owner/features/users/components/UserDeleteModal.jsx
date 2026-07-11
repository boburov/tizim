// Components
import Button from "@/shared/components/ui/button/Button";
import SelectField from "@/shared/components/ui/select/SelectField";
import InputField from "@/shared/components/ui/input/InputField";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import useUserRemoveMutation from "../hooks/useUserRemoveMutation";
import useArchiveReasonsQuery from "@/owner/features/archiveReasons/hooks/useArchiveReasonsQuery";

// Constants
import { ROLES } from "@/shared/constants/roles";
import { toDateInput } from "@/shared/utils/formatDate";

const UserDeleteModal = ({ user, close, isLoading, setIsLoading }) => {
  const today = toDateInput(new Date());
  const obj = useObjectState({ reasonId: "", archiveDate: today });
  const isStudent = user?.role === ROLES.STUDENT;

  const { data } = useArchiveReasonsQuery(
    isStudent ? { limit: 200 } : undefined,
  );
  const reasonOptions = [
    { value: "", label: "Sababsiz" },
    ...(data?.data || []).map((r) => ({ value: r._id, label: r.title })),
  ];

  const { mutate } = useUserRemoveMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleConfirm = () => {
    setIsLoading(true);
    mutate({
      id: user._id,
      reasonId: obj.reasonId || undefined,
      archiveDate: obj.archiveDate || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-semibold">
          {user?.firstName} {user?.lastName}
        </span>{" "}
        arxivlanadi (Arxiv filtrida ko'rinadi, qaytarish mumkin). Davom
        etasizmi?
      </p>

      <InputField
        type="date"
        name="archiveDate"
        label="Arxiv sanasi"
        value={obj.archiveDate}
        max={today}
        onChange={(e) => obj.setField("archiveDate", e.target.value)}
        disabled={isLoading}
      />

      {isStudent && (
        <SelectField
          searchable
          label="Arxivlash sababi"
          value={obj.reasonId}
          onChange={(v) => obj.setField("reasonId", v)}
          options={reasonOptions}
          disabled={isLoading}
        />
      )}

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
          onClick={handleConfirm}
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading ? "Arxivlanmoqda..." : "Arxivlash"}
        </Button>
      </div>
    </div>
  );
};

export default UserDeleteModal;
