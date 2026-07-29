// Icons
import { LogOut, PanelLeft, ChevronRight, ArrowLeftToLine } from "lucide-react";

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

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import useLogout from "@/features/auth/hooks/useLogout";
import usePermissions from "@/shared/hooks/usePermissions";
import { useIsMobile } from "@/shared/hooks/useMobile";

// Constants
import { ROLES } from "@/shared/constants/roles";
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
  const { role, roleType } = useAuth();
  const { has, hasAny } = usePermissions();

  // MENYUNI roleType ANIQLAYDI, rol NOMI emas.
  //
  // Rollar dinamik: "director", "buxgalter" kabi custom rollar bor va
  // ular ROLE_SIDEBAR xaritasida YO'Q. Faqat `role` bo'yicha qaralsa
  // menyu bo'm-bo'sh chiqardi - foydalanuvchi hamma ruxsatga ega bo'lsa ham
  // hech narsa ko'rmasdi. roleType ("owner"/"teacher"/"student") esa
  // har doim mavjud va custom rol qaysi panel bilan ishlashini bildiradi.
  const navItems = ROLE_SIDEBAR[role] || ROLE_SIDEBAR[roleType] || [];

  // `permission` - bitta kalit; `permissionAnyOf` - kamida bittasi
  // yetarli (bitta sahifa ikki xil ruxsat egasiga ochiq bo'lganda).
  const allowed = (entry) => {
    if (entry.permissionAnyOf?.length) return hasAny(entry.permissionAnyOf);
    return !entry.permission || has(entry.permission);
  };

  // Filter sub-items by permission.
  //
  // Ikki xil yozuv bor:
  //   - GURUH: `items` massivi bor -> ochiladigan collapsible.
  //   - YAKKA LINK: `url` bor, `items` yo'q -> to'g'ridan-to'g'ri havola.
  // Yakka link ataylab qo'shildi: "Tasdiqlar" kabi bitta sahifali bo'lim
  // uchun ochiladigan guruh ortiqcha bosish qadamini qo'shardi.
  const filtered = navItems
    .map((item) => ({
      ...item,
      items: (item.items || []).filter(allowed),
    }))
    .filter((item) =>
      item.items.length ? true : Boolean(item.url) && allowed(item),
    );

  return (
    <SidebarContent>
      {/* Yaratish tugmasi + global qidiruv - owner panelida ishlaydigan hamma
          uchun (custom "director" roli ham roleType="owner"/"staff" bo'lishi
          mumkin). Modallar shu yerda mount qilinadi: sidebar har doim
          DashboardLayout ichida turadi, ya'ni istalgan sahifadan ochiladi. */}
      {(role === ROLES.OWNER || roleType === ROLES.OWNER) && (
        <>
          <SidebarGroup className="gap-2 pb-0">
            <OwnerCreateMenu />
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <OwnerGlobalSearch />
              </div>
              {/* Kutilayotgan tasdiqlar paneli - yonboshdan chiqadi */}
              <OwnerApprovalsBell className="shrink-0" />
            </div>
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
            item.items.length === 0 ? (
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
                    {item.badge === "approvals" && (
                      <OwnerApprovalsBadge className="ml-auto" />
                    )}
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
                            {subItem.title}
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
    </SidebarContent>
  );
};

const Footer = () => {
  const { user } = useAuth();
  const { mutate: logout } = useLogout();
  const isMobile = useIsMobile();

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
                <div className="flex items-center justify-center size-8 shrink-0 bg-primary rounded-[2px] uppercase text-white">
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
                  <div className="flex items-center justify-center size-8 shrink-0 bg-primary rounded-[2px] uppercase text-white">
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
