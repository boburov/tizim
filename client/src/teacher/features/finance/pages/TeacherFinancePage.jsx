// Icons
import { Wallet, HandCoins, Clock } from "lucide-react";

// Components
import StatCard from "@/shared/components/ui/card/StatCard";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import SalaryMonthCard from "../components/SalaryMonthCard";

// Hooks
import useMyFinanceQuery from "../hooks/useMyFinanceQuery";

const TeacherFinancePage = () => {
  const { data, isLoading } = useMyFinanceQuery();

  const items = data?.items || [];
  const summary = data?.summary;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Moliya</h1>
      </header>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>
      ) : (
        <>
          {/* Umumiy ko'rsatkichlar - mobil 1 ustun, sm dan 3 ustun */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Jami hisoblangan"
              value={summary?.totalExpected ?? 0}
              icon={Wallet}
              isMoney
              hint={`${summary?.months ?? 0} oy`}
            />
            <StatCard
              label="Jami olingan"
              value={summary?.totalPaid ?? 0}
              icon={HandCoins}
              isMoney
              tone="positive"
            />
            <StatCard
              label="Qoldiq"
              value={summary?.totalRemaining ?? 0}
              icon={Clock}
              isMoney
              tone={summary?.totalRemaining ? "warn" : "default"}
            />
          </div>

          {/* Oylar bo'yicha maosh tarixi */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Oylar bo'yicha</h2>
            {items.length === 0 ? (
              <EmptyState
                title="Maosh yozuvi yo'q"
                description="Hozircha sizga hisoblangan maosh mavjud emas."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {items.map((s) => (
                  <SalaryMonthCard key={s._id} salary={s} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default TeacherFinancePage;
