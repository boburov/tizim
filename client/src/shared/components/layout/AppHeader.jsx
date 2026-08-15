// Components
import { useSidebar } from "../shadcn/sidebar";
import NotificationBell from "../notification/NotificationBell";
import BranchBadge from "./BranchBadge";
import ThemeToggle from "@/shared/components/theme/ThemeToggle";

// Icons
import { TextAlignJustify } from "lucide-react";

// Constants
import { APP_NAME, APP_LOGO } from "@/shared/constants/app";

const AppHeader = () => {
  const { toggleSidebar } = useSidebar();
  return (
    <header className="flex items-center justify-between h-12 container sticky top-0 z-30 bg-card shadow-sm md:hidden">
      {/* Hamburger menu */}
      <button onClick={toggleSidebar} className="size-7">
        <TextAlignJustify strokeWidth={1.5} className="size-5" />
      </button>

      {/* Logo. Filial badge'i joy egallaganda nom yashiriladi - eng tor
          ekranda "qaysi filialdaman" markaz nomidan muhimroq. */}
      <div className="flex items-center gap-3 min-w-0">
        <img
          width={24}
          height={24}
          src={APP_LOGO}
          className="size-6 shrink-0"
          alt="System logo svg"
        />
        <span className="font-medium truncate hidden xs:inline">{APP_NAME}</span>
      </div>

      {/* Filial + Tema + Bell */}
      <div className="flex items-center gap-1 min-w-0">
        <BranchBadge />
        <ThemeToggle variant="switch" className="size-8" />
        <NotificationBell />
      </div>
    </header>
  );
};

export default AppHeader;
