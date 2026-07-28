// Icons
import { Building2, Check, ChevronsUpDown, Layers } from "lucide-react";

// Sidebar
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/shared/components/shadcn/sidebar";

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
import useActiveBranch from "@/shared/hooks/useActiveBranch";
import { useIsMobile } from "@/shared/hooks/useMobile";

// Lib
import { ALL_BRANCHES } from "@/shared/lib/branch/activeBranch";

/**
 * FILIAL TANLAGICH.
 * Bitta filial bo'lsa ko'rinmaydi - eski (bir filialli) markazlar uchun
 * interfeys butunlay o'zgarmaydi.
 */
const BranchSwitcher = () => {
  const isMobile = useIsMobile();
  const {
    branches,
    activeBranch,
    isAllBranches,
    canSeeAllBranches,
    hasMultipleBranches,
    changeBranch,
  } = useActiveBranch();

  if (!hasMultipleBranches) return null;

  const label = isAllBranches
    ? "Barcha filiallar"
    : activeBranch?.name || "Filial tanlanmagan";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex items-center justify-center size-8 shrink-0 bg-primary/10 text-primary rounded-[2px]">
                {isAllBranches ? (
                  <Layers size={18} strokeWidth={1.5} />
                ) : (
                  <Building2 size={18} strokeWidth={1.5} />
                )}
              </div>

              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate text-xs opacity-70">Filial</span>
                <span className="truncate font-medium">{label}</span>
              </div>

              <ChevronsUpDown size={20} strokeWidth={1.5} className="ml-auto !size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="start"
            sideOffset={4}
            side={isMobile ? "bottom" : "right"}
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
          >
            <DropdownMenuLabel className="text-xs opacity-70">
              Filialni tanlang
            </DropdownMenuLabel>

            {/* Konsolidatsiya ko'rinish - faqat branches.view_all bilan */}
            {canSeeAllBranches && (
              <>
                <DropdownMenuItem onClick={() => changeBranch(ALL_BRANCHES)}>
                  <Layers strokeWidth={1.5} />
                  <span className="flex-1">Barcha filiallar</span>
                  {isAllBranches && <Check size={16} strokeWidth={2} />}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            {branches.map((branch) => {
              const isActive =
                !isAllBranches && String(activeBranch?._id) === String(branch._id);
              return (
                <DropdownMenuItem
                  key={branch._id}
                  onClick={() => changeBranch(branch._id)}
                >
                  <Building2 strokeWidth={1.5} />
                  <span className="flex-1 truncate">{branch.name}</span>
                  {isActive && <Check size={16} strokeWidth={2} />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

export default BranchSwitcher;
