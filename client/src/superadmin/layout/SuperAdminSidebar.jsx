import { NavLink } from "react-router-dom";

import { cn } from "@/shared/utils/cn";
import usePermissions from "@/shared/hooks/usePermissions";

import { SUPER_ADMIN_NAV } from "../navigation/nav.config";

/**
 * ══════════════════════════════════════════════════════════════════════
 * SUPER ADMIN SIDEBAR — ADMIN PANELINIKIDAN BOSHQA KOMPONENT
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA `AppSidebar` QAYTA ISHLATILMADI ──
 * `AppSidebar` — operatsion panelning menyusi: yig'iladigan guruhlar,
 * filial tanlagich, yaratish menyusi, qidiruv, tasdiqlar qo'ng'irog'i,
 * saqlagich kvotasi. Bularning HAMMASI kundalik ish uchun. Super Admin
 * esa kundalik ish qilmaydi — u tashkilotni boshqaradi. O'sha
 * komponentga "super admin rejimi" bayrog'ini qo'shish ikkala menyuni
 * ham buzardi va panellar ASLIDA bitta bo'lib qolardi.
 *
 * Bu yerda ataylab YO'Q:
 *   • filial tanlagich — Super Admin filialni TANLAMAYDI, OCHADI
 *     (Filiallar → Filial A). Sarlavhadagi tanlagich "hozir qaysi
 *     filialdaman?" degan ikkinchi, ziddiyatli holat yaratardi.
 *   • yig'iladigan guruhlar — uch yozuvda ierarxiya keraksiz.
 *   • qidiruv/yaratish menyusi — operatsion amallar Admin panelida.
 *
 * ── MOBIL ──
 * Tor ekranda ustun gorizontal qatorga aylanadi (`lg:` chegarasi).
 * Drawer ATAYLAB yo'q: uchta yozuv drawer ochish-yopish qadamiga
 * arzimaydi va yashirin menyu "qayerdaman?" savolini kuchaytiradi.
 */
const SuperAdminSidebar = () => {
  const { has, hasAny } = usePermissions();

  const items = SUPER_ADMIN_NAV.filter((item) => {
    if (item.permissionAnyOf?.length) return hasAny(item.permissionAnyOf);
    return !item.permission || has(item.permission);
  });

  return (
    <nav
      aria-label="Tashkilot menyusi"
      className={cn(
        "shrink-0 border-border bg-card",
        // Mobil: sarlavha ostidagi gorizontal qator.
        "flex gap-1 overflow-x-auto border-b px-3 py-2",
        // Desktop: chap ustun.
        // `top-14` — sarlavha balandligi (h-14). Menyu uning ostiga
        // yopishadi, ustiga emas.
        "lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:w-56 lg:flex-col lg:gap-0.5 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-3 lg:py-4",
      )}
    >
      <p className="hidden px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground lg:block">
        Tashkilot
      </p>

      {items.map((item) => (
        <NavLink
          key={item.key}
          to={item.url}
          end={item.end}
          className={({ isActive }) =>
            cn(
              "inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )
          }
        >
          <item.icon className="size-4 shrink-0" strokeWidth={1.75} />
          {item.title}
        </NavLink>
      ))}
    </nav>
  );
};

export default SuperAdminSidebar;
