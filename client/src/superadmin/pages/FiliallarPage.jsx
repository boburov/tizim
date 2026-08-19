import { useNavigate } from "react-router-dom";
import { Building2, Plus, TrendingUp, AlertTriangle, Scale, Layers, LayoutGrid } from "lucide-react";

import Button from "@/shared/components/ui/button/Button";
import { AnalyticsTable, QueryState } from "@/shared/components/analytics";
import { DashboardSection } from "@/shared/components/dashboard/SectionGrid";
import usePermissions from "@/shared/hooks/usePermissions";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { useBranchProfit } from "@/owner/features/financeAnalytics/hooks/useFinanceAnalytics";
import useBranchesQuery from "@/owner/features/branches/hooks/useBranchesQuery";
import PageShell from "@/shared/components/page/PageShell";
import TabNav from "@/shared/components/page/TabNav";
import { useActiveTab } from "@/shared/components/page/tabState";

import BranchCard from "../components/BranchCard";
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
const FiliallarPage = () => {
  const navigate = useNavigate();
  const { has } = usePermissions();
  const { openModal } = useModal();

  const canCreate =
    has(PERMISSIONS.SYSTEM_ADMIN_ACCESS) && has(PERMISSIONS.BRANCHES_CREATE);
  const canProfit = has(PERMISSIONS.FINANCE_VIEW_PROFITABILITY);
  const canFinance = has(PERMISSIONS.FINANCE_READ);

  // BIRINCHI TAB — KARTALAR, jadval EMAS (talab 8).
  //
  // Ega bu sahifaga ikki xil savol bilan keladi: "A filialiga kiray"
  // (ish) va "qaysi filial yaxshi ishlayapti" (tahlil). Kartalar
  // birinchi savolga, jadval ikkinchisiga javob beradi. Ilgari faqat
  // jadval bor edi va oddiy "filialga kirish" ham ma'lumot qatorini
  // o'qishdan boshlanardi.
  const TABS = [
    { key: "list", label: "Filiallar", icon: LayoutGrid },
    { key: "compare", label: "Taqqoslash", icon: Scale, visible: canProfit },
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

  // Karta uchun: filial ID → moliyaviy ko'rsatkichlar. Ro'yxat va
  // raqamlar IKKI xil manbadan keladi (biri filial kartochkasi, biri
  // jurnal kesimi), shuning uchun ular ID bo'yicha bog'lanadi —
  // tartibga tayanish mumkin emas.
  const statsById = new Map(rows.map((r) => [String(r.branchId), r]));

  return (
    <PageShell
      title="Filiallar"
      subtitle="Har filial — o'z xonalari, odamlari va moliyasi bilan. Kartani bosing."
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

      {/* ══════════ KARTALAR ══════════ */}
      {tab === "list" && (
        <QueryState
          query={branchList}
          empty={!rawBranches.length}
          emptyTitle="Hali filial yo'q"
          emptyHint="Filial — o'quv markazining fizik nuqtasi. Xonalar, guruhlar va moliya uning ichida bo'ladi."
          loadingRows={3}
        >
          {() => (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rawBranches.map((b) => (
                <BranchCard key={b.id} branch={b} stats={statsById.get(b.id)} />
              ))}

              {/* "+" KARTASI TO'R ICHIDA, sarlavhada emas: "yana bitta
                  filial ochsam bo'ladi" degani ko'rinib tursin
                  (talab 7 — "bir necha soniyada"). Sarlavhadagi tugma
                  ham qoladi — u ro'yxat uzun bo'lganda kerak. */}
              {canCreate && (
                <button
                  type="button"
                  onClick={() => openModal(MODAL.BRANCH_CREATE)}
                  className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 text-muted-foreground transition hover:border-primary/40 hover:bg-muted hover:text-foreground"
                >
                  <Plus className="size-6" strokeWidth={1.5} />
                  <span className="text-sm font-medium">Filial qo'shish</span>
                </button>
              )}
            </div>
          )}
        </QueryState>
      )}

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
        hint="Kutilgan — plan bo'yicha majburiyat; Yig'ilgan — undan to'langani; Daromad — jurnaldagi tushum (qaytarimsiz). Qatorni bosing."
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
                onRowClick={(r) => navigate(`/org/filiallar/${r.branchId}`)}
                columns={[
                  { key: "name", label: "Filial" },
                  { key: "students", label: "O'quvchi", align: "right", kind: "number" },
                  // ══════════════════════════════════════════════════
                  // KUTILGAN ≠ YIG'ILGAN ≠ DAROMAD (talab 19)
                  // ══════════════════════════════════════════════════
                  //
                  // Uchta boshqa-boshqa raqam va ular ATAYLAB yonma-yon
                  // turadi:
                  //
                  //   Kutilgan  — oylik plan bo'yicha hisoblangan
                  //               majburiyat (`StudentPayment.expected`)
                  //   Yig'ilgan — o'sha majburiyatdan haqiqatan
                  //               to'langan qismi
                  //   Qarz      — qolgani
                  //
                  // "Daromad" esa TO'RTINCHI narsa: u jurnal yozuvidan
                  // keladi va qaytarimlar ayirilgan. Ular bir xil emas
                  // va ularni bitta ustunda ko'rsatish eng ko'p
                  // uchraydigan moliyaviy chalkashlik manbai.
                  { key: "expected", label: "Kutilgan", align: "right", kind: "moneyShort" },
                  { key: "collected", label: "Yig'ilgan", align: "right", kind: "moneyShort" },
                  { key: "outstanding", label: "Qarz", align: "right", kind: "moneyShort" },
                  { key: "collectionRatePercent", label: "Undirish", align: "right", kind: "percent" },
                  { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                  { key: "contributionProfit", label: "Hissa foydasi", align: "right", kind: "moneyShort" },
                  { key: "contributionMarginPercent", label: "Marja", align: "right", kind: "percent" },
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
                onRowClick={(r) => navigate(`/org/filiallar/${r.id}`)}
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

    </PageShell>
  );
};

export default FiliallarPage;
