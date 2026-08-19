import { useState } from "react";
import { AlertTriangle, Info } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { MetricValue, ComparisonBadge, AnalyticsTable, QueryState, DeniedBlock } from "@/shared/components/analytics";
import {
  useTeacherProfit, useDirectionProfit, useGroupProfit,
  useRoomRevenue, useBranchProfit,
} from "../../hooks/useFinanceAnalytics";

/**
 * FOYDALILIK — o'qituvchi / yo'nalish / guruh / xona / filial.
 *
 * ═══════════════════════════════════════════════════════════════════
 * "HISSA FOYDASI", "SOF FOYDA" EMAS
 *
 * Sarlavhalar ATAYLAB shunday. Ijara, kommunal va ma'muriyat maoshi
 * o'qituvchiga taqsimlanmagan, chunki taqsimlash qoidasi YO'Q. Uni
 * o'ylab topib "sof foyda" deb atash — eng zararli variant: raqam
 * ishonchli ko'rinadi, lekin ikki o'qituvchi orasidagi farq ularning
 * ishidan emas, TANLANGAN FORMULADAN kelib chiqardi.
 *
 * ATRIBUTSIYA QAMROVI har jadval tepasida ko'rsatiladi — qamrov past
 * bo'lsa foydalanuvchi reytingga ehtiyot bo'lishi kerakligini KO'RIB
 * turadi.
 * ═══════════════════════════════════════════════════════════════════
 */

const TABS = [
  { key: "teachers", label: "O'qituvchilar" },
  { key: "directions", label: "Yo'nalishlar" },
  { key: "groups", label: "Guruhlar" },
  { key: "rooms", label: "Xonalar" },
  { key: "branches", label: "Filiallar" },
];

/** Atributsiya qamrovi — past bo'lsa OGOHLANTIRISH. */
const AttributionNote = ({ attribution }) => {
  if (!attribution) return null;
  const cov = attribution.coveragePercent;
  const low = cov !== null && cov < 90;

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border p-3 text-xs",
        low ? "border-warning/40 bg-warning/5" : "border-border bg-muted/40",
      )}
    >
      {low ? (
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
      ) : (
        <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0">
        <p className="text-foreground">
          Atributsiya qamrovi:{" "}
          <b><MetricValue value={cov} kind="percent" /></b>
          {low && " — reytingni ehtiyotkorlik bilan o'qing"}
        </p>
        {attribution.unattributedRevenue > 0 && (
          <p className="mt-0.5 text-muted-foreground">
            <MetricValue value={attribution.unattributedRevenue} kind="moneyShort" />{" "}
            daromad bog'lanmagan qoldi.
          </p>
        )}
        <p className="mt-1 text-muted-foreground">{attribution.rule}</p>
      </div>
    </div>
  );
};

const MARGIN_COL = {
  key: "contributionMarginPercent", label: "Marja", align: "right",
  render: (r) => (
    <span
      className={cn(
        "font-medium",
        r.contributionMarginPercent === null ? "" :
          r.contributionMarginPercent >= 50 ? "text-success" :
            r.contributionMarginPercent < 20 ? "text-destructive" : "",
      )}
    >
      <MetricValue value={r.contributionMarginPercent} kind="percent" emptyTitle="Daromad nol" />
    </span>
  ),
};

