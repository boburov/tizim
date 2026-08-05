// Components
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import StaffCreateModal from "./StaffCreateModal";
import UserDeleteModal from "./UserDeleteModal";
import UserPermanentDeleteModal from "./UserPermanentDeleteModal";
import UserRestoreModal from "./UserRestoreModal";
import UserEditModal from "./UserEditModal";
import UserPasswordModal from "./UserPasswordModal";
import UserFreezeModal from "./UserFreezeModal";
import UserUnfreezeModal from "./UserUnfreezeModal";
import { EmploymentDateChangeModal } from "@/owner/features/staffPayroll";

// Constants
import { MODAL } from "@/shared/constants/modals";

// UsersTable qatoridan ochiladigan modallar. O'quvchilar va O'qituvchilar
// endi ikki alohida sahifa - ikkalasi ham shu to'plamni mount qiladi.
// Bir vaqtda faqat bittasi render bo'ladi, shuning uchun nom to'qnashuvi yo'q.
//
// USER_CREATE bu yerda YO'Q: u global mount qilingan (owner/components/CreateModals).
const UserModals = () => (
  <>
    <ModalWrapper name={MODAL.USER_DELETE} title="Foydalanuvchini arxivlash">
      <UserDeleteModal />
    </ModalWrapper>
    <ModalWrapper name={MODAL.USER_PERMANENT_DELETE} title="Butunlay o'chirish">
      <UserPermanentDeleteModal />
    </ModalWrapper>
    <ModalWrapper name={MODAL.USER_RESTORE} title="Foydalanuvchini tiklash">
      <UserRestoreModal />
    </ModalWrapper>
    <ModalWrapper
      name={MODAL.USER_EDIT}
      title="Profilni tahrirlash"
      className="max-w-xl"
    >
      <UserEditModal />
    </ModalWrapper>
    <ModalWrapper name={MODAL.USER_PASSWORD} title="Foydalanuvchi paroli">
      <UserPasswordModal />
    </ModalWrapper>
    <ModalWrapper name={MODAL.USER_FREEZE} title="O'quvchini muzlatish">
      <UserFreezeModal />
    </ModalWrapper>
    <ModalWrapper name={MODAL.USER_UNFREEZE} title="Muzlatishdan chiqarish">
      <UserUnfreezeModal />
    </ModalWrapper>
    {/* Ishga olingan sana o'zgargandan KEYIN chiqadi: HR saqlangan,
        moliyaviy qism esa egasining ataylab qilgan tanlovi. */}
    <ModalWrapper
      name={MODAL.EMPLOYMENT_DATE_CHANGE}
      title="Maosh tarixi o'zgarmaydi"
      className="max-w-lg"
    >
      <EmploymentDateChangeModal />
    </ModalWrapper>
  </>
);

export default UserModals;
