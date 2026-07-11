import useObjectState from "@/shared/hooks/useObjectState";
import Button from "@/shared/components/ui/button/Button";
import HolidayFormFields from "./HolidayFormFields";
import { useHolidayCreateMutation } from "../hooks/useHolidayMutations";

const HolidayCreateModal = ({ close, isLoading, setIsLoading }) => {
  const obj = useObjectState({
    name: "",
    isRecurring: true,
    month: 1,
    day: 1,
    year: "",
    message: "",
    audience: "all",
  });

  const { mutate } = useHolidayCreateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!obj.name.trim() || !obj.message.trim() || !obj.day || !obj.month) return;
    if (!obj.isRecurring && !obj.year) return;
    setIsLoading(true);
    mutate({
      name: obj.name.trim(),
      isRecurring: !!obj.isRecurring,
      month: Number(obj.month),
      day: Number(obj.day),
      year: obj.isRecurring ? undefined : Number(obj.year),
      message: obj.message,
      audience: obj.audience,
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
          {isLoading ? "Yaratilmoqda..." : "Yaratish"}
        </Button>
      </div>
    </form>
  );
};

export default HolidayCreateModal;
