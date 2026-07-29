// Components
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import UserCreateModal from "../features/users/components/UserCreateModal";
import StaffCreateModal from "../features/users/components/StaffCreateModal";
import GroupCreateModal from "../features/groups/components/modals/GroupCreateModal";
import LeadCreateModal from "../features/leads/components/LeadCreateModal";
import DiscountCreateModal from "../features/finance/components/modals/DiscountCreateModal";

// Constants
import { MODAL } from "@/shared/constants/modals";

// Yaratish modallari GLOBAL mount qilinadi: <CreateMenu /> ularni istalgan
// sahifadan ochadi, shuning uchun ular sahifaga bog'lanib qolmasligi kerak.
//
// DIQQAT: shu nomdagi ModalWrapper sahifa darajasida TAKRORLANMASIN -
// bir nom ikki marta mount qilinsa, bitta openModal ikkita dialog ochadi.
// Shu sabab StudentsPage/TeachersPage, GroupsListPage, LeadsListPage va
// DiscountsPage dan olib tashlangan.
const CreateModals = () => (
  <>
    <ModalWrapper name={MODAL.USER_CREATE} title="Yangi foydalanuvchi">
      <UserCreateModal />
    </ModalWrapper>

    <ModalWrapper name={MODAL.STAFF_CREATE} title="Xodim qo'shish">
      <StaffCreateModal />
    </ModalWrapper>

    <ModalWrapper
      name={MODAL.GROUP_CREATE}
      title="Yangi guruh"
      className="max-w-4xl"
    >
      <GroupCreateModal />
    </ModalWrapper>

    <ModalWrapper name={MODAL.LEAD_CREATE} title="Yangi lid" className="max-w-xl">
      <LeadCreateModal />
    </ModalWrapper>

    <ModalWrapper name={MODAL.DISCOUNT_CREATE} title="Yangi chegirma">
      <DiscountCreateModal />
    </ModalWrapper>
  </>
);

export default CreateModals;
