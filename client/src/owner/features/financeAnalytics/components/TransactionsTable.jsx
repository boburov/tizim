import { AnalyticsTable, MetricValue } from "@/shared/components/analytics";
import { accountKindLabel } from "@/shared/constants/finance";
import { formatDateTimeUz } from "@/shared/utils/formatDate";
import { cn } from "@/shared/utils/cn";
import { useDrill, DRILL_TYPES } from "@/shared/drill";

/**
 * ══════════════════════════════════════════════════════════════════════
 * TRANZAKSIYALAR JADVALI
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── ISHORA SERVERDAN KELADI (`cashDelta`) ──
 * `amount` — yozuvning jami debeti, HAR DOIM musbat. "+300 000 /
 * −100 000" ni chizish uchun ishora kerak va uni yozuv turidan taxmin
 * qilib bo'lmaydi: hisoblar orasidagi o'tkazma KASSA uchun manfiy,
 * BANK uchun musbat — bitta yozuv, ikki xil ishora. Shuning uchun
 * server xazina qatorlaridan hisoblab beradi
 * (`entry-detail.service.ts` → `listEntries`).
 *
 * Hisob tanlanganda (`accountKind` filtri) `cashDelta` FAQAT o'sha
 * hisob bo'yicha bo'ladi — "Kassa" ko'rinishida o'tkazma to'g'ri
 * −500 000 bo'lib chiqadi.
 *
 * ── `cashDelta === 0` NIMA DEGANI ──
 * Yozuv xazinaga umuman tegmagan yoki ichki o'tkazma bo'lib, umumiy
 * pul miqdorini o'zgartirmagan. Uni "+0" yoki "−0" qilib ko'rsatish
 * yolg'on bo'lardi, shuning uchun summa NEYTRAL rangda va "ichki"
 * belgisi bilan chiqadi.
 *
 * ── USTUNLAR SONI CHEKLANGAN ──
 * Sana · Turi · Tavsif · Hisob · Summa · Kim yozdi. `postingKey`,
 * `refModel` va qo'sh yozuv qatorlari jadvalda YO'Q — ular tafsilot
 * panelida. Jadval "shu davrda nima bo'ldi" degan savolga javob
 * beradi, "bu yozuv qanday tuzilgan" degan savolga emas.
 */

/** Xazina hisoblari ro'yxati — bittadan ortiq bo'lsa vergul bilan. */
const accountsLabel = (kinds) =>
  Array.isArray(kinds) && kinds.length
    ? kinds.map(accountKindLabel).join(", ")
    : null;

const AmountCell = ({ row }) => {
  const delta = row.cashDelta;
  // `isMissing` mantiqini takrorlamaymiz: MetricValue null/NaN ni
  // o'zi "—" ga aylantiradi. Bu yerda faqat RANG va ISHORA hal
  // qilinadi va u faqat SON bo'lganda ma'noga ega.
  const isNumber = typeof delta === "number" && Number.isFinite(delta);
  const neutral = !isNumber || delta === 0;

  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {neutral && isNumber && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          ichki
        </span>
      )}
      {/* Musbat qiymatga «+» ochiq qo'yiladi: minus formatlashdan
          o'zi keladi, plus esa kelmaydi — va faqat rangga tayanish
          rangni ajrata olmaydigan foydalanuvchi uchun yo'nalishni
          umuman ko'rsatmasdi. */}
      <span
        className={cn(
          "font-medium tabular-nums",
          !neutral && isNumber && delta > 0 && "text-success",
          !neutral && isNumber && delta < 0 && "text-destructive",
          neutral && "text-muted-foreground",
        )}
      >
        {!neutral && isNumber && delta > 0 ? "+" : ""}
        <MetricValue value={neutral && isNumber ? row.amount : delta} kind="money" />
      </span>
    </span>
  );
};

const TransactionsTable = ({ rows = [], emptyTitle, emptyHint }) => {
  const { openRoot } = useDrill();

  return (
    <AnalyticsTable
      rows={rows}
      rowKey={(r, i) => r.id || i}
      defaultSort={{ key: "date", dir: "desc" }}
      emptyTitle={emptyTitle || "Bu davrda yozuv yo'q"}
      emptyHint={emptyHint}
      // Qatorni bosish — zanjirning oxirgi bo'g'ini: jurnal yozuvi.
      // Panel ilovada BITTA (shared/drill), shuning uchun bu yerda
      // o'z modalimiz yo'q.
      onRowClick={(r) =>
        openRoot({ type: DRILL_TYPES.ENTRY, id: r.id, name: r.kindLabel })
      }
      columns={[
        {
          key: "date",
          label: "Sana",
          render: (r) => (
            <span className="whitespace-nowrap">{formatDateTimeUz(r.date)}</span>
          ),
        },
        { key: "kindLabel", label: "Turi" },
        {
          key: "memo",
          label: "Tavsif",
          render: (r) =>
            r.memo || <span className="text-muted-foreground">—</span>,
        },
        {
          key: "accountKinds",
          label: "Hisob",
          sortable: false,
          render: (r) =>
            accountsLabel(r.accountKinds) || (
              <span className="text-muted-foreground">—</span>
            ),
        },
        {
          key: "cashDelta",
          label: "Summa",
          align: "right",
          render: (r) => <AmountCell row={r} />,
        },
        {
          key: "createdBy",
          label: "Kim yozdi",
          sortable: false,
          render: (r) =>
            r.createdBy?.name || <span className="text-muted-foreground">—</span>,
        },
      ]}
    />
  );
};

export default TransactionsTable;
