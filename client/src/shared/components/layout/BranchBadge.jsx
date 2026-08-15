// Icons
import { Building2, Check, Layers } from "lucide-react";

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

// Lib
import { ALL_BRANCHES } from "@/shared/lib/branch/activeBranch";

/**
 * FILIAL BADGE'i - kompakt, doim ko'rinadigan kontekst ko'rsatkichi.
 *
 * NEGA BranchSwitcher YETARLI EMAS: u sidebar ichida turadi, sidebar esa
 * mobil ekranda YOPIQ, desktopda esa yig'ilishi mumkin. Ya'ni "qaysi
 * filialdaman" degan savolga javob ko'rinmay qolardi - va aynan shu
 * paytda noto'g'ri filialga yozib yuborish oson bo'ladi.
 *
 * Bu badge esa header'da doim turadi va bosilganda o'sha ro'yxatni
 * ochadi. Mantiq BranchSwitcher bilan bir xil manbadan
 * (useActiveBranch) keladi - ikki joyda ikki xil holat bo'lib
 * qolmasligi uchun.
 *
 * Bitta filialli markazda BOSILMAYDIGAN yorliq bo'lib qoladi: tanlash
 * ma'nosiz, lekin kontekstni ko'rsatish baribir kerak.
 */
const BranchBadge = ({ className = "" }) => {
  const {
    branches,
    activeBranch,
    isAllBranches,
    canSeeAllBranches,
    hasMultipleBranches,
    multiBranch,
    changeBranch,
  } = useActiveBranch();

  // Yakka markaz rejimi - filial tushunchasi umuman yo'q.
  if (!multiBranch) return null;

  const only = activeBranch || branches[0];
  const label = isAllBranches
    ? "Barcha filiallar"
    : activeBranch?.code || activeBranch?.name || only?.name;

  if (!label) return null;

  const Icon = isAllBranches ? Layers : Building2;

  const face = (
    <span
      className={`flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary max-w-[9rem] ${className}`}
    >
      <Icon size={14} strokeWidth={2} className="shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );

  // Bitta filial - tanlash yo'q, faqat ko'rsatkich.
  if (!hasMultipleBranches) return face;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Filialni almashtirish">
          {face}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={6} className="min-w-52">
        <DropdownMenuLabel className="text-xs opacity-70">
          Filialni tanlang
        </DropdownMenuLabel>

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
  );
};

export default BranchBadge;
