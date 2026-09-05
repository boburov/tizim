import { useState } from "react";
import { SearchX } from "lucide-react";

import Pagination from "@/shared/components/ui/pagination/Pagination";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import useObjectState from "@/shared/hooks/useObjectState";
import { MODAL } from "@/shared/constants/modals";

import ActivityLogsTable from "../components/ActivityLogsTable";
import ActivityLogsTableSkeleton from "../components/ActivityLogsTableSkeleton";
import FinancialAuditTable from "../components/FinancialAuditTable";
import PayrollAuditTable from "../components/PayrollAuditTable";
import AuditTabs from "../components/AuditTabs";
import LogFilters from "../components/LogFilters";
import LogDetailModal from "../components/LogDetailModal";
import useActivityLogsQuery from "../hooks/useActivityLogsQuery";
import useFinancialAuditQuery from "../hooks/useFinancialAuditQuery";
import usePayrollAuditQuery from "../hooks/usePayrollAuditQuery";

const TABS = [
  { key: "activity", label: "Faoliyat" },
  { key: "financial", label: "Moliya" },
  { key: "payroll", label: "Oylik" },
];

const LIMIT = 30;

/**
 * ══════════════════════════════════════════════════════════════════════
 * AUDIT LOGLARI — IKKALA PANELDA BITTA SAHIFA
 * ══════════════════════════════════════════════════════════════════════
 *
 * Admin panelida `/owner/activity-logs`, super admin panelida
 * `/org/audit`. IKKINCHI NUSXA YARATILMADI: ko'lam — server qo'yadigan
 * filtr, ikkinchi ekran emas (xona, moliya va tizim tahlili bilan
 * AYNI qoida).
 *
 * ── IKKI PANEL ORASIDAGI YAGONA FARQ ──
 * `showBranchFilter`. Admin panelida filial yon paneldagi GLOBAL
 * tanlagich orqali boshqariladi va bu yerga ikkinchisini qo'yish
 * ikkita raqobatlashuvchi "joriy filial" yaratardi. Super admin
 * qobig'ida global tanlagich UMUMAN yo'q, shuning uchun tanlagich shu
 * yerda chiziladi.
 *
 * ── XAVFLI AMALLAR BAYROG'I HAM SHU BILAN BOG'LANGAN ──
 * U faqat super admin panelida STANDART bo'yicha YOQILADI: tashkilot
 * ko'lamidagi oqim minglab qatordan iborat va filtrsiz ochilgan sahifa
 * "kim rolni o'zgartirdi" ni ko'rsata olmasdi. Filial ko'lamida esa
 * oqim o'qiladigan darajada kichik va bayroq odamni to'sib qo'yardi.
 *
 * ⚠ Bayroq FAQAT "Faoliyat" tab'ida ma'noga ega: Moliya va Oylik
 * izlarining HAMMASI ta'rifi bo'yicha allaqachon xavfli.
 */
