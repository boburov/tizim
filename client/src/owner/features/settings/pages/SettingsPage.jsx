// Router
import { NavLink, Outlet } from "react-router-dom";

// Icons
import {
  UserCircle2,
  ShieldCheck,
  Gauge,
  Building2,
  Archive,
  Target,
  CalendarCheck,
  Star,
  Bell,
  PartyPopper,
  Tags,
} from "lucide-react";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import usePermissions from "@/shared/hooks/usePermissions";

// Utils
import { cn } from "@/shared/utils/cn";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";

const BASE = "/owner/settings";

// Ilgari 11 ta sozlama 6 xil sidebar guruhiga sochilgan edi ("Sozlamalar"
// nomi uchta guruhda takrorlanardi). Hammasi shu yerga yig'ildi.
//
// Tab qatori emas, CHAP USTUN: 11 ta yozuv gorizontal tabga sig'maydi -
// mobilda skroll bo'lib ketardi. Ustun mobilda tepaga o'tadi.
const SECTIONS = [
  {
    label: "Hisob",
    items: [
      { to: BASE, label: "Ega profili", icon: UserCircle2, exact: true },
      {
        to: `${BASE}/rollar`,
        label: "Rollar va ruxsatlar",
        icon: ShieldCheck,
        permission: PERMISSIONS.ROLES_READ,
        // Rol tahrirlash alohida sahifada (rollar/new, rollar/:value) -
        // ularda ham shu yozuv aktiv turishi kerak.
        exact: false,
      },
      // "Faoliyat loglari" bu yerdan OLIB TASHLANDI - u endi sidebarda
      // alohida bo'lim (/owner/activity-logs). Sozlamalar sozlash
      // sahifalari uchun; log ko'rish esa kundalik kuzatuv ishi.
    ],
  },
  {
    label: "Markaz",
    items: [
      // YAKKA MARKAZ: sidebarda "Filiallar" bo'limi yo'q, shuning uchun
      // markazning o'z ma'lumoti (nom, manzil, limit) shu yerdan ochiladi.
      {
        to: `${BASE}/markaz`,
        label: "Markaz ma'lumotlari",
        icon: Building2,
        permission: PERMISSIONS.BRANCHES_READ,
        singleBranchOnly: true,
      },
      {
        to: `${BASE}/limitlar`,
        label: "Filial limitlari",
        icon: Gauge,
        permission: PERMISSIONS.BRANCHES_UPDATE,
        multiBranchOnly: true,
      },
      {
        to: `${BASE}/arxiv-sabablari`,
        label: "Arxiv sabablari",
        icon: Archive,
        permission: PERMISSIONS.ARCHIVE_REASONS_MANAGE,
        exact: false,
      },
      {
        to: `${BASE}/bayramlar`,
        label: "Bayramlar",
        icon: PartyPopper,
        permission: PERMISSIONS.HOLIDAYS_MANAGE,
      },
    ],
  },
  {
    label: "Modullar",
    items: [
      {
        to: `${BASE}/davomat`,
        label: "Davomat",
        icon: CalendarCheck,
        permission: PERMISSIONS.ATTENDANCE_MANAGE,
      },
      {
        to: `${BASE}/reyting`,
        label: "Reyting",
        icon: Star,
        permission: PERMISSIONS.RATING_MANAGE,
      },
      {
        to: `${BASE}/lidlar`,
        label: "Lidlar",
        icon: Target,
        permission: PERMISSIONS.LEADS_MANAGE,
        exact: false,
      },
      {
        to: `${BASE}/shablonlar`,
        label: "Xabar shablonlari",
        icon: Bell,
        permission: PERMISSIONS.NOTIFICATION_TEMPLATES_MANAGE,
      },
      {
        to: `${BASE}/feedback-turlari`,
        label: "Feedback turlari",
        icon: Tags,
        permission: PERMISSIONS.FEEDBACK_TYPES_MANAGE,
      },
    ],
  },
];

const SettingsPage = () => {
  const { has } = usePermissions();
  const { multiBranch } = useAuth();

  // Rejimga bog'liq yozuvlar: yakka markazda "Markaz ma'lumotlari",
  // ko'p filialli rejimda "Filial limitlari".
  const visible = (item) => {
    if (item.multiBranchOnly && !multiBranch) return false;
    if (item.singleBranchOnly && multiBranch) return false;
    return !item.permission || has(item.permission);
  };

  const sections = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter(visible),
  })).filter((s) => s.items.length > 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Sozlamalar</h1>

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="lg:w-60 lg:shrink-0 space-y-4">
          {sections.map((section) => (
            <div key={section.label} className="space-y-1">
              <p className="px-2 text-xs font-medium uppercase text-muted-foreground">
                {section.label}
              </p>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.exact ?? true}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 rounded-sm px-2 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0" strokeWidth={1.5} />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
