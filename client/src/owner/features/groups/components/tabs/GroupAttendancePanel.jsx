import { useOutletContext } from "react-router-dom";
import GroupAttendanceStatsTab from "./GroupAttendanceStatsTab";

// group - GroupDetailPage layout (Outlet context).
const GroupAttendancePanel = () => {
  const { group } = useOutletContext();
  return <GroupAttendanceStatsTab groupId={group._id} />;
};

export default GroupAttendancePanel;
