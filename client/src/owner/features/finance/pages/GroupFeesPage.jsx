import { useNavigate } from "react-router-dom";
import DataTable from "@/shared/components/ui/table/DataTable";
import InputField from "@/shared/components/ui/input/InputField";
import useObjectState from "@/shared/hooks/useObjectState";
import useDebounce from "@/shared/hooks/useDebounce";
import { formatMoney } from "@/shared/utils/formatMoney";
import MonthPicker from "../components/MonthPicker";
import useGroupFeesQuery from "../hooks/useGroupFeesQuery";

const now = new Date();

const GroupFeesPage = () => {
  const navigate = useNavigate();
  const filters = useObjectState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    search: "",
  });
  const debouncedSearch = useDebounce(filters.search);

  const { data, isLoading } = useGroupFeesQuery({
    year: filters.year,
    month: filters.month,
    search: debouncedSearch || undefined,
  });

  const rows = data || [];

  const columns = [
    {
      key: "group",
      header: "Guruh",
      headerClassName: "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground",
      cell: (r) => <span className="font-medium">{r.group.name}</span>,
    },
    {
      key: "amount",
      header: "To'lov miqdori",
      headerClassName: "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground",
      cell: (r) =>
        r.amount == null ? (
          <span className="text-muted-foreground">Belgilanmagan</span>
        ) : (
          <span className="font-medium">{formatMoney(r.amount)}</span>
        ),
    },
  ];

  const renderCard = (r) => (
    <div
      className="flex items-center justify-between"
      onClick={() => navigate(`/owner/finance/group-fees/${r.group._id}`)}
    >
      <div>
        <p className="font-medium">{r.group.name}</p>
        <p className="text-sm text-muted-foreground">
          {r.amount == null ? "Belgilanmagan" : formatMoney(r.amount)}
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Guruh to'lovi</h1>
        </div>
        <MonthPicker
          year={filters.year}
          month={filters.month}
          onChange={({ year, month }) => filters.setFields({ year, month })}
        />
      </header>

      <InputField
        name="search"
        type="search"
        placeholder="Guruh nomi bo'yicha qidirish..."
        value={filters.search}
        onChange={(e) => filters.setField("search", e.target.value)}
      />

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        rowKey={(r) => r.group._id}
        onRowClick={(r) => navigate(`/owner/finance/group-fees/${r.group._id}`)}
        renderCard={renderCard}
      />
    </div>
  );
};

export default GroupFeesPage;
