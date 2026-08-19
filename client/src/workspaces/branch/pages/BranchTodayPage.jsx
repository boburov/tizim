import { Link } from "react-router-dom";
import {
  Wallet, HandCoins, GraduationCap, ClipboardCheck, BookOpen, Users,
  AlertTriangle, ArrowRight,
} from "lucide-react";

import { KpiGrid, DashboardSection } from "@/shared/components/dashboard/SectionGrid";
import KpiTile from "@/shared/components/dashboard/KpiTile";
import { fromQuery } from "@/shared/components/dashboard/dataStatus";
import { AnalyticsTable, QueryState } from "@/shared/components/analytics";
import useAuth from "@/shared/hooks/useAuth";
import usePermissions from "@/shared/hooks/usePermissions";
import useActiveBranch from "@/shared/hooks/useActiveBranch";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { useDrill, DRILL_TYPES as T } from "@/shared/drill";
import {
  useSummary, useReceivablesBy, useRevenueBy,
} from "@/owner/features/financeAnalytics/hooks/useFinanceAnalytics";
import WorkspacePage from "@/workspaces/shared/WorkspacePage";
import EmptyState from "@/workspaces/shared/EmptyState";

/**
 * ══════════════════════════════════════════════════════════════════════
 * FILIAL — "BUGUN NIMA BO'LYAPTI?" (talab 19)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── BU SUPER ADMIN EKRANINING KICHRAYTIRILGAN NUSXASI EMAS ──
 *
 * Ega ekrani "qaysi FILIAL kuchli?" deb so'raydi — u tanlaydi va
 * taqqoslaydi. Direktorda tanlash YO'Q: filial bitta va u o'sha
 * filialning ichida yashaydi. Uning savoli boshqa: "bugun nima
 * qilishim kerak?"
 *
 * Shuning uchun bu yerda:
 *   • filial taqqoslash YO'Q          (taqqoslaydigan narsa yo'q)
 *   • filial tanlagich YO'Q           (bitta filial)
 *   • birinchi o'rinda QARZDORLAR     (bu uning kundalik ishi)
 *   • birinchi o'rinda GURUH daromadi (uning ta'sir doirasi)
 *
 * Ega ekranida esa qarzdorlar ro'yxati umuman yo'q — u individual
 * o'quvchi bilan ishlamaydi.
 *
 * ── KO'LAM ──
 * Filial `x-branch-id` sarlavhasi orqali server tomonda aniqlanadi
 * (`resolveBranchScope`). Bu yerda ID QO'LDA UZATILMAYDI: uzatilsa
 * URL orqali boshqa filialni so'rash mumkindek ko'rinardi — server
 * baribir rad etadi, lekin UI yolg'on imkoniyat ko'rsatardi.
 */
