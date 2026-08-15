// React
import { useState } from "react";

// Icons
import { Wallet, Send, Check, X, LockKeyhole, PlayCircle } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import Input from "@/shared/components/ui/input/Input";
import InputMoney from "@/shared/components/ui/input/InputMoney";
import Select from "@/shared/components/ui/select/Select";
import DataTable from "@/shared/components/ui/table/DataTable";

// Hooks
import useBranchesQuery from "@/owner/features/branches/hooks/useBranchesQuery";
import {
  useBalancesQuery,
  useShiftsQuery,
  useTransfersQuery,
  useOpenShiftMutation,
  useCloseShiftMutation,
  useSendTransferMutation,
  useReceiveTransferMutation,
  useCancelTransferMutation,
} from "../hooks/useJournalQueries";

const fmt = (n) => new Intl.NumberFormat("uz-UZ").format(Math.round(n || 0));

// Hisob turlari - server kalitlari, UI nomlari shu yerda.
const ACCOUNT_LABELS = {
  cash: "Naqd",
  terminal: "Terminal",
  click: "Click",
  payme: "Payme",
  bank: "Bank",
  transit: "Yo'ldagi pul",
};

const TRANSFER_STATUS = {
  in_transit: { label: "Yo'lda", cls: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  received: { label: "Qabul qilindi", cls: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  disputed: { label: "Farq bor", cls: "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  canceled: { label: "Bekor qilindi", cls: "bg-muted text-muted-foreground" },
};

/**
 * QOLDIQ KARTOCHKASI.
 *
 * `transit` ALOHIDA ajratiladi: u kassada YO'Q, lekin filialning
 * javobgarligida. Boshqa hisoblar bilan bir xil ko'rsatilsa, kassir
 * "shuncha pul bor" deb o'ylab, sanoqda har safar kamomad chiqardi.
 */
const BalanceCard = ({ kind, balance }) => {
  const isTransit = kind === "transit";
  return (
    <div
      className={`rounded-lg border p-4 ${
        isTransit ? "border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10" : "border-border bg-card"
      }`}
    >
      <p className="text-xs text-muted-foreground">{ACCOUNT_LABELS[kind] || kind}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{fmt(balance)}</p>
      {isTransit && balance > 0 && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Kassada emas — jo'natilgan, hali qabul qilinmagan
        </p>
      )}
    </div>
  );
};

/** Smena yopish qatori: sanoq kiritiladi va farq DARHOL ko'rinadi. */
const CloseShiftRow = ({ shift, onClose, isPending }) => {
  const [counted, setCounted] = useState("");
  const value = String(counted).trim();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <InputMoney
        value={counted}
        placeholder="Sanalgan naqd"
        className="max-w-[170px]"
        disabled={isPending}
        onChange={(e) => setCounted(e.target.value)}
      />
      <Button
        size="sm"
        disabled={isPending || value === ""}
        onClick={() => onClose(shift._id, Number(value))}
        className="gap-1.5"
      >
        <LockKeyhole size={14} strokeWidth={2} />
        Yopish
      </Button>
    </div>
  );
};

/**
 * KASSA - qoldiqlar, smena va inkassatsiya bitta sahifada.
 *
 * NEGA BIRGA: uchalasi bitta savolning uch tomoni - "kassada qancha pul
 * bor va u qayerda". Alohida sahifalarga bo'linsa, kassir smenani
 * yopishdan oldin qoldiqni ko'rish uchun sahifa almashtirishga majbur
 * bo'lardi.
 */
const CashDeskPage = () => {
  const { data: balances = [], isLoading } = useBalancesQuery({ treasuryOnly: true });
  const { data: shiftsRes } = useShiftsQuery({ status: "open" });
  const { data: transfersRes } = useTransfersQuery({});
  const { data: branchesRes } = useBranchesQuery({});

  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");

  const openShift = useOpenShiftMutation();
  const closeShift = useCloseShiftMutation();
  const sendTransfer = useSendTransferMutation({
    onSuccess: () => {
      setSendAmount("");
      setSendTo("");
    },
  });
  const receiveTransfer = useReceiveTransferMutation();
  const cancelTransfer = useCancelTransferMutation();

  const openShifts = shiftsRes?.data || [];
  const transfers = transfersRes?.data || [];
  const branches = branchesRes?.data || [];

  // Bir xil turdagi hisoblar bir nechta filialdan kelishi mumkin
  // ("barcha filiallar" rejimi) - turi bo'yicha yig'amiz.
  const byKind = balances.reduce((acc, b) => {
    acc[b.kind] = (acc[b.kind] || 0) + b.balance;
    return acc;
  }, {});

  const transferColumns = [
    {
      key: "route",
      header: "Yo'nalish",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => (
        <span className="text-sm">
          {r.fromBranchId?.name || "—"} → {r.toBranchId?.name || "—"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Summa",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => (
        <span className="text-sm font-medium tabular-nums">{fmt(r.amount)}</span>
      ),
    },
    {
      key: "status",
      header: "Holat",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => {
        const s = TRANSFER_STATUS[r.status] || { label: r.status, cls: "bg-muted" };
        return (
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${s.cls}`}>
            {s.label}
            {r.discrepancy ? ` (${fmt(r.discrepancy)})` : ""}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) =>
        r.status === "in_transit" ? (
          <div className="flex gap-1.5">
            {/* QABUL QILISH faqat qabul qiluvchi filialda ishlaydi -
                server buni tekshiradi. Tugma har ikkalasida ko'rinadi,
                lekin noto'g'ri tomondan bosilsa tushunarli 403 keladi. */}
            <Button
              size="sm"
              variant="outline"
              disabled={receiveTransfer.isPending}
              onClick={() => receiveTransfer.mutate({ id: r._id, body: {} })}
              className="gap-1"
            >
              <Check size={14} strokeWidth={2} />
              Qabul
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={cancelTransfer.isPending}
              onClick={() => cancelTransfer.mutate(r._id)}
              className="gap-1"
            >
              <X size={14} strokeWidth={2} />
              Bekor
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Kassa</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Qoldiqlar, smena va inkassatsiya. Har bir amal qo'sh yozuv jurnaliga
          tushadi — qoldiq hech qachon qo'lda o'zgartirilmaydi.
        </p>
      </div>

      {/* ── QOLDIQLAR ── */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Wallet size={16} strokeWidth={2} />
          Qoldiqlar
        </h2>
        {isLoading ? (
          <p className="py-6 text-center text-sm opacity-60">Yuklanmoqda...</p>
        ) : Object.keys(byKind).length === 0 ? (
          <p className="rounded-lg border border-border bg-card py-8 text-center text-sm opacity-60">
            Hali hech qanday pul harakati yo'q
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(byKind).map(([kind, balance]) => (
              <BalanceCard key={kind} kind={kind} balance={balance} />
            ))}
          </div>
        )}
      </section>

      {/* ── SMENA ── */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Smena</h2>
        <div className="rounded-lg border border-border bg-card p-4">
          {openShifts.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Ochiq smena yo'q. Kun boshida smena oching — yopilishda sanoq
                jurnal bilan solishtiriladi.
              </p>
              <Button
                onClick={() => openShift.mutate({})}
                disabled={openShift.isPending}
                className="gap-1.5"
              >
                <PlayCircle size={16} strokeWidth={2} />
                Smena ochish
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {openShifts.map((s) => (
                <div
                  key={s._id}
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="text-sm">
                    <p className="font-medium">
                      {s.cashierId?.firstName} {s.cashierId?.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ochilgan: {new Date(s.openedAt).toLocaleString("uz-UZ")} ·
                      boshlang'ich {fmt(s.openingCash)}
                    </p>
                  </div>
                  <CloseShiftRow
                    shift={s}
                    isPending={closeShift.isPending}
                    onClose={(id, countedCash) =>
                      closeShift.mutate({ id, body: { countedCash } })
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── INKASSATSIYA ── */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Send size={16} strokeWidth={2} />
          Inkassatsiya
        </h2>

        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Qaysi filialga</span>
            <Select
              value={sendTo}
              onChange={setSendTo}
              placeholder="Filial tanlang"
              triggerClassName="min-w-[180px]"
              options={branches.map((b) => ({ value: b._id, label: b.name }))}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Summa</span>
            <InputMoney
              value={sendAmount}
              className="max-w-[170px]"
              onChange={(e) => setSendAmount(e.target.value)}
            />
          </label>
          <Button
            disabled={
              sendTransfer.isPending || !sendTo || String(sendAmount).trim() === ""
            }
            onClick={() =>
              sendTransfer.mutate({
                toBranchId: sendTo,
                amount: Number(sendAmount),
              })
            }
            className="gap-1.5"
          >
            <Send size={16} strokeWidth={2} />
            Jo'natish
          </Button>
        </div>

        <DataTable
          rows={transfers}
          columns={transferColumns}
          empty={
            <p className="py-8 text-center text-sm opacity-60">
              Inkassatsiya yozuvlari yo'q
            </p>
          }
        />
      </section>
    </div>
  );
};

export default CashDeskPage;
