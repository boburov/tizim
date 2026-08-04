// Icons
import { HardDrive, Settings2 } from "lucide-react";

// Router
import { Link } from "react-router-dom";

// Sidebar
import {
  useSidebar,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/shared/components/shadcn/sidebar";

// Hooks
import usePermissions from "@/shared/hooks/usePermissions";
import useStorageUsageQuery, { formatBytes } from "@/shared/hooks/useStorageUsage";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";

// Utils
import { cn } from "@/shared/utils/cn";

// Ogohlantirish bosqichlari. 80% dan keyin rang o'zgaradi: foydalanuvchi
// joy tugashini FAYL RAD ETILGUNCHA emas, oldindan sezishi kerak.
const WARN_PERCENT = 80;

// Boshqaruv sahifasi. Kvota ko'rsatkichi shu yerga olib boradi -
// "joy tugadi" degan xabarni ko'rgan odam DARHOL nima qilishni
// bilishi kerak.
const MANAGE_URL = "/owner/storage";

const toneOf = (percent, isFull) => {
  if (isFull) {
    return {
      bar: "bg-destructive",
      text: "text-destructive",
      hint: "Joy tugadi - fayl yuklanmaydi",
    };
  }
  if (percent >= WARN_PERCENT) {
    return {
      bar: "bg-amber-500",
      text: "text-amber-600 dark:text-amber-400",
      hint: "Joy tugab bormoqda",
    };
  }
  return { bar: "bg-primary", text: "text-muted-foreground", hint: "" };
};

/**
 * FAYL XOTIRASI INDIKATORI (sidebar).
 *
 * Chegara .env dan keladi (STORAGE_QUOTA_GB), shuning uchun raqamlar
 * client'da qattiq yozilmaydi - hammasi serverning javobidan.
 *
 * Yig'ilgan (icon) rejimda progress chizig'i ko'rinmaydi: u yerda atigi
 * ~2rem joy bor va chiziq o'qib bo'lmas holga kelardi - o'rniga foiz
 * tooltip'da beriladi.
 */
const StorageQuota = () => {
  const { state } = useSidebar();
  const { has } = usePermissions();
  const { data, isLoading, isError } = useStorageUsageQuery();

  // Boshqaruv sahifasiga havola FAQAT huquqi borlarga. O'qituvchi
  // raqamni ko'radi, lekin tozalash sahifasiga kira olmaydi - unga
  // ishlamaydigan havola ko'rsatish yolg'on va'da bo'lardi.
  const canManage = has(PERMISSIONS.STORAGE_MANAGE);

  // Xato bo'lsa jimgina yashiramiz: kvota indikatori yordamchi ma'lumot,
  // uning yiqilishi butun menyuni buzmasligi kerak.
  if (isLoading || isError || !data) return null;

  const percent = Math.round(data.percent || 0);
  const tone = toneOf(percent, data.isFull);
  const label = `${formatBytes(data.usedBytes)} / ${formatBytes(data.quotaBytes)}`;

  if (state === "collapsed") {
    return (
      <SidebarGroup className="py-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild={canManage}
              tooltip={`Fayl xotirasi: ${label} (${percent}%)`}
              className="h-auto py-2.5"
            >
              {canManage ? (
                <Link to={MANAGE_URL}>
                  <HardDrive strokeWidth={1.5} className={tone.text} />
                </Link>
              ) : (
                <HardDrive strokeWidth={1.5} className={tone.text} />
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  const Wrapper = canManage ? Link : "div";
  const wrapperProps = canManage
    ? {
        to: MANAGE_URL,
        title: "Fayl saqlagichni boshqarish",
        className:
          "block rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-2 transition-colors hover:bg-sidebar-accent",
      }
    : {
        className:
          "rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-2",
      };

  return (
    <SidebarGroup className="py-0">
      <Wrapper {...wrapperProps}>
        <div className="flex items-center gap-2">
          <HardDrive size={16} strokeWidth={1.5} className={tone.text} />
          <span className="flex-1 truncate text-xs font-medium">Fayl xotirasi</span>
          {/* Sozlash belgisi - blok bosiladigan ekanini bildiradi */}
          {canManage && (
            <Settings2 size={13} className="shrink-0 text-muted-foreground" />
          )}
          <span className={cn("text-xs tabular-nums", tone.text)}>{percent}%</span>
        </div>

        {/* Progress: shadcn'da alohida komponent yo'q, ikki div yetarli */}
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Fayl xotirasi band qismi"
          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn("h-full rounded-full transition-all", tone.bar)}
            style={{ width: `${Math.max(percent, percent > 0 ? 2 : 0)}%` }}
          />
        </div>

        <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{label}</p>
        {tone.hint && (
          <p className={cn("truncate text-[11px] font-medium", tone.text)}>
            {tone.hint}
          </p>
        )}
      </Wrapper>
    </SidebarGroup>
  );
};

export default StorageQuota;
