import { useOutletContext } from "react-router-dom";
import { Plus, AlertTriangle } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { ExemptionsTable } from "@/owner/features/attendanceExemptions";

const NoGroupNotice = () => (
  <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
    <AlertTriangle className="size-5 shrink-0 text-amber-500" />
    <div>
      <p className="font-medium text-amber-800">O'quvchi hech qaysi guruhda emas</p>
      <p className="text-amber-700">
        To'lov, chegirma va boshqa amallar uchun avval o'quvchini guruhga qo'shing.
      </p>
    </div>
  </div>
);

const UserExemptionsPanel = () => {
  const { profile, noActiveGroup } = useOutletContext();
  const { openModal } = useModal();

  return (
    <div className="space-y-3 pt-3">
      {noActiveGroup ? (
        <NoGroupNotice />
      ) : (
        <div className="flex justify-end">
          <Button
            onClick={() =>
              openModal(MODAL.ATTENDANCE_EXEMPTION_CREATE, { studentId: profile._id })
            }
          >
            <Plus className="size-4" />
            Yangi davr
          </Button>
        </div>
      )}
      <ExemptionsTable studentId={profile._id} />
    </div>
  );
};

export default UserExemptionsPanel;
