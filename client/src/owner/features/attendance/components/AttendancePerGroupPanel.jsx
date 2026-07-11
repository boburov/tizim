import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import GroupPicker from "./GroupPicker";
import GroupMonthlyMatrix from "./GroupMonthlyMatrix";

// year/month - layout (Outlet context); groupId - shu panelning lokal holati.
const AttendancePerGroupPanel = () => {
  const { year, month } = useOutletContext();
  const [groupId, setGroupId] = useState("");

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <GroupPicker value={groupId} onChange={setGroupId} />
      </div>
      <GroupMonthlyMatrix groupId={groupId} year={year} month={month} />
    </div>
  );
};

export default AttendancePerGroupPanel;
