// React
import { useMemo } from "react";

// Icons
import { Banknote, Building2, Target, Users } from "lucide-react";

// Dashboard components
import DataState from "@/shared/components/dashboard/DataState";
import DashboardSection from "@/shared/components/dashboard/SectionGrid";
import { narrow } from "@/shared/components/dashboard/dataStatus";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import usePermissions from "@/shared/hooks/usePermissions";
import useActiveBranch from "@/shared/hooks/useActiveBranch";
import {
  useBranchPnlData,
  useBranchSalesData,
  useBranchTeachersData,
} from "@/owner/features/systemAnalysis/hooks/useExecutiveData";

// Local components
import SectionHeader from "@/owner/features/systemAnalysis/components/SectionHeader";
import BranchPicker from "../components/BranchPicker";
import CompareTable from "../components/CompareTable";
import SourceBreakdown from "../components/SourceBreakdown";

// Navigation
import { useDrilldown } from "@/owner/features/systemAnalysis/navigation/drilldown";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";
import { ALL_BRANCHES } from "@/shared/lib/branch/activeBranch";

/**
 * FILIALLAR KESIMI - MOLIYA / O'QITUVCHI / SOTUV.
 *
 * ═══════════════════════════════════════════════════════════════════
 * SAVOL: "qaysi filial qanday ishlayapti va NEGA"
 *
 * Global filial tanlagichi butun ilovani BITTA filialga qisadi, ya'ni
 * bu savolga javob berolmaydi. `/owner/branches/compare` bor, lekin u
 * faqat SANOQ ko'rsatadi (o'quvchi, guruh, xodim) - "qaysi filial
 * ko'proq pul keltirdi", "qayerda o'qituvchi yuklamasi og'ir",
 * "qaysi kanal ishlayapti" degan savollar javobsiz qolardi.
 *
 * Shu sababli bu yerda UCH KESIM yonma-yon turadi. Ular bir ekranda
 * bo'lgani muhim: past foyda sababi ko'pincha ikkinchi jadvalda
 * (maosh fondi) yoki uchinchisida (lid oqimi to'xtagan) ko'rinadi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ═══════════════════════════════════════════════════════════════════
 * FILTR MIJOZDA, KO'LAM SERVERDA - ARALASHTIRILMAYDI
 *
 * Checkbox tanlovi ko'rinishni KESADI, ruxsatni EMAS. Endpoint'lar
 * `branchIds` qabul QILMAYDI va bu ataylab: mijozdan kelgan filial
 * ro'yxatiga ishonib qolinsa, uni qo'lda o'zgartirib boshqa filial
 * ma'lumotini so'rash mumkin bo'lardi.
 *
 * Server ko'lami AsyncLocalStorage orqali (`branchFilter()`): javobda
 * faqat foydalanuvchi KO'RISHGA HAQLI filiallar keladi. Tanlov esa
 * o'sha ro'yxatdan qismini ko'rsatadi - ya'ni filtr faqat KAMAYTIRA
 * oladi, hech qachon kengaytira olmaydi.
 * ═══════════════════════════════════════════════════════════════════
 */
