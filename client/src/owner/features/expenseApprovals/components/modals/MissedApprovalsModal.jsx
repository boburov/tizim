// Router
import { Link } from "react-router-dom";

// Components
import Button from "@/shared/components/ui/button/Button";
import ApprovalQuickRow from "../ApprovalQuickRow";

/**
 * Kirishda ko'rsatiladigan "sizni kutayotgan tasdiqlar" oynasi.
 *
 * Administrator panelga kirganda birinchi ko'rishi kerak bo'lgan narsa -
 * uning qaroriga qolgan so'rovlar. Sidebar belgisi e'tibordan chetda
 * qolishi mumkin, shuning uchun ochiq oyna bilan so'raladi. Har qatorda
 * ✓/✗ bor, ya'ni navbatni shu yerdan tozalash mumkin.
 */
const MissedApprovalsModal = ({ approvals = [], total = 0, close }) => (
  <div className="space-y-3">
    <p className="text-sm text-muted-foreground">
      Sizning qaroringizni <span className="font-semibold">{total} ta</span>{" "}
      so'rov kutmoqda.
    </p>

    <div className="max-h-[50vh] space-y-2 overflow-y-auto">
      {approvals.map((a) => (
        <ApprovalQuickRow key={a._id} approval={a} />
      ))}
    </div>

    <div className="flex gap-2 pt-1">
      <Button
        type="button"
        variant="outline"
        className="flex-1"
        onClick={() => close?.()}
      >
        Keyinroq
      </Button>
      <Button asChild className="flex-1">
        <Link to="/owner/expense-approvals" onClick={() => close?.()}>
          Hammasini ko'rish
        </Link>
      </Button>
    </div>
  </div>
);

export default MissedApprovalsModal;
