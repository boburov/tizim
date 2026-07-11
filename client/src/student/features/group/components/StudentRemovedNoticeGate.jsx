import { useEffect, useRef } from "react";

import useMeQuery from "@/features/auth/hooks/useMeQuery";
import useModal from "@/shared/hooks/useModal";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import { MODAL } from "@/shared/constants/modals";

import StudentRemovedNoticeModal from "./modals/StudentRemovedNoticeModal";

// O'quvchi guruhdan chiqarilgan bo'lsa, login qilganda bir marta modal ochadi.
// me.profile.removalNotice backend tomonidan beriladi (faqat ko'rilmagan, qayta
// qo'shilmagan holatda). Modal yopilganda backend "seen" qiladi va me qayta
// yuklanib removalNotice null bo'ladi - shuning uchun qayta ochilmaydi.
const StudentRemovedNoticeGate = () => {
  const { data: me } = useMeQuery();
  const { openModal } = useModal();
  const notice = me?.profile?.removalNotice || null;

  // Bir xil xabarni qayta-qayta ochmaslik uchun (modal yopilgach, lekin me hali
  // invalidate bo'lmaganida) ko'rsatilgan membershipId'ni eslab qolamiz.
  const shownRef = useRef(null);

  useEffect(() => {
    if (!notice?.membershipId) return;
    if (shownRef.current === notice.membershipId) return;
    shownRef.current = notice.membershipId;
    openModal(MODAL.STUDENT_REMOVED_NOTICE, {
      groupName: notice.groupName,
      reasonTitle: notice.reasonTitle,
    });
  }, [notice, openModal]);

  return (
    <ModalWrapper
      name={MODAL.STUDENT_REMOVED_NOTICE}
      title="Guruhdan chiqarildingiz"
    >
      <StudentRemovedNoticeModal />
    </ModalWrapper>
  );
};

export default StudentRemovedNoticeGate;
