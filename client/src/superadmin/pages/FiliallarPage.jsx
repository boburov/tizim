import { useNavigate } from "react-router-dom";
import { Building2, Plus, TrendingUp, AlertTriangle, Scale, Layers } from "lucide-react";

import Button from "@/shared/components/ui/button/Button";
import { AnalyticsTable, QueryState } from "@/shared/components/analytics";
import { DashboardSection } from "@/shared/components/dashboard/SectionGrid";
import usePermissions from "@/shared/hooks/usePermissions";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { useBranchProfit } from "@/owner/features/financeAnalytics/hooks/useFinanceAnalytics";
import useBranchesQuery from "@/owner/features/branches/hooks/useBranchesQuery";
import WorkspacePage from "@/workspaces/shared/WorkspacePage";
import EmptyState from "@/workspaces/shared/EmptyState";
import TabNav from "@/workspaces/shared/TabNav";
import { useActiveTab } from "@/workspaces/shared/tabState";

import BranchPnlSection from "../sections/BranchPnlSection";
import BranchCompareSection from "../sections/BranchCompareSection";

/**
 * ══════════════════════════════════════════════════════════════════════
 * FILIALLAR — RO'YXAT VA TAQQOSLASH BITTA EKRANDA (talab 3)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA BIRLASHTIRILDI ──
 * Ilgari uchta alohida sahifa bor edi: "Ro'yxat", "Taqqoslash",
 * "Statistika". Uchalasi ham AYNI savolga javob berardi — "filiallarim
 * qanday?" — va foydalanuvchi qaysi birini ochishni bilmasdi.
 * Yomoni: ro'yxatda raqam yo'q edi, ya'ni eng kerakli ma'lumot
 * (qaysi filial kuchli) eng ko'rinmas joyda turardi.
 *
 * Endi bitta jadval: har qator filial VA uning raqamlari. Qator
 * bosilsa — filialning boshqaruv markazi.
 *
 * ── "QAYSI FILIAL KUCHLI / KIMGA E'TIBOR" ──
 * Talab buni ochiq so'raydi, LEKIN asossiz xulosa chiqarishni
 * taqiqlaydi. Shuning uchun bu yerda MODEL YO'Q: server
 * (`/finance-analytics/branches`) allaqachon `rankings` beradi va
 * biz faqat uning birinchi qatorini nom bilan ko'rsatamiz.
 *
 * ── UCHTA TAB ──
 * Filialga uch xil savol beriladi va ular UCH XIL manbadan javob
 * oladi:
 *
 *   Taqqoslash — jurnal kesimi (`/finance-analytics/branches`)
 *   P&L        — normallashtirilgan hisobot (`/branch-analytics/pnl`)
 *   Kesimlar   — sotuv + o'qituvchi resursi + moliya yonma-yon
 *
 * Ular ilgari uchta BOSHQA-BOSHQA joyda edi: bu sahifada, `/admin/moliya`
 * da va `/admin/filiallar` da. Uchalasi ham "filiallarim qanday?"
 * degan savolga javob berardi va foydalanuvchi qaysi birini ochishni
 * bilmasdi.
 */
