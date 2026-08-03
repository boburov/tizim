import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import { deliveryStatusMeta } from "../utils/deliveryStatus";

/** Bitta o'quvchining yetkazish holati. */
const DeliveryStatusBadge = ({ status }) => {
  const meta = deliveryStatusMeta(status);
  return (
    <StatusBadge tone={meta.tone} icon={meta.icon}>
      {meta.label}
    </StatusBadge>
  );
};

export default DeliveryStatusBadge;
