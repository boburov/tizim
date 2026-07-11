import useObjectState from "@/shared/hooks/useObjectState";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import DataTable from "@/shared/components/ui/table/DataTable";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import { BarChart3 } from "lucide-react";
import useArchiveReasonReportQuery from "../hooks/useArchiveReasonReportQuery";

const ACTION_OPTIONS = [
  { value: "", label: "Hammasi" },
  { value: "archive", label: "Arxivlangan" },
  { value: "restore", label: "Qaytarilgan" },
];

const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";

const ArchiveReasonReportTab = () => {
  const filters = useObjectState({ from: "", to: "", action: "" });

  const { data, isLoading, isError, refetch } = useArchiveReasonReportQuery({
    from: filters.from || undefined,
    to: filters.to || undefined,
    action: filters.action || undefined,
  });
  const rows = data || [];

  const columns = [
    {
      key: "title",
      header: "Sabab",
      headerClassName: th,
      cell: (r) => <span className="font-medium">{r.title}</span>,
    },
    {
      key: "archiveCount",
      header: "Arxivlangan",
      headerClassName: th,
      cell: (r) => r.archiveCount,
    },
    {
      key: "restoreCount",
      header: "Qaytarilgan",
      headerClassName: th,
      cell: (r) => r.restoreCount,
    },
    {
      key: "total",
      header: "Jami",
      headerClassName: th,
      cell: (r) => <span className="font-medium">{r.total}</span>,
    },
  ];

  const renderCard = (r) => (
    <div className="space-y-1">
      <p className="font-medium">{r.title}</p>
      <p className="text-xs text-muted-foreground">
        Arxivlangan: {r.archiveCount} · Qaytarilgan: {r.restoreCount} · Jami:{" "}
        {r.total}
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <InputField
          name="from"
          type="date"
          label="Boshlanish"
          value={filters.from}
          onChange={(e) => filters.setField("from", e.target.value)}
        />
        <InputField
          name="to"
          type="date"
          label="Tugash"
          value={filters.to}
          onChange={(e) => filters.setField("to", e.target.value)}
        />
        <SelectField
          label="Amal"
          value={filters.action}
          onChange={(v) => filters.setField("action", v)}
          options={ACTION_OPTIONS}
        />
      </div>

      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          isLoading={isLoading}
          renderCard={renderCard}
          empty={
            <EmptyState
              icon={BarChart3}
              title="Ma'lumot yo'q"
              description="Tanlangan oraliqda arxivlash/qaytarish amallari topilmadi."
            />
          }
        />
      )}
    </div>
  );
};

export default ArchiveReasonReportTab;
