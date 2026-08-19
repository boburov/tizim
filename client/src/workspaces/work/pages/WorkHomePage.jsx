import { Link } from "react-router-dom";
import {
  BookOpen, ClipboardCheck, CalendarDays, Target, Briefcase, Bell,
  GraduationCap, ArrowRight,
} from "lucide-react";

import { cn } from "@/shared/utils/cn";
import useAuth from "@/shared/hooks/useAuth";
import usePermissions from "@/shared/hooks/usePermissions";
import WorkspacePage from "@/workspaces/shared/WorkspacePage";
import EmptyState from "@/workspaces/shared/EmptyState";

/**
 * ══════════════════════════════════════════════════════════════════════
 * XODIM ISH MAKONI — "MENGA BIRIKTIRILGAN ISH" (talab 17)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA BU YERDA MOLIYA UMUMAN YO'Q ──
 * Talab buni ochiq aytadi: "No organization-wide financial analytics".
 * Resepshin va o'qituvchi markazning daromadini ko'rmasligi kerak —
 * ularning ishi bunga bog'liq emas va ma'lumot ortiqcha.
 *
 * Ilgari ular EGA PANELIDA ishlardi: menyu ruxsat bo'yicha kesilardi,
 * lekin TUZILISH baribir egasiniki edi — "Moliya" guruhi ko'rinib
 * turardi (faqat ichi bo'sh), "Filiallar" ham. Ya'ni odam har kuni
 * o'ziga taalluqli bo'lmagan tuzilmani ko'rardi.
 *
 * ── NIMA KO'RSATILADI ──
 * Faqat ruxsati BOR bo'limlar. Hech biri bo'lmasa — ochiq tushuntirish,
 * bo'sh ekran emas (talab 23).
 */

const CARDS = [
  {
    to: "/work/groups",
    icon: BookOpen,
    title: "Guruhlarim",
    hint: "Menga biriktirilgan guruhlar va ularning o'quvchilari",
    permission: "groups.read",
  },
  {
    to: "/owner/attendance",
    icon: ClipboardCheck,
    title: "Davomat",
    hint: "Bugungi darsni belgilash va o'tgan davomatni ko'rish",
    permission: "attendance.read",
  },
  {
    to: "/work/schedule",
    icon: CalendarDays,
    title: "Jadval",
    hint: "Haftalik dars jadvali",
  },
  {
    to: "/owner/leads",
    icon: Target,
    title: "Lidlar",
    hint: "Yangi murojaatlar va ular bilan ishlash",
    permission: "leads.read",
  },
  {
    to: "/owner/assignments",
    icon: Briefcase,
    title: "Vazifalar",
    hint: "O'quvchilarga yuborilgan topshiriqlar",
    permission: "assignments.read",
  },
  {
    to: "/owner/inbox",
    icon: Bell,
    title: "Xabarlar",
    hint: "Menga kelgan bildirishnomalar",
  },
];

const WorkHomePage = () => {
  const { user } = useAuth();
  const { has } = usePermissions();
  const visible = CARDS.filter((c) => !c.permission || has(c.permission));

  return (
    <WorkspacePage
      title={user?.firstName ? `${user.firstName}, salom` : "Ish joyim"}
      subtitle="Sizga biriktirilgan ish shu yerda"
    >
      {visible.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Sizga hali ish biriktirilmagan"
          hint="Administrator sizga guruh yoki vazifa biriktirgach, ular shu yerda ko'rinadi."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              className={cn(
                "group flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-4",
                "transition hover:border-primary/40 hover:bg-muted/40",
              )}
            >
              <span className="flex items-center gap-2">
                <c.icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                <span className="font-medium text-foreground">{c.title}</span>
                <ArrowRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="text-xs text-muted-foreground">{c.hint}</span>
            </Link>
          ))}
        </div>
      )}
    </WorkspacePage>
  );
};

export default WorkHomePage;
