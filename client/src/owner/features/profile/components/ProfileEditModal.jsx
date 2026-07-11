import useObjectState from "@/shared/hooks/useObjectState";
import useProfileUpdateMutation from "../hooks/useProfileUpdateMutation";

import InputField from "@/shared/components/ui/input/InputField";
import Button from "@/shared/components/ui/button/Button";

const buildInitial = (user) => ({
  firstName: user?.firstName || "",
  lastName: user?.lastName || "",
});

// `user` ModalWrapper data orqali keladi
const ProfileEditModal = ({ user, close, isLoading, setIsLoading }) => {
  const obj = useObjectState(buildInitial(user));

  const { mutate } = useProfileUpdateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsLoading(true);
    mutate({
      firstName: obj.firstName.trim(),
      lastName: obj.lastName.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <InputField
          name="firstName"
          label="Ism"
          value={obj.firstName}
          onChange={(e) => obj.setField("firstName", e.target.value)}
          required
          disabled={isLoading}
        />
        <InputField
          name="lastName"
          label="Familiya"
          value={obj.lastName}
          onChange={(e) => obj.setField("lastName", e.target.value)}
          required
          disabled={isLoading}
        />
      </div>

      <div className="flex gap-2 pt-2">
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

export default ProfileEditModal;
