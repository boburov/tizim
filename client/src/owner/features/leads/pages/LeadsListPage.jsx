import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, UserCheck, BellRing, X } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import useObjectState from "@/shared/hooks/useObjectState";
import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import useDebounce from "@/shared/hooks/useDebounce";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { LEAD_STATUS_OPTIONS } from "@/shared/constants/leadStatus";

import LeadsTable from "../components/LeadsTable";
import LeadCreateModal from "../components/LeadCreateModal";
import LeadEditModal from "../components/LeadEditModal";
import LeadCloseModal from "../components/LeadCloseModal";
import LeadDeleteModal from "../components/LeadDeleteModal";
import LeadConvertModal from "../components/LeadConvertModal";
import LeadBulkConvertModal from "../components/LeadBulkConvertModal";
import LeadReminderModal from "../components/LeadReminderModal";
import LeadBulkReminderModal from "../components/LeadBulkReminderModal";
import useLeadsQuery from "../hooks/useLeadsQuery";
import useLeadOptionsQuery from "../hooks/useLeadOptionsQuery";
import useUsersListQuery from "@/owner/features/users/hooks/useUsersListQuery";

const LIMIT = 20;

const withAll = (data, label = "Barchasi") => [
  { value: "", label },
  ...(data?.data || []).map((o) => ({ value: o._id, label: o.name })),
];

// Aloqa holati filtri. Server bilan bir xil kalitlar (leads.validators.js).
const ENGAGEMENT_OPTIONS = [
  { value: "", label: "Aloqa holati: barchasi" },
  { value: "no_contact", label: "Aloqa qilinmagan" },
  { value: "stale", label: "Tashlab qo'yilgan (7+ kun)" },
];

