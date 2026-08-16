// Components
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";

// Modal bodies (operatsion panel feature'laridan)
import UserCreateModal from "@/owner/features/users/components/UserCreateModal";
import StaffCreateModal from "@/owner/features/users/components/StaffCreateModal";
import GroupCreateModal from "@/owner/features/groups/components/modals/GroupCreateModal";
import LeadCreateModal from "@/owner/features/leads/components/LeadCreateModal";
import DiscountCreateModal from "@/owner/features/finance/components/modals/DiscountCreateModal";
import RoomCreateModal from "@/owner/features/catalog/components/modals/RoomCreateModal";
import BranchCreateModal from "@/owner/features/branches/components/modals/BranchCreateModal";

// Constants
import { MODAL } from "@/shared/constants/modals";

/**
 * YARATISH MODALLARI - GLOBAL mount.
 *
 * `CreateSplitButton` ularni istalgan sahifadan ochadi, shuning uchun
 * ular sahifaga bog'lanib qolmasligi kerak.
 *
 * ═══════════════════════════════════════════════════════════════════
 * DIQQAT: SHU NOMDAGI `ModalWrapper` SAHIFA DARAJASIDA TAKRORLANMASIN.
 *
 * Bir nom ikki marta mount qilinsa, bitta `openModal` IKKITA dialog
 * ochadi (ikkalasi ham bir xil redux kalitini kuzatadi). Shu sabab
 * StudentsPage/TeachersPage, GroupsListPage, LeadsListPage,
 * DiscountsPage va BranchesPage dan olib tashlangan.
 * ═══════════════════════════════════════════════════════════════════
 *
 * NEGA `shared` DA: endi IKKI qobiq ishlatadi - operatsion sidebar
 * (`AppSidebar`) va rahbariyat sarlavhasi (`ExecutiveHeader`). Ular bir
 * vaqtda ekranda bo'lmaydi (`/owner/*` va `/admin` alohida layout), ya'ni
 * ikki marta mount bo'lish xavfi yo'q.
 */
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

    <ModalWrapper name={MODAL.ROOM_CREATE} title="Yangi xona">
      <RoomCreateModal />
    </ModalWrapper>

    <ModalWrapper
      name={MODAL.BRANCH_CREATE}
      title="Yangi filial"
      className="max-w-lg"
    >
      <BranchCreateModal />
    </ModalWrapper>
  </>
);

export default CreateModals;
