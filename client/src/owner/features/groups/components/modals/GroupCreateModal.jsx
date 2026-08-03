import GroupForm from "../GroupForm";
import useGroupCreateMutation from "../../hooks/useGroupCreateMutation";

// `onCreated` - selectdan "Yangi qo'shish" orqali ochilganda beriladi:
// yaratilgan guruh darhol tanlanishi uchun (CreatableSelectField).
const GroupCreateModal = ({ close, isLoading, setIsLoading, onCreated }) => {
  const { mutate } = useGroupCreateMutation({
    onSuccess: (data) => {
      setIsLoading(false);
      onCreated?.(data);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (body) => {
    setIsLoading(true);
    mutate(body);
  };

  return (
    <GroupForm
      onSubmit={handleSubmit}
      onCancel={() => close?.()}
      isLoading={isLoading}
      submitLabel="Yaratish"
    />
  );
};

export default GroupCreateModal;