const BranchTodayPage = () => {
  const { has } = usePermissions();
  const { user } = useAuth();
  const { activeBranch } = useActiveBranch();
  const { openRoot } = useDrill();

  const canFinance = has(PERMISSIONS.FINANCE_READ);
  const canReceivables = has(PERMISSIONS.FINANCE_VIEW_RECEIVABLES);

  const summary = useSummary({}, { enabled: canFinance });
  const debtors = useReceivablesBy("student", { limit: 8 }, { enabled: canReceivables });
  const groups = useRevenueBy("group", { limit: 8 }, { enabled: canFinance });

  const s = fromQuery(summary);
  const d = summary.data;

  const greeting = user?.firstName ? `${user.firstName}, salom` : "Salom";

  return (
    <WorkspacePage
      title={activeBranch?.name || "Mening filialim"}
      subtitle={`${greeting}. Filialingizda bugungi holat.`}
    >
      {canFinance ? (
        <KpiGrid cols={4}>
          <KpiTile
            label="Bu oy tushum" isMoney icon={Wallet}
            value={d?.revenue?.current} delta={d?.revenue?.changePercent}
            status={s.status} error={s.error} onRetry={s.refetch}
          />
          <KpiTile
            label="Qarzdorlik" isMoney icon={HandCoins} invertDelta
            value={d?.receivables?.outstanding?.current}
            status={s.status} error={s.error} onRetry={s.refetch}
            hint="To'lanmagan majburiyat"
            to="/branch/collections"
          />
          <KpiTile
            label="Undirish darajasi" icon={ClipboardCheck} suffix="%"
            value={d?.receivables?.collectionRate?.current}
            status={s.status} error={s.error} onRetry={s.refetch}
            hint="To'langan / kutilgan"
            to="/branch/collections"
          />
          <KpiTile
            label="Kassadagi pul" isMoney icon={Wallet}
            value={d?.cashBalance}
            status={s.status} error={s.error} onRetry={s.refetch}
          />
        </KpiGrid>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            to="/owner/students"
            className="rounded-2xl border border-border bg-card p-4 transition hover:bg-muted/40"
          >
            <GraduationCap className="size-4 text-muted-foreground" />
            <p className="mt-2 font-medium text-foreground">O'quvchilar</p>
          </Link>
          <Link
            to="/owner/groups"
            className="rounded-2xl border border-border bg-card p-4 transition hover:bg-muted/40"
          >
            <BookOpen className="size-4 text-muted-foreground" />
            <p className="mt-2 font-medium text-foreground">Guruhlar</p>
          </Link>
          <Link
            to="/owner/attendance"
            className="rounded-2xl border border-border bg-card p-4 transition hover:bg-muted/40"
          >
            <ClipboardCheck className="size-4 text-muted-foreground" />
            <p className="mt-2 font-medium text-foreground">Davomat</p>
          </Link>
        </div>
      )}

      {/* ── BUGUNGI ISH: KIM QARZDOR ── */}
      {canReceivables && (
        <DashboardSection
          title="E'tibor talab qiladi"
          hint="Eng katta qarzi bor o'quvchilar — ismini bosing"
          to="/branch/collections"
          toLabel="Barchasi"
        >
          <QueryState
            query={debtors}
            empty={!debtors.data?.length}
            emptyTitle="Qarzdor yo'q"
            emptyHint="Bu davrda hamma to'lovlar yopilgan — yaxshi natija."
            loadingRows={3}
          >
            {(rows) => (
              <AnalyticsTable
                rows={rows}
                defaultSort={{ key: "outstanding", dir: "desc" }}
                onRowClick={(r) => openRoot({ type: T.STUDENT, id: r.id, name: r.name })}
                columns={[
                  { key: "name", label: "O'quvchi" },
                  { key: "expected", label: "Kutilgan", align: "right", kind: "moneyShort" },
                  { key: "outstanding", label: "Qarz", align: "right", kind: "moneyShort" },
                  { key: "overdue60plus", label: "60+ kun", align: "right", kind: "moneyShort" },
                ]}
              />
            )}
          </QueryState>
        </DashboardSection>
      )}

      {/* ── GURUHLAR ── */}
      {canFinance && (
        <DashboardSection
          title="Guruhlar bo'yicha tushum"
          hint="Qaysi guruh qancha keltirdi"
          to="/owner/groups"
          toLabel="Guruhlar"
        >
          <QueryState
            query={groups}
            empty={!groups.data?.length}
            emptyTitle="Bu oyda to'lov yo'q"
            emptyHint="Guruhlarga to'lov kiritilmagan yoki oy endi boshlandi."
            loadingRows={3}
          >
            {(rows) => (
              <AnalyticsTable
                rows={rows}
                defaultSort={{ key: "revenue", dir: "desc" }}
                onRowClick={(r) => openRoot({ type: T.GROUP, id: r.id, name: r.name })}
                columns={[
                  { key: "name", label: "Guruh" },
                  { key: "revenue", label: "Tushum", align: "right", kind: "moneyShort" },
                  { key: "sharePercent", label: "Ulush", align: "right", kind: "percent" },
                ]}
              />
            )}
          </QueryState>
        </DashboardSection>
      )}

      {!canFinance && !canReceivables && (
        <EmptyState
          icon={AlertTriangle}
          title="Moliyaviy ko'rsatkichlar yopiq"
          hint="Sizga filial moliyasini ko'rish ruxsati berilmagan. O'quvchilar, guruhlar va davomat bilan ishlashingiz mumkin."
          action={
            <Link
              to="/owner/students"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              O'quvchilarga o'tish <ArrowRight className="size-3.5" />
            </Link>
          }
        />
      )}
    </WorkspacePage>
  );
};

export default BranchTodayPage;
