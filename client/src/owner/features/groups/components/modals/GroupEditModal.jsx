import GroupForm from "../GroupForm";
import useGroupUpdateMutation from "../../hooks/useGroupUpdateMutation";

// `group` ModalWrapper orqali data sifatida keladi
const GroupEditModal = ({ group, close, isLoading, setIsLoading }) => {
  const { mutate } = useGroupUpdateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (body) => {
    setIsLoading(true);
    mutate({ id: group._id, body });
  };

  return (
    <GroupForm
      initial={group}
      onSubmit={handleSubmit}
      onCancel={() => close?.()}
      isLoading={isLoading}
      submitLabel="Saqlash"
    />
  );
};

export default GroupEditModal;
