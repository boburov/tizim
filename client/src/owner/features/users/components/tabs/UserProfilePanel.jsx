import { useOutletContext } from "react-router-dom";
import {
  UserProfileCard,
  UserActiveGroupsList,
  UserTaughtGroupsList,
  UserTelegramCard,
} from "@/shared/components/userProfile";
import UserPasswordCard from "../UserPasswordCard";
import { StaffSalaryCard } from "@/owner/features/staffPayroll";
import useModal from "@/shared/hooks/useModal";
import { ROLES } from "@/shared/constants/roles";
import { MODAL } from "@/shared/constants/modals";

const UserProfilePanel = () => {
  const { profile } = useOutletContext();
  const { openModal } = useModal();
  const isStudent = profile.role === ROLES.STUDENT;
  const isTeacher = profile.role === ROLES.TEACHER;

  const openAddToGroup = () =>
    openModal(MODAL.STUDENT_ADD_TO_GROUP, {
      studentId: profile._id,
      // Boshlash sanasi ro'yxatga olingan sanadan oldin bo'lmasligi uchun.
      enrolledAt: profile.enrolledAt,
      excludeGroupIds: (profile.activeGroups || [])
        .map((m) => m.group?._id)
        .filter(Boolean),
    });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pt-4 lg:gap-6">
      <div className="lg:col-span-2 space-y-5">
        <UserProfileCard profile={profile} />
      </div>
      <div className="space-y-5">
        {/* MAOSH - FAQAT XODIMLARDA (staff payroll moduli).
            O'QUVCHIDA: ma'nosiz.
            O'QITUVCHIDA: ATAYLAB YASHIRILGAN. Bu karta StaffCompensation'ni
            o'qiydi, o'qituvchining oyligi esa BUTUNLAY boshqa modulda
            (TeacherCompensation) va profil tepasida ko'rinib turadi. Ikkalasi
            bir sahifada turganda karta "Maosh shartnomasi belgilanmagan - bu
            xodimga maosh hisoblanmaydi" deb yozardi, holbuki o'qituvchiga
            3 mln/oy hisoblanayotgan bo'lardi - ochiqdan-ochiq zid ma'lumot.
            Ustiga-ustak "Belgilash" tugmasi ham boshi berk ko'cha edi:
            forma standart `salaryType:"fixed"` yuboradi, server esa
            o'qituvchiga faqat `kpi_only` ga ruxsat beradi (oylik ikki marta
            hisoblanmasligi uchun) - ya'ni tugma har doim xato qaytarardi.
            Backend allaqachon shu qarashda: employeesWithoutCompensation()
            o'qituvchini ro'yxatdan chiqarib tashlaydi. */}
        {!isStudent && !isTeacher && <StaffSalaryCard employee={profile} />}
        <UserPasswordCard user={profile} />
        <UserTelegramCard telegram={profile.telegram} />
        {isStudent && (
          <UserActiveGroupsList
            activeGroups={profile.activeGroups || []}
            ownerLinks
            onAddToGroup={openAddToGroup}
          />
        )}
        {profile.role === ROLES.TEACHER && (
          <UserTaughtGroupsList groups={profile.groups || []} ownerLinks />
        )}
      </div>
    </div>
  );
};

export default UserProfilePanel;
