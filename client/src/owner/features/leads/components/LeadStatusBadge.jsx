import { LEAD_STATUS_LABEL, LEAD_STATUS_TONE } from "@/shared/constants/leadStatus";

const LeadStatusBadge = ({ status }) => (
  <span
    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
      LEAD_STATUS_TONE[status] || "bg-muted text-foreground"
    }`}
  >
    {LEAD_STATUS_LABEL[status] || status}
  </span>
);

export default LeadStatusBadge;
