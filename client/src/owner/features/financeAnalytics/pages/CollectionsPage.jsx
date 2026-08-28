import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { useDrill, useDrillFilters } from "@/shared/drill";
import useFinanceFilters from "@/owner/features/financeAnalytics/hooks/useFinanceFilters";
import FinanceFilterBar from "@/owner/features/financeAnalytics/components/FinanceFilterBar";
import ReceivablesSection from "@/owner/features/financeAnalytics/components/sections/ReceivablesSection";
import PageShell from "@/shared/components/page/PageShell";
import EmptyState from "@/shared/components/page/EmptyState";

/**
 * UNDIRISH — FILIAL DIREKTORINING KUNDALIK ISHI.
 *
 * ── NEGA ALOHIDA MANZIL ──
 * Qarzdorlik ilgari "Moliya > Boshqaruv markazi > Qarzdorlik" tabida
 * edi — uch qadam ichkarida, "moliyaviy tahlil" degan yorliq ostida.
 * Direktor uchun bu esa TAHLIL EMAS, kundalik ish ro'yxati: kimga
 * qo'ng'iroq qilish kerak.
 *
 * Sahifa yangi kod emas — mavjud `ReceivablesSection` ning mustaqil
 * manzili. O'zgargani: yorliq, joy va nima uchun kerakligi.
 */
const CollectionsPage = () => {
  const { has } = usePermissions();
  const { filters, set, reset, activeCount } = useFinanceFilters();
  const { openRoot } = useDrill();
  useDrillFilters(filters);

  if (!has(PERMISSIONS.FINANCE_VIEW_RECEIVABLES)) {
    return (
      <PageShell title="Undirish">
        <EmptyState
          title="Qarzdorlik ma'lumoti yopiq"
          hint="Bu bo'limni ochish uchun qarzdorlikni ko'rish ruxsati kerak."
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Undirish"
    >
      <FinanceFilterBar
        filters={filters}
        onChange={set}
        onReset={reset}
        activeCount={activeCount}
      />
      <ReceivablesSection filters={filters} onDrill={openRoot} />
    </PageShell>
  );
};

export default CollectionsPage;
