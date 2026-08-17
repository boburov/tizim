// Router
import { Link } from "react-router-dom";

// Icons
import { ArrowLeft, Gauge } from "lucide-react";

// Hooks
import usePermissions from "@/shared/hooks/usePermissions";

// Utils
import { cn } from "@/shared/utils/cn";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";

/**
 * RAHBARIYAT QOBIG'IGA QAYTISH.
 *
 * ═══════════════════════════════════════════════════════════════════
 * MUAMMO: BIR TOMONLAMA YO'L
 *
 * Rahbariyat qobig'ida (`/admin`) operatsion panelga o'tish tugmasi
 * KO'RINIB turadi (`ExecutiveHeader`). Teskarisi esa yo'q edi:
 * `/owner/*` ga tushgan foydalanuvchi uchun `/admin` ga qaytish yo'li
 * faqat sidebar ro'yxatidagi bitta qator edi - o'ttizta havola
 * orasida, mobil ekranda esa umuman yopiq menyu ichida.
 *
 * Amalda bu shunday sodir bo'ladi: rahbariyat kartasidan drill-down
 * qilinadi (bu ATAYLAB shunday - kartalar operatsion sahifalarga olib
 * boradi), keyin bir necha sahifa yuriladi va "asosiy ekranga qanday
 * qaytaman?" degan savol paydo bo'ladi. Brauzerning orqaga tugmasi
 * bir necha qadam orqaga qaytarardi, bu esa javob emas.
 *
 * Endi yo'l IKKI TOMONLAMA va ikkala tugma ham bir xil ko'rinishda:
 *
 *   /admin   →  [Operatsion panel]   (ExecutiveHeader)
 *   /owner/* →  [Rahbariyat]         (shu komponent)
 * ═══════════════════════════════════════════════════════════════════
 *
 * RUXSATSIZ KO'RSATILMAYDI: `/admin` marshruti `admin_dashboard.read`
 * bilan qo'riqlanadi, ya'ni ruxsati yo'q odam tugmani bosgach
 * operatsion panelga QAYTIB tushardi - o'zi turgan joyga. Bosilganda
 * hech narsa qilmaydigan tugma - buzuq tugma.
 *
 * `variant`:
 *   full    - matnli tugma
 *   sidebar - sidebar tepasida, to'liq kenglikda (yaratish tugmasi ostida)
 *   compact - faqat ikonka (mobil sarlavha, joy tor)
 */
const ExecutiveReturnButton = ({ variant = "full", className = "" }) => {
  const { has } = usePermissions();

  if (!has(PERMISSIONS.ADMIN_DASHBOARD_READ)) return null;

  if (variant === "sidebar") {
    return (
      <Link
        to="/admin"
        title="Rahbariyat"
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-dashed px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          // Yig'ilgan sidebar'da faqat ikonka sig'adi.
          "group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-1.5",
          className,
        )}
      >
        <ArrowLeft className="size-4 shrink-0" />
        {/* PUNKTIRLI CHEGARA - bu qator ostidagi 30 ta havoladan
            BOSHQA ishni qiladi: sahifaga emas, boshqa QOBIQQA olib
            boradi. Bir xil ko'rinishda bo'lsa u ham "yana bitta
            bo'lim" bo'lib o'qilardi. */}
        <span className="truncate group-data-[collapsible=icon]:hidden">
          Rahbariyatga qaytish
        </span>
      </Link>
    );
  }

  if (variant === "compact") {
    return (
      <Link
        to="/admin"
        title="Rahbariyat"
        aria-label="Rahbariyat bo'limiga qaytish"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          className,
        )}
      >
        <Gauge className="size-5" strokeWidth={1.5} />
      </Link>
    );
  }

  return (
    <Link
      to="/admin"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <ArrowLeft className="size-3.5" />
      Rahbariyat
    </Link>
  );
};

export default ExecutiveReturnButton;
