// React
import { useState } from "react";

// Components
import ApprovalCard from "../components/ApprovalCard";

// Hooks
import useExpenseApprovalsQuery from "../hooks/useExpenseApprovalsQuery";

const TABS = [
  { value: "pending", label: "Kutilmoqda" },
  { value: "executed", label: "Bajarilgan" },
  { value: "rejected", label: "Rad etilgan" },
  { value: "failed", label: "Xato" },
  { value: "", label: "Barchasi" },
];

const ExpenseApprovalsPage = () => {
  const [status, setStatus] = useState("pending");
  const { data, isLoading } = useExpenseApprovalsQuery(
    status ? { status } : undefined,
  );

  const items = data?.data || [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Chiqim tasdiqlari</h1>
        <p className="text-sm opacity-60">
          Filial limitidan oshgan to'lovlar shu yerda tasdiqlanadi
        </p>
      </header>

      <div className="flex gap-2 flex-wrap border-b pb-2">
        {TABS.map((t) => (
          <button
            key={t.value || "all"}
            type="button"
            onClick={() => setStatus(t.value)}
            className={`px-3 py-1.5 text-sm rounded-md transition ${
              status === t.value ? "bg-primary text-white" : "hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm opacity-60">Yuklanmoqda...</p>}
      {!isLoading && items.length === 0 && (
        <p className="text-sm opacity-60">So'rovlar topilmadi</p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((a) => (
          <ApprovalCard key={a._id} approval={a} />
        ))}
      </div>
    </div>
  );
};

export default ExpenseApprovalsPage;
