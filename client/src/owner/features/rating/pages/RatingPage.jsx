import { Outlet } from "react-router-dom";
import Card from "@/shared/components/ui/card/Card";
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";
import InputField from "@/shared/components/ui/input/InputField";
import useObjectState from "@/shared/hooks/useObjectState";

const BASE = "/owner/rating";

// Layout: ko'lam (Markaz / Guruh) route darajasida. Sana filtri header'da -
// Outlet context orqali leaderboard panellarga uzatiladi.
const RatingPage = () => {
  const { fromDate, toDate, setField, setFields } = useObjectState({
    fromDate: "",
    toDate: "",
  });

  const items = [
    { to: BASE, label: "Markaz bo'yicha", exact: true },
    { to: `${BASE}/guruh`, label: "Guruh bo'yicha" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Reyting</h1>

      <Card className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <TabsLinks items={items} />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <InputField
              type="date"
              label="Sanadan"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setField("fromDate", e.target.value)}
            />
            <InputField
              type="date"
              label="Sanagacha"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setField("toDate", e.target.value)}
            />
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => setFields({ fromDate: "", toDate: "" })}
                className="text-sm text-primary hover:underline sm:pb-2.5"
              >
                Tozalash
              </button>
            )}
          </div>
        </div>
      </Card>

      <Outlet context={{ fromDate, toDate }} />
    </div>
  );
};

export default RatingPage;