const ProfitabilitySection = ({ filters, onDrill, initialTab = "teachers" }) => {
  const [tab, setTab] = useState(initialTab);
  const { has, hasAny } = usePermissions();

  const canProfit = has(PERMISSIONS.FINANCE_VIEW_PROFITABILITY);
  const canPayroll = hasAny([PERMISSIONS.SALARY_READ, PERMISSIONS.PAYROLL_READ]);

  // So'rovlar FAQAT o'z tabi ochilganda ketadi (talab 17).
  const teachers = useTeacherProfit(filters, { enabled: tab === "teachers" && canProfit && canPayroll });
  const directions = useDirectionProfit(filters, { enabled: tab === "directions" && canProfit });
  const groups = useGroupProfit(filters, { enabled: tab === "groups" && canProfit });
  const rooms = useRoomRevenue(filters, { enabled: tab === "rooms" && canProfit });
  const branches = useBranchProfit(filters, { enabled: tab === "branches" && canProfit });

  if (!canProfit) return <DeniedBlock permission="finance.view_profitability" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition",
              tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── O'QITUVCHILAR ── */}
      {tab === "teachers" && (
        !canPayroll ? (
          <DeniedBlock permission="salary.read yoki payroll.read" />
        ) : (
          <QueryState query={teachers} empty={!teachers.data?.items?.length}
            emptyTitle="Bu davrda o'qituvchiga bog'langan daromad yo'q">
            {(d) => (
              <div className="space-y-3">
                <AttributionNote attribution={d.attribution} />
                <AnalyticsTable
                  rows={d.items}
                  rowKey={(r) => r.teacherId}
                  defaultSort={{ key: "contributionProfit", dir: "desc" }}
                  onRowClick={(r) => onDrill?.({ type: "teacher", id: r.teacherId, name: r.name })}
                  columns={[
                    { key: "name", label: "O'qituvchi" },
                    { key: "students", label: "O'quvchi", align: "right", kind: "number" },
                    { key: "groups", label: "Guruh", align: "right", kind: "number" },
                    { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                    { key: "directCosts", label: "To'g'ridan-to'g'ri xarajat", align: "right", kind: "moneyShort" },
                    { key: "contributionProfit", label: "Hissa foydasi", align: "right", kind: "moneyShort" },
                    MARGIN_COL,
                    { key: "revenuePerStudent", label: "Daromad/o'quvchi", align: "right", kind: "moneyShort" },
                    {
                      key: "revenuePerHour", label: "Daromad/soat", align: "right",
                      render: (r) => (
                        <MetricValue
                          value={r.revenuePerHour} kind="moneyShort"
                          emptyTitle="Jadval ma'lumoti yo'q — soat hisoblanmadi"
                        />
                      ),
                    },
                  ]}
                />
                {d.hoursBasis && (
                  <p className="text-[11px] text-muted-foreground">
                    Soat manbai: {d.hoursBasis.source}. {d.hoursBasis.note}
                  </p>
                )}
              </div>
            )}
          </QueryState>
        )
      )}

      {/* ── YO'NALISHLAR ── */}
      {tab === "directions" && (
        <QueryState query={directions} empty={!directions.data?.items?.length}
          emptyTitle="Yo'nalish bo'yicha daromad yo'q">
          {(d) => (
            <div className="space-y-3">
              <AttributionNote attribution={d.attribution} />
              <AnalyticsTable
                rows={d.items}
                rowKey={(r) => r.courseId}
                defaultSort={{ key: "contributionProfit", dir: "desc" }}
                onRowClick={(r) => onDrill?.({ type: "course", id: r.courseId, name: r.name })}
                columns={[
                  { key: "name", label: "Yo'nalish" },
                  { key: "students", label: "O'quvchi", align: "right", kind: "number" },
                  { key: "groups", label: "Guruh", align: "right", kind: "number" },
                  { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                  { key: "directCosts", label: "To'g'ridan-to'g'ri xarajat", align: "right", kind: "moneyShort" },
                  { key: "contributionProfit", label: "Hissa foydasi", align: "right", kind: "moneyShort" },
                  MARGIN_COL,
                  { key: "revenuePerStudent", label: "Daromad/o'quvchi", align: "right", kind: "moneyShort" },
                  {
                    key: "growth", label: "O'sish", align: "right",
                    sortValue: (r) => r.growth?.changePercent,
                    render: (r) => <ComparisonBadge compare={r.growth} />,
                  },
                ]}
              />
            </div>
          )}
        </QueryState>
      )}

      {/* ── GURUHLAR ── */}
      {tab === "groups" && (
        <QueryState query={groups} empty={!groups.data?.items?.length} emptyTitle="Guruh bo'yicha daromad yo'q">
          {(d) => (
            <AnalyticsTable
              rows={d.items}
              rowKey={(r) => r.groupId}
              defaultSort={{ key: "contributionProfit", dir: "desc" }}
              onRowClick={(r) => onDrill?.({ type: "group", id: r.groupId, name: r.name })}
              columns={[
                { key: "name", label: "Guruh" },
                { key: "students", label: "O'quvchi", align: "right", kind: "number" },
                { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                { key: "teacherCost", label: "Ustoz tannarxi", align: "right", kind: "moneyShort" },
                { key: "discounts", label: "Chegirma", align: "right", kind: "moneyShort" },
                { key: "refunds", label: "Qaytarim", align: "right", kind: "moneyShort" },
                { key: "outstanding", label: "Qarz", align: "right", kind: "moneyShort" },
                { key: "contributionProfit", label: "Hissa foydasi", align: "right", kind: "moneyShort" },
                MARGIN_COL,
              ]}
            />
          )}
        </QueryState>
      )}

      {/* ── XONALAR: "daromad va bandlik", FOYDA EMAS ── */}
      {tab === "rooms" && (
        <QueryState query={rooms} empty={!rooms.data?.items?.length} emptyTitle="Xona bo'yicha ma'lumot yo'q">
          {(d) => (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="text-foreground">Xona daromadi va bandligi</p>
                <p className="mt-1">{d.note}</p>
                {d.availableHoursBasis?.assumption && (
                  <p className="mt-1">
                    Mavjud soat <b className="text-foreground">taxmin</b> asosida:{" "}
                    {d.availableHoursBasis.workingHoursPerDay} soat ×{" "}
                    {d.availableHoursBasis.workingDaysPerWeek} kun ×{" "}
                    {d.availableHoursBasis.weeksInPeriod} hafta. {d.availableHoursBasis.note}
                  </p>
                )}
              </div>
              <AnalyticsTable
                rows={d.items}
                rowKey={(r) => r.roomId}
                defaultSort={{ key: "revenue", dir: "desc" }}
                onRowClick={(r) => onDrill?.({ type: "room", id: r.roomId, name: r.name })}
                columns={[
                  { key: "name", label: "Xona" },
                  { key: "groups", label: "Guruh", align: "right", kind: "number" },
                  { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                  { key: "occupiedHours", label: "Band soat", align: "right", kind: "number" },
                  { key: "availableHours", label: "Mavjud soat", align: "right", kind: "number" },
                  {
                    key: "utilizationPercent", label: "Bandlik", align: "right",
                    render: (r) => (
                      <span className={cn("font-medium",
                        r.utilizationPercent === null ? "" :
                          r.utilizationPercent < 40 ? "text-destructive" :
                            r.utilizationPercent > 80 ? "text-success" : "")}>
                        <MetricValue value={r.utilizationPercent} kind="percent" />
                      </span>
                    ),
                  },
                  { key: "revenuePerOccupiedHour", label: "Daromad/soat", align: "right", kind: "moneyShort" },
                ]}
              />
            </div>
          )}
        </QueryState>
      )}

      {/* ── FILIALLAR ── */}
      {tab === "branches" && (
        <QueryState query={branches} empty={!branches.data?.items?.length} emptyTitle="Filial ma'lumoti yo'q">
          {(d) => (
            <div className="space-y-3">
              <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                {d.note}
              </p>
              <AnalyticsTable
                rows={d.items}
                rowKey={(r) => r.branchId}
                defaultSort={{ key: "contributionProfit", dir: "desc" }}
                columns={[
                  { key: "name", label: "Filial" },
                  { key: "students", label: "O'quvchi", align: "right", kind: "number" },
                  { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                  { key: "directCosts", label: "To'g'ridan-to'g'ri xarajat", align: "right", kind: "moneyShort" },
                  { key: "contributionProfit", label: "Hissa foydasi", align: "right", kind: "moneyShort" },
                  MARGIN_COL,
                  { key: "outstanding", label: "Qarz", align: "right", kind: "moneyShort" },
                  { key: "collectionRatePercent", label: "Undirish", align: "right", kind: "percent" },
                ]}
              />
            </div>
          )}
        </QueryState>
      )}
    </div>
  );
};

export default ProfitabilitySection;
