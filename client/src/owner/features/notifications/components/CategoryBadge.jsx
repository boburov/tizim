import Badge from "@/shared/components/ui/badge/Badge";
import {
  CATEGORY_LABEL,
  CATEGORY_BADGE_CLASS,
} from "@/shared/constants/notification";

const CategoryBadge = ({ category }) => {
  if (!category) return null;
  return (
    <Badge className={CATEGORY_BADGE_CLASS[category] || ""}>
      {CATEGORY_LABEL[category] || category}
    </Badge>
  );
};

export default CategoryBadge;
