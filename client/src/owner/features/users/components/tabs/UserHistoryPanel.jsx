import { useOutletContext } from "react-router-dom";
import { UserGroupHistoryTable } from "@/shared/components/userProfile";

const UserHistoryPanel = () => {
  const { historyData, historyLoading } = useOutletContext();
  return (
    <div className="pt-3">
      <UserGroupHistoryTable
        items={historyData?.data || []}
        isLoading={historyLoading}
      />
    </div>
  );
};

export default UserHistoryPanel;
