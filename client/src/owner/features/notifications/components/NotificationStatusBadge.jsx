import { CheckCircle2, Clock, Ban, Bot } from "lucide-react";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import {
  resolveStatusTone,
  resolveStatusLabel,
} from "@/shared/constants/notification";

// Ikonka status bo'yicha (avto-tizim alohida) - tone bo'yicha emas,
// chunki "bekor" ham, "avto" ham neutral tone.
const statusIcon = ({ status, isAuto }) => {
  if (isAuto && status === "sent") return Bot;
  if (status === "scheduled") return Clock;
  if (status === "canceled") return Ban;
  return CheckCircle2; // sent
};

// Modul bo'yicha YAGONA status badge - yuborildi/rejalashtirilgan/bekor/avto.
const NotificationStatusBadge = ({ status = "sent", isAuto = false }) => {
  const tone = resolveStatusTone({ status, isAuto });
  const label = resolveStatusLabel({ status, isAuto });
  return (
    <StatusBadge tone={tone} icon={statusIcon({ status, isAuto })}>
      {label}
    </StatusBadge>
  );
};

export default NotificationStatusBadge;
