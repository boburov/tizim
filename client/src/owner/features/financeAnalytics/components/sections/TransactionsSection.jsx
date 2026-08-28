import { LoadingBlock, ErrorBlock } from "@/shared/components/analytics";
import { ACCOUNT_KIND_LABEL } from "@/shared/constants/finance";
import SelectField from "@/shared/components/ui/select/SelectField";
import { TREASURY_ACCOUNT_KINDS } from "../../utils/accountKinds";
import { useEntryList } from "../../hooks/useFinanceAnalytics";
import TransactionsTable from "../TransactionsTable";

/**
 * TRANZAKSIYALAR — jamlanma bilan hujjat orasidagi ko'prik.
 *
 * ── NEGA "Umumiy" BILAN BIR SAHIFADA ──
 * KPI kartadagi raqamni ko'rgan odamning keyingi savoli deyarli har
 * doim bitta: "shu davrda nima bo'ldi?". Bu ro'yxat alohida menyu
 * yozuviga chiqarilsa, o'sha savol ikkita bosish naridan qolardi.
 *
 * ── RO'YXAT CHEKLANGAN, VA BU OCHIQ AYTILADI ──
 * Server ko'pi bilan 100 ta yozuv qaytaradi (`listEntries`). Sahifalash
 * YO'Q — bu ro'yxat "hammasini ko'rish" uchun emas, "shu kesimda nima
 * bo'lganini ko'rish" uchun. Chegara yashirilsa, foydalanuvchi 100 ta
 * qatorni to'liq tarix deb o'qib, jami bilan solishtirib chalkashardi.
 */
const LIMITS = [
  { value: "25", label: "Oxirgi 25" },
  { value: "50", label: "Oxirgi 50" },
  { value: "100", label: "Oxirgi 100" },
];

const ACCOUNT_OPTIONS = [
  { value: "", label: "Barcha hisob" },
  ...TREASURY_ACCOUNT_KINDS.map((k) => ({
    value: k,
    label: ACCOUNT_KIND_LABEL[k] || k,
  })),
];

const TransactionsSection = ({ filters, onFilter }) => {
  const limit = filters.limit || "50";
  const query = useEntryList({ ...filters, limit });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-44">
          <SelectField
            value={filters.accountKind || ""}
            onChange={(v) => onFilter({ accountKind: v })}
            options={ACCOUNT_OPTIONS}
            className="!gap-1"
          />
        </div>
        <div className="w-36">
          <SelectField
            value={String(limit)}
            onChange={(v) => onFilter({ limit: v })}
            options={LIMITS}
            className="!gap-1"
          />
        </div>
      </div>

      {query.isLoading && <LoadingBlock rows={6} />}
      {query.isError && <ErrorBlock error={query.error} onRetry={query.refetch} />}
      {query.isSuccess && (
        <TransactionsTable
          rows={query.data}
          emptyHint="Tanlangan davr va hisob bo'yicha jurnalda yozuv yo'q."
        />
      )}
    </div>
  );
};

export default TransactionsSection;
