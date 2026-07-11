// State
import { useState } from "react";

// Components
import Button from "@/shared/components/ui/button/Button";
import SelectField from "@/shared/components/ui/select/SelectField";

// Hooks
import useUserRestoreMutation from "../hooks/useUserRestoreMutation";
import useArchiveReasonsQuery from "@/owner/features/archiveReasons/hooks/useArchiveReasonsQuery";

// Constants
import { ROLES } from "@/shared/constants/roles";

const UserRestoreModal = ({ user, close, isLoading, setIsLoading }) => {
  const [reasonId, setReasonId] = useState("");
  const isStudent = user?.role === ROLES.STUDENT;

  const { data } = useArchiveReasonsQuery(
    isStudent ? { limit: 200 } : undefined,
  );
  const reasonOptions = [
    { value: "", label: "Sababsiz" },
    ...(data?.data || []).map((r) => ({ value: r._id, label: r.title })),
  ];

  const { mutate } = useUserRestoreMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleConfirm = () => {
    setIsLoading(true);
    mutate({ id: user._id, reasonId: reasonId || undefined });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-semibold">
          {user?.firstName} {user?.lastName}
        </span>{" "}
        tiklanadi (faol foydalanuvchilar ro'yxatiga qaytadi). Davom etasizmi?
      </p>

      {isStudent && (
        <SelectField
          searchable
          label="Qaytarish sababi"
          value={reasonId}
          onChange={setReasonId}
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
          onClick={handleConfirm}
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading ? "Tiklanmoqda..." : "Tiklash"}
        </Button>
      </div>
    </div>
  );
};

export default UserRestoreModal;
