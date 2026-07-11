import useObjectState from "@/shared/hooks/useObjectState";
import Button from "@/shared/components/ui/button/Button";
import TemplateFormFields from "./TemplateFormFields";
import { useTemplateUpdateMutation } from "../hooks/useTemplateMutations";

const TemplateEditModal = ({ template, close, isLoading, setIsLoading }) => {
  const obj = useObjectState({
    name: template?.name || "",
    body: template?.body || "",
    category: template?.category || "custom",
  });
  const { mutate } = useTemplateUpdateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!obj.name.trim() || !obj.body.trim()) return;
    setIsLoading(true);
    mutate({
      id: template._id,
      body: {
        name: obj.name.trim(),
        body: obj.body,
        category: obj.category,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <TemplateFormFields obj={obj} disabled={isLoading} />
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

export default TemplateEditModal;
