import { useState } from "react";
import {
  Wallet, TrendingDown, PiggyBank, Banknote, HandCoins, GraduationCap,
  Building2,
} from "lucide-react";

import { KpiGrid, DashboardSection } from "@/shared/components/dashboard/SectionGrid";
import KpiTile from "@/shared/components/dashboard/KpiTile";
import { fromQuery } from "@/shared/components/dashboard/dataStatus";
import { AnalyticsTable, QueryState } from "@/shared/components/analytics";
import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { useDrill, DRILL_TYPES as T } from "@/shared/drill";
import {
  useSummary, useBranchProfit, useDirectionProfit, useTeacherProfit,
} from "@/owner/features/financeAnalytics/hooks/useFinanceAnalytics";
import { useIntelligence } from "@/owner/features/financeAnalytics/hooks/useFinanceIntelligence";
import IntelligenceCenter from "@/owner/features/financeAnalytics/components/IntelligenceCenter";
import SignalDetailDrawer from "@/owner/features/financeAnalytics/components/SignalDetailDrawer";
import PageShell from "@/shared/components/page/PageShell";
import EmptyState from "@/shared/components/page/EmptyState";

/**
 * ══════════════════════════════════════════════════════════════════════
 * TASHKILOT — BOSH EKRAN (talab 18)
 * ══════════════════════════════════════════════════════════════════════
 *
 * BITTA EKRANDA BITTA SAVOL: "biznes qanday ketyapti?"
 *
 * ── NEGA 6 TA KPI, 20 TA EMAS ──
 * Talab ochiq aytadi: 4-6 asosiy ko'rsatkich. Yigirmata karta
 * "hammasi muhim" degani, ya'ni "hech nima muhim emas" — ko'z hech
 * qayerga tushmaydi va ekran bezakka aylanadi.
 *
 * Tanlangan oltitasi biznesning butun konturini beradi:
 *   Daromad → Chiqim → Foyda   (natija)
 *   Pul → Qarz                  (likvidlik)
 *   O'quvchi                    (hajm)
 *
 * ── HAR RAQAM BOSILADI ──
 * Talab 35: har muhim ko'rsatkich "nega?" degan savolga javob
 * berishi kerak. KPI bosilganda tegishli bo'lim ochiladi, jadval
 * qatori bosilganda esa universal drill paneli.
 *
 * ── SO'ROVLAR (talab 29) ──
 * Sahifa ochilganda TO'RTTA so'rov ketadi: xulosa, intellekt,
 * filial va yo'nalish kesimi. O'qituvchi kesimi eng "og'ir" va
 * eng sezgir — u ALOHIDA ruxsat bilan va faqat ruxsat bo'lsa.
 */