const ComparePage = () => {
  const DRILLDOWN = useDrilldown();
  const now = new Date();
  const state = useObjectState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    // Bo'sh massiv = "hammasi" (BranchPicker izohiga qarang).
    selected: [],
  });

  const { has } = usePermissions();
  const { branches, isAllBranches, hasMultipleBranches, canSeeAllBranches, changeBranch } =
    useActiveBranch();

  const period = { year: state.year, month: state.month };

  // RUXSATLAR HAR BLOK UCHUN ALOHIDA - serverdagi marshrut bilan bir xil:
  //   /branch-analytics/pnl      -> finance.read
  //   /branch-analytics/teachers -> salary.read
  //   /branch-analytics/sales    -> leads.read
  //
  // Ruxsati yo'q blok CHAQIRILMAYDI. Bu "xatoni yashirish" emas: 403
  // ma'lum va oldindan aniq, uni so'rab olib keyin qizil karta chizish
  // foydalanuvchiga hech narsa bermasdi.
  const canFinance = has(PERMISSIONS.FINANCE_READ);
  const canTeachers = has(PERMISSIONS.SALARY_READ);
  const canSales = has(PERMISSIONS.LEADS_READ);

  const pnl = useBranchPnlData(canFinance ? period : {});
  const teachers = useBranchTeachersData(canTeachers ? period : {});
  const sales = useBranchSalesData(canSales ? period : {});

  // Tanlangan filiallar bo'yicha kesish. `narrow` HOLATNI MEROS
  // qoldiradi: so'rov yiqilgan bo'lsa filtrlangan ko'rinish ham
  // "xato" bo'lib qoladi, `ready` bo'lsa-yu tanlovga hech nima
  // tushmasa - `empty`.
  const pick = useMemo(() => {
    const set = new Set(state.selected.map(String));
    return (rows) =>
      !set.size ? rows : (rows || []).filter((r) => set.has(String(r.branchId)));
  }, [state.selected]);

  const pnlView = narrow(pnl, pick, { emptyWhen: (r) => !r?.length });
  const teachersView = narrow(teachers, pick, { emptyWhen: (r) => !r?.length });
  const salesView = narrow(sales, pick, { emptyWhen: (r) => !r?.length });

  const FILTERED_EMPTY = "Tanlangan filiallar uchun bu davrda yozuv yo'q.";

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Uch kesim yonma-yon"
        hint="Past foyda sababi ko'pincha ikkinchi jadvalda (maosh fondi) yoki uchinchisida (lid oqimi) ko'rinadi."
        period={state}
        actions={
          hasMultipleBranches ? (
            <BranchPicker
              branches={branches}
              value={state.selected}
              onChange={(v) => state.setField("selected", v)}
            />
          ) : null
        }
      />

      {/* BITTA FILIAL TANLANGAN BO'LSA OGOHLANTIRISH.
          ═════════════════════════════════════════════════════════════
          Server ko'lami tanlangan filialga qisiladi, ya'ni jadvalda
          bitta qator qoladi va "taqqoslash" degan sahifa taqqoslamaydi.
          Buni jimgina qoldirish eng yomoni bo'lardi: foydalanuvchi
          "boshqa filiallarda ma'lumot yo'q ekan" deb xulosa chiqarardi.

          TUGMA HAM BOR, faqat matn emas. Ogohlantirish "yuqoridagi
          belgidan almashtiring" deb yo'l ko'rsatsa, foydalanuvchi
          ekranning boshqa burchagidan boshqa element qidirishi kerak
          bo'lardi - ayniqsa yangi filial ochilgan zahoti, ya'ni aynan
          shu sahifa birinchi marta ochilganda.

          SAHIFA O'ZI AVTOMATIK ALMASHTIRMAYDI: filial konteksti
          GLOBAL, u butun ilovaga ta'sir qiladi. Sahifaga kirgani uchun
          jimgina o'zgarsa, foydalanuvchi keyingi ekranda o'zi
          tanlamagan ko'lamda ishlab qolardi. Almashtirish - ochiq
          harakat bo'lishi kerak. */}
      {hasMultipleBranches && !isAllBranches && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-dashed bg-muted/40 px-3 py-2.5">
          <p className="min-w-0 text-sm text-muted-foreground">
            Hozir bitta filial tanlangan, shuning uchun kesimda faqat
            o&apos;sha filial ko&apos;rinadi.
          </p>
          {canSeeAllBranches && (
            <button
              type="button"
              onClick={() => changeBranch(ALL_BRANCHES)}
              className="shrink-0 rounded-md border bg-card px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              Barcha filiallarga o&apos;tish
            </button>
          )}
        </div>
      )}

      {/* ── MOLIYA ── */}
      {canFinance && (
        <DashboardSection
          title="Moliya"
          hint="Daromad, xarajat va sof natija"
          to={DRILLDOWN.branchAnalytics}
          toLabel="Filial tahlili"
        >
          <DataState
            status={pnlView.status}
            data={pnlView.data}
            error={pnlView.error}
            onRetry={pnl.refetch}
            emptyIcon={Banknote}
            emptyHint={FILTERED_EMPTY}
            notConnectedHint="Moliya tahlili moduli ma'lumot manbai ulangach chiqadi."
            skeletonClassName="h-40"
          >
            {(rows) => (
              <CompareTable
                rows={rows}
                columns={[
                  { key: "revenue", label: "Daromad", format: "money" },
                  { key: "expense", label: "Xarajat", format: "money" },
                  {
                    key: "shortage",
                    label: "Kamomad",
                    format: "money",
                    hint: "Yo'qotish — xarajat emas",
                  },
                  {
                    key: "net",
                    label: "Sof",
                    format: "money",
                    tone: "signed",
                    hint: "Markaz xarajatlari kirmaydi",
                  },
                  { key: "margin", label: "Marja", format: "percent" },
                ]}
              />
            )}
          </DataState>
        </DashboardSection>
      )}

      {/* ── O'QITUVCHI RESURSI ── */}
      {canTeachers && (
        <DashboardSection
          title="O'qituvchilar"
          hint="Yuklama va maosh fondi"
          to={DRILLDOWN.teacherSalaries}
          toLabel="Maoshlar"
        >
          <DataState
            status={teachersView.status}
            data={teachersView.data}
            error={teachersView.error}
            onRetry={teachers.refetch}
            emptyIcon={Users}
            emptyHint={FILTERED_EMPTY}
            notConnectedHint="O'qituvchi tahlili ma'lumot manbai ulangach chiqadi."
            skeletonClassName="h-40"
          >
            {(rows) => (
              <CompareTable
                rows={rows}
                minWidth={820}
                columns={[
                  { key: "teacherCount", label: "O'qituvchi" },
                  { key: "activeGroups", label: "Guruh" },
                  {
                    key: "groupsWithoutTeacher",
                    label: "Egasiz",
                    hint: "O'qituvchi biriktirilmagan guruh",
                  },
                  { key: "students", label: "O'quvchi" },
                  {
                    key: "groupsPerTeacher",
                    label: "Guruh/o'qit.",
                    hint: "Bitta o'qituvchiga to'g'ri keladigan guruh",
                  },
                  {
                    key: "studentsPerTeacher",
                    label: "O'quvchi/o'qit.",
                  },
                  { key: "salaryExpected", label: "Maosh", format: "money" },
                  {
                    key: "salaryShareOfRevenue",
                    label: "Maosh ulushi",
                    format: "percent",
                    hint: "Maoshning daromaddagi ulushi",
                  },
                ]}
              />
            )}
          </DataState>
        </DashboardSection>
      )}

      {/* ── SOTUV ── */}
      {canSales && (
        <DashboardSection
          title="Sotuv"
          hint="Lid oqimi va o'quvchiga aylanishi"
          to={DRILLDOWN.leads}
          toLabel="Lidlar"
        >
          <DataState
            status={salesView.status}
            data={salesView.data}
            error={salesView.error}
            onRetry={sales.refetch}
            emptyIcon={Target}
            emptyHint={FILTERED_EMPTY}
            notConnectedHint="Sotuv tahlili ma'lumot manbai ulangach chiqadi."
            skeletonClassName="h-40"
          >
            {(rows) => (
              <div className="space-y-4">
                <CompareTable
                  rows={rows}
                  minWidth={760}
                  columns={[
                    { key: "leads", label: "Lid", hint: "Davr ichida kelgan" },
                    {
                      key: "enrolled",
                      label: "Yozildi",
                      hint: "Shu davr lidlaridan",
                    },
                    { key: "rejected", label: "Rad" },
                    { key: "open", label: "Ochiq" },
                    {
                      key: "conversionPercent",
                      label: "Konversiya",
                      format: "percent",
                      hint: "Davr lidlarining nechta foizi yozildi",
                    },
                    {
                      key: "enrolledInRange",
                      label: "Davrda yozildi",
                      hint: "Qachon kelganidan qat'i nazar",
                    },
                    {
                      key: "avgDaysToConvert",
                      label: "O'rtacha",
                      format: "days",
                      hint: "Lid kelgandan yozilgunga qadar",
                    },
                  ]}
                />

                {/* KANAL KESIMI - har filial uchun alohida.
                    Bitta umumiy ro'yxatga qo'shib yuborilsa, "Instagram
                    yaxshi ishlayapti" degan xulosa chiqardi, aslida esa
                    u faqat BIR filialda ishlayotgan bo'lishi mumkin -
                    va aynan shu farq qaror o'zgartiradi. */}
                <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
                  {rows.map((r) => (
                    <div
                      key={r.branchId}
                      className="space-y-3 rounded-md border bg-card p-3"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium text-foreground">
                          {r.name || "—"}
                        </p>
                        <p className="shrink-0 text-xs text-muted-foreground">
                          kanallar bo&apos;yicha
                        </p>
                      </div>
                      <SourceBreakdown items={r.bySource} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DataState>
        </DashboardSection>
      )}

      {/* Uchala blokka ham ruxsati yo'q foydalanuvchi bo'sh ekran
          ko'rmasin - nima uchun bo'shligi aytiladi. */}
      {!canFinance && !canTeachers && !canSales && (
        <DataState
          status="empty"
          emptyIcon={Building2}
          emptyTitle="Kesim mavjud emas"
          emptyHint="Filiallar kesimini ko'rish uchun moliya, maosh yoki lid ruxsatlaridan kamida bittasi kerak."
        />
      )}
    </div>
  );
};

export default ComparePage;
