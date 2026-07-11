import { useOutletContext } from "react-router-dom";
import { StudentGradesTab } from "@/owner/features/grades";

const UserGradesPanel = () => {
  const { profile } = useOutletContext();
  return <StudentGradesTab studentId={profile._id} />;
};

export default UserGradesPanel;
