import { Link } from "react-router-dom";
import {
  GraduationCap, BookOpen, Users, ClipboardCheck, Target, Star,
  MessageSquare, FileSpreadsheet, ArrowRight,
} from "lucide-react";

import { cn } from "@/shared/utils/cn";
import usePermissions from "@/shared/hooks/usePermissions";
import WorkspacePage from "@/workspaces/shared/WorkspacePage";
import EmptyState from "@/workspaces/shared/EmptyState";

/**
 * ══════════════════════════════════════════════════════════════════════
 * OPERATSIYA — KUNDALIK ISHGA KIRISH NUQTASI
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA BU SAHIFA BOR ──
 * Ega kundalik ishga kamdan-kam tushadi, lekin tushganda "o'quvchilar
 * qayerda edi?" deb menyu qidirmasligi kerak. Ilgari sidebar'da
 * "O'quv jarayoni" degan OCHILADIGAN guruh bor edi va uning ichida
 * olti havola — ya'ni har biri IKKI bosishda edi.
 *
 * Endi sidebar'da bitta yozuv, ichida esa bitta ekranda hammasi
 * TUSHUNTIRISH bilan. Yangi foydalanuvchi uchun bu ayni paytda
 * o'quv qo'llanmasi: har karta modul NIMA QILISHINI aytadi.
 *
 * ── NEGA SAHIFALAR KO'CHIRILMADI ──
 * O'quvchilar ro'yxati, guruhlar, davomat — hammasi ishlaydi va
 * o'z manzilida (`/owner/...`) qoladi. Ularni ko'chirish eski
 * xatcho'plarni buzardi va hech qanday foyda bermasdi (talab 32).
 * Qobiq esa ish makonidan keladi — ya'ni o'sha sahifalar bu yerdan
 * ochilganda ham TASHKILOT menyusi bilan ko'rinadi.
 */

const CARDS = [
  {
    to: "/owner/students",
    icon: GraduationCap,
    title: "O'quvchilar",
    hint: "Ro'yxat, to'lovlar, qarzdorlar, chegirmalar va chiqib ketish tahlili",
    permission: "students.read",
  },
  {
    to: "/owner/groups",
    icon: BookOpen,
    title: "Guruhlar",
    hint: "Guruh ochish, o'quvchi biriktirish, jadval va guruh to'lovi",
    permission: "groups.read",
  },
  {
    to: "/owner/teachers",
    icon: Users,
    title: "O'qituvchilar",
    hint: "Ro'yxat, maosh belgilash, o'qituvchi davomati",
    permission: "teachers.read",
  },
  {
    to: "/owner/attendance",
    icon: ClipboardCheck,
    title: "Davomat",
    hint: "Umumiy hisobot, guruh kesimi va belgilash",
    permission: "attendance.read",
  },
  {
    to: "/owner/leads",
    icon: Target,
    title: "Lidlar",
    hint: "Hali o'quvchi bo'lmagan odamlar: voronka, doska, statistika",
    permission: "leads.read",
  },
  {
    to: "/owner/grades",
    icon: Star,
    title: "Baholash va reyting",
    hint: "Baho qo'yish va o'quvchilar reytingi",
    permission: "grades.record",
  },
  {
    to: "/owner/notifications",
    icon: MessageSquare,
    title: "Aloqa",
    hint: "Bildirishnoma, vazifa va feedback",
    permission: "notifications.read",
  },
  {
    to: "/owner/catalog",
    icon: FileSpreadsheet,
    title: "Kurslar va narxlar",
    hint: "Yo'nalish katalogi va filial narx matritsasi",
    permission: "courses.read",
  },
];

const OrgOperationsPage = () => {
  const { has } = usePermissions();
  const visible = CARDS.filter((c) => !c.permission || has(c.permission));

  return (
    <WorkspacePage
      title="Operatsiya"
      subtitle="Kundalik ish: o'quvchilar, guruhlar, davomat va sotuv"
    >
      {visible.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Operatsion bo'limlar yopiq"
          hint="Sizga hali kundalik ish bo'limlariga ruxsat berilmagan."
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

export default OrgOperationsPage;
