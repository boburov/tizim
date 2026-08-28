import { useState } from "react";
import { Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import ConfirmDialog from "@/shared/components/ui/modal/ConfirmDialog";
import usePermissions from "@/shared/hooks/usePermissions";
import useDebounce from "@/shared/hooks/useDebounce";
import useActiveBranch from "@/shared/hooks/useActiveBranch";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { formatDateUz } from "@/shared/utils/formatDate";
import { paymentMethodLabel } from "@/shared/constants/finance";
import { saveResponseAsFile, readErrorMessage } from "@/shared/utils/downloadFile";
import {
  AnalyticsTable, MetricValue, LoadingBlock, ErrorBlock, DeniedBlock,
} from "@/shared/components/analytics";
import { PageHeader } from "@/shared/components/page/PageShell";
import FinanceFilterBar from "../../financeAnalytics/components/FinanceFilterBar";
import useFinanceFilters from "../../financeAnalytics/hooks/useFinanceFilters";

import { expensesAPI } from "../api/expenses.api";
import {
  useExpensesQuery,
  useExpenseCategoriesQuery,
  useDeleteExpenseMutation,
} from "../hooks/useExpenses";
import ExpenseFormSheet from "../components/ExpenseFormSheet";

/**
 * CHIQIMLAR.
 *
 * ── NEGA ALOHIDA SAHIFA, TAHLIL TABI EMAS ──
 * «Chiqim» tahlil bo'limida DIAGRAMMA sifatida bor edi (kategoriya
 * kesimi, dinamika) — u "pul qayerga ketdi" degan savolga javob
 * beradi. Bu sahifa esa BOSHQA savolga: "bugun nima yozildi va yana
 * bittasini qanday yozaman". Ikkinchisi kunlik ish va u diagramma
 * ostiga yashirilmasligi kerak.
 *
 * ── RAQAMLAR SERVERDAN ──
 * `Jami` — `meta.totalAmount`, ya'ni BUTUN filtr bo'yicha va
 * sahifadan mustaqil. Ekrandagi qatorlarni qo'shib chiqarish
 * ikkinchi (va boshqacha) raqam yaratardi.
 *
 * ── FILIAL TANLAGICHI BU YERDA YO'Q — ATAYLAB ──
 * Filial global tanlagich orqali boshqariladi (`x-branch-id`) va u
 * almashganda barcha so'rovlar bekor qilinadi. Sahifaga ikkinchi
 * tanlagich qo'yilsa ikkita raqobatlashuvchi "joriy filial"
 * tushunchasi paydo bo'lardi. Admin uchun «Barcha filiallar» varianti
 * global tanlagichda ham YO'Q, va cheklovni SERVER qo'yadi — bu yerda
 * hech narsa yashirilmaydi.
 */
const ExpensesPage = () => {
  const { has } = usePermissions();
  const { isAllBranches } = useActiveBranch();
  const { filters, set, reset, activeCount } = useFinanceFilters();

  const [editing, setEditing] = useState(null); // null | {} (yangi) | hujjat
  const [voiding, setVoiding] = useState(null);
  const [search, setSearch] = useState("");
  // Har harfda so'rov yuborilmasin — server tomonda bu `ILIKE`
  // qidiruvi va u indekssiz ishlaydi.
  const debouncedSearch = useDebounce(search, 350);

  const canRead = has(PERMISSIONS.EXPENSES_READ);
  const canCreate = has(PERMISSIONS.FINANCE_CREATE_EXPENSE);
  const canManage = has(PERMISSIONS.FINANCE_MANAGE_EXPENSE);

  const categories = useExpenseCategoriesQuery({ enabled: canRead });
  const remove = useDeleteExpenseMutation();

  // Tahlil filtri `expenseCategoryId` deydi, chiqim ro'yxati esa
  // `categoryId` — nom SERVER marshrutiniki, shuning uchun tarjima
  // shu yerda va faqat shu yerda.
  const query = useExpensesQuery(
    {
      year: filters.year,
      month: filters.month,
      from: filters.from,
      to: filters.to,
      categoryId: filters.expenseCategoryId,
      search: debouncedSearch.trim() || undefined,
      limit: 50,
    },
    { enabled: canRead },
  );

  if (!canRead) return <DeniedBlock permission="expenses.read" className="mt-6" />;

  const rows = query.data?.data || [];
  const meta = query.data?.meta;

  const downloadReceipt = async (id) => {
    try {
      const res = await expensesAPI.downloadReceipt(id);
      saveResponseAsFile(res, "chek");
    } catch (err) {
      // `responseType: "blob"` da xato ham Blob bo'lib keladi —
      // to'g'ridan-to'g'ri ko'rsatilsa foydalanuvchi "[object Blob]"
      // o'qirdi.
      toast.error(await readErrorMessage(err, "Chekni yuklab bo'lmadi"));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Chiqimlar"
        actions={
          canCreate && (
            <Button onClick={() => setEditing({})}>
              <Plus className="mr-1.5 size-4" />
              Yangi chiqim
            </Button>
          )
        }
      />

      <FinanceFilterBar
        filters={filters}
        onChange={set}
        onReset={reset}
        activeCount={activeCount}
        slots={
          <>
            <div className="w-56">
              <InputField
                name="search"
                type="search"
                value={search}
                placeholder="Nomi, izoh yoki yetkazib beruvchi..."
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-48">
              <SelectField
                searchable
                value={filters.expenseCategoryId || ""}
                onChange={(v) => set({ expenseCategoryId: v })}
                options={[
                  { value: "", label: "Barcha kategoriya" },
                  ...(categories.data || []).map((c) => ({
                    value: c._id || c.id,
                    label: c.name,
                  })),
                ]}
                className="!gap-1"
              />
            </div>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border border-border bg-card px-4 py-3">
        <div>
          <p className="text-xs text-muted-foreground">Jami chiqim</p>
          <p className="text-xl font-semibold text-foreground">
            <MetricValue value={meta?.totalAmount} kind="money" />
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Hujjatlar</p>
          <p className="text-xl font-semibold text-foreground">
            <MetricValue value={meta?.total} />
          </p>
        </div>
      </div>

      {query.isLoading && <LoadingBlock rows={5} />}
      {query.isError && <ErrorBlock error={query.error} onRetry={query.refetch} />}
      {query.isSuccess && (
        <AnalyticsTable
          rows={rows}
          rowKey={(r, i) => r._id || r.id || i}
          defaultSort={{ key: "spentAt", dir: "desc" }}
          emptyTitle={
            debouncedSearch.trim() ? "Qidiruvga mos chiqim yo'q" : "Bu davrda chiqim yo'q"
          }
          emptyHint={canCreate ? "«Yangi chiqim» bilan birinchisini yozing." : undefined}
          columns={[
            {
              key: "spentAt",
              label: "Sana",
              render: (r) => formatDateUz(r.spentAt),
            },
            { key: "categoryName", label: "Kategoriya" },
            {
              key: "title",
              label: "Tavsif",
              render: (r) => (
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 truncate">{r.title}</span>
                  {r.receiptId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadReceipt(r.receiptId);
                      }}
                      title="Chekni yuklab olish"
                      className="shrink-0 text-muted-foreground transition hover:text-foreground"
                    >
                      <Paperclip className="size-3.5" />
                    </button>
                  )}
                </span>
              ),
            },
            {
              key: "method",
              label: "Hisob",
              render: (r) => paymentMethodLabel(r.method),
            },
            // FILIAL USTUNI faqat «Barcha filiallar» rejimida.
            // Aniq filial tanlangan bo'lsa har qatorda bir xil qiymat
            // turardi — u ma'lumot bermaydi, faqat joy egallaydi.
            ...(isAllBranches
              ? [
                  {
                    key: "branchName",
                    label: "Filial",
                    sortable: false,
                    // Filialsiz chiqim (markaz umumiy) — bo'sh emas,
                    // ATAYLAB shunday. "—" uni "noma'lum" ga
                    // aylantirardi.
                    render: (r) => r.branch?.name || "Markaz umumiy",
                  },
                ]
              : []),
            { key: "amount", label: "Summa", align: "right", kind: "money" },
            {
              key: "createdBy",
              label: "Kim yozdi",
              sortable: false,
              render: (r) =>
                r.createdBy
                  ? `${r.createdBy.firstName || ""} ${r.createdBy.lastName || ""}`.trim()
                  : "—",
            },
            ...(canCreate || canManage
              ? [
                  {
                    key: "actions",
                    label: "",
                    sortable: false,
                    align: "right",
                    render: (r) => (
                      <span className="flex justify-end gap-1">
                        {canCreate && (
                          <button
                            type="button"
                            onClick={() => setEditing(r)}
                            title="Tahrirlash"
                            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        )}
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => setVoiding(r)}
                            title="Bekor qilish"
                            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </span>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}

      {(canCreate || canManage) && (
        // ⚠ `key` — SHART, bezak emas: panel bir marta yaratiladi va
        // forma holatini O'ZIDA saqlaydi. Kalitsiz, bitta chiqimni
        // tahrirlab yopib, keyin boshqasini ochganda maydonlarda
        // OLDINGI hujjat qiymatlari turardi va foydalanuvchi buni
        // sezmay saqlab yuborardi.
        <ExpenseFormSheet
          key={editing?.id || editing?._id || "new"}
          open={Boolean(editing)}
          onOpenChange={(v) => !v && setEditing(null)}
          // `{}` — YANGI chiqim, hujjat — tahrirlash. Bo'sh obyekt
          // `null` dan farq qiladi: `Boolean({})` rost.
          expense={editing?.id || editing?._id ? editing : null}
        />
      )}

      {/* ── O'CHIRISH EMAS, BEKOR QILISH ──
          Server yozuvni yo'qotmaydi: `isDeleted` qo'yadi va jurnalni
          STORNO qiladi. Tasdiq matni shuni ochiq aytadi, aks holda
          foydalanuvchi "tarix o'chib ketdi" deb o'ylardi. */}
      <ConfirmDialog
        open={Boolean(voiding)}
        onOpenChange={(v) => !v && setVoiding(null)}
        title="Chiqim bekor qilinsinmi?"
        description={
          voiding
            ? `«${voiding.title}» bekor qilinadi. Jurnal yozuvi storno qilinadi va kassa qoldig'i tiklanadi. Yozuv tarixda qoladi.`
            : ""
        }
        confirmLabel="Bekor qilish"
        cancelLabel="Yo'q"
        confirmVariant="destructive"
        isLoading={remove.isPending}
        onConfirm={() => {
          remove.mutate(voiding.id || voiding._id, {
            onSuccess: () => setVoiding(null),
          });
        }}
      />
    </div>
  );
};

export default ExpensesPage;
