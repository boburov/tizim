import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, Plus, DoorOpen, Users, GraduationCap, Wallet, Pencil,
  TrendingDown, PiggyBank, HandCoins, Banknote,
} from "lucide-react";

import Button from "@/shared/components/ui/button/Button";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import { cn } from "@/shared/utils/cn";
import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { KpiGrid } from "@/shared/components/dashboard/SectionGrid";
import KpiTile from "@/shared/components/dashboard/KpiTile";
import { fromQuery } from "@/shared/components/dashboard/dataStatus";
import { AnalyticsTable, QueryState } from "@/shared/components/analytics";
import { useDrill, useDrillFilters, DRILL_TYPES as T } from "@/shared/drill";
import {
  useSummary, useRevenueBy, useExpenseBy,
} from "@/owner/features/financeAnalytics/hooks/useFinanceAnalytics";
import useBranchStatsQuery from "@/owner/features/branches/hooks/useBranchStatsQuery";
import useBranchesQuery from "@/owner/features/branches/hooks/useBranchesQuery";
import { useRoomsQuery, useRoomRemoveMutation } from "@/owner/features/catalog/hooks/useCatalogQueries";
import RoomCreateModal from "@/owner/features/catalog/components/modals/RoomCreateModal";
import { useUsersListQuery } from "@/owner/features/users";
import WorkspacePage from "@/workspaces/shared/WorkspacePage";
import EmptyState from "@/workspaces/shared/EmptyState";

/**
 * ══════════════════════════════════════════════════════════════════════
 * FILIAL BOSHQARUV MARKAZI (talab 2)
 * ══════════════════════════════════════════════════════════════════════
 *
 * TALAB QILINGAN OQIM:
 *
 *   Super Admin → Filiallar → Filial A → Xonalar → Xona qo'shish
 *
 * Ilgari bu MUMKIN EMAS edi: xonalar "Katalog > Kurslar va xonalar"
 * sahifasida, filial kontekstidan TASHQARIDA turardi. Ega A filialiga
 * xona qo'shish uchun filialdan chiqib, katalogga o'tib, u yerda
 * filialni QAYTADAN tanlashi kerak edi. Kontekst ikki marta
 * yo'qolardi va xato filialga xona qo'shish oson edi.
 *
 * Endi filial — KONTEYNER. Xona qo'shish tugmasi shu yerda va u
 * `branchId` ni kontekstdan oladi.
 *
 * ── TAB LAR, ALOHIDA SAHIFA EMAS ──
 * To'rt bo'lim bitta manzilda (`?tab=`): sarlavha, filial nomi va
 * "orqaga" tugmasi joyida qoladi. Alohida sahifalar bo'lsa, har
 * o'tishda kontekst qaytadan yuklanardi.
 *
 * ── SO'ROVLAR (talab 29) ──
 * Har tab O'Z ma'lumotini so'raydi (`enabled`). Sahifa ochilganda
 * faqat "Umumiy" tab yuklanadi.
 */

const TABS = [
  { key: "overview", label: "Umumiy", icon: Wallet },
  { key: "rooms", label: "Xonalar", icon: DoorOpen },
  { key: "people", label: "Odamlar", icon: Users },
  { key: "money", label: "Moliya", icon: Banknote },
];

const OrgBranchDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { has } = usePermissions();
  const { openModal } = useModal();
  const { openRoot } = useDrill();
  const [tab, setTab] = useState("overview");

  const canFinance = has(PERMISSIONS.FINANCE_READ);
  const canRooms = has(PERMISSIONS.CLASSES_READ);
  const canCreateRoom = has(PERMISSIONS.CLASSES_CREATE);
  const canPeople = has(PERMISSIONS.USERS_READ);
  const canEdit = has(PERMISSIONS.SYSTEM_ADMIN_ACCESS) && has(PERMISSIONS.BRANCHES_UPDATE);

  // Filial nomi — ro'yxatdan. Alohida so'rov qilinmaydi: ro'yxat
  // sidebar tanlagichi uchun baribir keshda turadi.
  const branches = useBranchesQuery();
  const branch = (branches.data?.data || []).find((b) => b.id === id);

  const filters = { branchId: id };
  // Drill paneli SHU FILIAL doirasida ochilsin: aks holda filial
  // kartasidagi raqamni bosgan odam butun tashkilot kesimini ko'rardi
  // va ikkita raqam bir-biriga mos kelmasdi.
  useDrillFilters(filters);
  const summary = useSummary(filters, { enabled: canFinance });
  const stats = useBranchStatsQuery(id);
  const rooms = useRoomsQuery({ branchId: id }, { enabled: canRooms && tab === "rooms" });
  const staff = useUsersListQuery(
    { branchId: id, limit: 100 },
    { enabled: canPeople && tab === "people" },
  );
  const revenueByCourse = useRevenueBy("course", filters, {
    enabled: canFinance && tab === "money",
  });
  const expenseByCategory = useExpenseBy("category", filters, {
    enabled: canFinance && tab === "money",
  });

  const removeRoom = useRoomRemoveMutation();
  const s = fromQuery(summary);
  const d = summary.data;
  const st = fromQuery(stats);

  const visibleTabs = TABS.filter((t) => {
    if (t.key === "rooms") return canRooms;
    if (t.key === "people") return canPeople;
    if (t.key === "money") return canFinance;
    return true;
  });

  return (
    <WorkspacePage
      title={branch?.name || "Filial"}
      subtitle={
        branch?.code
          ? `Kod: ${branch.code}${branch.address ? ` · ${branch.address}` : ""}`
          : "Filialning barcha resurslari shu yerda"
      }
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => navigate("/org/branches")}>
            <ArrowLeft className="size-4" />
            Filiallar
          </Button>
          {canEdit && branch && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openModal(MODAL.BRANCH_EDIT, branch)}
            >
              <Pencil className="size-4" />
              Tahrirlash
            </Button>
          )}
        </>
      }
    >
      {/* ── TAB LAR ── */}
      <nav className="flex flex-wrap gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition",
              tab === t.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </nav>

      {/* ══════════ UMUMIY ══════════ */}
      {tab === "overview" && (
        <>
          <KpiGrid cols={3}>
            {canFinance && (
              <>
                <KpiTile
                  label="Daromad" isMoney icon={Wallet}
                  value={d?.revenue?.current} delta={d?.revenue?.changePercent}
                  status={s.status} error={s.error} onRetry={s.refetch}
                  onClick={() =>
                    openRoot({ type: T.REVENUE, name: `${branch?.name || "Filial"} · daromad` })
                  }
                />
                <KpiTile
                  label="Chiqim" isMoney icon={TrendingDown} invertDelta
                  value={d?.operatingExpenses?.current} delta={d?.operatingExpenses?.changePercent}
                  status={s.status} error={s.error} onRetry={s.refetch}
                  onClick={() =>
                    openRoot({ type: T.EXPENSE, name: `${branch?.name || "Filial"} · chiqim` })
                  }
                />
                <KpiTile
                  label="Hissa foydasi" isMoney icon={PiggyBank}
                  value={d?.contributionProfit?.current}
                  status={s.status} error={s.error} onRetry={s.refetch}
                />
                <KpiTile
                  label="Kassa" isMoney icon={Banknote}
                  value={d?.cashBalance}
                  status={s.status} error={s.error} onRetry={s.refetch}
                />
                <KpiTile
                  label="Qarzdorlik" isMoney icon={HandCoins} invertDelta
                  value={d?.receivables?.outstanding?.current}
                  status={s.status} error={s.error} onRetry={s.refetch}
                />
              </>
            )}
            <KpiTile
              label="O'quvchilar" icon={GraduationCap} suffix=" ta"
              value={stats.data?.studentCount}
              status={st.status} error={st.error} onRetry={st.refetch}
              to="/owner/students"
            />
            <KpiTile
              label="Guruhlar" icon={Users} suffix=" ta"
              value={stats.data?.activeGroupCount}
              status={st.status} error={st.error} onRetry={st.refetch}
              to="/owner/groups"
            />
            <KpiTile
              label="Xodimlar" icon={Users} suffix=" ta"
              value={stats.data?.staffCount}
              status={st.status} error={st.error} onRetry={st.refetch}
              onClick={() => setTab("people")}
            />
          </KpiGrid>

          <p className="text-xs text-muted-foreground">
            Filialning xonalari, odamlari va pul harakati — yuqoridagi bo'limlarda.
          </p>
        </>
      )}

      {/* ══════════ XONALAR ══════════ */}
      {tab === "rooms" && canRooms && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">Xonalar</h2>
              <p className="text-xs text-muted-foreground">
                Filialning fizik resursi. Guruh jadvali shu xonalarga bog'lanadi.
              </p>
            </div>
            {canCreateRoom && (
              <Button size="sm" onClick={() => openModal(MODAL.ROOM_CREATE, { branchId: id })}>
                <Plus className="size-4" />
                Xona qo'shish
              </Button>
            )}
          </div>

          {/* `useRoomsQuery` KONVERTNI qaytaradi (`{ success, data }`),
              massivni EMAS — shuning uchun `.data.data`. Bu farq jimgina
              bo'sh jadval berardi: so'rov muvaffaqiyatli, xato yo'q,
              lekin ro'yxat "bo'sh" bo'lib ko'rinardi. */}
          <QueryState
            query={rooms}
            empty={!rooms.data?.data?.length}
            emptyTitle="Bu filialda hali xona yo'q"
            loadingRows={3}
          >
            {(res) => (
              <AnalyticsTable
                rows={res.data}
                rowKey={(r) => r.id}
                columns={[
                  { key: "name", label: "Xona" },
                  { key: "capacity", label: "Sig'im", align: "right", kind: "number" },
                  { key: "areaM2", label: "Maydon (m²)", align: "right", kind: "number" },
                  {
                    key: "isActive",
                    label: "Holat",
                    render: (r) => (r.isActive ? "Faol" : "To'xtatilgan"),
                  },
                ]}
              />
            )}
          </QueryState>

          {!rooms.isLoading && !rooms.data?.data?.length && (
            <EmptyState
              icon={DoorOpen}
              title="Xona yo'q"
              hint="Xonasiz guruh jadvali tuzilmaydi — dars qayerda o'tishini tizim bilmaydi."
              action={
                canCreateRoom && (
                  <Button size="sm" onClick={() => openModal(MODAL.ROOM_CREATE, { branchId: id })}>
                    <Plus className="size-4" />
                    Birinchi xonani qo'shish
                  </Button>
                )
              }
            />
          )}
        </section>
      )}

      {/* ══════════ ODAMLAR ══════════ */}
      {tab === "people" && canPeople && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">Filial jamoasi</h2>
              <p className="text-xs text-muted-foreground">
                Bu filialga biriktirilgan xodim va o'qituvchilar
              </p>
            </div>
            <Link
              to="/org/people"
              className="text-xs font-medium text-primary hover:underline"
            >
              Barcha odamlar
            </Link>
          </div>

          <QueryState
            query={staff}
            empty={!staff.data?.data?.length}
            emptyTitle="Bu filialda xodim yo'q"
            emptyHint="Odamlar bo'limidan xodim yaratib, unga shu filialni biriktiring."
            loadingRows={3}
          >
            {(res) => (
              <AnalyticsTable
                rows={res.data}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/owner/users/${r.id}`)}
                columns={[
                  {
                    key: "fullName",
                    label: "Ism",
                    render: (r) => `${r.firstName || ""} ${r.lastName || ""}`.trim() || r.username,
                  },
                  { key: "role", label: "Rol" },
                  { key: "phone", label: "Telefon" },
                ]}
              />
            )}
          </QueryState>
        </section>
      )}

      {/* ══════════ MOLIYA ══════════ */}
      {tab === "money" && canFinance && (
        <section className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Daromad qayerdan keldi</h2>
            <QueryState
              query={revenueByCourse}
              empty={!revenueByCourse.data?.length}
              emptyTitle="Bu filialda daromad yozilmagan"
              loadingRows={3}
            >
              {(rows) => (
                <AnalyticsTable
                  rows={rows}
                  defaultSort={{ key: "revenue", dir: "desc" }}
                  onRowClick={(r) => openRoot({ type: T.COURSE, id: r.id, name: r.name })}
                  columns={[
                    { key: "name", label: "Yo'nalish" },
                    { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                    { key: "sharePercent", label: "Ulush", align: "right", kind: "percent" },
                  ]}
                />
              )}
            </QueryState>
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Pul qayerga ketdi</h2>
            <QueryState
              query={expenseByCategory}
              empty={!expenseByCategory.data?.items?.length}
              emptyTitle="Bu filialda chiqim yozilmagan"
              loadingRows={3}
            >
              {(data) => (
                <AnalyticsTable
                  rows={data.items}
                  defaultSort={{ key: "amount", dir: "desc" }}
                  onRowClick={(r) =>
                    openRoot({ type: T.EXPENSE_CATEGORY, id: r.id, name: r.name })
                  }
                  columns={[
                    { key: "name", label: "Chiqim turi" },
                    { key: "amount", label: "Summa", align: "right", kind: "moneyShort" },
                    { key: "sharePercent", label: "Ulush", align: "right", kind: "percent" },
                  ]}
                />
              )}
            </QueryState>
          </div>
        </section>
      )}

      {/* Xona modali SAHIFA darajasida: `branchId` shu yerdagi
          kontekstdan uzatiladi (talab 21 — amal o'z joyida). */}
      <ModalWrapper name={MODAL.ROOM_CREATE} title="Yangi xona">
        <RoomCreateModal onCreated={() => rooms.refetch()} />
      </ModalWrapper>
    </WorkspacePage>
  );
};

export default OrgBranchDetailPage;