const LeadsListPage = () => {
  const { openModal } = useModal();
  const { has } = usePermissions();
  // RESEPSHIN: lid qo'sha oladi, lekin ommaviy ravishda guruhga qabul
  // qila olmaydi - u boshqa toifadagi qaror (joy, to'lov, jadval).
  const canCreate = has(PERMISSIONS.LEADS_CREATE);
  const canManage = has(PERMISSIONS.LEADS_MANAGE);
  // Eslatma - TAHRIRLASH darajasidagi amal (guruhga qabul qilish emas).
  // Resepshin ham o'z lidlariga qayta qo'ng'iroq qo'ya olishi kerak.
  const canUpdate = has(PERMISSIONS.LEADS_UPDATE);
  const filters = useObjectState({
    search: "",
    status: "",
    source: "",
    direction: "",
    assignedTo: "",
  });

  // ALOQA FILTRI - MANBA HAQIQATI URL'da, komponent state'ida EMAS.
  //
  // Nega: statistika sahifasidagi kartochkalar shu sahifaga turli parametr
  // bilan olib keladi ("aloqa qilinmagan" va "tashlab qo'yilgan"). Agar
  // qiymat useState boshlang'ich qiymatidan olinsa, foydalanuvchi ro'yxatda
  // TURGANIDA ikkinchi kartochkaga o'tsa React Router komponentni QAYTA
  // MOUNT QILMAYDI (bir xil route, faqat search param o'zgardi) va filtr
  // eski holatda qotib qolardi - URL bir narsani, ro'yxat boshqa narsani
  // ko'rsatardi.
  //
  // URL'dan o'qish bu muammoni butunlay yo'q qiladi va filtrni
  // bookmark/ulashsa bo'ladigan qiladi.
  const [searchParams, setSearchParams] = useSearchParams();
  const engagement = searchParams.get("engagement") || "";

  const updateEngagement = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("engagement", value);
    else next.delete("engagement");
    setSearchParams(next, { replace: true });
    setPage(1);
    setSelectedIds([]);
  };
  const [page, setPage] = useState(1);
  // Ko'p lidni birdan guruhga qabul qilish uchun tanlov. Faqat ID saqlanadi -
  // lid obyektlari ro'yxat yangilanganda eskirib qolmasligi uchun.
  const [selectedIds, setSelectedIds] = useState([]);
  const debouncedSearch = useDebounce(filters.search);

  const sourceQ = useLeadOptionsQuery({ kind: "source" });
  const directionQ = useLeadOptionsQuery({ kind: "direction" });
  const staffQ = useUsersListQuery({ staff: 1, limit: 200 });

  // "none" - mas'uli yo'q lidlar. Bu eng muhim ko'rinish: egasiz lid bilan
  // hech kim ishlamaydi va u jimgina yo'qoladi.
  const assigneeOptions = [
    { value: "", label: "Barcha mas'ullar" },
    { value: "none", label: "Mas'uli yo'q" },
    ...(staffQ.data?.data || []).map((u) => ({
      value: u._id,
      label: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.username,
    })),
  ];

  const { data, isLoading, isError, refetch } = useLeadsQuery({
    search: debouncedSearch || undefined,
    status: filters.status || undefined,
    source: filters.source || undefined,
    direction: filters.direction || undefined,
    assignedTo: filters.assignedTo || undefined,
    engagement: engagement || undefined,
    page,
    limit: LIMIT,
  });

  const items = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const update = (key, value) => {
    filters.setField(key, value);
    setPage(1);
    // Filtr o'zgarsa tanlangan lidlar ro'yxatdan chiqib ketadi - ko'rinmayotgan
    // odamni guruhga qabul qilib qo'ymaslik uchun tanlov tozalanadi.
    setSelectedIds([]);
  };

  const toggleOne = (id, checked) =>
    setSelectedIds((prev) =>
      checked
        ? [...new Set([...prev, String(id)])]
        : prev.filter((x) => x !== String(id)),
    );

  // "Barchasini tanlash" - FAQAT joriy sahifadagi (va aylantirilmagan) lidlar.
  const toggleAll = (ids, checked) =>
    setSelectedIds((prev) => {
      const page = ids.map(String);
      if (!checked) return prev.filter((x) => !page.includes(x));
      return [...new Set([...prev, ...page])];
    });

  // Modalga to'liq lid obyektlari kerak (ism/telefon login generatsiyasi uchun).
  const selectedLeads = items.filter((l) => selectedIds.includes(String(l._id)));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        {/* Sarlavha LeadsPage qobig'ida */}
        <div />
        {canCreate && (
          <Button onClick={() => openModal(MODAL.LEAD_CREATE)}>
            <Plus className="size-4" />
            Yangi lid
          </Button>
        )}
      </header>

      <div className="grid grid-cols-1 gap-2 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <InputField
          name="search"
          type="search"
          placeholder="Ism yoki telefon..."
          value={filters.search}
          onChange={(e) => update("search", e.target.value)}
        />
        <SelectField
          value={filters.status}
          onChange={(v) => update("status", v)}
          options={[{ value: "", label: "Barcha statuslar" }, ...LEAD_STATUS_OPTIONS]}
        />
        <SelectField
          searchable
          value={filters.source}
          onChange={(v) => update("source", v)}
          options={withAll(sourceQ.data, "Barcha manbalar")}
        />
        <SelectField
          searchable
          value={filters.direction}
          onChange={(v) => update("direction", v)}
          options={withAll(directionQ.data, "Barcha yo'nalishlar")}
        />
        {/* ALOQA holati - statusdan ATAYLAB ajratilgan filtr.
            "Yangi" statusdagi lidlarning bir qismi bilan allaqachon
            ishlangan bo'lishi mumkin, shuning uchun status filtri
            "hech kim tegmagan" savoliga javob bermaydi. */}
        <SelectField
          value={engagement}
          onChange={updateEngagement}
          options={ENGAGEMENT_OPTIONS}
        />
        <SelectField
          searchable
          value={filters.assignedTo}
          onChange={(v) => update("assignedTo", v)}
          options={assigneeOptions}
          searchPlaceholder="Xodim qidirish..."
          emptyText="Xodim topilmadi"
        />
      </div>

      {/* Tanlov paneli. Har tugma O'Z huquqiga bog'langan: resepshin
          eslatma qo'ya oladi, lekin guruhga qabul qila olmaydi. */}
      {(canManage || canUpdate) && selectedLeads.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-sm font-medium">
            {selectedLeads.length} ta lid tanlandi
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds([])}
            >
              <X className="size-4" />
              Bekor qilish
            </Button>
            {canUpdate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  openModal(MODAL.LEAD_BULK_REMINDER, {
                    leads: selectedLeads,
                    onDone: () => setSelectedIds([]),
                  })
                }
              >
                <BellRing className="size-4" />
                Eslatma o&apos;rnatish
              </Button>
            )}
            {canManage && (
              <Button
                size="sm"
                onClick={() =>
                  openModal(MODAL.LEAD_BULK_CONVERT, {
                    leads: selectedLeads,
                    onDone: () => setSelectedIds([]),
                  })
                }
              >
                <UserCheck className="size-4" />
                Guruhga qabul qilish
              </Button>
            )}
          </div>
        </div>
      )}

      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <>
          <LeadsTable
            items={items}
            isLoading={isLoading}
            selectedIds={selectedIds}
            onToggle={toggleOne}
            onToggleAll={toggleAll}
          />
          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              // Sahifa almashsa tanlov tozalanadi: boshqa sahifadagi lid
              // ro'yxatda ko'rinmay turib tanlangan bo'lib qolardi.
              onPageChange={(p) => {
                setSelectedIds([]);
                setPage(p);
              }}
              totalPages={totalPages}
              hasNextPage={page < totalPages}
              hasPrevPage={page > 1}
            />
          )}
        </>
      )}

      {/* LEAD_CREATE global mount qilingan (owner/components/CreateModals) */}
      <ModalWrapper name={MODAL.LEAD_EDIT} title="Lidni tahrirlash" className="max-w-xl">
        <LeadEditModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.LEAD_CLOSE} title="Lidni yopish">
        <LeadCloseModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.LEAD_DELETE} title="Lidni o'chirish">
        <LeadDeleteModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.LEAD_CONVERT} title="O'quvchiga aylantirish" className="max-w-xl">
        <LeadConvertModal />
      </ModalWrapper>
      <ModalWrapper
        name={MODAL.LEAD_BULK_CONVERT}
        title="Lidlarni guruhga qabul qilish"
        className="max-w-3xl"
      >
        <LeadBulkConvertModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.LEAD_REMINDER} title="Qayta bog'lanish eslatmasi">
        <LeadReminderModal />
      </ModalWrapper>
      <ModalWrapper
        name={MODAL.LEAD_BULK_REMINDER}
        title="Ommaviy eslatma"
        className="max-w-lg"
      >
        <LeadBulkReminderModal />
      </ModalWrapper>
    </div>
  );
};

export default LeadsListPage;
