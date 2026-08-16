// Router
import { NavLink, Link } from "react-router-dom";

// Icons
import { Check, LayoutDashboard, LogOut, Moon, Monitor, Sun } from "lucide-react";

// Dropdown Menu
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
} from "@/shared/components/shadcn/dropdown-menu";

// Components
import BranchBadge from "@/shared/components/layout/BranchBadge";
import NotificationBell from "@/shared/components/notification/NotificationBell";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import useLogout from "@/features/auth/hooks/useLogout";
import usePermissions from "@/shared/hooks/usePermissions";
import useTheme, { THEME_OPTIONS } from "@/shared/hooks/useTheme";

// Utils
import { cn } from "@/shared/utils/cn";

// Constants
import { APP_NAME, APP_LOGO } from "@/shared/constants/app";

// Navigation
import { visibleNav } from "../navigation/executiveNav.config";

const THEME_ITEMS = [
  { value: THEME_OPTIONS.LIGHT, label: "Yorug'", Icon: Sun },
  { value: THEME_OPTIONS.DARK, label: "Qorong'i", Icon: Moon },
  { value: THEME_OPTIONS.SYSTEM, label: "Tizim bo'yicha", Icon: Monitor },
];

/**
 * EXECUTIVE SARLAVHASI - sidebar'siz qobiqning yagona doimiy elementi.
 *
 * IKKI QATOR:
 *   1) kontekst  - qaysi markaz, qaysi filial, kim (o'zgarmaydi)
 *   2) bo'limlar - qayerdaman (sahifadan sahifaga o'zgaradi)
 *
 * Ular ATAYLAB ajratilgan. Bitta qatorga siqilganda filial tanlagichi
 * bo'lim tablari bilan bir xil balandlikda turadi va foydalanuvchi
 * "filial" ni ham bo'lim deb o'qiydi - holbuki u butun ekranning
 * kontekstini o'zgartiradi, sahifani emas.
 *
 * MOBIL: birinchi qator siqiladi (nom yashiriladi, faqat logo qoladi),
 * ikkinchi qator gorizontal scroll bo'ladi. Tablar yig'ilib "..." menyu
 * ichiga KIRMAYDI: beshta bo'lim scroll bilan bemalol sig'adi, yashirin
 * menyu esa bosishni ikki barobar qiladi.
 */
const ExecutiveHeader = () => {
  const { user } = useAuth();
  const { has } = usePermissions();
  const { theme, setTheme } = useTheme();
  const { mutate: logout } = useLogout();

  const items = visibleNav(has);
  const initial = user?.firstName?.[0] || user?.username?.[0] || "?";

  return (
    <header className="sticky top-0 z-30 border-b bg-card">
      {/* ── 1-QATOR: KONTEKST ── */}
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-2 px-3 sm:gap-3 sm:px-5">
        <Link to="/admin" className="flex min-w-0 shrink-0 items-center gap-2">
          <img
            src={APP_LOGO}
            width={24}
            height={24}
            alt=""
            className="size-6 shrink-0"
          />
          <span className="hidden truncate font-semibold sm:inline">
            {APP_NAME}
          </span>
        </Link>

        <span className="hidden shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground xs:inline">
          Rahbariyat
        </span>

        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
          <BranchBadge />

          {/* OPERATSION PANELGA QAYTISH.
              Sidebar'siz qobiqdan chiqish yo'li KO'RINIB turishi kerak -
              aks holda foydalanuvchi brauzer tugmasidan boshqa yo'l
              topolmaydi va "qamalib qoldim" hissi paydo bo'ladi. */}
          <Link
            to="/owner"
            className="hidden items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:inline-flex"
          >
            <LayoutDashboard className="size-3.5" />
            Operatsion panel
          </Link>

          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Profil menyusi"
                className="flex size-8 shrink-0 items-center justify-center rounded-[2px] bg-primary uppercase text-primary-foreground"
              >
                {initial}
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" sideOffset={6} className="min-w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex items-center gap-2 text-left text-sm">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-[2px] bg-primary uppercase text-primary-foreground">
                    {initial}
                  </div>
                  <div className="grid flex-1 leading-tight">
                    <span className="truncate font-medium">
                      {user?.firstName || user?.username}
                    </span>
                    <span className="truncate text-xs opacity-70">
                      {user?.username}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              {/* Operatsion panelga o'tish mobilda SHU YERDA - yuqoridagi
                  tugma `md` dan pastda yashiriladi. */}
              <DropdownMenuItem asChild className="md:hidden">
                <Link to="/owner">
                  <LayoutDashboard strokeWidth={1.5} />
                  Operatsion panel
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="md:hidden" />

              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Mavzu
              </DropdownMenuLabel>
              {THEME_ITEMS.map(({ value, label, Icon }) => (
                <DropdownMenuItem
                  key={value}
                  onSelect={(event) => {
                    event.preventDefault();
                    setTheme(value);
                  }}
                >
                  <Icon strokeWidth={1.5} />
                  <span className="flex-1">{label}</span>
                  {theme === value && <Check className="size-4 shrink-0" />}
                </DropdownMenuItem>
              ))}

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => logout()}>
                <LogOut strokeWidth={1.5} />
                Chiqish
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── 2-QATOR: BO'LIMLAR ──
          `overflow-x-auto` + `hidden-scrollbar`: mobilda barmoq bilan
          suriladi, desktopda hammasi ko'rinadi.
          Scrollbar YASHIRILADI - global uslub gorizontal panelga 10px
          balandlik beradi va u tablar ostida yo'g'on chiziq bo'lib
          ko'rinardi (styles/scrollbars.css). */}
      {items.length > 1 && (
        <nav
          className="hidden-scrollbar mx-auto flex w-full max-w-[1600px] gap-1 overflow-x-auto px-3 sm:px-5"
          aria-label="Rahbariyat bo'limlari"
        >
          {items.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.end ?? false}
              title={item.hint}
              className={({ isActive }) =>
                cn(
                  "relative shrink-0 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
                  // Faol holat PASTKI CHIZIQ bilan, fon bilan emas:
                  // fon bo'lganda tab tugmaga o'xshab qoladi va
                  // "bosilgan/bosilmagan" degan ikkinchi ma'no paydo
                  // bo'ladi.
                  isActive
                    ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <span className="inline-flex items-center gap-1.5">
                {item.icon && <item.icon className="size-4" />}
                {item.title}
              </span>
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
};

export default ExecutiveHeader;
