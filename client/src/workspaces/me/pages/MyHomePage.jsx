import { Link } from "react-router-dom";
import {
  BookOpen, CalendarDays, ClipboardCheck, Wallet, TrendingUp,
  Briefcase, Bell, ArrowRight,
} from "lucide-react";

import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";
import useAuth from "@/shared/hooks/useAuth";
import { useMyLedgerQuery } from "@/owner/features/ledger";
import WorkspacePage from "@/workspaces/shared/WorkspacePage";

/**
 * ══════════════════════════════════════════════════════════════════════
 * O'QUVCHINING BOSH SAHIFASI (talab 16)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── TIL ──
 * Har yozuv O'QUVCHI nuqtai nazaridan: "Guruhlar" emas —
 * "Mening guruhim". Tashkilot tushunchalari (filial, xodim, hisobot)
 * umuman yo'q.
 *
 * ── NEGA BALANS ENG TEPADA ──
 * O'quvchining eng tez-tez beradigan savoli — "qarzim bormi?".
 * Uni menyuning ichiga yashirish har safar uch bosish degani.
 * Shuning uchun javob birinchi ekranda, bir jumlada.
 */

const LINKS = [
  { to: "/student/group", icon: BookOpen, title: "O'qishim", hint: "Guruhim, o'qituvchim va darslarim" },
  { to: "/me/schedule", icon: CalendarDays, title: "Jadvalim", hint: "Qaysi kuni qachon dars" },
  { to: "/student/attendance", icon: ClipboardCheck, title: "Davomatim", hint: "Qatnashgan va qoldirgan darslarim" },
  { to: "/me/payments", icon: Wallet, title: "To'lovlarim", hint: "To'lov tarixim va holatim" },
  { to: "/student/rating", icon: TrendingUp, title: "Natijalarim", hint: "Baholarim va reytingim" },
  { to: "/student/assignments", icon: Briefcase, title: "Vazifalarim", hint: "Berilgan topshiriqlar" },
  { to: "/student/inbox", icon: Bell, title: "Xabarlarim", hint: "Markazdan kelgan xabarlar" },
];

const MyHomePage = () => {
  const { user } = useAuth();
  const ledger = useMyLedgerQuery();
  const balance = ledger.data?.currentBalance;
  const owes = typeof balance === "number" && balance < 0;

  return (
    <WorkspacePage
      title={user?.firstName ? `Salom, ${user.firstName}` : "Mening sahifam"}
      subtitle="O'qishingiz va to'lovlaringiz bir joyda"
    >
      {/* ── HOLAT: bitta jumla ── */}
      <Link
        to="/me/payments"
        className={cn(
          "flex items-center justify-between gap-3 rounded-2xl border p-4 transition",
          owes
            ? "border-destructive/40 bg-destructive/5 hover:bg-destructive/10"
            : "border-border bg-card hover:bg-muted/40",
        )}
      >
        <span>
          <span className="block text-xs text-muted-foreground">To'lov holati</span>
          <span
            className={cn(
              "mt-0.5 block text-lg font-semibold",
              owes ? "text-destructive" : "text-foreground",
            )}
          >
            {ledger.isLoading
              ? "Yuklanmoqda…"
              : owes
                ? `Qarzingiz ${formatMoney(Math.abs(balance))}`
                : typeof balance === "number" && balance > 0
                  ? `Oldindan to'lov ${formatMoney(balance)}`
                  : "Qarzingiz yo'q"}
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="group flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 hover:bg-muted/40"
          >
            <span className="flex items-center gap-2">
              <l.icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
              <span className="font-medium text-foreground">{l.title}</span>
              <ArrowRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </span>
            <span className="text-xs text-muted-foreground">{l.hint}</span>
          </Link>
        ))}
      </div>
    </WorkspacePage>
  );
};

export default MyHomePage;
