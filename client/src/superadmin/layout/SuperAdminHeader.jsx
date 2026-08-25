import { NavLink, Link } from "react-router-dom";
import { ChevronDown, LogOut, ShieldCheck, User } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
} from "@/shared/components/shadcn/dropdown-menu";
import ThemeToggle from "@/shared/components/theme/ThemeToggle";
import NotificationBell from "@/shared/components/notification/NotificationBell";
import useAuth from "@/shared/hooks/useAuth";
import usePermissions from "@/shared/hooks/usePermissions";
import useCoinConfig from "@/shared/hooks/useCoinConfig";
import useLogout from "@/features/auth/hooks/useLogout";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { APP_NAME, APP_LOGO } from "@/shared/constants/app";
import { cn } from "@/shared/utils/cn";

import { SUPER_ADMIN_HEADER_NAV } from "../navigation/nav.config";

/**
 * ══════════════════════════════════════════════════════════════════════
 * SUPER ADMIN SARLAVHASI — MOLIYA SHU YERDA
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA MOLIYA SARLAVHADA, SIDEBAR'DA EMAS ──
 * Sidebar tashkilotning TUZILISHINI ko'rsatadi (nima bor: filiallar,
 * tahlil). Moliya esa tuzilma emas — u markaz egasi panelni ochishning
 * ENG KO'P sababi. Sidebar'ning to'rtinchi qatori bo'lsa, u "yana bitta
 * bo'lim" bo'lib o'qilardi va hisobot menyusiga ko'milgan har qanday
 * moliya kabi ko'zdan qochardi.
 *
 * Bu yerda u doim ko'rinadigan, alohida ajratilgan yo'nalish.
 *
 * ── PROFIL MENYUSIDA NIMA BOR VA NEGA ──
 *   Vakolatlar      — "kim nima qila oladi". Bu SOZLASH ishi, kundalik
 *                     emas: sidebar'da bo'lsa uch yozuvli menyuni
 *                     to'rtga chiqarardi.
 *
 * ── ADMIN PANELIGA HAVOLA ATAYLAB YO'Q ──
 * Bir muddat bu menyuda "Admin paneli" qatori turgandi. U olib
 * tashlandi: Admin paneli — filial direktorlarining ish joyi va Super
 * Admin u yerda ishlamaydi (`AdminPanelGuard` uni qaytaradi).
 *
 * Havolani qoldirish "yolg'on eshik" bo'lardi: bosiladi, lekin odam
 * darhol shu yerga qaytariladi.
 */
const SuperAdminHeader = () => {
  const { user, roleLabel } = useAuth();
  const { has } = usePermissions();
  const { enabled: coinEnabled } = useCoinConfig();
  const { mutate: logout } = useLogout();

  // ══════════════════════════════════════════════════════════════════
  // SARLAVHA YO'NALISHLARI IKKI SHART BILAN KESILADI
  //
  //   1. RUXSAT     — `permission` yoki `permissionAnyOf`
  //   2. IMKONIYAT  — `capability` (bo'lim UMUMAN yoqilganmi)
  //
  // Ikkinchisi kerak, chunki ruxsat "menda huquq bor" deydi, xolos.
  // Tanga bo'limini ega o'chirib qo'yishi mumkin va o'shanda huquq
  // baribir rolda qoladi — faqat ruxsatga tayanilsa sarlavhada
  // ishlamaydigan havola turib qolardi.
  //
  // Bu qobiqda "yolg'on eshik" ATAYLAB yo'q (Admin paneliga havola
  // ham shu sababdan olib tashlangan) — o'chirilgan bo'lim yozuvi
  // aynan shunday eshik bo'lardi.
  // ══════════════════════════════════════════════════════════════════
  const capabilities = { coin: coinEnabled };

  const headerNav = SUPER_ADMIN_HEADER_NAV.filter((item) => {
    if (item.permission && !has(item.permission)) return false;
    if (item.permissionAnyOf?.length && !item.permissionAnyOf.some(has)) return false;
    if (item.capability && !capabilities[item.capability]) return false;
    return true;
  });

  const name =
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    user?.username ||
    "Foydalanuvchi";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-3 sm:px-4">
      {/* ── TASHKILOT ── */}
      <Link to="/org" className="flex min-w-0 items-center gap-2">
        <img src={APP_LOGO} width={28} height={28} alt="" className="size-7 shrink-0" />
        <span className="hidden truncate text-sm font-semibold sm:inline">
          {APP_NAME}
        </span>
        <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground md:inline">
          Tashkilot
        </span>
      </Link>

      {/* ── YUQORI DARAJADAGI YO'NALISHLAR: MOLIYA, MARKET ── */}
      <nav aria-label="Asosiy yo'nalishlar" className="ml-1 flex items-center gap-1 sm:ml-3">
        {headerNav.map((item) => (
          <NavLink
            key={item.key}
            to={item.url}
            className={({ isActive }) =>
              cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition sm:px-3",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted",
              )
            }
          >
            <item.icon className="size-4" strokeWidth={1.75} />
            {item.title}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle variant="switch" className="size-8" />
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="size-3.5" />
            </span>
            <span className="hidden max-w-[10rem] truncate sm:inline">{name}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {roleLabel || "Tashkilot boshqaruvi"}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {has(PERMISSIONS.ROLES_READ) && (
              <DropdownMenuItem asChild>
                <Link to="/org/vakolatlar">
                  <ShieldCheck className="size-4" />
                  Vakolatlar
                </Link>
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout()}>
              <LogOut className="size-4" />
              Chiqish
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default SuperAdminHeader;
