import { useOutletContext } from "react-router-dom";
import { Plus } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import GroupStudentsTable from "../GroupStudentsTable";

// group - GroupDetailPage layout (Outlet context).
const GroupStudentsPanel = () => {
  const { group } = useOutletContext();
  const { openModal } = useModal();

  return (
    <div className="space-y-3 pt-3">
      <div className="flex justify-end">
        <Button
          onClick={() =>
            openModal(MODAL.GROUP_ADD_STUDENT, {
              groupId: group._id,
              // Guruh boshlangan sana: startDate, bo'lmasa createdAt.
              groupStartedAt: group.startDate || group.createdAt,
            })
          }
        >
          <Plus className="size-4" />
          O'quvchi qo'shish
        </Button>
      </div>
      <GroupStudentsTable group={group} />
    </div>
  );
};

export default GroupStudentsPanel;
