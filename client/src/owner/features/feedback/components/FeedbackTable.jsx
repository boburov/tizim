import { useNavigate } from "react-router-dom";
import { UserCircle2, Inbox } from "lucide-react";
import DataTable from "@/shared/components/ui/table/DataTable";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import { formatDateUz } from "@/shared/utils/formatDate";
import FeedbackStatusBadge from "./FeedbackStatusBadge";

// Muallif ko'rinishi (anonim uchun alohida belgi)
const Author = ({ f }) => {
  if (f.isAnonymous || !f.author) {
    return (
      <span className="inline-flex items-center gap-1 italic text-muted-foreground">
        <UserCircle2 className="size-3.5 shrink-0" />
        Anonim
      </span>
    );
  }
  return (
    <span className="font-medium">
      {f.author.firstName} {f.author.lastName}
    </span>
  );
};

// Bo'sh guruh - och kulrang, joy egallamasin
const Group = ({ name }) =>
  name ? (
    <span>{name}</span>
  ) : (
    <span className="text-muted-foreground/50">-</span>
  );

const FeedbackTable = ({ items = [], isLoading = false }) => {
  const navigate = useNavigate();
  const columns = [
    {
      key: "author",
      header: "Muallif",
      className: "w-[160px] whitespace-nowrap",
      cell: (f) => <Author f={f} />,
    },
    {
      key: "type",
      header: "Tur",
      className: "w-[140px] whitespace-nowrap text-muted-foreground",
      cell: (f) => f.type?.name || <span className="text-muted-foreground/50">-</span>,
    },
    {
      key: "group",
      header: "Guruh",
      className: "w-[120px] whitespace-nowrap text-sm",
      cell: (f) => <Group name={f.group?.name} />,
    },
    {
      key: "message",
      header: "Matn",
      className: "min-w-[260px] max-w-md",
      cell: (f) => (
        <p className="line-clamp-2 text-muted-foreground" title={f.message}>
          {f.message}
        </p>
      ),
    },
    {
      key: "status",
      header: "Holat",
      className: "w-[130px]",
      cell: (f) => <FeedbackStatusBadge status={f.status} short />,
    },
    {
      key: "date",
      header: "Sana",
      className: "w-[120px] whitespace-nowrap text-xs text-muted-foreground",
      cell: (f) => formatDateUz(f.createdAt),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      isLoading={isLoading}
      rowKey={(f) => f._id}
      onRowClick={(f) => navigate(`/owner/feedback/${f._id}`)}
      empty={
        <EmptyState
          icon={Inbox}
          title="Feedback topilmadi"
          description="Tanlangan filtrlar bo'yicha hech qanday murojaat yo'q. Filtrlarni o'zgartirib ko'ring."
        />
      }
      renderCard={(f) => (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <Author f={f} />
            <FeedbackStatusBadge status={f.status} short />
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {f.message}
          </p>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              {f.type?.name && (
                <span className="rounded bg-muted px-1.5 py-0.5">
                  {f.type.name}
                </span>
              )}
              {f.group?.name && <span>· {f.group.name}</span>}
            </span>
            <span>{formatDateUz(f.createdAt)}</span>
          </div>
        </div>
      )}
    />
  );
};

export default FeedbackTable;
