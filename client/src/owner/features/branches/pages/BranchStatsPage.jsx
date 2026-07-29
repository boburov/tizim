// React
import { useMemo, useState } from "react";

// Icons
import { Users, Layers, Briefcase, Wallet } from "lucide-react";

// Components
import StatCard from "@/shared/components/ui/card/StatCard";
import Select from "@/shared/components/ui/select/Select";

// Hooks
import useActiveBranch from "@/shared/hooks/useActiveBranch";
import useBranchesQuery from "../hooks/useBranchesQuery";
import useBranchStatsQuery from "../hooks/useBranchStatsQuery";

/**
 * Bitta filialning ko'rsatkichlari.
 *
 * NEGA O'Z TANLAGICHI BOR: global BranchPicker "Barcha filiallar" holatida
 * ham bo'lishi mumkin, lekin bu sahifa BITTA filial haqida. Shuning uchun
 * u yerdan mustaqil tanlagich - boshlang'ich qiymat sifatida aktiv filial
 * olinadi, keyin foydalanuvchi butun ilovaning ko'lamini o'zgartirmasdan
 * filialdan filialga o'ta oladi.
 */
const BranchStatsPage = () => {
  const { branchId: activeBranchId } = useActiveBranch();
  const { data: listData } = useBranchesQuery({ includeInactive: false });

  const branches = useMemo(() => listData?.data || [], [listData]);

  // Tanlov HOSILA, useEffect + setState EMAS: ro'yxat kelguncha
  // boshlang'ich qiymatni bilib bo'lmaydi, lekin uni effektda qo'yish
  // ortiqcha render zanjirini keltirib chiqarardi. `picked` faqat
  // foydalanuvchi o'zi tanlaganda to'ladi.
  const [picked, setPicked] = useState("");

  const fallbackId = useMemo(() => {
    if (!branches.length) return "";
    const match = branches.find((b) => String(b._id) === String(activeBranchId));
    return String(match?._id || branches[0]._id);
  }, [branches, activeBranchId]);

  const selectedId = picked || fallbackId;

  const { data: stats, isLoading } = useBranchStatsQuery(selectedId);

  const options = branches.map((b) => ({ value: String(b._id), label: b.name }));
  const selected = branches.find((b) => String(b._id) === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Filial statistikasi</h1>
        <Select
          options={options}
          value={selectedId}
          onChange={setPicked}
          triggerClassName="w-[220px]"
          placeholder="Filialni tanlang"
        />
      </div>

      {!selectedId && !isLoading && (
        <p className="text-sm opacity-60">Filialni tanlang</p>
      )}

      {selectedId && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Users}
            label="O'quvchilar"
            value={stats?.studentCount ?? null}
          />
          <StatCard
            icon={Layers}
            label="Faol guruhlar"
            hint={
              stats?.groupCount != null ? `Jami ${stats.groupCount} ta` : ""
            }
            value={stats?.activeGroupCount ?? null}
          />
          <StatCard
            icon={Briefcase}
            label="Xodimlar"
            value={stats?.staffCount ?? null}
          />
          <StatCard
            isMoney
            icon={Wallet}
            label="Tasdiq limiti"
            hint={selected?.expenseApprovalThreshold ? "" : "Limit yo'q"}
            value={selected?.expenseApprovalThreshold ?? null}
          />
        </div>
      )}
    </div>
  );
};

export default BranchStatsPage;