const ActivityLogsPage = ({ showBranchFilter = false }) => {
  const [tab, setTab] = useState("activity");
  const [page, setPage] = useState(1);

  // Filtrlar TAB'DAN TASHQARIDA saqlanadi: odam bitta xodimni tanlab,
  // uchala izni ketma-ket ko'rib chiqadi. Tab almashganda tanlov
  // yo'qolsa, u har safar qaytadan tanlashi kerak bo'lardi.
  const filters = useObjectState({
    userId: "",
    branchId: "",
    action: "",
    resourceType: "",
    fromDate: "",
    toDate: "",
    dangerousOnly: showBranchFilter,
  });

  const onFilterChange = (key, value) => {
    filters.setField(key, value);
    setPage(1);
  };

  const onTabChange = (next) => {
    setTab(next);
    setPage(1);
  };

  // Uchala tab uchun umumiy bo'lak. `|| undefined` — bo'sh satr
  // so'rovga `?userId=` bo'lib tushmasligi uchun.
  const shared = {
    userId: filters.userId || undefined,
    fromDate: filters.fromDate || undefined,
    toDate: filters.toDate || undefined,
    page,
    limit: LIMIT,
  };

  // ⚠ `enabled` — faol bo'lmagan tab so'rov YUBORMAYDI. Usiz sahifa
  // ochilishida uchala endpoint ham chaqirilardi va ikkitasining
  // natijasi hech qachon ko'rsatilmasdi.
  const activity = useActivityLogsQuery(
    {
      ...shared,
      branchId: filters.branchId || undefined,
      action: filters.action || undefined,
      resourceType: filters.resourceType || undefined,
      dangerousOnly: filters.dangerousOnly ? "true" : undefined,
    },
    { enabled: tab === "activity" },
  );

  const financial = useFinancialAuditQuery(
    {
      // `FinancialAuditLog` da aktyor maydoni `actorId` deb ataladi —
      // `ActivityLog` dagi `userId` NING egizagi, boshqa nom.
      actorId: filters.userId || undefined,
      branchId: filters.branchId || undefined,
      fromDate: shared.fromDate,
      toDate: shared.toDate,
      page,
      limit: LIMIT,
    },
    { enabled: tab === "financial" },
  );

  const payroll = usePayrollAuditQuery(
    {
      actorId: filters.userId || undefined,
      fromDate: shared.fromDate,
      toDate: shared.toDate,
      page,
      limit: LIMIT,
    },
    { enabled: tab === "payroll" },
  );

  const current =
    tab === "financial" ? financial : tab === "payroll" ? payroll : activity;

  const items = current.data?.data || [];
  const total = current.data?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  // ── BO'SH HOLAT NEGA BO'SH ──
  //
  // "Qayd yo'q" ikki BUTUNLAY boshqa holatni bildiradi va ularni
  // aralashtirish odamni noto'g'ri yo'lga soladi:
  //
  //   1) FILTR hech narsani topmadi — filtrni bo'shatsa natija chiqadi;
  //   2) umuman ma'lumot yo'q — filtr bilan ovora bo'lish behuda.
  //
  // Ilgari ikkalasiga ham bir xil "Hozircha qayd yo'q" chizilardi va
  // filtr yoqilganini hech narsa eslatmasdi. Aynan shu holat jonli
  // tizimda chalkashlik bergan: "Xodim" tanlangan holda sahifa bo'sh
  // ko'rinardi va sabab ko'rinmasdi.
  const activeFilters = [
    filters.userId && "Xodim",
    filters.branchId && "Filial",
    filters.action && "Amal turi",
    filters.resourceType && "Modul",
    filters.fromDate && "Boshlanish sanasi",
    filters.toDate && "Tugash sanasi",
    filters.dangerousOnly && "Faqat xavfli amallar",
  ].filter(Boolean);

  const clearFilters = () => {
    filters.setFields({
      userId: "",
      branchId: "",
      action: "",
      resourceType: "",
      fromDate: "",
      toDate: "",
      dangerousOnly: false,
    });
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Audit loglari</h1>
        <div className="text-sm text-muted-foreground">
          Jami: <span className="font-semibold">{total}</span>
        </div>
      </header>

      <AuditTabs value={tab} onChange={onTabChange} tabs={TABS} />

      <LogFilters
        filters={filters}
        onChange={onFilterChange}
        showBranch={showBranchFilter}
        // Modul va amal turi ustunlari FAQAT `ActivityLog` da bor.
        // Boshqa tab'larda ular hech narsani filtrlamasdi va
        // "ishlamaydigan tanlagich" bo'lib qolardi.
        showAction={tab === "activity"}
        showResource={tab === "activity"}
        showDangerous={tab === "activity"}
      />

      {current.isLoading ? (
        <ActivityLogsTableSkeleton />
      ) : (
        <>
          {/* Filtr yoqilgan-u natija yo'q — sababni AYTAMIZ va bo'shatish
              tugmasini beramiz. Jadvalning o'z bo'sh holati faqat
              "haqiqatan ma'lumot yo'q" uchun qoladi. */}
          {items.length === 0 && activeFilters.length > 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card py-16 text-center">
              <SearchX className="size-10 text-muted-foreground" strokeWidth={1.5} />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Tanlangan filtrlar bo'yicha qayd topilmadi
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Faol filtrlar: {activeFilters.join(", ")}
                </p>
              </div>
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm font-medium text-primary hover:underline"
              >
                Filtrlarni tozalash
              </button>
            </div>
          ) : (
            <>
              {tab === "activity" && <ActivityLogsTable items={items} />}
              {tab === "financial" && <FinancialAuditTable items={items} />}
              {tab === "payroll" && <PayrollAuditTable items={items} />}
            </>
          )}

          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              onPageChange={setPage}
              totalPages={totalPages}
              hasNextPage={page < totalPages}
              hasPrevPage={page > 1}
            />
          )}
        </>
      )}

      <ModalWrapper
        name={MODAL.ACTIVITY_LOG_DETAIL}
        title="Log tafsilotlari"
        className="max-w-2xl"
      >
        <LogDetailModal />
      </ModalWrapper>
    </div>
  );
};

export default ActivityLogsPage;
