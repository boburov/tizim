import { useParams } from "react-router-dom";
import useGroupQuery from "@/owner/features/groups/hooks/useGroupQuery";
import BackLink from "@/shared/components/ui/link/BackLink";
import SalaryPeriodsManager from "../components/SalaryPeriodsManager";

const SalaryGroupDetailPage = () => {
  const { groupId } = useParams();
  const { data: group } = useGroupQuery(groupId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <BackLink to="/owner/finance/teacher-salaries/maosh-belgilash" />
        <h2 className="text-lg font-semibold">{group?.name || "Guruh"}</h2>
      </div>

      <SalaryPeriodsManager groupId={groupId} />
    </div>
  );
};

export default SalaryGroupDetailPage;