const OrgBranchesPage = () => {
  const navigate = useNavigate();
  const { has } = usePermissions();
  const { openModal } = useModal();

  const canCreate =
    has(PERMISSIONS.SYSTEM_ADMIN_ACCESS) && has(PERMISSIONS.BRANCHES_CREATE);
  const canProfit = has(PERMISSIONS.FINANCE_VIEW_PROFITABILITY);
  const canFinance = has(PERMISSIONS.FINANCE_READ);

  const TABS = [
    { key: "compare", label: "Taqqoslash", icon: Scale },
    { key: "pnl", label: "P&L", icon: Building2, visible: canFinance },
    { key: "cross", label: "Kesimlar", icon: Layers, visible: canFinance },
  ];
  const tab = useActiveTab(TABS);

  const branchList = useBranchesQuery();
  const profit = useBranchProfit({}, { enabled: canProfit });

  const rows = profit.data?.items || [];
  const rankings = profit.data?.rankings || {};
  const best = rankings.contributionProfit?.[0];
  const weakest = rankings.collectionRatePercent?.slice?.(-1)?.[0];

  const rawBranches = branchList.data?.data || [];

  return (
    <WorkspacePage
      title="Filiallar"
      subtitle="Har filial — o'z xonalari, odamlari va moliyasi bilan. Qatorni bosing."
      actions={
        canCreate && (
          <Button size="sm" onClick={() => openModal(MODAL.BRANCH_CREATE)}>
            <Plus className="size-4" />
            Filial qo'shish
          </Button>
        )
      }
    >
      <TabNav tabs={TABS} />

      {/* ── XULOSA: ikki jumla, model emas ── */}
      {tab === "compare" && canProfit && (best || weakest) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {best && (
            <div className="flex items-start gap-2 rounded-xl border border-border bg-card p-3">
              <TrendingUp className="mt-0.5 size-4 shrink-0 text-success" />
              <p className="text-sm text-foreground">
                Eng ko'p foyda: <strong>{best.name}</strong>
                <span className="block text-xs text-muted-foreground">
                  Hissa foydasi bo'yicha birinchi o'rinda
                </span>
              </p>
            </div>
          )}
          {weakest && rows.length > 1 && (
            <div className="flex items-start gap-2 rounded-xl border border-border bg-card p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <p className="text-sm text-foreground">
                E'tibor kerak: <strong>{weakest.name}</strong>
                <span className="block text-xs text-muted-foreground">
                  Undirish darajasi eng past
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      {tab === "compare" && (
      <DashboardSection
        title="Filiallar yonma-yon"
        hint="Daromad, foyda, o'quvchi va undirish — bitta jadvalda. Qatorni bosing."
      >
        {canProfit ? (
          <QueryState
            query={profit}
            empty={!rows.length}
            emptyTitle="Filiallar bo'yicha raqam yo'q"
            emptyHint="Tanlangan davrda hech bir filialda moliyaviy harakat bo'lmagan."
            loadingRows={3}
          >
            {() => (
              <AnalyticsTable
                rows={rows}
                rowKey={(r) => r.branchId}
                defaultSort={{ key: "contributionProfit", dir: "desc" }}
                onRowClick={(r) => navigate(`/org/branches/${r.branchId}`)}
                columns={[
                  { key: "name", label: "Filial" },
                  { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                  { key: "contributionProfit", label: "Hissa foydasi", align: "right", kind: "moneyShort" },
                  { key: "contributionMarginPercent", label: "Marja", align: "right", kind: "percent" },
                  { key: "students", label: "O'quvchi", align: "right", kind: "number" },
                  { key: "outstanding", label: "Qarz", align: "right", kind: "moneyShort" },
                  { key: "collectionRatePercent", label: "Undirish", align: "right", kind: "percent" },
                ]}
              />
            )}
          </QueryState>
        ) : (
          /* Foydalilik ruxsati yo'q — LEKIN filial ro'yxati baribir
             kerak: xona qo'shish va odam biriktirish moliyaga
             bog'liq emas. */
          <QueryState
            query={branchList}
            empty={!rawBranches.length}
            emptyTitle="Filial yo'q"
            loadingRows={2}
          >
            {() => (
              <AnalyticsTable
                rows={rawBranches}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/org/branches/${r.id}`)}
                columns={[
                  { key: "name", label: "Filial" },
                  { key: "code", label: "Kod" },
                ]}
              />
            )}
          </QueryState>
        )}
      </DashboardSection>
      )}

      {tab === "pnl" && <BranchPnlSection />}
      {tab === "cross" && <BranchCompareSection />}

      {tab === "compare" && !branchList.isLoading && rawBranches.length === 0 && (
        <EmptyState
          icon={Building2}
          title="Hali filial yo'q"
          hint="Filial — o'quv markazining fizik nuqtasi. Xonalar, guruhlar va moliya uning ichida bo'ladi."
          action={
            canCreate && (
              <Button size="sm" onClick={() => openModal(MODAL.BRANCH_CREATE)}>
                <Plus className="size-4" />
                Birinchi filialni qo'shish
              </Button>
            )
          }
        />
      )}
    </WorkspacePage>
  );
};

export default OrgBranchesPage;
