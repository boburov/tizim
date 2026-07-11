import { CheckCheck, Mail, Send, AlertTriangle, Minus } from "lucide-react";
import DataTable from "@/shared/components/ui/table/DataTable";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import { formatDateTimeUz } from "@/shared/utils/formatDate";
import { formatPhone } from "@/shared/utils/formatPhone";
import { formatBotFailReason } from "@/shared/constants/notification";

const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";

const userName = (r) =>
  r.user ? `${r.user.firstName} ${r.user.lastName}` : "-";

// Bot yetkazish holati badge
const BotCell = ({ r }) => {
  if (r.botDeliveredAt)
    return (
      <StatusBadge tone="success" icon={Send}>
        {formatDateTimeUz(r.botDeliveredAt)}
      </StatusBadge>
    );
  if (r.botFailedReason)
    return (
      <StatusBadge tone="danger" icon={AlertTriangle}>
        {formatBotFailReason(r.botFailedReason)}
      </StatusBadge>
    );
  return (
    <StatusBadge tone="neutral" icon={Minus}>
      Yetkazilmadi
    </StatusBadge>
  );
};

// O'qish holati badge - o'qilgan: yashil (success), o'qilmagan: neytral kulrang
const ReadCell = ({ r }) =>
  r.readAt ? (
    <StatusBadge tone="success" icon={CheckCheck}>
      {formatDateTimeUz(r.readAt)}
    </StatusBadge>
  ) : (
    <StatusBadge tone="neutral" icon={Mail}>
      O'qilmagan
    </StatusBadge>
  );

const RecipientsTable = ({ items = [], isLoading = false }) => {
  const columns = [
    {
      key: "user",
      header: "Foydalanuvchi",
      headerClassName: th,
      cell: (r) => <span className="font-medium">{userName(r)}</span>,
    },
    {
      key: "phone",
      header: "Telefon",
      headerClassName: th,
      cell: (r) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {r.user?.phone ? formatPhone(r.user.phone) : "-"}
        </span>
      ),
    },
    {
      key: "bot",
      header: "Bot yetkazildi",
      headerClassName: th,
      cell: (r) => <BotCell r={r} />,
    },
    {
      key: "read",
      header: "O'qilgan",
      headerClassName: th,
      cell: (r) => <ReadCell r={r} />,
    },
  ];

  const renderCard = (r) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{userName(r)}</span>
        <span className="text-xs text-muted-foreground">
          {r.user?.phone ? formatPhone(r.user.phone) : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <BotCell r={r} />
        <ReadCell r={r} />
      </div>
    </div>
  );

  return (
    <DataTable
      columns={columns}
      rows={items}
      isLoading={isLoading}
      renderCard={renderCard}
      empty={
        <EmptyState
          compact
          title="Qabul qiluvchilar yo'q"
          description="Bu xabar uchun qabul qiluvchilar topilmadi."
        />
      }
    />
  );
};

export default RecipientsTable;
