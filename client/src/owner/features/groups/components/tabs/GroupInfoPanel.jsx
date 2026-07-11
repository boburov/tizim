import { useOutletContext } from "react-router-dom";
import GroupInfoTab from "./GroupInfoTab";

// group - GroupDetailPage layout (Outlet context).
const GroupInfoPanel = () => {
  const { group } = useOutletContext();
  return <GroupInfoTab group={group} />;
};

export default GroupInfoPanel;
