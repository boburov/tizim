import { useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { ExemptionsTable } from "@/owner/features/attendanceExemptions";

const MyStudentExemptionsPanel = () => {
  const { studentId } = useParams();
  const { openModal } = useModal();

  return (
    <div className="space-y-3 pt-3">
      <div className="flex justify-end">
        <Button
          onClick={() => openModal(MODAL.ATTENDANCE_EXEMPTION_CREATE, { studentId })}
        >
          <Plus className="size-4" />
          Yangi davr
        </Button>
      </div>
      <ExemptionsTable studentId={studentId} />
    </div>
  );
};

export default MyStudentExemptionsPanel;
