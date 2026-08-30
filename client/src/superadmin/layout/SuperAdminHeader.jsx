import { NavLink, Link } from "react-router-dom";
import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  User,
} from "lucide-react";

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
import useFeatures from "@/shared/hooks/useFeatures";
import useLogout from "@/features/auth/hooks/useLogout";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { APP_NAME, APP_LOGO } from "@/shared/constants/app";
import { cn } from "@/shared/utils/cn";

import { SUPER_ADMIN_HEADER_NAV } from "../navigation/nav.config";

/**
 * ══════════════════════════════════════════════════════════════════════
 * SUPER ADMIN SARLAVHASI — ASOSIY · MOLIYA · MARKET SHU YERDA
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA BU UCHTASI SARLAVHADA, SIDEBAR'DA EMAS ──
 * Sidebar tashkilotning TUZILISHINI ko'rsatadi (nima bor: filiallar,
 * tahlil). Sarlavha esa YO'NALISH beradi — "qayerga boraman".
 *
 *   ASOSIY — bo'lim emas, BOSH SAHIFA. Hamma yo'l unga qaytadi, ya'ni
 *            u chap ustunning birinchi qatori emas, doim ko'rinadigan
 *            boshlanish nuqtasi.
 *   MOLIYA — tuzilma emas: markaz egasi panelni ochishning ENG KO'P
 *            sababi. Sidebar qatori bo'lsa "yana bitta bo'lim" bo'lib
 *            o'qilardi va hisobot menyusiga ko'milgan har qanday moliya
 *            kabi ko'zdan qochardi.
 *   MARKET — alohida ish, "biznes qanday ketyapti" savoliga javob
 *            bermaydi.
 *
 * Natijada yuqori darajadagi yo'nalishlar BITTA qatorda turadi, ikki
 * ustunga bo'linmaydi.
 *
 * ── PROFIL MENYUSIDA NIMA BOR VA NEGA ──
 *   Vakolatlar      — "kim nima qila oladi". Bu SOZLASH ishi, kundalik
 *                     emas: sidebar'da bo'lsa qisqa menyuni
 *                     uzaytirardi.
 *
 * ── ADMIN PANELIGA HAVOLA QAYTARILDI ──
 * Bu qator bir muddat olib tashlangan edi, sababi haqli: o'sha paytda
 * `AdminPanelGuard` tashkilot darajasidagi odamni `/owner/*` dan
 * darhol qaytarardi, ya'ni havola "yolg'on eshik" edi.
 *
 * Endi qaytarish YO'Q — ega aynan `/owner` da yashaydi
 * (`resolveWorkspace` → `ADMIN`) va `/org` unga ikkinchi, ixtiyoriy
 * ko'rinish. Shuning uchun havola endi haqiqiy eshik va IKKI TOMONLAMA
 * yurish uchun kerak: `/owner` tomonidagi jufti — yon menyu
 * pastidagi "Markaz ko'rinishi" (`AppSidebar`).
 *
 * ⚠ Ruxsat tekshirilmaydi: bu yergacha yetib kelgan odam
 * `SuperAdminGuard` dan o'tgan, ya'ni unda tashkilot vakolati bor va
 * admin paneli unga baribir ochiq.
 */
const SuperAdminHeader = () => {
  const { user, roleLabel } = useAuth();
  const { has } = usePermissions();
  const { enabled: coinEnabled } = useCoinConfig();
  const { features: featureMap } = useFeatures();
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
  // ⚠ Tarif imkoniyatlari (dev panel) va ega o'chirgichi (`coin`) —
  // bitta xaritada: ikkalasi ham "bo'lim UMUMAN bormi" degan savolga
  // javob beradi.
  const capabilities = { ...featureMap, coin: coinEnabled && featureMap.coin !== false };

  const headerNav = SUPER_ADMIN_HEADER_NAV.filter((item) => {
    if (item.permission && !has(item.permission)) return false;
    if (item.permissionAnyOf?.length && !item.permissionAnyOf.some(has)) return false;
    if (![].concat(item.capability ?? []).every((k) => capabilities[k] !== false))
      return false;
    return true;
  });

  const name =
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    user?.username ||
    "Foydalanuvchi";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-3 sm:px-4">
      {/* ── BREND ──
          ⚠ `lg:w-52` TASODIFIY EMAS: 13rem + sarlavhaning `px-4` (1rem)
          = 14rem, ya'ni AYNAN sidebar kengligi (`lg:w-56`). Shu tufayli
          yonidagi yo'nalishlar chap ustun tugagan joydan, asosiy
          maydonning chap chetiga tekislanib boshlanadi.

          Ilgari bu yerda "Tashkilot" nishoni ham turardi: u brend
          blokining kengligini o'zgartirib turardi (nishon `md:` dan
          past ekranda yo'q edi), shuning uchun Moliya/Market har
          ekranda boshqa joydan boshlanardi va hech qayerga
          tekislanmasdi. Nishon olib tashlandi — panelni sidebar
          sarlavhasi ("Tashkilot menyusi") va yo'nalishlar o'zi
          aytadi. */}
      <Link
        to="/org"
        className="flex min-w-0 shrink-0 items-center gap-2 lg:w-52"
      >
        <img src={APP_LOGO} width={28} height={28} alt="" className="size-7 shrink-0" />
        <span className="hidden truncate text-sm font-semibold sm:inline">
          {APP_NAME}
        </span>
      </Link>

      {/* ── YUQORI DARAJADAGI YO'NALISHLAR: ASOSIY, MOLIYA, MARKET ── */}
      {/* `lg:-ml-1` — yozuvning O'Z ichki chekkasi (px-2.5) hisobga
          olinadi: shunda IKONKA aynan asosiy maydon chetiga (244px)
          tushadi, ya'ni "Moliya" sahifa sarlavhasi bilan bir vertikalda
          boshlanadi. */}
      <nav
        aria-label="Asosiy yo'nalishlar"
        className="flex items-center gap-1 lg:-ml-1"
      >
        {headerNav.map((item) => (
          <NavLink
            key={item.key}
            to={item.url}
            // ⚠ `end` — `/org` qolgan hamma yo'lning prefiksi. Usiz
            // "Asosiy" Moliya ochilganda ham faol bo'lib qolardi.
            end={item.end}
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

            <DropdownMenuItem asChild>
              <Link to="/owner/dashboard">
                <LayoutDashboard className="size-4" />
                Admin paneli
              </Link>
            </DropdownMenuItem>

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
