import DataTable from "@/shared/components/ui/table/DataTable";
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatPhone } from "@/shared/utils/formatPhone";
import { MONTH_LABELS } from "@/shared/constants/calendar";

const headerCls = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";

// showMonth: "Barcha oylar" rejimida qaysi oyga tegishli qarz ekanini ko'rsatadi.
const StudentObligationsTable = ({ rows = [], isLoading, showMonth = false }) => {
  const columns = [
    {
      key: "student",
      header: "O'quvchi",
      headerClassName: headerCls,
      cell: (r) => (
        <span className="font-medium">
          {r.student?.firstName} {r.student?.lastName}
        </span>
      ),
    },
    {
      // TELEFON: qarzdorlar ro'yxati amalda "kimga qo'ng'iroq qilaman"
      // ro'yxati. Raqamsiz har safar o'quvchi profilini ochishga to'g'ri
      // kelardi, shuning uchun u ismdan keyin darhol turadi.
      key: "phone",
      header: "Telefon",
      headerClassName: headerCls,
      cell: (r) =>
        r.student?.phone ? (
          // tel: havola - mobil qurilmada bosilsa to'g'ridan-to'g'ri
          // qo'ng'iroq qiladi (ish oqimidagi asosiy amal).
          <a
            href={`tel:${r.student.phone}`}
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            {formatPhone(r.student.phone)}
          </a>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: "group",
      header: "Guruh",
      headerClassName: headerCls,
      cell: (r) => r.group?.name || "-",
    },
    ...(showMonth
      ? [
          {
            key: "month",
            header: "Oy",
            headerClassName: headerCls,
            cell: (r) => `${MONTH_LABELS[r.month - 1]} ${r.year}`,
          },
        ]
      : []),
    {
      key: "expected",
      header: "Kutilgan",
      headerClassName: headerCls,
      cell: (r) => formatMoney(r.expectedAmount || 0),
    },
    {
      key: "paid",
      header: "To'langan",
      headerClassName: headerCls,
      cell: (r) => <span className="text-emerald-600 dark:text-emerald-300">{formatMoney(r.paidAmount || 0)}</span>,
    },
    {
      key: "remaining",
      header: "Qoldiq",
      headerClassName: headerCls,
      cell: (r) => (
        <span className="font-semibold text-rose-600 dark:text-rose-300">{formatMoney(r.remaining || 0)}</span>
      ),
    },
  ];

  const renderCard = (r) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {r.student?.firstName} {r.student?.lastName}
        </span>
        <span className="font-semibold text-rose-600 dark:text-rose-300">{formatMoney(r.remaining || 0)}</span>
      </div>
      {r.student?.phone && (
        <a
          href={`tel:${r.student.phone}`}
          className="block text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {formatPhone(r.student.phone)}
        </a>
      )}
      <p className="text-xs text-muted-foreground">
        {r.group?.name}
        {showMonth ? ` · ${MONTH_LABELS[r.month - 1]} ${r.year}` : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        {formatMoney(r.paidAmount || 0)} / {formatMoney(r.expectedAmount || 0)}
      </p>
    </div>
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      isLoading={isLoading}
      rowKey={(r) => r._id}
      renderCard={renderCard}
    />
  );
};

export default StudentObligationsTable;
