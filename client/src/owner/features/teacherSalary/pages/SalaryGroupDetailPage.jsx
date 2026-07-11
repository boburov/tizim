import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import useGroupQuery from "@/owner/features/groups/hooks/useGroupQuery";
import SalaryPeriodsManager from "../components/SalaryPeriodsManager";

const SalaryGroupDetailPage = () => {
  const { groupId } = useParams();
  const { data: group } = useGroupQuery(groupId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          to="/owner/finance/teacher-salaries/maosh-belgilash"
          className="text-muted-foreground hover:text-foreground"
          aria-label="Orqaga"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h2 className="text-lg font-semibold">{group?.name || "Guruh"}</h2>
      </div>

      <SalaryPeriodsManager groupId={groupId} />
    </div>
  );
};

export default SalaryGroupDetailPage;
