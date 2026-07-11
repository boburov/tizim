import Badge from "@/shared/components/ui/badge/Badge";
import { STATUS_LABEL, STATUS_BADGE_CLASS } from "@/shared/constants/attendance";

const AttendanceBadge = ({ status, size = "default" }) => {
  if (!status) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Belgilanmagan
      </Badge>
    );
  }
  return (
    <Badge className={STATUS_BADGE_CLASS[status] || ""}>
      {STATUS_LABEL[status] || status}
    </Badge>
  );
};

export default AttendanceBadge;
