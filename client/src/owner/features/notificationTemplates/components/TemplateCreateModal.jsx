import useObjectState from "@/shared/hooks/useObjectState";
import Button from "@/shared/components/ui/button/Button";
import TemplateFormFields from "./TemplateFormFields";
import { useTemplateCreateMutation } from "../hooks/useTemplateMutations";

const TemplateCreateModal = ({ close, isLoading, setIsLoading }) => {
  const obj = useObjectState({ name: "", body: "", category: "custom" });
  const { mutate } = useTemplateCreateMutation({
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
      name: obj.name.trim(),
      body: obj.body,
      category: obj.category,
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
          {isLoading ? "Yaratilmoqda..." : "Yaratish"}
        </Button>
      </div>
    </form>
  );
};

export default TemplateCreateModal;
