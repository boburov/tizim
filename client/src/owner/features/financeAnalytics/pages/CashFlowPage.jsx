import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { DeniedBlock } from "@/shared/components/analytics";
import { PageHeader } from "@/shared/components/page/PageShell";
import SelectField from "@/shared/components/ui/select/SelectField";
import { ACCOUNT_KIND_LABEL } from "@/shared/constants/finance";
import { useDrillFilters } from "@/shared/drill";

import useFinanceFilters from "../hooks/useFinanceFilters";
import FinanceFilterBar from "../components/FinanceFilterBar";
import CashFlowSection from "../components/sections/CashFlowSection";
import { TREASURY_ACCOUNT_KINDS } from "../utils/accountKinds";

/**
 * PUL OQIMI — ALOHIDA SAHIFA.
 *
 * ── NEGA TAB EMAS ──
 * "Kassada qancha pul bor va u qayerga ketdi" — bu tahlil emas,
 * kunlik nazorat savoli. Boshqaruv markazining ettinchi tabi ostida
 * turganda unga yetib borish uchun avval moliya tahlilini ochish,
 * keyin kerakli tabni topish kerak edi.
 *
 * ── AYNAN BITTA AMALGA OSHIRISH ──
 * Sahifa `CashFlowSection` ni o'raydi — boshqaruv markazidagi tab ham
 * AYNAN o'sha komponentni ko'rsatadi. "Filial versiyasi" yozilsa,
 * bitta fakt uchun ikkita raqam paydo bo'lardi.
 *
 * ── FILIAL FILTRI BU YERDA YO'Q ──
 * U ilovada GLOBAL (yon paneldagi tanlagich → `x-branch-id`).
 * Super Admin "Barcha filiallar"/aniq filialni o'sha yerdan tanlaydi,
 * bitta filialga biriktirilgan administrator esa tanlagichni umuman
 * ko'rmaydi va server so'rovni baribir uning filialiga kesadi.
 * Ikkinchi tanlagich ikkita raqobatlashuvchi "joriy filial"
 * tushunchasini yaratardi.
 */
const ACCOUNT_OPTIONS = [
  { value: "", label: "Barcha hisob" },
  ...TREASURY_ACCOUNT_KINDS.map((k) => ({
    value: k,
    label: ACCOUNT_KIND_LABEL[k] || k,
  })),
];

const CashFlowPage = () => {
  const { has } = usePermissions();
  const { filters, set, reset, activeCount } = useFinanceFilters();
  useDrillFilters(filters);

  if (!has(PERMISSIONS.FINANCE_VIEW_CASHFLOW)) {
    return <DeniedBlock permission="finance.view_cashflow" className="mt-6" />;
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Pul oqimi" />

      <FinanceFilterBar
        filters={filters}
        onChange={set}
        onReset={reset}
        activeCount={activeCount}
        showGranularity
        slots={
          <div className="w-44">
            <SelectField
              value={filters.accountKind || ""}
              onChange={(v) => set({ accountKind: v })}
              options={ACCOUNT_OPTIONS}
              className="!gap-1"
            />
          </div>
        }
      />

      <CashFlowSection filters={filters} />
    </div>
  );
};

export default CashFlowPage;
