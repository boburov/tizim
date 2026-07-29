// Icons
import { Plus, GraduationCap, User, Users } from "lucide-react";

// Sidebar
import { useSidebar } from "@/shared/components/shadcn/sidebar";

// Dropdown Menu
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuContent,
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

// Yaratish menyusining yozuvlari. Har biri o'z ruxsati bilan kesiladi -
// ruxsati yo'q foydalanuvchi menyuda uni umuman ko'rmaydi.
const CREATE_ITEMS = [
  {
    icon: GraduationCap,
    label: "O'quvchi",
    permission: PERMISSIONS.STUDENTS_CREATE,
    modal: MODAL.USER_CREATE,
    data: { defaultRole: ROLES.STUDENT },
  },
  {
    icon: User,
    label: "O'qituvchi",
    permission: PERMISSIONS.TEACHERS_CREATE,
    modal: MODAL.USER_CREATE,
    data: { defaultRole: ROLES.TEACHER },
  },
  {
    icon: Users,
    label: "Guruh",
    permission: PERMISSIONS.GROUPS_CREATE,
    modal: MODAL.GROUP_CREATE,
    data: null,
  },
];

// Sidebar tepasidagi global "Yaratish" tugmasi: qaysi sahifada bo'lishidan
// qat'i nazar o'quvchi/o'qituvchi/guruh qo'shish uchun tezkor yo'l.
// Modallarning o'zi <CreateModals /> da global mount qilingan.
const CreateMenu = () => {
  const { openModal } = useModal();
  const { has } = usePermissions();
  const { state, isMobile, toggleSidebar } = useSidebar();

  const isCollapsed = state === "collapsed" && !isMobile;

  const items = CREATE_ITEMS.filter((item) => has(item.permission));

  // Hech narsa yaratolmaydigan foydalanuvchiga tugma ko'rsatilmaydi.
  if (items.length === 0) return null;

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
            "flex items-center gap-2 w-full rounded-md bg-primary text-white hover:bg-primary/90 transition-colors",
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

      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-[--radix-dropdown-menu-trigger-width] min-w-48"
      >
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            onSelect={() => handleSelect(item)}
          >
            <item.icon strokeWidth={1.5} />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default CreateMenu;
