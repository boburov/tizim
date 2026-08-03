import { Users } from "lucide-react";
import DataTable from "@/shared/components/ui/table/DataTable";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import { formatDateTimeUz } from "@/shared/utils/formatDate";
import { formatPhone } from "@/shared/utils/formatPhone";
import DeliveryStatusBadge from "./DeliveryStatusBadge";

const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";

const studentName = (r) =>
  r.student ? `${r.student.firstName} ${r.student.lastName}` : "-";

/** Har bir o'quvchining yetkazish holati (o'qituvchi ko'radigan jadval). */
const AssignmentRecipientsTable = ({ items = [], isLoading = false }) => {
  const columns = [
    {
      key: "student",
      header: "O'quvchi",
      headerClassName: th,
      cell: (r) => <span className="font-medium">{studentName(r)}</span>,
    },
    {
      key: "group",
      header: "Guruh",
      headerClassName: th,
      cell: (r) => (
        <span className="text-muted-foreground">{r.group?.name || "-"}</span>
      ),
    },
    {
      key: "phone",
      header: "Telefon",
      headerClassName: th,
      cell: (r) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {r.student?.phone ? formatPhone(r.student.phone) : "-"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Holat",
      headerClassName: th,
      cell: (r) => <DeliveryStatusBadge status={r.status} />,
    },
    {
      key: "deliveredAt",
      header: "Yetkazilgan",
      headerClassName: th,
      cell: (r) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {r.deliveredAt ? formatDateTimeUz(r.deliveredAt) : "-"}
        </span>
      ),
    },
  ];

  const renderCard = (r) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{studentName(r)}</span>
        <span className="text-xs text-muted-foreground">
          {r.student?.phone ? formatPhone(r.student.phone) : ""}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{r.group?.name || "-"}</p>
      <div className="flex flex-wrap items-center gap-2">
        <DeliveryStatusBadge status={r.status} />
        {r.deliveredAt && (
          <span className="text-xs text-muted-foreground">
            {formatDateTimeUz(r.deliveredAt)}
          </span>
        )}
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
          icon={Users}
          title="O'quvchilar topilmadi"
          description="Bu vazifa uchun oluvchilar ro'yxati bo'sh."
        />
      }
    />
  );
};

export default AssignmentRecipientsTable;
