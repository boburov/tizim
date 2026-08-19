// Components
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import useModal from "@/shared/hooks/useModal";
import { ROLES } from "@/shared/constants/roles";

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
const CreateModals = () => {
  /**
   * SARLAVHA YARATILAYOTGAN NARSANI ATAYDI.
   *
   * Ilgari u har doim "Yangi foydalanuvchi" edi — menyuda "O'quvchi"
   * ni tanlagan odam ham shu sarlavhani ko'rardi. Bu kichik narsadek
   * tuyuladi, lekin u ishonchni buzadi: odam "men noto'g'ri tugmani
   * bosdimmi?" deb o'ylaydi va formani boshidan tekshirib chiqadi.
   *
   * Rol modal MA'LUMOTIDA keladi (`openModal(..., { defaultRole })`),
   * shuning uchun sarlavha ham o'shandan olinadi.
   */
  const { data: userData } = useModal(MODAL.USER_CREATE);
  const userTitle =
    userData?.defaultRole === ROLES.TEACHER ? "Yangi o'qituvchi"
      : userData?.defaultRole === ROLES.STUDENT ? "Yangi o'quvchi"
        : "Yangi foydalanuvchi";

  return (
  <>
    <ModalWrapper name={MODAL.USER_CREATE} title={userTitle}>
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
};

export default CreateModals;
