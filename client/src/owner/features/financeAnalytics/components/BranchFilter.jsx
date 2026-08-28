import { useLocation } from "react-router-dom";

import SelectField from "@/shared/components/ui/select/SelectField";
import useActiveBranch from "@/shared/hooks/useActiveBranch";

/**
 * ══════════════════════════════════════════════════════════════════════
 * FILIAL FILTRI — FAQAT SUPER ADMIN QOBIG'IDA
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA HAMMA JOYDA EMAS ──
 * Admin panelida (`/owner/*`) filial ALLAQACHON global tanlagich
 * orqali boshqariladi (yon panel → `x-branch-id`), va u almashganda
 * barcha so'rovlar bekor qilinadi. U yerga ikkinchi tanlagich
 * qo'yilsa, ikkita raqobatlashuvchi "joriy filial" tushunchasi paydo
 * bo'lardi: tepada bittasi, moliya panelida boshqasi — foydalanuvchi
 * qaysi biri amal qilayotganini bilmasdi.
 *
 * Super Admin qobig'ida (`/org/*`) esa global tanlagich UMUMAN YO'Q:
 * u sidebar'da yashaydi, `/org` esa o'z qobig'iga ega va sidebar'i
 * boshqa. Ya'ni u yerda raqobat ham yo'q, lekin filiallarni
 * taqqoslash imkoni ham yo'q edi — talab esa aynan shuni so'raydi
 * ("Barcha filiallar / Filial A / Filial B").
 *
 * Shuning uchun tanlagich SHU YERDA va faqat o'sha qobiqda chiziladi.
 *
 * ── RO'YXAT KO'LAMDAN KELADI ──
 * `branches` — foydalanuvchi KIRA OLADIGAN filiallar (`useAuth`).
 * Ya'ni ruxsati yo'q filial ro'yxatda umuman ko'rinmaydi. Bu
 * QULAYLIK, xavfsizlik emas: server `assertBranchInScope` bilan
 * begona `branchId` ni baribir rad etadi (403).
 *
 * ── BITTA FILIALDA CHIZILMAYDI ──
 * Bitta variantli tanlov — javobi oldindan ma'lum savol.
 */
const BranchFilter = ({ value, onChange }) => {
  const { pathname } = useLocation();
  const { branches, hasMultipleBranches } = useActiveBranch();

  // `/org/*` — Super Admin qobig'i (global tanlagichsiz).
  const isOrgShell = pathname === "/org" || pathname.startsWith("/org/");
  if (!isOrgShell || !hasMultipleBranches) return null;

  return (
    <div className="w-44">
      <SelectField
        value={value || ""}
        onChange={(v) => onChange({ branchId: v })}
        options={[
          { value: "", label: "Barcha filiallar" },
          ...branches.map((b) => ({ value: b._id || b.id, label: b.name })),
        ]}
        className="!gap-1"
      />
    </div>
  );
};

export default BranchFilter;
