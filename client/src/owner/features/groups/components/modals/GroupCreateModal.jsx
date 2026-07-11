import GroupForm from "../GroupForm";
import useGroupCreateMutation from "../../hooks/useGroupCreateMutation";

const GroupCreateModal = ({ close, isLoading, setIsLoading }) => {
  const { mutate } = useGroupCreateMutation({
    onSuccess: () => {
      setIsLoading(false);
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
