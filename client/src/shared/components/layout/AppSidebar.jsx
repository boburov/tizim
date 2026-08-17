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
import ExecutiveReturnButton from "./ExecutiveReturnButton";

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

// Rol-spec sidebar konfiguratsiyalari
import {
  ownerSidebar,
  OwnerGlobalSearch,
  OwnerCreateMenu,
  OwnerCreateModals,
  OwnerApprovalsBadge,
  OwnerApprovalNotifier,
  OwnerApprovalsBell,
} from "@/owner";
import { teacherSidebar } from "@/teacher";
import { studentSidebar } from "@/student";

const ROLE_SIDEBAR = {
  [ROLES.OWNER]: ownerSidebar,
  [ROLES.TEACHER]: teacherSidebar,
  [ROLES.STUDENT]: studentSidebar,
  // XODIM (direktor, buxgalter, administrator...) - owner panelida ishlaydi,
  // lekin menyusi RUXSATLARI bo'yicha kesiladi (pastdagi filter).
  // Bu qator bo'lmasa custom rolli foydalanuvchi bo'sh menyu ko'rardi.
  staff: ownerSidebar,
};

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
  const { role, roleType, multiBranch } = useAuth();
  const { isAllBranches } = useActiveBranch();
  const { has, hasAny } = usePermissions();

  // MENYUNI roleType ANIQLAYDI, rol NOMI emas.
  //
  // Rollar dinamik: "director", "buxgalter" kabi custom rollar bor va
  // ular ROLE_SIDEBAR xaritasida YO'Q. Faqat `role` bo'yicha qaralsa
  // menyu bo'm-bo'sh chiqardi - foydalanuvchi hamma ruxsatga ega bo'lsa ham
  // hech narsa ko'rmasdi. roleType ("owner"/"teacher"/"student") esa
  // har doim mavjud va custom rol qaysi panel bilan ishlashini bildiradi.
  const navItems = ROLE_SIDEBAR[role] || ROLE_SIDEBAR[roleType] || [];

  // OWNER PANELIDA ishlayaptimi. Menyu ROLE_SIDEBAR'da `staff: ownerSidebar`
  // bilan berilgani uchun xodim (direktor, buxgalter) ham shu panelda
  // ishlaydi - yaratish tugmasi, qidiruv va MODALLAR unga ham kerak.
  const isOwnerPanel =
    role === ROLES.OWNER ||
    roleType === ROLES.OWNER ||
    roleType === ROLE_TYPES.STAFF;

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

          DIQQAT: shart `isOwnerPanel` - roleType "staff" HAM kiradi.
          Ilgari faqat owner tekshirilardi va filial direktori (roleType
          "staff") uchun modallar UMUMAN mount qilinmasdi: sahifadagi
          "Yangi o'quvchi" tugmasi bosilardi, Redux holati ochilardi,
          lekin ekranda hech narsa chiqmasdi. Menyu esa ROLE_SIDEBAR'da
          `staff: ownerSidebar` orqali ko'rinib turardi - shuning uchun
          nosozlik jimgina bo'lardi. */}
      {isOwnerPanel && (
        <>
          {/* Qidiruv to'liq kenglikda. Tasdiqlar qo'ng'irog'i ilgari shu
              yerda, qidiruv yonida turardi - u kenglikni yer, yig'ilgan
              holatda ustma-ust tushardi va menyudagi "Tasdiqlar" qatori
              bilan bir xil sanoqni takrorlardi. Endi panel o'sha
              qatorning o'zidan ochiladi (pastda). */}
          <SidebarGroup className="gap-2 pb-0">
            <OwnerCreateMenu />
            <OwnerGlobalSearch />
            {/* RAHBARIYATGA QAYTISH - eng tepada, menyu ro'yxatidan
                TASHQARIDA.
                Yo'l ikki tomonlama bo'lishi kerak: `/admin` sarlavhasida
                "Operatsion panel" tugmasi bor, teskarisi esa faqat
                menyudagi bitta qator edi - o'ttizta havola orasida
                yo'qolib ketardi. Rahbariyat kartasidan drill-down
                qilgan odam aynan shu yerda "qanday qaytaman?" degan
                savolga tushardi. */}
            <ExecutiveReturnButton variant="sidebar" />
          </SidebarGroup>
          <OwnerCreateModals />
          {/* Bildirishnoma qatlamining YAGONA mount nuqtasi: sidebar har
              doim DashboardLayout ichida turadi, ya'ni toast va kirish
              oynasi istalgan sahifada ishlaydi. */}
          <OwnerApprovalNotifier />
        </>
      )}
      <SidebarGroup>
        <SidebarGroupLabel>Platforma</SidebarGroupLabel>
        <SidebarMenu>
          {filtered.map((item) =>
            item.sheet === "approvals" ? (
              /* Panel qatori - sahifaga o'tmaydi, yonboshdan tasdiqlar
                 navbatini ochadi. Ko'rinishi qo'shni linklar bilan bir
                 xil; yig'ilgan holatda SidebarMenuButton o'zi ikonka +
                 tooltip'ga aylanadi, alohida moslash kerak emas. */
              <SidebarMenuItem key={item.title}>
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
      </SidebarGroup>

      {/* FAYL XOTIRASI - faqat fayl YUKLAY oladiganlar uchun.
          O'quvchi panelida ko'rsatilmaydi: u fayl yuklamaydi, ya'ni raqam
          unga hech qanday qaror bermaydi - faqat menyuni chalg'itardi. */}
      {(isOwnerPanel || roleType === ROLES.TEACHER) && <StorageQuota />}
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
