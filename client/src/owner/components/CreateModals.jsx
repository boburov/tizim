// Components
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import UserCreateModal from "../features/users/components/UserCreateModal";
import GroupCreateModal from "../features/groups/components/modals/GroupCreateModal";

// Constants
import { MODAL } from "@/shared/constants/modals";

// Yaratish modallari GLOBAL mount qilinadi: <CreateMenu /> ularni istalgan
// sahifadan ochadi, shuning uchun ular sahifaga bog'lanib qolmasligi kerak.
//
// DIQQAT: shu nomdagi ModalWrapper sahifa darajasida TAKRORLANMASIN -
// bir nom ikki marta mount qilinsa, bitta openModal ikkita dialog ochadi.
// Shu sabab StudentsPage/TeachersPage va GroupsListPage dan olib tashlangan.
const CreateModals = () => (
  <>
    <ModalWrapper name={MODAL.USER_CREATE} title="Yangi foydalanuvchi">
      <UserCreateModal />
    </ModalWrapper>

    <ModalWrapper
      name={MODAL.GROUP_CREATE}
      title="Yangi guruh"
      className="max-w-4xl"
    >
      <GroupCreateModal />
    </ModalWrapper>
  </>
);

export default CreateModals;
