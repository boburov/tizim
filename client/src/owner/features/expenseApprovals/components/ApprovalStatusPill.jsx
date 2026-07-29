// Constants
import { STATUS_META } from "../constants";

// Holat belgisi - jadval, karta, toast va batafsil panelida bir xil.
const ApprovalStatusPill = ({ status, className = "" }) => {
  const meta = STATUS_META[status] || STATUS_META.pending;
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${meta.cls} ${className}`}
    >
      <Icon size={12} strokeWidth={2.5} />
      {meta.label}
    </span>
  );
};

export default ApprovalStatusPill;
