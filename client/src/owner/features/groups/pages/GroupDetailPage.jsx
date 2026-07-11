// Router
import { useParams, useNavigate, Outlet } from "react-router-dom";

// Icons
import {
  Pencil,
  Trash2,
  CalendarCheck,
  CalendarRange,
  MoreHorizontal,
} from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import Badge from "@/shared/components/ui/badge/Badge";
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import { formatDateUz } from "@/shared/utils/formatDate";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/shared/components/shadcn/dropdown-menu";
import GroupEditModal from "../components/modals/GroupEditModal";
import GroupPermanentDeleteModal from "../components/modals/GroupPermanentDeleteModal";
import GroupAddStudentModal from "../components/modals/GroupAddStudentModal";
import GroupRemoveStudentModal from "../components/modals/GroupRemoveStudentModal";
import GroupStudentPeriodsModal from "../components/modals/GroupStudentPeriodsModal";
import { UserPasswordModal } from "@/owner/features/users";

// Hooks
import useModal from "@/shared/hooks/useModal";
import useGoBack from "@/shared/hooks/useGoBack";
import useGroupQuery from "../hooks/useGroupQuery";

// Constants
import { MODAL } from "@/shared/constants/modals";

// Utils
import BackLink from "@/shared/components/ui/link/BackLink";

const GroupDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { openModal } = useModal();
  const goBack = useGoBack("/owner/groups");
  const { data: group, isLoading, isError } = useGroupQuery(id);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Yuklanmoqda...
      </div>
    );
  }

  if (isError || !group) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground mb-4">Guruh topilmadi</p>
        <button
          type="button"
          onClick={goBack}
          className="text-blue-600 hover:underline cursor-pointer"
        >
          Guruhlar ro'yxatiga qaytish
        </button>
      </div>
    );
  }

  // Kurs tugagan (arxiv) = endDate o'tgan yoki isActive=false (kunlik job).
  const fmtDate = (v) => (v ? formatDateUz(v) : "");
  const todayKey = new Date().toISOString().slice(0, 10);
  const endKey = group.endDate ? String(group.endDate).slice(0, 10) : null;
  const isEnded = !group.isActive || (endKey && endKey <= todayKey);
  const canDelete = (group.studentsCount || 0) === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <BackLink to="/owner/groups" />

          <h1 className="text-2xl font-semibold">{group.name}</h1>
          <Badge variant="secondary">{group.studentsCount} o'quvchi</Badge>
          {isEnded && (
            <Badge className="bg-gray-200 text-gray-700">Tugagan</Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isEnded && (
            <Button
              onClick={() =>
                navigate(`/owner/attendance/mark?groupId=${group._id}`)
              }
            >
              <CalendarCheck className="size-4" />
              Davomat belgilash
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" title="Amallar" aria-label="Amallar">
                <MoreHorizontal className="size-4" />
                Amallar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[14rem]">
              <DropdownMenuItem
                onSelect={() => openModal(MODAL.GROUP_EDIT, { group })}
              >
                <Pencil className="size-4" />
                Tahrirlash
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  navigate(`/owner/finance/teacher-salaries/group/${id}`)
                }
              >
                <CalendarRange className="size-4" />
                O'qituvchi davrlari
              </DropdownMenuItem>
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-700"
                    onSelect={() =>
                      openModal(MODAL.GROUP_PERMANENT_DELETE, { group })
                    }
                  >
                    <Trash2 className="size-4" />
                    O'chirish
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isEnded && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Kurs{" "}
          {endKey && (
            <>
              <span className="font-medium">{fmtDate(group.endDate)}</span> sanasida
            </>
          )}{" "}
          tugagan. To'lov, davomat va davr amallari to'xtatilgan. Davom ettirish
          uchun "Tahrirlash"da tugash sanasini o'zgartiring yoki bo'shating.
        </div>
      )}

      <TabsLinks
        items={[
          { to: `/owner/groups/${id}`, label: "Ma'lumot", exact: true },
          { to: `/owner/groups/${id}/o-quvchilar`, label: "O'quvchilar" },
          { to: `/owner/groups/${id}/davomat`, label: "Davomat" },
        ]}
      />
      <Outlet context={{ group }} />

      <ModalWrapper
        name={MODAL.GROUP_EDIT}
        title="Guruhni tahrirlash"
        className="max-w-4xl"
      >
        <GroupEditModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.GROUP_PERMANENT_DELETE} title="Guruhni butunlay o'chirish">
        <GroupPermanentDeleteModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.GROUP_ADD_STUDENT} title="O'quvchi qo'shish">
        <GroupAddStudentModal />
      </ModalWrapper>
      <ModalWrapper
        name={MODAL.GROUP_REMOVE_STUDENT}
        title="O'quvchini guruhdan chiqarish"
      >
        <GroupRemoveStudentModal />
      </ModalWrapper>
      <ModalWrapper
        name={MODAL.GROUP_STUDENT_PERIODS}
        title="O'qish davrlari"
        className="max-w-lg"
      >
        <GroupStudentPeriodsModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.USER_PASSWORD} title="Login va parol">
        <UserPasswordModal />
      </ModalWrapper>
    </div>
  );
};

export default GroupDetailPage;
