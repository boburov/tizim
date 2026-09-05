import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import useActiveBranch from "@/shared/hooks/useActiveBranch";
import useUsersListQuery from "@/owner/features/users/hooks/useUsersListQuery";

// Texnik "metod" o'rniga - ma'noga ega amal turlari
const ACTION_OPTIONS = [
  { value: "", label: "Barcha amallar" },
  { value: "CREATE", label: "Yaratildi" },
  { value: "UPDATE", label: "Tahrirlandi" },
  { value: "DELETE", label: "O'chirildi" },
  { value: "LOGIN", label: "Tizimga kirish" },
];

const RESOURCE_OPTIONS = [
  { value: "", label: "Barcha modullar" },
  { value: "user", label: "Foydalanuvchilar" },
  { value: "group", label: "Guruhlar" },
  { value: "attendance", label: "Davomat" },
  { value: "feedback", label: "Fikr-mulohaza" },
  { value: "notification", label: "Bildirishnomalar" },
  { value: "holiday", label: "Bayramlar" },
];

const fullName = (u) =>
  `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.username || "—";

/**
 * ══════════════════════════════════════════════════════════════════════
 * AUDIT FILTRLARI
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── XODIM TANLAGICHI ──
 * Talabning o'zagi: "administrator bugun qanday ish harakat qildi".
 * Bitta odamni tanlab, sanani bugunga qo'yish shu savolga to'g'ridan-
 * to'g'ri javob beradi.
 *
 * Ro'yxat `staff: 1` bilan so'raladi — O'QUVCHILARSIZ. Sabab amaliy:
 * o'quvchilar minglab bo'lishi mumkin va ular audit nishoni emas,
 * SUBYEKTI ham emas (ularning harakati alohida ekranlarda ko'rinadi).
 *
 * ⚠ RO'YXAT KO'LAMDAN KELADI: server `staff` so'rovini ham filial
 * bo'yicha kesadi, ya'ni filial administratori begona filial xodimini
 * tanlay olmaydi. Bu QULAYLIK, xavfsizlik emas — audit endpoint'i
 * begona `userId` uchun baribir bo'sh natija qaytaradi.
 *
 * ── FILIAL TANLAGICHI FAQAT SO'RALGANDA ──
 * Admin panelida filial ALLAQACHON yon paneldagi global tanlagich
 * orqali boshqariladi; u yerga ikkinchisini qo'yish ikkita
 * raqobatlashuvchi "joriy filial" yaratardi. Super admin qobig'ida
 * esa global tanlagich umuman yo'q — shuning uchun sahifa uni
 * `showBranch` bilan so'raydi (`FinanceCommandPage` dagi
 * `BranchFilter` bilan AYNI sabab).
 *
 * ── "XAVFLI AMALLAR" ──
 * Tashkilot ko'lamidagi oqim shovqinli: kunlik davomat va
 * bildirishnoma yozuvlari orasidan "kim rolni o'zgartirdi" ni topib
 * bo'lmaydi. Bayroq o'chirish, imtiyoz va pulga tegadigan amallarni
 * qoldiradi (ro'yxat serverda — `DANGEROUS_QUERY`).
 */
const LogFilters = ({
  filters,
  onChange,
  showBranch = false,
  showAction = true,
  showResource = true,
  showDangerous = false,
}) => {
  const { branches, hasMultipleBranches } = useActiveBranch();

  const { data: staffData } = useUsersListQuery(
    { staff: 1, limit: 500, status: "active" },
    // Xodimlar ro'yxati kam o'zgaradi va har filtr almashganda qayta
    // so'ralishi shart emas.
    { staleTime: 5 * 60 * 1000 },
  );

  const staffOptions = [
    { value: "", label: "Barcha xodimlar" },
    ...(staffData?.data || []).map((u) => ({
      value: u._id || u.id,
      label: fullName(u),
    })),
  ];

  return (
    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SelectField
        label="Xodim"
        value={filters.userId}
        onChange={(v) => onChange("userId", v)}
        options={staffOptions}
      />

      {showBranch && hasMultipleBranches && (
        <SelectField
          label="Filial"
          value={filters.branchId}
          onChange={(v) => onChange("branchId", v)}
          options={[
            { value: "", label: "Barcha filiallar" },
            ...branches.map((b) => ({ value: b._id || b.id, label: b.name })),
          ]}
        />
      )}

      {showAction && (
        <SelectField
          label="Amal turi"
          value={filters.action}
          onChange={(v) => onChange("action", v)}
          options={ACTION_OPTIONS}
        />
      )}

      {showResource && (
        <SelectField
          label="Modul"
          value={filters.resourceType}
          onChange={(v) => onChange("resourceType", v)}
          options={RESOURCE_OPTIONS}
        />
      )}

      <InputField
        type="date"
        name="fromDate"
        label="Boshlanish sanasi"
        value={filters.fromDate}
        onChange={(e) => onChange("fromDate", e.target.value)}
      />
      <InputField
        type="date"
        name="toDate"
        label="Tugash sanasi"
        value={filters.toDate}
        onChange={(e) => onChange("toDate", e.target.value)}
      />

      {showDangerous && (
        <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={filters.dangerousOnly}
            onChange={(e) => onChange("dangerousOnly", e.target.checked)}
            className="size-4 rounded border-border"
          />
          Faqat xavfli amallar
        </label>
      )}
    </div>
  );
};

export default LogFilters;
