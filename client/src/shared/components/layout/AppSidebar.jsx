import { lazy, Suspense } from "react";

// Icons
import {
  Sun,
  Moon,
  Check,
  LogOut,
  Monitor,
  PanelLeft,
  ChevronRight,
  ArrowLeftToLine,
} from "lucide-react";

// Router
import { Link } from "react-router-dom";

// Sidebar
import {
  Sidebar,
  useSidebar,
  SidebarRail,
  SidebarMenu,
  SidebarGroup,
  SidebarFooter,
  SidebarHeader,
  SidebarContent,
  SidebarMenuSub,
  SidebarMenuItem,
  SidebarGroupLabel,
  SidebarMenuButton,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/shared/components/shadcn/sidebar";

// Collapsible
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/shadcn/collapsible";

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
import BranchSwitcher from "./BranchSwitcher";
import StorageQuota from "./StorageQuota";
import SidebarItemBadge from "./SidebarItemBadge";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import useTheme, { THEME_OPTIONS } from "@/shared/hooks/useTheme";
import useLogout from "@/features/auth/hooks/useLogout";
import usePermissions from "@/shared/hooks/usePermissions";
import useActiveBranch from "@/shared/hooks/useActiveBranch";
import { useIsMobile } from "@/shared/hooks/useMobile";

// Constants
import { ROLES, ROLE_TYPES } from "@/shared/constants/roles";
import { APP_NAME, APP_LOGO } from "@/shared/constants/app";

/**
 * ══════════════════════════════════════════════════════════════════════
 * ISHCHI PANEL WIDGET'LARI — KERAK BO'LGANDA YUKLANADI
 * ══════════════════════════════════════════════════════════════════════
 *
 * Qidiruv, yaratish menyusi, yaratish MODALLARI va tasdiqlar
 * qo'ng'irog'i faqat ishchi makonlarda ko'rsatiladi (`isWorkPanel`).
 * Lekin statik import bo'lsa, ular O'QUVCHIGA ham yuklanardi — u
 * hech qachon ko'rmaydigan o'nlab forma bilan birga (o'quvchi
 * yaratish, guruh yaratish, filial yaratish...).
 *
 * Sidebar kirish faylida turadi, ya'ni bu og'irlik HAR yuklanishga
 * tushardi. Endi u faqat kerak bo'lganda keladi.
 *
 * `Suspense fallback={null}`: bu widget'lar sidebar tepasidagi
 * qo'shimcha, sahifa mazmuni emas. Ular bir zumdan keyin paydo
 * bo'lgani — spinner chaqnaganidan yaxshiroq.
 */
const OwnerGlobalSearch = lazy(() => import("@/owner/components/GlobalSearch"));
const OwnerCreateMenu = lazy(() => import("@/owner/components/CreateMenu"));
const OwnerCreateModals = lazy(() => import("@/owner/components/CreateModals"));
const OwnerApprovalsBadge = lazy(() => import("@/owner/components/ApprovalsBadge"));
const OwnerApprovalNotifier = lazy(() =>
  import("@/owner/features/expenseApprovals").then((m) => ({ default: m.ApprovalNotifier })));
const OwnerApprovalsBell = lazy(() =>
  import("@/owner/features/expenseApprovals").then((m) => ({ default: m.ApprovalsBell })));

// ISH MAKONI — menyuning YAGONA manbai.
import useWorkspace from "@/shared/hooks/useWorkspace";
import { WORKSPACES } from "@/shared/workspaces";

/**
 * ══════════════════════════════════════════════════════════════════════
 * MENYU ENDI ROLDAN EMAS, ISH MAKONIDAN KELADI
 * ══════════════════════════════════════════════════════════════════════
 *
 * Ilgari `ROLE_SIDEBAR` xaritasi bor edi va u ikkita muammoni
 * hal qila olmasdi:
 *
 *  1) DINAMIK ROLLAR. "Filial direktori" va "Resepshin" xaritada
 *     YO'Q edi, shuning uchun ikkalasi ham xodim qatoriga tushardi —
 *     ya'ni EGA MENYUSINING o'zini ko'rardi,
 *     faqat ruxsat bo'yicha kesilgan holda. Bu esa talab ATAYLAB
 *     rad etadigan model: "Admin — bu tugmalari kamaytirilgan
 *     Super Admin emas".
 *
 *  2) MANZIL ≠ KONTEKST. Bitta sahifa (`/owner/students`) turli
 *     odamlar uchun turli axborot arxitekturasida turishi kerak.
 *     Endi qobiq MANZILDAN emas, ODAMDAN kelib chiqadi: direktor
 *     uni FILIAL menyusi bilan, ega esa TASHKILOT menyusi bilan
 *     ko'radi. Sahifa bitta, nusxa yo'q.
 */

const AppSidebar = ({ ...props }) => {
  return (
    <Sidebar collapsible="icon" {...props}>
      <Header />
      <Main />
      <Footer />
      <SidebarRail />
    </Sidebar>
  );
};

const Header = () => {
  const { toggleSidebar } = useSidebar();

  return (
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            onClick={() => toggleSidebar()}
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <img
              width={32}
              alt="Logo"
              height={32}
              src={APP_LOGO}
              className="size-8"
            />

            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{APP_NAME}</span>
            </div>
            <ArrowLeftToLine className="ml-auto" size={24} strokeWidth={1.5} />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      {/* Filial tanlagich - bir filialli markazlarda ko'rinmaydi */}
      <BranchSwitcher />
    </SidebarHeader>
  );
};

const Main = () => {
  const isMobile = useIsMobile();
  const { toggleSidebar } = useSidebar();
  const { roleType, multiBranch } = useAuth();
  const { isAllBranches } = useActiveBranch();
  const { has, hasAny } = usePermissions();
  const { workspace, nav: navItems, meta } = useWorkspace();

  // YARATISH TUGMASI, QIDIRUV VA MODALLAR — o'quvchidan boshqa hammaga.
  //
  // Ilgari shart `roleType` ga qarardi va o'qituvchi tushib qolardi:
  // uning "Vazifa yuborish" modali umuman mount qilinmasdi. Endi
  // shart ISH MAKONI — o'quvchi makonidan boshqa hamma ishchi
  // makonda yaratish amallari bo'lishi mumkin (aniq ro'yxatni
  // `createRegistry` ruxsat bo'yicha kesadi).
  const isWorkPanel = workspace !== WORKSPACES.STUDENT;

  // `permission` - bitta kalit; `permissionAnyOf` - kamida bittasi
  // yetarli (bitta sahifa ikki xil ruxsat egasiga ochiq bo'lganda).
  // `multiBranchOnly`  - yakka markaz rejimida yozuv umuman ko'rsatilmaydi.
  // `allBranchesOnly`  - faqat "Barcha filiallar" tanlanganda ko'rinadi
  //                      (filiallararo hisobotlar bitta filial ichida
  //                      ma'nosiz).
  const allowed = (entry) => {
    if (entry.multiBranchOnly && !multiBranch) return false;
    if (entry.allBranchesOnly && !isAllBranches) return false;
    if (entry.permissionAnyOf?.length) return hasAny(entry.permissionAnyOf);
    return !entry.permission || has(entry.permission);
  };

  // Filter sub-items by permission.
  //
  // Uch xil yozuv bor:
  //   - GURUH:      `items` massivi bor -> ochiladigan collapsible.
  //   - YAKKA LINK: `url` bor, `items` yo'q -> to'g'ridan-to'g'ri havola.
  //   - PANEL:      `sheet` bor -> yonboshdan chiqadigan panelni ochadi.
  // Yakka link ataylab qo'shildi: bitta sahifali bo'lim uchun ochiladigan
  // guruh ortiqcha bosish qadamini qo'shardi.
  const filtered = navItems
    .filter(allowed)
    .map((item) => ({
      ...item,
      items: (item.items || []).filter(allowed),
    }))
    .filter((item) =>
      item.items.length
        ? true
        : Boolean(item.url || item.sheet) && allowed(item),
    );

  return (
    <SidebarContent>
      {/* Yaratish tugmasi + global qidiruv + YARATISH MODALLARI.
          Sidebar har doim DashboardLayout ichida turadi, ya'ni modallar
          istalgan sahifadan ochiladi.

          DIQQAT: shart `isWorkPanel` - o'quvchidan BOSHQA hamma.
          Ilgari faqat owner tekshirilardi va filial direktori uchun
          modallar UMUMAN mount qilinmasdi: sahifadagi "Yangi o'quvchi"
          tugmasi bosilardi, Redux holati ochilardi, lekin ekranda hech
          narsa chiqmasdi. Menyu esa ko'rinib turardi - shuning uchun
          nosozlik jimgina bo'lardi. */}
      {isWorkPanel && (
        <Suspense fallback={null}>
          {/* Qidiruv to'liq kenglikda. Tasdiqlar qo'ng'irog'i ilgari shu
              yerda, qidiruv yonida turardi - u kenglikni yer, yig'ilgan
              holatda ustma-ust tushardi va menyudagi "Tasdiqlar" qatori
              bilan bir xil sanoqni takrorlardi. Endi panel o'sha
              qatorning o'zidan ochiladi (pastda). */}
          <SidebarGroup className="gap-2 pb-0">
            {/* ══════════════════════════════════════════════════════
                SUPER ADMIN PANELIGA HAVOLA ATAYLAB YO'Q
                ══════════════════════════════════════════════════════

                Bir muddat bu yerda "Tashkilot paneli" tugmasi turgandi.
                U OLIB TASHLANDI: ikki panel bir-biridan TO'LIQ
                ajratilgan bo'lishi kerak.

                Admin paneli — filial direktorining ish joyi. Undan
                tashkilot darajasiga chiqadigan yo'l bo'lsa, panel
                "kattaroq panelning bir qismi" bo'lib o'qiladi va
                direktor o'zi ko'ra olmaydigan bo'limni ko'rsatadigan
                tugmani bosib yuradi.

                Chegara UI da emas, MARSHRUTDA: `/org/*` `SuperAdminGuard`
                ostida, `/owner/*` esa `AdminPanelGuard` ostida
                (`app/routes.jsx`). Ma'lumot esa har doimgidek serverda
                qo'riqlanadi. */}
            <OwnerCreateMenu />
            <OwnerGlobalSearch />
            {/* "RAHBARIYATGA QAYTISH" TUGMASI OLIB TASHLANDI.
                U hal qilgan muammo — "asosiy ekranga qanday qaytaman?" —
                endi TUZILISH darajasida yo'q: har ish makonining bosh
                sahifasi menyuning BIRINCHI qatori. Tugma esa yangi
                modelda buzuq bo'lardi: filial direktorida
                `admin_dashboard.read` bor, ya'ni u ko'rinardi, lekin
                bosilganda `/admin → /org → (makon qo'riqchisi) → /branch`
                bo'lib, odam turgan joyiga qaytardi. */}
          </SidebarGroup>
          <OwnerCreateModals />
          {/* Bildirishnoma qatlamining YAGONA mount nuqtasi: sidebar har
              doim DashboardLayout ichida turadi, ya'ni toast va kirish
              oynasi istalgan sahifada ishlaydi. */}
          <OwnerApprovalNotifier />
        </Suspense>
      )}
      {/* ── NAVIGATSIYA LANDMARK'I ──
          `SidebarGroup` — oddiy `<div>`. Ekran o'quvchi uchun bu
          "matn to'plami", ya'ni foydalanuvchi menyuga SAKRAB o'ta
          olmaydi va uni sahifadagi boshqa ro'yxatlardan ajrata
          olmaydi. Landmark bo'lsa — bitta buyruq bilan boriladi.

          `aria-label` ish makonini aytadi: ega va direktor bir xil
          qobiqni ko'radi, lekin menyu TUZILMASI boshqa. Ekran
          o'quvchi bilan ishlaydigan odam qaysi makonda ekanini
          ko'rmaydi — eshitadi. */}
      <SidebarGroup>
        <nav aria-label={`${meta?.label || "Asosiy"} menyusi`}>
        {/* GURUH YORLIG'I ENDI ISH MAKONINI AYTADI.
            Ilgari bu yerda "Platforma" turardi — u hech qanday
            savolga javob bermasdi va har makonda bir xil edi.
            Endi u "Tashkilot" / "Filial" / "Ish joyim" / "Mening
            sahifam" bo'ladi: menyu tuzilmasi nega bunday ekanini
            bitta so'z bilan tushuntiradi. */}
        <SidebarGroupLabel>{meta?.label || "Menyu"}</SidebarGroupLabel>
        <SidebarMenu>
          {filtered.map((item) =>
            item.sheet === "approvals" ? (
              /* Panel qatori - sahifaga o'tmaydi, yonboshdan tasdiqlar
                 navbatini ochadi. Ko'rinishi qo'shni linklar bilan bir
                 xil; yig'ilgan holatda SidebarMenuButton o'zi ikonka +
                 tooltip'ga aylanadi, alohida moslash kerak emas. */
              <SidebarMenuItem key={item.title}>
                <Suspense fallback={null}>
                <OwnerApprovalsBell
                  renderTrigger={({ open }) => (
                    <SidebarMenuButton
                      onClick={open}
                      tooltip={item.title}
                      className="h-auto py-2.5"
                    >
                      {item.icon && <item.icon strokeWidth={1.5} />}
                      <span>{item.title}</span>
                      <OwnerApprovalsBadge className="ml-auto" />
                    </SidebarMenuButton>
                  )}
                />
                </Suspense>
              </SidebarMenuItem>
            ) : item.items.length === 0 ? (
              /* Yakka link - collapsible'siz, to'g'ridan-to'g'ri sahifaga */
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  className="h-auto py-2.5"
                >
                  <Link
                    to={item.url}
                    onClick={isMobile ? toggleSidebar : undefined}
                  >
                    {item.icon && <item.icon strokeWidth={1.5} />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : (
            <Collapsible
              asChild
              key={item.title}
              defaultOpen={item.isActive}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    tooltip={item.title}
                    className="h-auto py-2.5"
                  >
                    {item.icon && <item.icon strokeWidth={1.5} />}
                    <span>{item.title}</span>
                    <ChevronRight
                      size={20}
                      strokeWidth={1.5}
                      className="!size-5 ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                    />
                  </SidebarMenuButton>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton className="h-auto py-2" asChild>
                          <Link
                            to={subItem.url}
                            onClick={isMobile ? toggleSidebar : undefined}
                          >
                            <span className="truncate">{subItem.title}</span>
                            {/* Nishon (o'qilmagan soni). Konfiguratsiyada
                                faqat kalit turadi - komponent reyestrda
                                tanlanadi, shunda navigatsiya fayli
                                so'rovlarga bog'lanmaydi. */}
                            {subItem.badge && (
                              <SidebarItemBadge kind={subItem.badge} />
                            )}
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
            ),
          )}
        </SidebarMenu>
        </nav>
      </SidebarGroup>

      {/* FAYL XOTIRASI - faqat fayl YUKLAY oladiganlar uchun.
          O'quvchi panelida ko'rsatilmaydi: u fayl yuklamaydi, ya'ni raqam
          unga hech qanday qaror bermaydi - faqat menyuni chalg'itardi. */}
      {isWorkPanel && <StorageQuota />}
    </SidebarContent>
  );
};

const THEME_ITEMS = [
  { value: THEME_OPTIONS.LIGHT, label: "Yorug'", Icon: Sun },
  { value: THEME_OPTIONS.DARK, label: "Qorong'i", Icon: Moon },
  { value: THEME_OPTIONS.SYSTEM, label: "Tizim bo'yicha", Icon: Monitor },
];

const Footer = () => {
  const { user } = useAuth();
  const { mutate: logout } = useLogout();
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();

  if (!user) return null;

  const initial = user.firstName?.[0] || user.username?.[0] || "?";

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className="flex items-center justify-center size-8 shrink-0 bg-primary rounded-[2px] uppercase text-primary-foreground">
                  {initial}
                </div>

                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {user.firstName || user.username}
                  </span>
                  <span className="truncate text-xs">{user.username}</span>
                </div>

                <ChevronRight
                  size={20}
                  strokeWidth={1.5}
                  className="ml-auto !size-5"
                />
              </SidebarMenuButton>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              sideOffset={4}
              side={isMobile ? "bottom" : "right"}
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
            >
              <DropdownMenuLabel className="!p-0 font-normal">
                <div className="flex items-center gap-2 text-left text-sm">
                  <div className="flex items-center justify-center size-8 shrink-0 bg-primary rounded-[2px] uppercase text-primary-foreground">
                    {initial}
                  </div>

                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {user.firstName || user.username}
                    </span>
                    <span className="truncate text-xs opacity-70">
                      {user.username}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              {/* Mavzu: Yorug' / Qorong'i / Tizim bo'yicha (avtomatik) */}
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Mavzu
              </DropdownMenuLabel>

              {THEME_ITEMS.map(({ value, label, Icon }) => (
                <DropdownMenuItem
                  key={value}
                  onSelect={(event) => {
                    // Menyu yopilib ketmasin - foydalanuvchi natijani darhol ko'rsin
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
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
};

export default AppSidebar;
