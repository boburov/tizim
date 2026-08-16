// React
import { useState } from "react";

// Icons
import { ChevronDown, Plus } from "lucide-react";

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

// Registry
import { visibleCreateGroups, findCreateItem } from "./createRegistry";

const STORAGE_KEY = "create:lastType";

/**
 * YARATISH TUGMASI - IKKI QISMLI (split button).
 *
 * ═══════════════════════════════════════════════════════════════════
 * MUAMMO: oddiy menyu HAR SAFAR ikki bosishni talab qiladi -
 * "Yaratish" -> ro'yxat -> "O'quvchi". Resepshin kuniga o'nlab
 * o'quvchi kiritadi va har safar o'sha ikki bosish takrorlanadi.
 *
 * YECHIM: tugma ikkiga bo'linadi.
 *
 *   [ + Yaratish · O'quvchi ][ ▾ ]
 *     └─ chap: BIR BOSISHDA    └─ o'ng: turni almashtirish
 *        oxirgi turni ochadi
 *
 * Tanlangan tur `localStorage` da saqlanadi, ya'ni ertasi kuni ham
 * o'sha turdan boshlanadi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ESLAB QOLINGAN TUR RUXSAT BILAN QAYTA TEKSHIRILADI: rol o'zgarib,
 * foydalanuvchi o'sha turni yarata olmay qolgan bo'lishi mumkin -
 * u holda birinchi ruxsat etilgan turga tushadi. Aks holda tugma
 * ochib bo'lmaydigan modalga ishora qilib turaverardi.
 *
 * KO'RINISHLAR:
 *   bar      - rahbariyat sarlavhasi (o'ng burchak)
 *   sidebar  - operatsion sidebar tepasi (butun kenglikka cho'ziladi)
 *   collapsed=true - sidebar yig'ilgan: faqat "+" ikonkasi qoladi.
 *     Bunda BO'LINISH YO'Q: 32px kenglikda ikki nishonni ajratish
 *     ikkalasini ham noaniq qiladi, shuning uchun butun tugma menyuni
 *     ochadi.
 */
const CreateSplitButton = ({
  variant = "bar",
  collapsed = false,
  className = "",
  onAfterOpen,
}) => {
  const { openModal } = useModal();
  const { has, hasAll } = usePermissions();

  const groups = visibleCreateGroups({ has, hasAll });
  const allowed = groups.flatMap((g) => g.items);

  const [lastKey, setLastKey] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      // Shaxsiy rejimda `localStorage` otishi mumkin - tugma baribir
      // ishlashi kerak, shunchaki eslab qolmaydi.
      return null;
    }
  });

  // Hech narsa yarata olmaydigan foydalanuvchiga tugma KO'RSATILMAYDI.
  if (!allowed.length) return null;

  // Eslab qolingan tur hali ham ruxsat etilganmi.
  const remembered = findCreateItem(lastKey);
  const active =
    remembered && allowed.some((i) => i.key === remembered.key)
      ? remembered
      : allowed[0];

  const open = (item) => {
    setLastKey(item.key);
    try {
      localStorage.setItem(STORAGE_KEY, item.key);
    } catch {
      /* eslab qolinmadi - amal baribir bajariladi */
    }
    openModal(item.modal, item.data);
    onAfterOpen?.();
  };

  const menu = (
    <DropdownMenuContent
      align={variant === "sidebar" ? "start" : "end"}
      sideOffset={6}
      className="w-64"
    >
      {groups.map((group, i) => (
        <div key={group.label}>
          {i > 0 && <DropdownMenuSeparator />}
          <DropdownMenuLabel className="text-xs uppercase text-muted-foreground">
            {group.label}
          </DropdownMenuLabel>
          {group.items.map((item) => (
            <DropdownMenuItem
              key={item.key}
              onSelect={() => open(item)}
              // BARQAROR SELEKTOR - matn bo'yicha topish ISHONCHSIZ:
              // "Filial" so'zi `Xodim` va `Xona` yozuvlarining IZOHIDA
              // ham bor ("Rol va filial biriktiriladi", "Filial resursi"),
              // ya'ni matn bo'yicha qidirilganda uchta element mos
              // kelib, noto'g'risi bosilardi.
              data-create-key={item.key}
              className={cn("gap-3 py-2", item.key === active.key && "bg-accent")}
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
  );

  // ── YIG'ILGAN SIDEBAR: bo'linmagan yakka ikonka ──
  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Yaratish"
            aria-label="Yaratish"
            className={cn(
              "flex h-8 w-full items-center justify-center rounded-md bg-primary px-1.5 text-primary-foreground transition-colors hover:bg-primary/90",
              className,
            )}
          >
            <Plus className="size-4 shrink-0" strokeWidth={2} />
          </button>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    );
  }

  const sidebar = variant === "sidebar";

  return (
    <div className={cn("flex items-stretch", sidebar && "w-full", className)}>
      {/* CHAP: bir bosishda oxirgi turni ochadi */}
      <button
        type="button"
        onClick={() => open(active)}
        title={`${active.label} yaratish`}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-l-md bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          sidebar && "min-w-0 flex-1",
        )}
      >
        <Plus className="size-4 shrink-0" strokeWidth={2.5} />
        <span className="shrink-0">Yaratish</span>
        {/* Faol tur nomi - "nima ochiladi" oldindan ko'rinadi.
            Eng tor ekranda yashiriladi, tugmaning o'zi qoladi. */}
        <span
          className={cn(
            "min-w-0 truncate opacity-80",
            sidebar ? "text-left" : "hidden sm:inline",
          )}
        >
          · {active.label}
        </span>
      </button>

      {/* O'NG: turni almashtirish */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Yaratish turini tanlash"
            className={cn(
              "flex h-9 w-7 shrink-0 items-center justify-center rounded-r-md border-l border-primary-foreground/25 bg-primary text-primary-foreground transition-colors hover:bg-primary/90",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <ChevronDown className="size-4" />
          </button>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    </div>
  );
};

export default CreateSplitButton;
