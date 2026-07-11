import { useState } from "react";
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import { useLeadOptionUpdateMutation } from "../hooks/useLeadOptionMutations";

const LeadOptionEditModal = ({ option, close, isLoading, setIsLoading }) => {
  const [name, setName] = useState(option?.name || "");

  const { mutate } = useLeadOptionUpdateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsLoading(true);
    mutate({ id: option._id, body: { name: name.trim() } });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <InputField
        name="name"
        label="Nom"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        disabled={isLoading}
      />
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

export default LeadOptionEditModal;
