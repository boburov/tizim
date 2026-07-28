// Components
import ApprovalCard from "../components/ApprovalCard";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import usePermissions from "@/shared/hooks/usePermissions";
import useExpenseApprovalsQuery from "../hooks/useExpenseApprovalsQuery";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";

const STATUS_TABS = [
  { value: "pending", label: "Kutilmoqda" },
  { value: "executed", label: "Bajarilgan" },
  { value: "rejected", label: "Rad etilgan" },
  { value: "failed", label: "Xato" },
  { value: "", label: "Barchasi" },
];

// Kategoriya filtri. Server baribir ruxsatga qarab kesadi - bu tab faqat
// ko'rish qulayligi uchun (ikkala kategoriyaga huquqi bor owner uchun).
const CATEGORY_TABS = [
  { value: "", label: "Barchasi" },
  { value: "financial", label: "Chiqimlar" },
  { value: "configuration", label: "Sozlamalar" },
];

const TabRow = ({ tabs, value, onChange }) => (
  <div className="flex gap-2 flex-wrap">
    {tabs.map((t) => (
      <button
        key={t.value || "all"}
        type="button"
        onClick={() => onChange(t.value)}
        className={`px-3 py-1.5 text-sm rounded-md transition ${
          value === t.value ? "bg-primary text-white" : "hover:bg-muted"
        }`}
      >
        {t.label}
      </button>
    ))}
  </div>
);

const ExpenseApprovalsPage = () => {
  const { has } = usePermissions();
  const { status, category, setField } = useObjectState({
    status: "pending",
    category: "",
  });

  // Ikkala kategoriyaga ham huquqi bo'lmasa kategoriya tab'i ortiqcha -
  // ro'yxatda baribir bitta tur ko'rinadi.
  const showCategoryTabs =
    has(PERMISSIONS.FINANCE_READ) && has(PERMISSIONS.APPROVALS_DECIDE_CONFIG);

  const { data, isLoading } = useExpenseApprovalsQuery({
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
  });

  const items = data?.data || [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Tasdiqlar</h1>
        <p className="text-sm opacity-60">
          Limitdan oshgan to'lovlar va maosh stavkasi kabi sozlama
          o'zgarishlari shu yerda tasdiqlanadi
        </p>
      </header>

      <div className="space-y-2 border-b pb-2">
        <TabRow
          tabs={STATUS_TABS}
          value={status}
          onChange={(v) => setField("status", v)}
        />
        {showCategoryTabs && (
          <TabRow
            tabs={CATEGORY_TABS}
            value={category}
            onChange={(v) => setField("category", v)}
          />
        )}
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
