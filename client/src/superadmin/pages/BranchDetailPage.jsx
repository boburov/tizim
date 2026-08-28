import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, Plus, DoorOpen, Users, UserCog, GraduationCap, Wallet, Pencil, Trash2,
  TrendingDown, PiggyBank, HandCoins, Banknote,
} from "lucide-react";

import Button from "@/shared/components/ui/button/Button";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import { cn } from "@/shared/utils/cn";
import { formatPhone } from "@/shared/utils/formatPhone";
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
import RoomsGrid from "@/owner/features/rooms/components/RoomsGrid";
import BranchEditModal from "@/owner/features/branches/components/modals/BranchEditModal";
import BranchDeleteModal from "@/owner/features/branches/components/modals/BranchDeleteModal";
import BranchCredentials from "../components/BranchCredentials";
import { useUsersListQuery } from "@/owner/features/users";
import PageShell from "@/shared/components/page/PageShell";
import EmptyState from "@/shared/components/page/EmptyState";

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

/**
 * ── NEGA "ODAMLAR" EMAS, "XODIMLAR" ──
 *
 * Eski "Odamlar" tabi ikki jihatdan yolg'on edi:
 *
 *  1. U `?branchId=` ni so'rovga qo'shardi, lekin server bu parametrni
 *     TANIMASDI (`users` ro'yxatida faqat `x-branch-id` SARLAVHASI
 *     ko'lamni belgilardi). Natijada zod uni jimgina tashlab yuborardi
 *     va ro'yxatda BUTUN MARKAZ ko'rinardi — "DEMO Markaz" sahifasida
 *     boshqa filialning odamlari ham.
 *  2. `staff` bayrog'i yuborilmagani uchun ro'yxat o'quvchi+o'qituvchi
 *     qaytarardi — sarlavhada esa "xodim va o'qituvchilar" deb yozilgan
 *     edi. Ekran o'nlab "Talaba…" qatori bilan to'lardi.
 *
 * Endi bo'lim XODIMLARNIKI: server `branchId` ni qabul qiladi
 * (`users.validators.ts`), ro'yxat `staff: 1` bilan so'raladi va shu
 * yerdan yangi xodim qo'shiladi. Ro'yxat "Umumiy" dagi "Xodimlar"
 * kartochkasi bilan bir xil tushunchani sanaydi — o'quvchidan boshqa
 * hamma — ya'ni ikki joydagi son bir-biriga mos keladi.
 */
const TABS = [
  { key: "overview", label: "Umumiy", icon: Wallet },
  { key: "rooms", label: "Xonalar", icon: DoorOpen },
  { key: "staff", label: "Xodimlar", icon: UserCog },
  { key: "money", label: "Moliya", icon: Banknote },
];

const BranchDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { has, hasAll } = usePermissions();
  const { openModal } = useModal();
  const { openRoot } = useDrill();
  const [tab, setTab] = useState("overview");

  const canFinance = has(PERMISSIONS.FINANCE_READ);
  const canRooms = has(PERMISSIONS.CLASSES_READ);
  const canCreateRoom = has(PERMISSIONS.CLASSES_CREATE);
  const canStaff = has(PERMISSIONS.USERS_READ);
  // XODIM QO'SHISH IKKI RUXSAT TALAB QILADI — serverdagi
  // `POST /users/staff` bilan aynan bir xil (`@AllPermissions`):
  // odam yaratish VA rol biriktirish. Bitta ruxsatga bog'lansa tugma
  // ko'rinardi-yu, so'rov 403 bilan qaytardi.
  const canCreateStaff = hasAll([
    PERMISSIONS.TEACHERS_CREATE,
    PERMISSIONS.ROLES_UPDATE,
  ]);
  const canEdit = has(PERMISSIONS.SYSTEM_ADMIN_ACCESS) && has(PERMISSIONS.BRANCHES_UPDATE);
  // O'CHIRISH — TAHRIRLASHDAN ALOHIDA RUXSAT.
  //
  // Server ikkalasini ham `system.admin_access` BILAN BIRGA talab
  // qiladi (`branches.routes.js`): faqat `branches.delete` ga bog'lash
  // imtiyoz oshirish yo'li bo'lardi.
  const canDelete = has(PERMISSIONS.SYSTEM_ADMIN_ACCESS) && has(PERMISSIONS.BRANCHES_DELETE);

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
  // `staff: 1` — o'quvchilarni chiqarib tashlaydi; `branchId` — shu
  // filialga biriktirilganlar (uy filiali YOKI qo'shimcha biriktiruv).
  const staff = useUsersListQuery(
    { staff: 1, branchId: id, limit: 100 },
    { enabled: canStaff && tab === "staff" },
  );
  const revenueByCourse = useRevenueBy("course", filters, {
    enabled: canFinance && tab === "money",
  });
  const expenseByCategory = useExpenseBy("category", filters, {
    enabled: canFinance && tab === "money",
  });

  const s = fromQuery(summary);
  const d = summary.data;
  const st = fromQuery(stats);

  const visibleTabs = TABS.filter((t) => {
    if (t.key === "rooms") return canRooms;
    if (t.key === "staff") return canStaff;
    if (t.key === "money") return canFinance;
    return true;
  });

  return (
    <PageShell
      title={branch?.name || "Filial"}
      subtitle={
        branch?.code
          ? `Kod: ${branch.code}${branch.address ? ` · ${branch.address}` : ""}`
          : branch?.address || undefined
      }
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => navigate("/org/filiallar")}>
            <ArrowLeft className="size-4" />
            Filiallar
          </Button>
          {/* DIQQAT: `openModal(NAME, { branch })` — MA'LUMOT SHAKLI
              MUHIM. `ModalWrapper` `data` ni propslarga YOYIB beradi,
              ya'ni `openModal(NAME, branch)` yozilsa modal `branch`
              propini UMUMAN olmasdi va forma BO'SH ochilardi (xato
              bermasdan). Bu aynan shu yerda yuz bergan edi. */}
          {canEdit && branch && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openModal(MODAL.BRANCH_EDIT, { branch })}
            >
              <Pencil className="size-4" />
              Tahrirlash
            </Button>
          )}
          {/* O'CHIRISH — ASOSIY FILIALDA KO'RSATILMAYDI.
              Server uni baribir rad etadi ("Asosiy filialni o'chirib
              bo'lmaydi"), ya'ni tugma faqat yolg'on va'da bo'lardi. */}
          {canDelete && branch && !branch.isMain && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openModal(MODAL.BRANCH_DELETE, { branch })}
            >
              <Trash2 className="size-4" />
              O&apos;chirish
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
            />
            <KpiTile
              label="Guruhlar" icon={Users} suffix=" ta"
              value={stats.data?.activeGroupCount}
              status={st.status} error={st.error} onRetry={st.refetch}
            />
            <KpiTile
              label="Xodimlar" icon={Users} suffix=" ta"
              value={stats.data?.staffCount}
              status={st.status} error={st.error} onRetry={st.refetch}
              onClick={() => setTab("staff")}
            />
          </KpiGrid>

          {/* KIRISH MA'LUMOTLARI — "UMUMIY" TABDA, ko'milgan joyda emas.
              Filial ochilgandan keyin beriladigan BIRINCHI savol:
              "direktor qaysi login bilan kiradi?". Uni "Xodimlar"
              tabining ichiga qo'yish o'sha savolni yana bir bosish
              orqasiga yashirardi. */}
          <BranchCredentials branchId={id} enabled={tab === "overview"} />

          <p className="text-xs text-muted-foreground">
            Filialning xonalari, xodimlari va pul harakati — yuqoridagi bo'limlarda.
          </p>
        </>
      )}

      {/* ══════════ XONALAR ══════════ */}
      {tab === "rooms" && canRooms && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Xonalar</h2>
            <p className="text-xs text-muted-foreground">
              Filialning fizik resursi. Guruh jadvali shu xonalarga bog'lanadi —
              bandlik va to'qnashuv hisobi ham shundan chiqadi.
            </p>
          </div>

          {/* AYNI KOMPONENT Admin panelida ham ishlatiladi
              (`/owner/rooms`). Farqi bitta: bu yerda `branchId`
              kontekstdan uzatiladi, u yerda esa server ko'lamdan
              oladi. Ikkinchi nusxa yaratilmadi — aks holda ikkita
              xona ekrani bo'lib, ular vaqt o'tishi bilan ajralib
              ketardi. */}
          <RoomsGrid branchId={id} enabled={tab === "rooms"} />
        </section>
      )}

      {/* ══════════ XODIMLAR ══════════ */}
      {tab === "staff" && canStaff && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">Filial jamoasi</h2>
              <p className="text-xs text-muted-foreground">
                Bu filialga biriktirilgan xodim va o'qituvchilar
              </p>
            </div>
            {/* QO'SHISH SHU YERDA — XONA QO'SHISH BILAN BIR MANTIQ.
                Filial — konteyner: administratorni yaratib, keyin uni
                filialga biriktirish uchun boshqa panelga (`/owner/staff`)
                o'tish kerak emas edi — Super Admin u yerga KIRA OLMAYDI.
                Filial `openModal` ma'lumoti orqali boradi, ya'ni forma
                ochilganda filial allaqachon tanlangan. */}
            {canCreateStaff && (
              <Button
                size="sm"
                onClick={() =>
                  openModal(MODAL.STAFF_CREATE, {
                    branchId: id,
                    branchName: branch?.name,
                  })
                }
              >
                <Plus className="size-4" />
                Xodim qo&apos;shish
              </Button>
            )}
          </div>

          <QueryState
            query={staff}
            empty={!staff.data?.data?.length}
            emptyTitle="Bu filialda xodim yo'q"
            emptyHint="Yuqoridagi «Xodim qo'shish» tugmasi orqali administrator yoki direktor yarating — u shu filialga biriktiriladi."
            loadingRows={3}
          >
            {(res) => (
              <AnalyticsTable
                rows={res.data}
                rowKey={(r) => r.id}
                columns={[
                  {
                    key: "fullName",
                    label: "Ism",
                    // `sortValue` SHART: jadval standart holda `row[key]` ni
                    // o'qiydi, `fullName` esa yo'q maydon — saralash
                    // "o'lchanmagan" deb hisoblab hech narsa qilmasdi.
                    sortValue: (r) =>
                      `${r.firstName || ""} ${r.lastName || ""}`.trim() || r.username,
                    render: (r) => `${r.firstName || ""} ${r.lastName || ""}`.trim() || r.username,
                  },
                  {
                    key: "role",
                    label: "Rol",
                    sortValue: (r) => r.roleLabel || r.role,
                    // `roleLabel` — SERVERDAN (`staff: 1` bilan so'ralganda).
                    // Xom `role` qiymati ("branch_director") custom rollarda
                    // o'qib bo'lmas kalit bo'lib chiqardi.
                    render: (r) => r.roleLabel || r.role,
                  },
                  { key: "username", label: "Login" },
                  {
                    key: "phone",
                    label: "Telefon",
                    render: (r) => (r.phone ? formatPhone(r.phone) : "—"),
                  },
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

      {/* ══════════════════════════════════════════════════════════
          FILIAL MODALLARI — SAHIFA DARAJASIDA
          ══════════════════════════════════════════════════════════

          Qobiq (`SuperAdminLayout` → `CreateModals`) faqat
          `BRANCH_CREATE` ni ko'taradi. Tahrirlash va o'chirish esa
          FAQAT shu ekranda kerak, shuning uchun shu yerda.

          Ilgari "Tahrirlash" tugmasi bor edi-yu, modal hech qayerda
          mount qilinmagandi: tugma bosilardi, redux holati ochilardi,
          ekranda esa HECH NARSA bo'lmasdi. Nosozlik jimgina edi. */}
      <ModalWrapper name={MODAL.BRANCH_EDIT} title="Filialni tahrirlash">
        <BranchEditModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.BRANCH_DELETE} title="Filialni o'chirish">
        {/* O'chirilgach ro'yxatga qaytamiz — mavjud bo'lmagan filial
            ekranida qolib ketmaslik uchun. */}
        <BranchDeleteModal onDeleted={() => navigate("/org/filiallar")} />
      </ModalWrapper>

      {/* XONA MODALI BU YERDA MOUNT QILINMAYDI — uni qobiq ko'taradi
          (`SuperAdminLayout` → `CreateModals`). Ikkinchi mount bitta
          `openModal` ga IKKITA dialog ochardi.

          `branchId` esa yo'qolmaydi: u `openModal(..., { branchId })`
          ma'lumoti bilan boradi va `ModalWrapper` uni forma propsiga
          aylantiradi. */}
    </PageShell>
  );
};

export default BranchDetailPage;
