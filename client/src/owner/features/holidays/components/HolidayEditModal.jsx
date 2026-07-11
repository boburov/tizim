import useObjectState from "@/shared/hooks/useObjectState";
import Button from "@/shared/components/ui/button/Button";
import HolidayFormFields from "./HolidayFormFields";
import { useHolidayUpdateMutation } from "../hooks/useHolidayMutations";

const HolidayEditModal = ({ holiday, close, isLoading, setIsLoading }) => {
  const obj = useObjectState({
    name: holiday?.name || "",
    isRecurring: holiday?.isRecurring ?? true,
    month: holiday?.month || 1,
    day: holiday?.day || 1,
    year: holiday?.year || "",
    message: holiday?.message || "",
    audience: holiday?.audience || "all",
  });

  const { mutate } = useHolidayUpdateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!obj.name.trim() || !obj.message.trim()) return;
    setIsLoading(true);
    mutate({
      id: holiday._id,
      body: {
        name: obj.name.trim(),
        isRecurring: !!obj.isRecurring,
        month: Number(obj.month),
        day: Number(obj.day),
        year: obj.isRecurring ? null : Number(obj.year),
        message: obj.message,
        audience: obj.audience,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <HolidayFormFields obj={obj} disabled={isLoading} />
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

export default HolidayEditModal;
