import { Info } from "lucide-react";

import { AnalyticsTable, QueryState } from "@/shared/components/analytics";
import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { useDrill, DRILL_TYPES as T } from "@/shared/drill";
import { useDirectionProfit } from "@/owner/features/financeAnalytics/hooks/useFinanceAnalytics";
import useLeadStatsQuery from "@/owner/features/leads/hooks/useLeadStatsQuery";
import EmptyState from "@/shared/components/page/EmptyState";

/**
 * ══════════════════════════════════════════════════════════════════════
 * YO'NALISH TALABI — IKKI JADVAL, ATAYLAB BIRLASHTIRILMAGAN (talab 16)
 * ══════════════════════════════════════════════════════════════════════
 *
 * Talab bitta savol beradi: "qaysi yo'nalish eng ko'p lid oladi, eng
 * ko'p o'quvchi va eng ko'p foyda keltiradi?"
 *
 * ── NEGA JAVOB IKKI JADVALDA ──
 * Chunki bazada IKKITA "yo'nalish" bor va ular BOG'LANMAGAN:
 *
 *   `Lead.directionId`  → `LeadOption` — sotuv ro'yxati. Uni resepshin
 *                          to'ldiradi ("Ingliz tili", "IELTS kurslari").
 *   `Group.courseId`    → `Course`     — o'quv katalogi. Daromad,
 *                          tannarx va foyda AYNAN shunga bog'lanadi.
 *
 * Ular orasida hech qanday havola yo'q: `LeadOption` da `courseId`
 * maydoni mavjud emas. Ikkalasini NOM bo'yicha moslashtirish mumkin
 * edi — va bu eng xavfli yo'l bo'lardi: "IELTS" va "IELTS kurslari"
 * jimgina bir-biriga tushmaydi, natijada konversiya foizi noto'g'ri
 * chiqadi va buni hech kim sezmaydi.
 *
 * Shuning uchun ikkala kesim ham TO'LIQ ko'rsatiladi, lekin YONMA-YON
 * va nomi bilan: "sotuv ro'yxati" va "o'quv katalogi". Ekran nimani
 * bilishini va nimani BILMASLIGINI ochiq aytadi.
 *
 * ── BUNI QANDAY BOG'LASH MUMKIN ──
 * `LeadOption` ga ixtiyoriy `courseId` qo'shilsa, ikkala jadval bitta
 * bo'lardi va "qaysi yo'nalish eng yaxshi konversiya beradi → u qancha
 * foyda keltirdi" zanjiri to'liq yopilardi. Bu — MA'LUMOT MODELI
 * qarori, ekran qarori emas.
 */
const DirectionDemandSection = ({ filters = {} }) => {
  const { has } = usePermissions();
  const { openRoot } = useDrill();

  const canLeads = has(PERMISSIONS.LEADS_READ);
  const canProfit = has(PERMISSIONS.FINANCE_VIEW_PROFITABILITY);

  const leads = useLeadStatsQuery(filters);
  const directions = useDirectionProfit(filters, { enabled: canProfit });

  if (!canLeads && !canProfit) {
    return (
      <EmptyState
        title="Yo'nalish tahlili yopiq"
        hint="Bu kesim uchun lidlarni ko'rish yoki foydalilik ruxsati kerak."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* IKKI TAKSONOMIYA HAQIDA OGOHLANTIRISH — YASHIRILMAYDI.
          Foydalanuvchi ikki jadvaldagi nomlar mos kelmasligini
          KO'RADI; sababini aytmaslik uni "tizim adashyapti" degan
          xulosaga olib borardi. */}
      <div className="flex items-start gap-2 rounded-lg border border-border bg-card p-3">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Quyidagi ikki jadval <strong>ikki xil ro&apos;yxatdan</strong> keladi:
          lidlardagi yo&apos;nalish sotuv ro&apos;yxati (Sozlamalar &rarr; Lidlar &rarr;
          Yo&apos;nalish), daromad esa guruhga biriktirilgan <strong>kurs</strong> bo&apos;yicha
          hisoblanadi. Ular bir-biriga bog&apos;lanmagan, shuning uchun nomlar
          mos kelmasligi mumkin — bu xato emas. Ikkalasini bitta jadvalga
          qo&apos;shish uchun lid yo&apos;nalishiga kurs biriktirish kerak.
        </p>
      </div>

      {/* ══════════ 1) TALAB: LIDLAR ══════════ */}
      {canLeads && (
        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              Talab — lidlar bo&apos;yicha
            </h3>
            <p className="text-xs text-muted-foreground">
              Qaysi yo&apos;nalishga eng ko&apos;p murojaat keladi va qaysi biri
              o&apos;quvchiga aylanadi
            </p>
          </div>

          <QueryState
            query={leads}
            empty={!leads.data?.byDirection?.length}
            emptyTitle="Lid yo'nalishi bo'yicha ma'lumot yo'q"
            emptyHint="Lid qo'shilganda unga yo'nalish tanlanmagan bo'lishi mumkin."
            loadingRows={3}
          >
            {(data) => (
              <AnalyticsTable
                rows={data.byDirection}
                rowKey={(r) => r.id || "none"}
                defaultSort={{ key: "total", dir: "desc" }}
                columns={[
                  { key: "name", label: "Yo'nalish (sotuv ro'yxati)" },
                  { key: "total", label: "Lid", align: "right", kind: "number" },
                  { key: "enrolled", label: "O'quvchiga aylandi", align: "right", kind: "number" },
                  { key: "conversionRate", label: "Konversiya", align: "right", kind: "percent" },
                ]}
              />
            )}
          </QueryState>
        </div>
      )}

      {/* ══════════ 2) NATIJA: DAROMAD VA FOYDA ══════════ */}
      {canProfit && (
        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              Natija — kurs bo&apos;yicha
            </h3>
            <p className="text-xs text-muted-foreground">
              {directions.data?.attribution
                ? `Bog'lanish qamrovi: ${directions.data.attribution.coveragePercent}% — qolgan daromad kursga bog'lanmagan`
                : "Qaysi kurs qancha o'quvchi, daromad va foyda keltirdi"}
            </p>
          </div>

          <QueryState
            query={directions}
            empty={!directions.data?.items?.length}
            emptyTitle="Kurs bo'yicha daromad yo'q"
            emptyHint="Guruhlarga kurs biriktirilmagan bo'lishi mumkin."
            loadingRows={3}
          >
            {(data) => (
              <AnalyticsTable
                rows={data.items}
                rowKey={(r) => r.courseId}
                defaultSort={{ key: "contributionProfit", dir: "desc" }}
                onRowClick={(r) => openRoot({ type: T.COURSE, id: r.courseId, name: r.name })}
                columns={[
                  { key: "name", label: "Kurs (o'quv katalogi)" },
                  { key: "students", label: "O'quvchi", align: "right", kind: "number" },
                  { key: "groups", label: "Guruh", align: "right", kind: "number" },
                  { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                  { key: "directCosts", label: "Bevosita xarajat", align: "right", kind: "moneyShort" },
                  { key: "contributionProfit", label: "Hissa foydasi", align: "right", kind: "moneyShort" },
                  { key: "contributionMarginPercent", label: "Marja", align: "right", kind: "percent" },
                ]}
              />
            )}
          </QueryState>
        </div>
      )}
    </div>
  );
};

export default DirectionDemandSection;