const AsosiyPage = () => {
  const { has } = usePermissions();
  const { openRoot } = useDrill();
  // Signal paneli — "nega bu ogohlantirish chiqdi" savolining javobi.
  const [signalId, setSignalId] = useState(null);

  const canFinance = has(PERMISSIONS.FINANCE_READ);
  const canProfit = has(PERMISSIONS.FINANCE_VIEW_PROFITABILITY);
  const canTeacherProfit =
    canProfit && (has(PERMISSIONS.SALARY_READ) || has(PERMISSIONS.PAYROLL_READ));

  const summary = useSummary({}, { enabled: canFinance });
  const intelligence = useIntelligence({}, { enabled: canFinance });
  const branches = useBranchProfit({}, { enabled: canProfit });
  const directions = useDirectionProfit({ limit: 5 }, { enabled: canProfit });
  const teachers = useTeacherProfit({ limit: 5 }, { enabled: canTeacherProfit });

  const s = fromQuery(summary);
  const d = summary.data;

  return (
    <PageShell
      title="Umumiy holat"
      subtitle="Butun tashkilot bo'yicha joriy oy. Har raqam bosiladi."
    >
      {!canFinance ? (
        <EmptyState
          icon={Wallet}
          title="Moliyaviy manzara yopiq"
          hint="Bu ekran markazning pul holatini ko'rsatadi. Uni ochish uchun moliyani ko'rish ruxsati kerak."
        />
      ) : (
        <KpiGrid cols={3}>
          <KpiTile
            label="Daromad" isMoney icon={Wallet}
            value={d?.revenue?.current} delta={d?.revenue?.changePercent}
            status={s.status} error={s.error} onRetry={s.refetch}
            hint="Qaytarimlar ayirilgan · bosing"
            onClick={() => openRoot({ type: T.REVENUE, name: "Daromad manbalari" })}
          />
          <KpiTile
            label="Chiqim" isMoney icon={TrendingDown} invertDelta
            value={d?.operatingExpenses?.current} delta={d?.operatingExpenses?.changePercent}
            status={s.status} error={s.error} onRetry={s.refetch}
            hint="Maosh ham shu yerda · bosing"
            onClick={() => openRoot({ type: T.EXPENSE, name: "Chiqim yo'nalishlari" })}
          />
          <KpiTile
            label="Hissa foydasi" isMoney icon={PiggyBank}
            value={d?.contributionProfit?.current} delta={d?.contributionProfit?.changePercent}
            status={s.status} error={s.error} onRetry={s.refetch}
            hint="Daromaddan bevosita xarajatlar ayirilgan"
          />
          <KpiTile
            label="Kassadagi pul" isMoney icon={Banknote}
            value={d?.cashBalance}
            status={s.status} error={s.error} onRetry={s.refetch}
            hint="Barcha hisoblar yig'indisi"
            to="/org/moliya?tab=cash"
          />
          <KpiTile
            label="Qarzdorlik" isMoney icon={HandCoins} invertDelta
            value={d?.receivables?.outstanding?.current}
            status={s.status} error={s.error} onRetry={s.refetch}
            hint="To'lanmagan majburiyat"
            to="/org/moliya?tab=receivables"
          />
          <KpiTile
            label="O'quvchilar" icon={GraduationCap} suffix=" ta"
            value={branches.data?.items?.reduce?.((acc, b) => acc + (b.students || 0), 0)}
            status={fromQuery(branches).status}
            error={fromQuery(branches).error}
            onRetry={branches.refetch}
            hint="Faol filiallar bo'yicha"
            to="/owner/students"
          />
        </KpiGrid>
      )}

      {/* ── NIMAGA E'TIBOR BERISH KERAK ── */}
      {canFinance && (
        <IntelligenceCenter query={intelligence} onOpenSignal={setSignalId} />
      )}

      {/* ── FILIALLAR: eng qisqa taqqoslash (talab 3) ── */}
      {canProfit && (
        <DashboardSection
          title="Filiallar"
          hint="Qaysi filial kuchli, qaysi biriga e'tibor kerak"
          to="/org/filiallar"
          toLabel="To'liq taqqoslash"
        >
          <QueryState
            query={branches}
            empty={!branches.data?.items?.length}
            emptyTitle="Filial ma'lumoti yo'q"
            emptyHint="Tanlangan davrda hech bir filialda moliyaviy harakat bo'lmagan."
            loadingRows={3}
          >
            {(data) => (
              <AnalyticsTable
                rows={data.items}
                rowKey={(r) => r.branchId}
                defaultSort={{ key: "contributionProfit", dir: "desc" }}
                onRowClick={(r) =>
                  openRoot({ type: T.BRANCH, id: r.branchId, name: r.name })
                }
                columns={[
                  { key: "name", label: "Filial" },
                  { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                  { key: "contributionProfit", label: "Foyda", align: "right", kind: "moneyShort" },
                  { key: "students", label: "O'quvchi", align: "right", kind: "number" },
                  { key: "collectionRatePercent", label: "Undirish", align: "right", kind: "percent" },
                ]}
              />
            )}
          </QueryState>
        </DashboardSection>
      )}

      {/* ── ENG FOYDALI YO'NALISHLAR ── */}
      {canProfit && (
        <DashboardSection
          title="Eng foydali yo'nalishlar"
          hint={
            directions.data?.attribution
              ? `Bog'lanish qamrovi: ${directions.data.attribution.coveragePercent}% — qolgan daromad yo'nalishga bog'lanmagan`
              : undefined
          }
          to="/org/tahlil"
          toLabel="Barcha kesimlar"
        >
          <QueryState
            query={directions}
            empty={!directions.data?.items?.length}
            emptyTitle="Yo'nalish bo'yicha daromad yo'q"
            emptyHint="Guruhlarga kurs biriktirilmagan bo'lishi mumkin."
            loadingRows={3}
          >
            {(data) => (
              <AnalyticsTable
                rows={data.items.slice(0, 5)}
                rowKey={(r) => r.courseId}
                defaultSort={{ key: "contributionProfit", dir: "desc" }}
                onRowClick={(r) => openRoot({ type: T.COURSE, id: r.courseId, name: r.name })}
                columns={[
                  { key: "name", label: "Yo'nalish" },
                  { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                  { key: "contributionProfit", label: "Foyda", align: "right", kind: "moneyShort" },
                  { key: "contributionMarginPercent", label: "Marja", align: "right", kind: "percent" },
                ]}
              />
            )}
          </QueryState>
        </DashboardSection>
      )}

      {/* ── ENG FOYDALI O'QITUVCHILAR ── */}
      {canTeacherProfit && (
        <DashboardSection
          title="Eng foydali o'qituvchilar"
          hint={
            teachers.data?.attribution
              ? `Bog'lanish qamrovi: ${teachers.data.attribution.coveragePercent}% — qolgani bir nechta o'qituvchili guruhlarda`
              : undefined
          }
        >
          <QueryState
            query={teachers}
            empty={!teachers.data?.items?.length}
            emptyTitle="O'qituvchi kesimi bo'sh"
            emptyHint="Daromad o'qituvchiga faqat guruhda bitta o'qituvchi bo'lganda bog'lanadi."
            loadingRows={3}
          >
            {(data) => (
              <AnalyticsTable
                rows={data.items.slice(0, 5)}
                rowKey={(r) => r.teacherId}
                defaultSort={{ key: "contributionProfit", dir: "desc" }}
                onRowClick={(r) => openRoot({ type: T.TEACHER, id: r.teacherId, name: r.name })}
                columns={[
                  { key: "name", label: "O'qituvchi" },
                  { key: "students", label: "O'quvchi", align: "right", kind: "number" },
                  { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                  { key: "contributionProfit", label: "Foyda", align: "right", kind: "moneyShort" },
                ]}
              />
            )}
          </QueryState>
        </DashboardSection>
      )}

      {!canProfit && canFinance && (
        <EmptyState
          icon={Building2}
          title="Foydalilik kesimlari yopiq"
          hint="Filial, yo'nalish va o'qituvchi bo'yicha foyda tahlili maosh tannarxini ochadi — shuning uchun alohida ruxsat talab qiladi."
        />
      )}
      <SignalDetailDrawer
        signalId={signalId}
        filters={{}}
        onOpenChange={setSignalId}
      />
    </PageShell>
  );
};

export default AsosiyPage;
