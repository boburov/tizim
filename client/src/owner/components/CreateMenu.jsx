// Icons
import {
  Plus,
  GraduationCap,
  User,
  UserCog,
  Users,
  Target,
  BadgePercent,
} from "lucide-react";

// Sidebar
import { useSidebar } from "@/shared/components/shadcn/sidebar";

// Dropdown Menu
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
} from "@/shared/components/shadcn/dropdown-menu";

// Hooks
import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";

// Utils
import { cn } from "@/shared/utils/cn";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { ROLES } from "@/shared/constants/roles";
import { PERMISSIONS } from "@/shared/constants/permissions";

// Yaratish menyusi ikki bo'limga ajratilgan: kim (odam) va nima (ish yozuvi).
// Har bir yozuv o'z ruxsati bilan kesiladi - ruxsati yo'q odam uni ko'rmaydi.
const GROUPS = [
  {
    label: "Odamlar",
    items: [
      {
        icon: GraduationCap,
        label: "O'quvchi",
        hint: "Profil, guruh, ro'yxat sanasi",
        permission: PERMISSIONS.STUDENTS_CREATE,
        modal: MODAL.USER_CREATE,
        data: { defaultRole: ROLES.STUDENT },
      },
      {
        icon: User,
        label: "O'qituvchi",
        hint: "Profil va ishga olingan sana",
        permission: PERMISSIONS.TEACHERS_CREATE,
        modal: MODAL.USER_CREATE,
        data: { defaultRole: ROLES.TEACHER },
      },
      {
        icon: UserCog,
        label: "Xodim",
        hint: "Rol va filial biriktiriladi",
        // Xodim yaratish ikkita ruxsat talab qiladi (serverda ham shunday):
        // odam yaratish VA rol biriktirish.
        permissions: [PERMISSIONS.TEACHERS_CREATE, PERMISSIONS.ROLES_UPDATE],
        modal: MODAL.STAFF_CREATE,
        data: null,
      },
    ],
  },
  {
    label: "Ish",
    items: [
      {
        icon: Users,
        label: "Guruh",
        hint: "Jadval, o'qituvchi, narx",
        permission: PERMISSIONS.GROUPS_CREATE,
        modal: MODAL.GROUP_CREATE,
        data: null,
      },
      {
        icon: Target,
        label: "Lid",
        hint: "Potensial mijoz",
        permission: PERMISSIONS.LEADS_CREATE,
        modal: MODAL.LEAD_CREATE,
        data: null,
      },
      {
        icon: BadgePercent,
        label: "Chegirma",
        hint: "O'quvchiga imtiyoz",
        permission: PERMISSIONS.FINANCE_MANAGE,
        modal: MODAL.DISCOUNT_CREATE,
        data: null,
      },
    ],
  },
];

// Sidebar tepasidagi global "Yaratish" tugmasi: qaysi sahifada bo'lishidan
// qat'i nazar tez-tez yaratiladigan yozuvlarga tezkor yo'l.
// Modallarning o'zi <CreateModals /> da global mount qilingan.
const CreateMenu = () => {
  const { openModal } = useModal();
  const { has, hasAll } = usePermissions();
  const { state, isMobile, toggleSidebar } = useSidebar();

  const isCollapsed = state === "collapsed" && !isMobile;

  const allowed = (item) =>
    item.permissions ? hasAll(item.permissions) : has(item.permission);

  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(allowed),
  })).filter((g) => g.items.length > 0);

  // Hech narsa yaratolmaydigan foydalanuvchiga tugma ko'rsatilmaydi.
  if (groups.length === 0) return null;

  const handleSelect = (item) => {
    openModal(item.modal, item.data);
    // Mobilda sidebar modal ustida qolib ketmasin.
    if (isMobile) toggleSidebar();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Yaratish"
          aria-label="Yaratish"
          className={cn(
            "flex items-center gap-2 w-full rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
            isCollapsed ? "h-8 justify-center px-1.5" : "h-9 px-2.5 text-sm",
          )}
        >
          <Plus className="size-4 shrink-0" strokeWidth={2} />
          {!isCollapsed && (
            <span className="flex-1 text-left truncate font-medium">
              Yaratish
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" sideOffset={6} className="w-64">
        {groups.map((group, i) => (
          <div key={group.label}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs uppercase text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {group.items.map((item) => (
              <DropdownMenuItem
                key={item.label}
                onSelect={() => handleSelect(item)}
                className="gap-3 py-2"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-accent">
                  <item.icon className="size-4" strokeWidth={1.5} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium leading-tight">{item.label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {item.hint}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default CreateMenu;
